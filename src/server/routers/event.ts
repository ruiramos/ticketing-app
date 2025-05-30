import { router, publicProcedure, authedProcedure } from '../trpc';
import type { Prisma } from '~/generated/prisma/client';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { prisma } from '~/server/prisma';

const defaultEventSelect = {
  id: true,
  title: true,
  text: true,
  location: true,
  link: true,
  startsAt: true,
  endsAt: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  variants: {
    orderBy: {
      displayOrder: 'asc',
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
  create: authedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(255),
        text: z.string().min(1),
        location: z.string().optional(),
        link: z.string().optional(),
        startsAt: z.date(),
        endsAt: z.date().nullable().optional(),
        enabled: z.boolean().default(true),
        variants: z
          .array(
            z.object({
              title: z.string().min(1),
              price: z.number().min(0),
              stock: z.number().int().min(0),
              displayOrder: z.number().int().min(0),
            }),
          )
          .min(1),
        extras: z
          .array(
            z.object({
              title: z.string().min(1),
              price: z.number().min(0),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Get user's organization
      const user = await prisma.user.findFirst({
        where: { email: ctx.user.email },
        include: { organization: true },
      });

      if (!user?.organization) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'User must be associated with an organization to create events',
        });
      }

      const event = await prisma.event.create({
        data: {
          title: input.title,
          text: input.text,
          location: input.location || '',
          link: input.link || '',
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          enabled: input.enabled,
          organizationId: user.organization.id,
          variants: {
            create: input.variants.map((variant) => ({
              title: variant.title,
              price: variant.price,
              currency: 'GBP',
              stock: variant.stock,
              displayOrder: variant.displayOrder,
            })),
          },
          eventExtras: {
            create: input.extras.map((extra) => ({
              title: extra.title,
              price: extra.price,
              currency: 'GBP',
            })),
          },
        },
        select: defaultEventSelect,
      });

      return event;
    }),
  update: authedProcedure
    .input(
      z.object({
        id: z.string(),
        title: z.string().min(1).max(255),
        text: z.string().min(1),
        location: z.string().optional(),
        link: z.string().optional(),
        startsAt: z.date(),
        endsAt: z.date().nullable().optional(),
        enabled: z.boolean().default(true),
        variants: z
          .array(
            z.object({
              id: z.string().optional(),
              title: z.string().min(1),
              price: z.number().min(0),
              stock: z.number().int().min(0),
              displayOrder: z.number().int().min(0),
            }),
          )
          .min(1),
        extras: z
          .array(
            z.object({
              id: z.string().optional(),
              title: z.string().min(1),
              price: z.number().min(0),
              description: z.string().optional(),
            }),
          )
          .optional()
          .default([]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user.email) throw new Error('Could not get email from user');

      // Get user's organization
      const user = await prisma.user.findFirst({
        where: { email: ctx.user.email },
        include: { organization: true },
      });

      if (!user?.organization) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message:
            'User must be associated with an organization to update events',
        });
      }

      // Check if user has access to this event
      const existingEvent = await prisma.event.findFirst({
        where: {
          id: input.id,
          organizationId: user.organization.id,
        },
        include: { variants: true, eventExtras: true },
      });

      if (!existingEvent) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Event not found or you do not have permission to edit it',
        });
      }

      // Use transaction to update event, variants, and extras
      const event = await prisma.$transaction(async (tx) => {
        // Update main event data
        await tx.event.update({
          where: { id: input.id },
          data: {
            title: input.title,
            text: input.text,
            location: input.location || '',
            link: input.link || '',
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            enabled: input.enabled,
          },
          select: defaultEventSelect,
        });

        // Handle variants - update/create/delete safely
        const existingVariants = await tx.variant.findMany({
          where: { eventId: input.id },
          include: { orders: true },
        });

        // Check which variants have orders (cannot be deleted)
        const variantsWithOrders = existingVariants.filter(
          (v) => v.orders.length > 0,
        );
        const variantIdsWithOrders = new Set(
          variantsWithOrders.map((v) => v.id),
        );

        // Process input variants
        for (const inputVariant of input.variants) {
          if (inputVariant.id && variantIdsWithOrders.has(inputVariant.id)) {
            // Update existing variant with orders (preserve it)
            await tx.variant.update({
              where: { id: inputVariant.id },
              data: {
                title: inputVariant.title,
                price: inputVariant.price,
                stock: inputVariant.stock,
                displayOrder: inputVariant.displayOrder,
              },
            });
          } else if (inputVariant.id) {
            // Update existing variant without orders
            await tx.variant.update({
              where: { id: inputVariant.id },
              data: {
                title: inputVariant.title,
                price: inputVariant.price,
                stock: inputVariant.stock,
                displayOrder: inputVariant.displayOrder,
              },
            });
          } else {
            // Create new variant
            await tx.variant.create({
              data: {
                eventId: input.id,
                title: inputVariant.title,
                price: inputVariant.price,
                currency: 'GBP',
                stock: inputVariant.stock,
                displayOrder: inputVariant.displayOrder,
              },
            });
          }
        }

        // Delete variants that are no longer needed (only those without orders)
        const inputVariantIds = new Set(
          input.variants.map((v) => v.id).filter(Boolean),
        );
        const variantsToDelete = existingVariants.filter(
          (v) => !inputVariantIds.has(v.id) && v.orders.length === 0,
        );

        if (variantsToDelete.length > 0) {
          await tx.variant.deleteMany({
            where: {
              id: { in: variantsToDelete.map((v) => v.id) },
            },
          });
        }

        // Handle extras - update/create/delete safely
        const existingExtras = await tx.eventExtras.findMany({
          where: { eventId: input.id },
        });

        // Process input extras
        for (const inputExtra of input.extras) {
          if (inputExtra.id) {
            // Update existing extra
            await tx.eventExtras.update({
              where: { id: inputExtra.id },
              data: {
                title: inputExtra.title,
                price: inputExtra.price,
                description: inputExtra.description,
              },
            });
          } else {
            // Create new extra
            await tx.eventExtras.create({
              data: {
                eventId: input.id,
                title: inputExtra.title,
                price: inputExtra.price,
                description: inputExtra.description,
                currency: 'GBP',
              },
            });
          }
        }

        // Delete extras that are no longer needed
        const inputExtraIds = new Set(
          input.extras.map((e) => e.id).filter(Boolean),
        );
        const extrasToDelete = existingExtras.filter(
          (e) => !inputExtraIds.has(e.id),
        );

        if (extrasToDelete.length > 0) {
          await tx.eventExtras.deleteMany({
            where: {
              id: { in: extrasToDelete.map((e) => e.id) },
            },
          });
        }

        // Fetch the complete updated event with relations
        return await tx.event.findFirst({
          where: { id: input.id },
          select: defaultEventSelect,
        });
      });

      return event;
    }),
});
