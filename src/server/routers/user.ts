import { router, publicProcedure } from '../trpc';
import type { Prisma } from '~/generated/prisma/client';
import { z } from 'zod';
import { prisma } from '~/server/prisma';
import { TRPCError } from '@trpc/server';

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

// TODO user login - get from session
const userEmail = 'comms@friendsofhped.com';

export const userRouter = router({
  getUser: publicProcedure.query(async () => {
    const user = await prisma.user.findFirstOrThrow({
      select: defaultUserSelect,
      where: { email: userEmail },
    });

    return user;
  }),
  getUserEvents: publicProcedure.query(async () => {
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
      where: { email: userEmail },
    });

    return user.organization?.events;
  }),
  getUserEvent: publicProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ input }) => {
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
                },
              },
            },
          },
          eventExtras: true,
        },
        where: { id: input.eventId },
      });

      return event;
    }),
  getUserEventOrders: publicProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ input }) => {
      const orders = await prisma.order.findMany({
        include: { variant: { select: { title: true } } },
        where: { eventId: input.eventId },
        orderBy: { createdAt: 'desc' },
      });

      return orders;
    }),
});
