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
 * Create an unprotected procedure
 * @see https://trpc.io/docs/v11/procedures
 **/
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async function isAuthed(opts) {
  const { ctx } = opts;

  if (!ctx?.session?.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return opts.next({
    ctx: {
      user: ctx.session.user,
    },
  });
});

export const authedProcedureWithEventId = authedProcedure
  .input(z.object({ eventId: z.string() }))
  .use(async function validateEventId(opts) {
    const { ctx } = opts;

    if (!ctx.user.email) {
      console.error('Could not get email from user');
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
 * Merge multiple routers together
 * @see https://trpc.io/docs/v11/merging-routers
 */
export const mergeRouters = t.mergeRouters;

/**
 * Create a server-side caller
 * @see https://trpc.io/docs/v11/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;
