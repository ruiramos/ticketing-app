import { router, authedProcedure, authedProcedureWithEventId } from '../trpc';
import type { Prisma } from '~/generated/prisma/client';
import { z } from 'zod';
import { InviteOrganizationMemberSchema } from '~/lib/schemas';

import { prisma } from '~/server/prisma';
import { sendEmail } from '~/utils/email';

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
  inviteOrganizationMember: authedProcedure
    .input(InviteOrganizationMemberSchema)
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Get current user's organization and ID
      const currentUser = await prisma.user.findFirstOrThrow({
        select: { organizationId: true, id: true },
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

      // Check if there's already a pending invitation
      const existingInvitation = await prisma.organizationInvitation.findFirst({
        where: {
          email: input.email,
          organizationId: currentUser.organizationId,
          status: 'PENDING',
        },
      });

      if (existingInvitation) {
        throw new Error('An invitation has already been sent to this email');
      }

      // Generate unique token
      const token = crypto.randomUUID();

      // Create invitation (expires in 7 days)
      const invitation = await prisma.organizationInvitation.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role,
          token,
          organizationId: currentUser.organizationId,
          invitedById: currentUser.id,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      });

      sendEmail({
        to: input.email,
        subject: `Invitation to join ${invitation.organization.name} organization`,
        content: `<h1>Ticketing App</h1>

        <p>You have been invited to join the organization ${invitation.organization.name} on Ticketing App.</p>
        <p>Please click the link below to accept the invitation:</p>

  <a href="${process.env.NEXTAUTH_URL}/invite/${invitation.token}">Accept Invitation</a>
`,
      });

      return {
        id: invitation.id,
        email: invitation.email,
        name: invitation.name,
        role: invitation.role,
        status: 'PENDING',
        createdAt: invitation.createdAt,
      };
    }),
  getInvitationByToken: authedProcedure
    .input(
      z.object({
        token: z.string().uuid(),
      }),
    )
    .query(async ({ input }) => {
      const invitation = await prisma.organizationInvitation.findUnique({
        where: { token: input.token },
        include: {
          organization: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!invitation) {
        throw new Error('Invalid invitation token');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Invitation has already been processed');
      }

      if (invitation.expiresAt < new Date()) {
        throw new Error('Invitation has expired');
      }

      return {
        name: invitation.name,
        email: invitation.email,
        role: invitation.role,
        organizationName: invitation.organization.name,
        expiresAt: invitation.expiresAt,
      };
    }),
  acceptInvitation: authedProcedure
    .input(
      z.object({
        token: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Find the invitation
      const invitation = await prisma.organizationInvitation.findUnique({
        where: { token: input.token },
        include: {
          organization: true,
        },
      });

      if (!invitation) {
        throw new Error('Invalid invitation token');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Invitation has already been processed');
      }

      if (invitation.expiresAt < new Date()) {
        await prisma.organizationInvitation.update({
          where: { id: invitation.id },
          data: { status: 'EXPIRED' },
        });
        throw new Error('Invitation has expired');
      }

      if (invitation.email !== ctx.user.email) {
        throw new Error('Invitation email does not match your account');
      }

      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: { email: ctx.user.email },
      });

      if (existingUser) {
        // Update existing user's organization
        await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            organizationId: invitation.organizationId,
            role: invitation.role,
            name: invitation.name,
          },
        });
      } else {
        // Create new user
        await prisma.user.create({
          data: {
            email: invitation.email,
            name: invitation.name,
            role: invitation.role,
            organizationId: invitation.organizationId,
          },
        });
      }

      // Mark invitation as accepted
      await prisma.organizationInvitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return { success: true };
    }),
  getOrganizationInvitations: authedProcedure.query(async ({ ctx }) => {
    if (!ctx.user.email) throw new Error('Could not get email from user');

    const user = await prisma.user.findFirstOrThrow({
      select: { organizationId: true },
      where: { email: ctx.user.email },
    });

    if (!user.organizationId) {
      throw new Error('User does not belong to an organization');
    }

    const invitations = await prisma.organizationInvitation.findMany({
      where: { organizationId: user.organizationId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return invitations;
  }),
  cancelInvitation: authedProcedure
    .input(
      z.object({
        invitationId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      const currentUser = await prisma.user.findFirstOrThrow({
        select: { organizationId: true },
        where: { email: ctx.user.email },
      });

      if (!currentUser.organizationId) {
        throw new Error('User does not belong to an organization');
      }

      // Verify the invitation belongs to the same organization
      const invitation = await prisma.organizationInvitation.findFirst({
        where: {
          id: input.invitationId,
          organizationId: currentUser.organizationId,
        },
      });

      if (!invitation) {
        throw new Error('Invitation not found in your organization');
      }

      if (invitation.status !== 'PENDING') {
        throw new Error('Can only cancel pending invitations');
      }

      // Delete the invitation
      await prisma.organizationInvitation.delete({
        where: { id: input.invitationId },
      });

      return { success: true };
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
  getUserEventOrdersSummary: authedProcedureWithEventId.query(
    async ({ input }) => {
      const orders = await prisma.order.findMany({
        select: {
          status: true,
          quantity: true,
          amount: true,
          selectedExtras: true,
          variant: {
            select: {
              price: true,
            },
          },
        },
        where: { eventId: input.eventId },
      });

      const confirmedOrders = orders.filter(
        (order) => order.status === 'CONFIRMED',
      );
      const totalOrders = confirmedOrders.length;
      const totalTickets = confirmedOrders.reduce(
        (sum, order) => sum + order.quantity,
        0,
      );

      // Calculate ticket revenue (from variants)
      const ticketRevenue = confirmedOrders.reduce((sum, order) => {
        return sum + order.variant.price * order.quantity;
      }, 0);

      // Calculate addon revenue (from extras)
      const addonRevenue = confirmedOrders.reduce((sum, order) => {
        const extrasTotal = ((order.selectedExtras as any[]) || []).reduce(
          (extraSum, extra) => {
            return extraSum + extra.price * extra.quantity;
          },
          0,
        );
        return sum + extrasTotal;
      }, 0);

      const totalRevenue = ticketRevenue + addonRevenue;

      return {
        totalOrders,
        totalTickets,
        ticketRevenue,
        addonRevenue,
        totalRevenue,
      };
    },
  ),
});
