import { router, authedProcedure, authedProcedureWithEventId } from '../trpc';
import type { Prisma } from '~/generated/prisma/client';
import { z } from 'zod';

import { prisma } from '~/server/prisma';

const defaultUserSelect = {
  id: true,
  email: true,
  role: true,
  name: true,
  phone: true,
  address: true,
  orders: true,
  organization: {
    select: {
      id: true,
      events: true,
      name: true,
    },
  },
} satisfies Prisma.UserSelect;

export const userRouter = router({
  getUser: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) throw new Error('Could not get email from user');

    const user = await prisma.user.findFirstOrThrow({
      select: defaultUserSelect,
      where: { email: ctx.user.email },
    });

    return user;
  }),
  getUserEvents: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) throw new Error('Could not get email from user');

    const user = await prisma.user.findFirstOrThrow({
      select: {
        id: true,
        organization: {
          select: {
            id: true,
            events: {
              select: {
                id: true,
                title: true,
                enabled: true,
                startsAt: true,
                endsAt: true,
              },
            },
          },
        },
      },
      where: { email: ctx.user.email },
    });

    return user.organization?.events || [];
  }),
  getUserEvent: authedProcedureWithEventId.query(async ({ input }) => {
    const event = await prisma.event.findFirstOrThrow({
      select: {
        title: true,
        text: true,
        location: true,
        link: true,
        enabled: true,
        startsAt: true,
        endsAt: true,
        variants: {
          select: {
            id: true,
            title: true,
            stock: true,
            price: true,
            currency: true,
            displayOrder: true,
            orders: {
              select: {
                status: true,
                quantity: true,
              },
            },
          },
          orderBy: {
            displayOrder: 'asc',
          },
        },
        eventExtras: true,
      },
      where: { id: input.eventId },
    });

    return event;
  }),
  getUserEventOrders: authedProcedureWithEventId
    .input(
      z.object({
        eventId: z.string().uuid(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { eventId, limit, cursor } = input;
      
      const orders = await prisma.order.findMany({
        take: limit + 1, // Take one extra to determine if there are more results
        cursor: cursor ? { id: cursor } : undefined,
        skip: cursor ? 1 : 0, // Skip the cursor itself
        include: { variant: { select: { title: true, price: true } } },
        where: { eventId },
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined = undefined;
      if (orders.length > limit) {
        const nextItem = orders.pop(); // Remove the extra item
        nextCursor = nextItem!.id;
      }

      return {
        orders,
        nextCursor,
        hasMore: !!nextCursor,
      };
    }),
  getAllUserEventOrders: authedProcedureWithEventId.query(async ({ input }) => {
    const orders = await prisma.order.findMany({
      include: { variant: { select: { title: true, price: true } } },
      where: { eventId: input.eventId },
      orderBy: { createdAt: 'desc' },
    });

    return orders;
  }),
});
