/**
 * This file contains the root router of your tRPC-backend
 */
import { createCallerFactory, publicProcedure, router } from '../trpc';
import { eventRouter } from './event';
import { orderRouter } from './order';

export const appRouter = router({
  healthcheck: publicProcedure.query(() => 'yay!'),

  //post: postRouter,
  event: eventRouter,
  order: orderRouter,
});

export const createCaller = createCallerFactory(appRouter);

export type AppRouter = typeof appRouter;
