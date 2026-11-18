/**
 * This is your entry point to setup the root configuration for tRPC on the server.
 * - `initTRPC` should only be used once per app.
 * - We export only the functionality that we use so we can enforce which base procedures should be used
 *
 * Learn how to create protected base procedures and other things below:
 * @see https://trpc.io/docs/v11/router
 * @see https://trpc.io/docs/v11/procedures
 */

import { initTRPC, TRPCError } from '@trpc/server';
import { transformer } from '~/utils/transformer';
import type { Context } from './context';
import { z } from 'zod';
import { prisma } from './prisma';
import { logger } from './logger';
import { metrics } from './metrics';

const t = initTRPC.context<Context>().create({
  /**
   * @see https://trpc.io/docs/v11/data-transformers
   */
  transformer,
  /**
   * @see https://trpc.io/docs/v11/error-formatting
   */
  errorFormatter({ shape }) {
    return shape;
  },
});

/**
 * Create a router
 * @see https://trpc.io/docs/v11/router
 */
export const router = t.router;

/**
 * Counts every procedure call by outcome and times it. HTTP status codes alone
 * miss errors here because tRPC batches calls (a batch with one failure is
 * returned as 207), so this is the source of truth for API error rates.
 */
const observability = t.middleware(async ({ path, type, next }) => {
  const endTimer = metrics.trpcDuration.startTimer({ procedure: path, type });
  const result = await next();
  endTimer();
  metrics.trpcRequests.inc({
    procedure: path,
    type,
    code: result.ok ? 'OK' : result.error.code,
  });
  return result;
});

/**
 * Create an unprotected procedure
 * @see https://trpc.io/docs/v11/procedures
 **/
export const publicProcedure = t.procedure.use(observability);

export const authedProcedure = publicProcedure.use(
  async function isAuthed(opts) {
    const { ctx } = opts;

    if (!ctx?.session?.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return opts.next({
      ctx: {
        user: ctx.session.user,
      },
    });
  },
);

export const authedProcedureWithEventId = authedProcedure
  .input(z.object({ eventId: z.string() }))
  .use(async function validateEventId(opts) {
    const { ctx } = opts;

    if (!ctx.user.email) {
      logger.error('Could not get email from user');
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }

    const event = await prisma.event.findUnique({
      where: { id: opts.input.eventId },
      select: {
        id: true,
        organization: { select: { users: { select: { email: true } } } },
      },
    });

    if (!event) {
      throw new TRPCError({ code: 'NOT_FOUND' });
    }

    if (
      !event.organization?.users.find((user) => user.email === ctx.user.email)
    ) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return opts.next({
      ctx: {
        user: ctx.user,
        event: event,
      },
    });
  });
/**
 * For procedures acting on one order: the order's event must belong to the
 * user's organization (like authedProcedureWithEventId). Without this any
 * signed-in user (any Google account) could act on any order.
 */
export const authedProcedureWithOrderId = authedProcedure
  .input(z.object({ orderId: z.string() }))
  .use(async function validateOrderId(opts) {
    const { ctx } = opts;

    if (!ctx.user.email) {
      logger.error('Could not get email from user');
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
    }

    const order = await prisma.order.findUnique({
      where: { id: opts.input.orderId },
      select: {
        event: {
          select: {
            organization: { select: { users: { select: { email: true } } } },
          },
        },
      },
    });

    if (!order) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
    }

    if (
      !order.event.organization?.users.find(
        (user) => user.email === ctx.user.email,
      )
    ) {
      throw new TRPCError({ code: 'FORBIDDEN' });
    }

    return opts.next();
  });

/**
 * Merge multiple routers together
 * @see https://trpc.io/docs/v11/merging-routers
 */
export const mergeRouters = t.mergeRouters;

/**
 * Create a server-side caller
 * @see https://trpc.io/docs/v11/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;
