import { z } from 'zod';
import {
  router,
  publicProcedure,
  authedProcedureWithEventId,
  authedProcedureWithOrderId,
} from '../trpc';
import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrdersController,
  PaymentsController,
  PaypalExperienceUserAction,
  PaypalWalletContextShippingPreference,
  RefundStatus as PaypalRefundStatus,
} from '@paypal/paypal-server-sdk';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import { Order, Prisma } from '~/generated/prisma/client';
import { env } from '../env';
import {
  generateCancellationMailContent,
  generateMailContent,
  sendEmail,
} from '~/utils/email';
import { logger } from '../logger';
import { metrics, trackPaypal } from '../metrics';

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
const paymentsController = new PaymentsController(client);

type RefundOutcome = 'REFUNDED' | 'PENDING' | 'FAILED';

/** PayPal's error name and message, from an SDK error, for refundError. */
function paypalErrorInfo(e: unknown) {
  const body = (e as { body?: unknown })?.body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as {
        name?: string;
        message?: string;
        details?: { issue?: string }[];
      };
      return {
        name: parsed.name,
        message: parsed.message,
        issue: parsed.details?.[0]?.issue,
      };
    } catch {
      // not JSON
    }
  }
  return { message: e instanceof Error ? e.message : String(e) };
}

/**
 * Refunds a cancelled order's PayPal capture and records the outcome on the
 * order. Safe to call again for the same order (order.retryRefund): the
 * PayPal-Request-Id makes PayPal return the existing refund instead of
 * refunding twice.
 */
