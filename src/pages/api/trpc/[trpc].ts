/**
 * This file contains tRPC's HTTP response handler
 */
import * as trpcNext from '@trpc/server/adapters/next';
import { createContext } from '~/server/context';
import { appRouter } from '~/server/routers/_app';
import { logger } from '~/server/logger';

export default trpcNext.createNextApiHandler({
  router: appRouter,
  /**
   * @see https://trpc.io/docs/v11/context
   */
  createContext,
  /**
   * @see https://trpc.io/docs/v11/error-handling
   */
  onError({ error, path, type }) {
    if (error.code === 'INTERNAL_SERVER_ERROR') {
      logger.error(
        { err: error.cause ?? error, procedure: path, type, code: error.code },
        `tRPC ${path} failed: ${error.message}`,
      );
    } else {
      logger.info(
        { procedure: path, type, code: error.code },
        `tRPC ${path} rejected: ${error.message}`,
      );
    }
  },
  /**
   * @see https://trpc.io/docs/v11/caching#api-response-caching
   */
  // responseMeta() {
  //   // ...
  // },
});
