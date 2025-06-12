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
  getOrganization: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) throw new Error('Could not get email from user');

    const user = await prisma.user.findFirstOrThrow({
      select: {
        organization: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            address: true,
            city: true,
            postCode: true,
            website: true,
            users: {
              select: {
                id: true,
                email: true,
                name: true,
                role: true,
                createdAt: true,
              },
            },
          },
        },
      },
      where: { email: ctx.user.email },
    });

    if (!user.organization) {
      throw new Error('User does not belong to an organization');
    }

    return user.organization;
  }),
  addOrganizationMember: authedProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1),
        role: z.string().default('USER'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Get current user's organization
      const currentUser = await prisma.user.findFirstOrThrow({
        select: { organizationId: true },
        where: { email: ctx.user.email },
      });

      if (!currentUser.organizationId) {
        throw new Error('User does not belong to an organization');
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { email: input.email },
      });

      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Create new user
      const newUser = await prisma.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          organizationId: currentUser.organizationId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        },
      });

      return newUser;
    }),
  removeOrganizationMember: authedProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Get current user's organization
      const currentUser = await prisma.user.findFirstOrThrow({
        select: { organizationId: true, id: true },
        where: { email: ctx.user.email },
      });

      if (!currentUser.organizationId) {
        throw new Error('User does not belong to an organization');
      }

      // Check if trying to remove self
      if (currentUser.id === input.userId) {
        throw new Error('Cannot remove yourself from the organization');
      }

      // Verify the user to be removed belongs to the same organization
      const userToRemove = await prisma.user.findFirst({
        where: {
          id: input.userId,
          organizationId: currentUser.organizationId,
        },
      });

      if (!userToRemove) {
        throw new Error('User not found in your organization');
      }

      // Remove user from organization
      await prisma.user.delete({
        where: { id: input.userId },
      });

      return { success: true };
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