async function refundOrder(order: {
  id: string;
  eventId: string;
  externalTransactionId: string;
  currency: string;
  amount: number;
  refundReason: string | null;
}): Promise<RefundOutcome> {
  let status: RefundOutcome;
  try {
    const { result: refund } = await trackPaypal('refundCapture', () =>
      paymentsController.refundCapturedPayment({
        captureId: order.externalTransactionId,
        paypalRequestId: `refund-${order.id}`,
        prefer: 'return=representation',
        body: {
          amount: {
            currencyCode: order.currency,
            value: order.amount.toFixed(2),
          },
          customId: order.id,
          ...(order.refundReason
            ? { noteToPayer: order.refundReason.slice(0, 255) }
            : {}),
        },
      }),
    );

    status =
      refund.status === PaypalRefundStatus.Completed
        ? 'REFUNDED'
        : refund.status === PaypalRefundStatus.Pending
          ? 'PENDING'
          : 'FAILED';

    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundStatus: status,
        refundId: refund.id ?? null,
        refundedAt: status === 'REFUNDED' ? new Date() : null,
        refundError:
          status === 'FAILED'
            ? { message: `PayPal refund status ${refund.status}` }
            : Prisma.DbNull,
      },
    });
  } catch (e) {
    status = 'FAILED';
    await prisma.order.update({
      where: { id: order.id },
      data: {
        refundStatus: 'FAILED',
        refundError: { ...paypalErrorInfo(e), at: new Date().toISOString() },
      },
    });
  }

  metrics.ordersRefunded.inc({ outcome: status.toLowerCase() });
  if (status === 'FAILED') {
    logger.error(
      { orderId: order.id, eventId: order.eventId, amount: order.amount },
      'refund failed',
    );
  } else {
    logger.info(
      {
        orderId: order.id,
        eventId: order.eventId,
        amount: order.amount,
        status,
      },
      'order refunded',
    );
  }
  return status;
}

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
        metrics.orderReservationFailures.inc({ reason: 'out_of_stock' });
        logger.warn(
          {
            err: error,
            eventId: variant.event.id,
            variantId: variant.id,
            quantity: input.quantity,
            stock: variant.stock,
          },
          'order reservation failed: not enough stock',
        );
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

      metrics.ordersReserved.inc();
      logger.info(
        {
          orderId: ourOrder.id,
          eventId: variant.event.id,
          variantId: variant.id,
          quantity: input.quantity,
          amount,
        },
        'order reserved',
      );

      let paypalOrder;
      try {
        ({ result: paypalOrder } = await trackPaypal('createOrder', () =>
          ordersController.createOrder({
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
          }),
        ));
      } catch (error) {
        // the reservation stays RESERVED and is released by the expiry job
        metrics.orderReservationFailures.inc({ reason: 'paypal_error' });
        logger.error(
          { err: error, orderId: ourOrder.id, eventId: variant.event.id },
          'PayPal createOrder failed',
        );
        throw error;
      }

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
        ({ result: order } = await trackPaypal('getOrder', () =>
          ordersController.getOrder({
            id: input.id,
          }),
        ));

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
        metrics.orderCaptureFailures.inc({ stage: 'confirm' });
        logger.warn(
          { err: error, paypalOrderId: input.id, orderId: ourOrderId },
          'capture: could not confirm our order (reservation missing or expired)',
        );
        throw new Error('Could not confirm order - order might have expired.');
      }

      // tries to capture payment
      try {
        ({ result: capturedOrder } = await trackPaypal('captureOrder', () =>
          ordersController.captureOrder({
            id: input.id,
          }),
        ));
      } catch (error: any) {
        // if capture fails, release tickets and cancel order
        metrics.orderCaptureFailures.inc({ stage: 'payment' });
        logger.error(
          { err: error, paypalOrderId: input.id, orderId: ourOrderId },
          'capture: PayPal payment capture failed, cancelling order',
        );

        prisma
          .$transaction(async (tx) => {
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
          })
          .catch((cancelError) => {
            // tickets are still held by a CONFIRMED order that was never paid
            logger.error(
              { err: cancelError, orderId: ourOrderId },
              'capture: failed to cancel order and release stock after failed payment',
            );
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
        metrics.orderCaptureFailures.inc({ stage: 'post_capture' });
        logger.error(
          { err: e, paypalOrderId: input.id, orderId: ourOrderId },
          'capture: payment taken but could not save customer and transaction details',
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

      metrics.ordersConfirmed.inc();
      metrics.ticketsSold.inc(ourOrder.quantity);
      metrics.revenue.inc({ currency: ourOrder.currency }, ourOrder.amount);
      logger.info(
        {
          orderId: ourOrder.id,
          eventId: ourOrder.eventId,
          variantId: ourOrder.variantId,
          quantity: ourOrder.quantity,
          amount: ourOrder.amount,
          currency: ourOrder.currency,
        },
        'order confirmed',
      );

      // send email
      if (capturedOrder.payer?.emailAddress) {
        sendEmail({
          to: capturedOrder.payer?.emailAddress,
          replyTo: ourOrder.event.organization?.email || 'noreply@example.com',
          subject: 'Order Confirmation - ' + ourOrder.event.title,
          content: generateMailContent(order, ourOrder),
        });
      }

      return ourOrder;
    }),
  // only members of the event's organization (see authedProcedureWithOrderId)
  cancelOrder: authedProcedureWithOrderId
    .input(
      z.object({
        orderId: z.string().uuid(),
        // refund the buyer's PayPal payment: all of it, or `amount`
        refund: z.boolean().default(false),
        amount: z.number().positive().optional(),
        // shown to the buyer (PayPal refund note and the email)
        reason: z.string().trim().max(255).optional(),
        notifyBuyer: z.boolean().default(true),
      }),
    )
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
        include: { event: { include: { organization: true } } },
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

      // checked before cancelling, so a refund that can't happen doesn't
      // leave a cancelled order the buyer has paid for
      const refundAmount = input.refund ? (input.amount ?? order.amount) : null;
      if (input.refund) {
        if (!order.externalTransactionId) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'No PayPal payment is recorded for this order: refund it in PayPal, then cancel without a refund',
          });
        }
        if (!refundAmount || refundAmount > order.amount + 1e-9) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `The refund must be more than 0 and at most the ${order.amount.toFixed(2)} paid`,
          });
        }
      }

      // cancel and release the stock exactly once, even if two cancels race
      const cancelled = await prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { id: order.id, status: 'CONFIRMED' },
          data: {
            status: 'CANCELLED',
            ...(input.refund
              ? {
                  refundStatus: 'PENDING' as const,
                  refundedAmount: refundAmount,
                  refundReason: input.reason || null,
                }
              : {}),
          },
        });
        if (count === 0) return false;

        await tx.variant.update({
          where: { id: order.variantId },
          data: { stock: { increment: order.quantity } },
        });
        return true;
      });

      if (!cancelled) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'This order has already been cancelled',
        });
      }

      metrics.ordersCancelled.inc();
      logger.info(
        {
          orderId: order.id,
          eventId: order.eventId,
          quantity: order.quantity,
          refund: input.refund,
        },
        'order cancelled by admin',
      );

      let refundStatus: RefundOutcome | 'NONE' = 'NONE';
      if (input.refund && order.externalTransactionId && refundAmount) {
        refundStatus = await refundOrder({
          id: order.id,
          eventId: order.eventId,
          externalTransactionId: order.externalTransactionId,
          currency: order.currency,
          amount: refundAmount,
          refundReason: input.reason || null,
        });
      }

      const customer = order.customer as {
        emailAddress?: string;
        name?: { givenName?: string };
      } | null;
      if (input.notifyBuyer && customer?.emailAddress) {
        // a failed refund isn't mentioned: the organiser retries or refunds
        // by hand, and the buyer hears about it then
        await sendEmail({
          to: customer.emailAddress,
          replyTo: order.event.organization?.email || 'noreply@example.com',
          subject: 'Order cancelled - ' + order.event.title,
          content: generateCancellationMailContent({
            givenName: customer.name?.givenName,
            eventTitle: order.event.title,
            organizationName: order.event.organization?.name,
            organizationEmail: order.event.organization?.email,
            refund:
              refundStatus === 'REFUNDED' || refundStatus === 'PENDING'
                ? {
                    amount: refundAmount ?? 0,
                    currency: order.currency,
                    pending: refundStatus === 'PENDING',
                    reason: input.reason,
                  }
                : undefined,
          }),
        });
      }

      return { success: true, refundStatus };
    }),

  /** Tries a failed (or still pending) refund again, for the same amount. */
  retryRefund: authedProcedureWithOrderId
    .input(z.object({ orderId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const order = await prisma.order.findUnique({
        where: { id: input.orderId },
      });

      if (!order) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      }

      if (
        order.status !== 'CANCELLED' ||
        (order.refundStatus !== 'FAILED' && order.refundStatus !== 'PENDING') ||
        !order.externalTransactionId
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This order has no failed or pending refund to retry',
        });
      }

      const refundStatus = await refundOrder({
        id: order.id,
        eventId: order.eventId,
        externalTransactionId: order.externalTransactionId,
        currency: order.currency,
        amount: order.refundedAmount ?? order.amount,
        refundReason: order.refundReason,
      });

      return { success: true, refundStatus };
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
  // buyers' names, emails and answers: only for the event's organization
  getOrdersForCheckin: authedProcedureWithEventId
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
  toggleCheckin: authedProcedureWithOrderId
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
