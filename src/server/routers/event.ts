import { router, publicProcedure } from '../trpc';
import type { Prisma } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '~/server/prisma';

const defaultEventSelect = {
  id: true,
  title: true,
  text: true,
  createdAt: true,
  updatedAt: true,
  variants: {
    orderBy: {
      order: 'asc',
    },
  },
  eventExtras: true,
} satisfies Prisma.EventSelect;

export const eventRouter = router({
  list: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).nullish(),
        cursor: z.string().nullish(),
        filter: z
          .object({
            enabled: z.boolean().optional(),
          })
          .optional(),
      }),
    )
    .query(async ({ input }) => {
      /**
       * For pagination docs you can have a look here
       * @see https://trpc.io/docs/v11/useInfiniteQuery
       * @see https://www.prisma.io/docs/concepts/components/prisma-client/pagination
       */

      const limit = input.limit ?? 50;
      const filter = input.filter ?? {};
      const { cursor } = input;

      const whereClause: Prisma.EventWhereInput = {};
      if (filter.enabled !== undefined) {
        whereClause.enabled = filter.enabled;
      }

      const items = await prisma.event.findMany({
        select: defaultEventSelect,
        // get an extra item at the end which we'll use as next cursor
        take: limit + 1,
        where: whereClause,
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,
        orderBy: {
          createdAt: 'desc',
        },
      });
      let nextCursor: typeof cursor | undefined = undefined;
      if (items.length > limit) {
        // Remove the last item and use it as next cursor

        const nextItem = items.pop()!;
        nextCursor = nextItem.id;
      }

      return {
        items: items.reverse(),
        nextCursor,
      };
    }),
  byId: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { id } = input;
      const event = await prisma.event.findUnique({
        where: { id },
        select: defaultEventSelect,
      });
      if (!event) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `No event with id '${id}'`,
        });
      }
      return event;
    }),
  // add: publicProcedure
  //   .input(
  //     z.object({
  //       id: z.string().uuid().optional(),
  //       title: z.string().min(1).max(32),
  //       text: z.string().min(1),
  //     }),
  //   )
  //   .mutation(async ({ input }) => {
  //     const post = await prisma.post.create({
  //       data: input,
  //       select: defaultPostSelect,
  //     });
  //     return post;
  //   }),
});
