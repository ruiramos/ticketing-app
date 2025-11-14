import { z } from 'zod';
import { router, publicProcedure, authedProcedure } from '../trpc';
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
} from '@paypal/paypal-server-sdk';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { Order, Prisma } from '~/generated/prisma/client';
import { env } from '../env';
import { generateMailContent, sendEmail } from '~/utils/email';

const client = new Client({
  clientCredentialsAuthCredentials: {
    oAuthClientId: env.PAYPAL_CLIENT_ID,
    oAuthClientSecret: env.PAYPAL_CLIENT_SECRET,
  },
  timeout: 0,
  environment:
    (env.NEXT_PUBLIC_PAYPAL_ENV as Environment) ?? Environment.Sandbox,
  logging: {
    logLevel: LogLevel.Info,
    logRequest: { logBody: true },
    logResponse: { logHeaders: true },
  },
});

const ordersController = new OrdersController(client);

export const orderRouter = router({
  createOrder: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        variantId: z.string().uuid(),
        quantity: z.number().min(1),
        extras: z.record(z.string().uuid(), z.any()).nullish(),
        customFields: z.record(z.string(), z.any()).nullish(),
      }),
    )
    .mutation(async ({ input }) => {
      const variant = await prisma.variant.findUnique({
        where: { id: input.variantId },
        select: {
          id: true,
          title: true,
          price: true,
          currency: true,
          stock: true,
          event: {
            select: {
              id: true,
              title: true,
              eventExtras: true,
              customFields: true,
            },
          },
        },
      });

      if (!variant) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Variant ${input.variantId} not found.`,
        });
      }

      const extrasState = Object.keys(input.extras ?? {})
        .map((key) => {
          if (!input.extras?.[key]) return null;
          const extra = variant.event.eventExtras.find((ex) => ex.id === key);
          if (!extra) return null;
          return { ...extra, quantity: 1 };
        })
        .filter((a) => !!a);

      // Process custom field responses
      const customFields = (variant.event.customFields as any[]) || [];
      const customFieldResponses: Record<string, any> = {};

      customFields.forEach((field: any) => {
        const value = input.customFields?.[field.id];
        if (value !== undefined && value !== null && value !== '') {
          customFieldResponses[field.id] = {
            fieldId: field.id,
            fieldName: field.name,
            fieldLabel: field.label,
            value: value,
          };
        }
      });

      const amount =
        variant.price * input.quantity +
        extrasState.reduce((acc, extra) => {
          return acc + extra.quantity * (extra.price ?? 0);
        }, 0);

      const items = [
        {
          name: variant.title,
          sku: variant.id,
          quantity: input.quantity.toString(),
          unitAmount: {
            currencyCode: variant.currency,
            value: variant.price.toString(),
          },
        },
        ...extrasState.map((extra) => ({
          name: extra.title,
          sku: extra.id,
          quantity: '1',
          unitAmount: {
            currencyCode: extra.currency ?? 'GBP',
            value: (extra.price ?? 0).toString(),
          },
        })),
      ];

      let ourOrder: Order, _updatedVariant;
      try {
        [_updatedVariant, ourOrder] = await prisma.$transaction([
          prisma.variant.update({
            data: {
              stock: {
                decrement: input.quantity,
              },
            },
            where: {
              id: variant.id,
              stock: {
                gte: input.quantity,
              },
            },
          }),
          prisma.order.create({
            data: {
              eventId: variant.event.id,
              variantId: variant.id,
              quantity: input.quantity,
              status: 'RESERVED',
              selectedExtras: extrasState,
              items,
              customer: {}, // TBD later
              customFieldResponses:
                Object.keys(customFieldResponses).length > 0
                  ? customFieldResponses
                  : undefined,
              amount: amount,
              currency: variant.currency,
            },
          }),
        ]);
      } catch (error) {
        // couldnt update variant - is stock already 0?
        console.error(error);
        throw new TRPCError({
          code: 'UNPROCESSABLE_CONTENT',
          message: !variant?.stock
            ? 'The selected option is out of stock'
            : `Sorry, there are not enough tickets of the selected type to fulfill the request. (${variant.stock} left)`,
        });
      }

      if (!ourOrder) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Could not create internal order.`,
        });
      }

      const { result: paypalOrder } = await ordersController.createOrder({
        body: {
          intent: 'CAPTURE' as CheckoutPaymentIntent,
          paymentSource: {
            paypal: {
              experienceContext: {
                shippingPreference:
                  PaypalWalletContextShippingPreference.NoShipping,
                userAction: PaypalExperienceUserAction.PayNow,
                locale: 'en-GB',
              },
            },
          },
          purchaseUnits: [
            {
              items: items,
              amount: {
                currencyCode: 'GBP',
                value: amount.toFixed(2),
                breakdown: {
                  itemTotal: {
                    currencyCode: 'GBP',
                    value: amount.toFixed(2),
                  },
                },
              },
              referenceId: ourOrder.id,
              description: `${variant.event.title} - ${variant.title} x ${input.quantity}`,
            },
          ],
        },
      });

      await prisma.order.update({
        where: {
          id: ourOrder.id,
        },
        data: {
          externalId: paypalOrder.id,
        },
      });

      return paypalOrder;
    }),
  captureOrder: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      let order, capturedOrder, ourOrderId;

      // locks our order to confirmed so it doesnt expire and the tickets dont get relased
      try {
        ({ result: order } = await ordersController.getOrder({
          id: input.id,
        }));

        ourOrderId = order.purchaseUnits?.[0].referenceId;

        if (!ourOrderId) {
          throw new Error(
            `Error during capture: can't find our order id (order id ${input.id})`,
          );
        }

        await prisma.order.update({
          where: {
            id: ourOrderId,
            status: 'RESERVED',
          },
          data: {
            status: 'CONFIRMED',
          },
        });
      } catch (error) {
        console.warn(
          `Error during capure: could not confirm our order. Error: ${(error as any).message}`,
        );
        throw new Error('Could not confirm order - order might have expired.');
      }

      // tries to capture payment
      try {
        ({ result: capturedOrder } = await ordersController.captureOrder({
          id: input.id,
        }));
      } catch (error: any) {
        // if capture fails, release tickets and cancel order
        console.error(error);

        prisma.$transaction(async (tx) => {
          const ourOrder = await tx.order.findUnique({
            where: { id: ourOrderId },
          });

          const variantId = ourOrder?.variantId;
          const quantity = ourOrder?.quantity;

          await tx.variant.update({
            where: {
              id: variantId,
            },
            data: {
              stock: {
                increment: quantity,
              },
            },
          });

          await tx.order.update({
            where: {
              id: ourOrderId,
            },
            data: {
              status: 'CANCELLED',
              error: error.result,
            },
          });
        });

        if (error.body) {
          const jsonErrorBody = JSON.parse(error.body);
          throw new Error(`${jsonErrorBody.message} (${jsonErrorBody.name})`);
        } else {
          throw new Error(error);
        }
      }

      // update order info after capture
      try {
        const ourOrderId = capturedOrder.purchaseUnits?.[0].referenceId;

        await prisma.order.update({
          where: {
            id: ourOrderId,
          },
          data: {
            externalTransactionId:
              capturedOrder.purchaseUnits?.[0].payments?.captures?.[0].id,
            customer: (capturedOrder.payer ?? {}) as Prisma.JsonObject,
          },
        });
      } catch (e) {
        console.error(
          `Could not update customer and transaction details on order: ${(e as any).message}`,
        );
      }

      const ourOrder = await prisma.order.findFirstOrThrow({
        include: {
          variant: true,
          event: {
            include: {
              organization: true,
            },
          },
        },
        where: { id: ourOrderId },
      });

      // send email
      if (capturedOrder.payer?.emailAddress) {
        sendEmail({
          to: capturedOrder.payer?.emailAddress,
          replyTo: ourOrder.event.organization?.email || 'noreply@example.com',
          subject: 'Order Confirmation - ' + ourOrder.event.title,
          content: generateMailContent(order),
        });
      }

      return ourOrder;
    }),
  cancelOrder: authedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: { variant: true },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Order not found',
        });
      }

      if (order.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only confirmed orders can be cancelled',
        });
      }

      // Cancel order and release stock in a transaction
      await prisma.$transaction(async (tx) => {
        await tx.order.update({
          where: { id: input.orderId },
          data: { status: 'CANCELLED' },
        });

        await tx.variant.update({
          where: { id: order.variantId },
          data: {
            stock: {
              increment: order.quantity,
            },
          },
        });
      });

      return { success: true };
    }),
  byId: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        eventId: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const ourOrder = await prisma.order.findFirst({
        include: {
          variant: true,
          event: {
            include: {
              organization: true,
            },
          },
        },
        where: { id: input.id, eventId: input.eventId },
      });

      // const { result: paypalOrder } = await ordersController.getOrder({
      //   id: ourOrder.externalTransactionId,
      // });

      return ourOrder;
    }),
  getOrdersForCheckin: authedProcedure
    .input(
      z.object({
        eventId: z.string().uuid(),
        search: z.string().optional(),
        variantId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      const where: Prisma.OrderWhereInput = {
        eventId: input.eventId,
        status: 'CONFIRMED',
      };

      if (input.variantId) {
        where.variantId = input.variantId;
      }

      if (input.search) {
        where.OR = [
          {
            customer: {
              path: ['name', 'givenName'],
              string_contains: input.search,
              mode: 'insensitive',
            },
          },
          {
            customer: {
              path: ['name', 'surname'],
              string_contains: input.search,
              mode: 'insensitive',
            },
          },
          {
            customer: {
              path: ['emailAddress'],
              string_contains: input.search,
              mode: 'insensitive',
            },
          },
        ];
      }

      return await prisma.order.findMany({
        where,
        include: {
          variant: true,
          event: {
            select: {
              title: true,
            },
          },
        },
        orderBy: [{ checkedIn: 'asc' }, { createdAt: 'desc' }],
      });
    }),
  toggleCheckin: authedProcedure
    .input(
      z.object({
        orderId: z.string().uuid(),
      }),
    )
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        select: { checkedIn: true, status: true },
      });

      if (!order) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Order not found',
        });
      }

      if (order.status !== 'CONFIRMED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Only confirmed orders can be checked in',
        });
      }

      const newCheckedInStatus = !order.checkedIn;

      return await prisma.order.update({
        where: { id: input.orderId },
        data: {
          checkedIn: newCheckedInStatus,
          checkedInAt: newCheckedInStatus ? new Date() : null,
        },
        include: {
          variant: true,
          event: {
            select: {
              title: true,
            },
          },
        },
      });
    }),
});
