import { z } from 'zod';
import { router, publicProcedure } from '../trpc';
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
import { Order, Prisma } from '@prisma/client';
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
            : `There are not enough tickets to fulfill the request (${variant.stock} left)`,
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

        throw new Error(error.message);
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

      // send email
      if (capturedOrder.payer?.emailAddress) {
        sendEmail({
          to: capturedOrder.payer?.emailAddress,
          replyTo: 'info@friendsofhped.com',
          subject: 'Order Confirmation - FoHPED Summer Fair 2025',
          content: generateMailContent(order),
        });
      }

      return capturedOrder;
    }),
  byId: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { result: order } = await ordersController.getOrder({
        id: input.id,
      });
      return order;
    }),
});
