/**
 * Integration test for the `event` router
 *
 * This test suite covers the event creation TRPC mutation and related functionality.
 *
 * Test Coverage:
 * - event.create mutation with full authentication and authorization flow
 * - Event creation with variants and extras
 * - Input validation (required fields, data types, constraints)
 * - Authentication checks (unauthorized access)
 * - Authorization checks (user must have organization)
 * - Optional field handling
 * - Database integrity verification
 * - event.list filtering functionality
 * - event.byId retrieval and error handling
 *
 * The tests use a clean database state for each test to ensure isolation
 * and create minimal test data (organizations, users, events) as needed.
 */
import type { inferProcedureInput } from '@trpc/server';
import { createContextInner } from '../context';
import type { AppRouter } from './_app';
import { createCaller } from './_app';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';

// Clean up database before and after tests
beforeEach(async () => {
  await prisma.order.deleteMany();
  await prisma.eventExtras.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
});

afterEach(async () => {
  await prisma.order.deleteMany();
  await prisma.eventExtras.deleteMany();
  await prisma.variant.deleteMany();
  await prisma.event.deleteMany();
  await prisma.user.deleteMany();
  await prisma.organization.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('event.create', () => {
  test('should create event with variants and extras when user is authenticated and has organization', async () => {
    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    // Create authenticated context
    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    const input: inferProcedureInput<AppRouter['event']['create']> = {
      title: 'Test Event',
      text: 'A test event description',
      location: 'Test Location',
      link: 'https://test.com',
      startsAt: new Date('2024-12-25T10:00:00Z'),
      endsAt: new Date('2024-12-25T18:00:00Z'),
      enabled: true,
      variants: [
        {
          title: 'Standard Ticket',
          price: 25.99,
          stock: 100,
          displayOrder: 0,
        },
        {
          title: 'VIP Ticket',
          price: 49.99,
          stock: 50,
          displayOrder: 1,
        },
      ],
      extras: [
        {
          title: 'T-shirt',
          price: 15.0,
        },
        {
          title: 'Meal voucher',
          price: 10.0,
        },
      ],
    };

    const event = await caller.event.create(input);

    // Verify event was created correctly
    expect(event).toMatchObject({
      id: expect.any(String),
      title: 'Test Event',
      text: 'A test event description',
    });

    // Verify variants were created
    expect(event.variants).toHaveLength(2);
    expect(event.variants[0]).toMatchObject({
      title: 'Standard Ticket',
      price: 25.99,
      stock: 100,
      currency: 'GBP',
      displayOrder: 0,
    });
    expect(event.variants[1]).toMatchObject({
      title: 'VIP Ticket',
      price: 49.99,
      stock: 50,
      currency: 'GBP',
      displayOrder: 1,
    });

    // Verify extras were created
    expect(event.eventExtras).toHaveLength(2);
    expect(event.eventExtras[0]).toMatchObject({
      title: 'T-shirt',
      price: 15.0,
      currency: 'GBP',
    });
    expect(event.eventExtras[1]).toMatchObject({
      title: 'Meal voucher',
      price: 10.0,
      currency: 'GBP',
    });

    // Verify database state
    const dbEvent = await prisma.event.findUnique({
      where: { id: event.id },
      include: {
        variants: true,
        eventExtras: true,
        organization: true,
      },
    });

    expect(dbEvent).toBeTruthy();
    expect(dbEvent?.organizationId).toBe(organization.id);
    expect(dbEvent?.variants).toHaveLength(2);
    expect(dbEvent?.eventExtras).toHaveLength(2);
  });

  test('should create event with minimal data (no extras)', async () => {
    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    const input: inferProcedureInput<AppRouter['event']['create']> = {
      title: 'Minimal Event',
      text: 'A minimal event',
      startsAt: new Date('2024-12-25T10:00:00Z'),
      enabled: false,
      variants: [
        {
          title: 'Basic Ticket',
          price: 10.0,
          stock: 20,
          displayOrder: 0,
        },
      ],
    };

    const event = await caller.event.create(input);

    expect(event).toMatchObject({
      title: 'Minimal Event',
      text: 'A minimal event',
      enabled: false,
    });
    expect(event.variants).toHaveLength(1);
    expect(event.eventExtras).toHaveLength(0);
  });

  test('should throw UNAUTHORIZED when user is not authenticated', async () => {
    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input: inferProcedureInput<AppRouter['event']['create']> = {
      title: 'Test Event',
      text: 'A test event',
      startsAt: new Date(),
      enabled: true,
      variants: [
        {
          title: 'Ticket',
          price: 10,
          stock: 10,
          displayOrder: 0,
        },
      ],
    };

    await expect(caller.event.create(input)).rejects.toThrow(TRPCError);
    await expect(caller.event.create(input)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('should throw FORBIDDEN when user has no organization', async () => {
    // Create user without organization
    await prisma.user.create({
      data: {
        email: 'orphan@example.com',
        name: 'Orphan User',
        role: 'USER',
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'orphan@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    const input: inferProcedureInput<AppRouter['event']['create']> = {
      title: 'Test Event',
      text: 'A test event',
      startsAt: new Date(),
      enabled: true,
      variants: [
        {
          title: 'Ticket',
          price: 10,
          stock: 10,
          displayOrder: 0,
        },
      ],
    };

    await expect(caller.event.create(input)).rejects.toThrow(TRPCError);
    await expect(caller.event.create(input)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: 'User must be associated with an organization to create events',
    });
  });

  test('should validate input data correctly', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    // Test with empty title
    await expect(
      caller.event.create({
        title: '',
        text: 'Valid text',
        startsAt: new Date(),
        enabled: true,
        variants: [
          {
            title: 'Ticket',
            price: 10,
            stock: 10,
            displayOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow();

    // Test with negative price
    await expect(
      caller.event.create({
        title: 'Valid Title',
        text: 'Valid text',
        startsAt: new Date(),
        enabled: true,
        variants: [
          {
            title: 'Ticket',
            price: -5,
            stock: 10,
            displayOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow();

    // Test with no variants
    await expect(
      caller.event.create({
        title: 'Valid Title',
        text: 'Valid text',
        startsAt: new Date(),
        enabled: true,
        variants: [],
      }),
    ).rejects.toThrow();
  });

  test('should handle optional fields correctly', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    const input: inferProcedureInput<AppRouter['event']['create']> = {
      title: 'Event with optional fields',
      text: 'Description',
      startsAt: new Date('2024-12-25T10:00:00Z'),
      endsAt: null,
      enabled: true,
      variants: [
        {
          title: 'Ticket',
          price: 15,
          stock: 25,
          displayOrder: 0,
        },
      ],
    };

    const event = await caller.event.create(input);

    const dbEvent = await prisma.event.findUnique({
      where: { id: event.id },
    });

    expect(dbEvent?.location).toBe('');
    expect(dbEvent?.link).toBe('');
    expect(dbEvent?.endsAt).toBeNull();
  });
});

describe('event.list', () => {
  test('should list events with correct filtering', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    // Create test events
    await prisma.event.createMany({
      data: [
        {
          title: 'Enabled Event',
          text: 'Description',
          enabled: true,
          organizationId: organization.id,
        },
        {
          title: 'Disabled Event',
          text: 'Description',
          enabled: false,
          organizationId: organization.id,
        },
      ],
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    // Test filtering enabled events
    const enabledEvents = await caller.event.list({
      filter: { enabled: true },
    });

    expect(enabledEvents.items).toHaveLength(1);
    expect(enabledEvents.items[0].title).toBe('Enabled Event');

    // Test listing all events
    const allEvents = await caller.event.list({});
    expect(allEvents.items).toHaveLength(2);
  });
});

describe('event.byId', () => {
  test('should get event by id', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Org',
        email: 'test@org.com',
      },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
      },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const result = await caller.event.byId({ id: event.id });

    expect(result).toMatchObject({
      id: event.id,
      title: 'Test Event',
      text: 'Description',
    });
  });

  test('should throw NOT_FOUND for non-existent event', async () => {
    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    await expect(caller.event.byId({ id: 'non-existent-id' })).rejects.toThrow(
      TRPCError,
    );
    await expect(
      caller.event.byId({ id: 'non-existent-id' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  test('should preserve variants with existing orders during update', async () => {
    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        email: 'org@test.com',
      },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    // Create an event with variants
    const originalEvent = await prisma.event.create({
      data: {
        title: 'Event with Orders',
        text: 'Event description',
        startsAt: new Date('2024-12-25T10:00:00Z'),
        organizationId: organization.id,
        variants: {
          create: [
            {
              title: 'Variant with Orders',
              price: 20.0,
              currency: 'GBP',
              stock: 100,
              displayOrder: 0,
            },
            {
              title: 'Variant without Orders',
              price: 30.0,
              currency: 'GBP',
              stock: 50,
              displayOrder: 1,
            },
          ],
        },
      },
    });

    const variants = await prisma.variant.findMany({
      where: { eventId: originalEvent.id },
    });

    // Create an order for the first variant
    await prisma.order.create({
      data: {
        eventId: originalEvent.id,
        variantId: variants[0].id,
        quantity: 2,
        status: 'CONFIRMED',
        selectedExtras: [],
        items: [],
        customer: {},
        amount: 40.0,
        currency: 'GBP',
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    // Update event - try to modify both variants and add a new one
    const updateInput: inferProcedureInput<AppRouter['event']['update']> = {
      id: originalEvent.id,
      title: 'Updated Event',
      text: 'Updated description',
      startsAt: new Date('2024-12-26T14:00:00Z'),
      enabled: true,
      variants: [
        {
          id: variants[0].id, // Variant with orders - should be preserved and updated
          title: 'Updated Variant with Orders',
          price: 25.0,
          stock: 80,
          displayOrder: 0,
        },
        // Omit variants[1] - should be deleted since it has no orders
        {
          // New variant without ID - should be created
          title: 'New Variant',
          price: 35.0,
          stock: 30,
          displayOrder: 1,
        },
      ],
      extras: [],
    };

    const updatedEvent = await caller.event.update(updateInput);

    // Verify the update was successful
    expect(updatedEvent!.title).toBe('Updated Event');

    // Check variants in database
    const finalVariants = await prisma.variant.findMany({
      where: { eventId: originalEvent.id },
      include: { orders: true },
      orderBy: { displayOrder: 'asc' },
    });

    expect(finalVariants).toHaveLength(2);

    // First variant should be preserved and updated (it has orders)
    expect(finalVariants[0]).toMatchObject({
      id: variants[0].id, // Same ID - preserved
      title: 'Updated Variant with Orders',
      price: 25.0,
      stock: 80,
    });
    expect(finalVariants[0].orders).toHaveLength(1); // Order still exists

    // Second variant should be the new one
    expect(finalVariants[1]).toMatchObject({
      title: 'New Variant',
      price: 35.0,
      stock: 30,
    });
    expect(finalVariants[1].id).not.toBe(variants[1].id); // Different ID - new variant

    // Verify the variant without orders was deleted
    const deletedVariant = await prisma.variant.findUnique({
      where: { id: variants[1].id },
    });
    expect(deletedVariant).toBeNull();

    // Verify the order still references the correct variant
    const order = await prisma.order.findFirst({
      where: { eventId: originalEvent.id },
    });
    expect(order?.variantId).toBe(variants[0].id);
  });
});

describe('event.update', () => {
  test('should update event successfully', async () => {
    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        email: 'org@test.com',
      },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    // Create an event to update
    const originalEvent = await prisma.event.create({
      data: {
        title: 'Original Event',
        text: 'Original description',
        location: 'Original location',
        enabled: false,
        startsAt: new Date('2024-12-25T10:00:00Z'),
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Original Ticket',
            price: 10.0,
            currency: 'GBP',
            stock: 50,
            displayOrder: 0,
          },
        },
        eventExtras: {
          create: {
            title: 'Original Extra',
            price: 5.0,
            currency: 'GBP',
          },
        },
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    const updateInput: inferProcedureInput<AppRouter['event']['update']> = {
      id: originalEvent.id,
      title: 'Updated Event',
      text: 'Updated description',
      location: 'Updated location',
      link: 'https://updated.com',
      startsAt: new Date('2024-12-26T14:00:00Z'),
      endsAt: new Date('2024-12-26T18:00:00Z'),
      enabled: true,
      variants: [
        {
          title: 'Updated Ticket',
          price: 15.0,
          stock: 75,
          displayOrder: 0,
        },
        {
          title: 'New Ticket Type',
          price: 25.0,
          stock: 25,
          displayOrder: 1,
        },
      ],
      extras: [
        {
          title: 'Updated Extra',
          price: 8.0,
        },
      ],
    };

    const updatedEvent = await caller.event.update(updateInput);

    // Verify the update was successful
    expect(updatedEvent).toMatchObject({
      id: originalEvent.id,
      title: 'Updated Event',
      text: 'Updated description',
      location: 'Updated location',
      link: 'https://updated.com',
      enabled: true,
    });

    // Verify variants were updated
    expect(updatedEvent.variants).toHaveLength(2);
    expect(updatedEvent.variants[0]).toMatchObject({
      title: 'Updated Ticket',
      price: 15.0,
      stock: 75,
    });
    expect(updatedEvent.variants[1]).toMatchObject({
      title: 'New Ticket Type',
      price: 25.0,
      stock: 25,
    });

    // Verify extras were updated
    expect(updatedEvent.eventExtras).toHaveLength(1);
    expect(updatedEvent.eventExtras[0]).toMatchObject({
      title: 'Updated Extra',
      price: 8.0,
    });
  });

  test('should throw FORBIDDEN when user does not own event', async () => {
    // Create two organizations
    const org1 = await prisma.organization.create({
      data: { name: 'Org 1', email: 'org1@test.com' },
    });

    const org2 = await prisma.organization.create({
      data: { name: 'Org 2', email: 'org2@test.com' },
    });

    // User belongs to org1
    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: org1.id,
      },
    });

    // Event belongs to org2
    const event = await prisma.event.create({
      data: {
        title: 'Other Org Event',
        text: 'Description',
        organizationId: org2.id,
        variants: {
          create: {
            title: 'Ticket',
            price: 10.0,
            currency: 'GBP',
            stock: 50,
            displayOrder: 0,
          },
        },
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    await expect(
      caller.event.update({
        id: event.id,
        title: 'Updated Title',
        text: 'Updated description',
        startsAt: new Date(),
        enabled: true,
        variants: [
          {
            title: 'Updated Ticket',
            price: 15.0,
            stock: 50,
            displayOrder: 0,
          },
        ],
      }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.event.update({
        id: event.id,
        title: 'Updated Title',
        text: 'Updated description',
        startsAt: new Date(),
        enabled: true,
        variants: [
          {
            title: 'Updated Ticket',
            price: 15.0,
            stock: 50,
            displayOrder: 0,
          },
        ],
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Event not found or you do not have permission to edit it',
    });
  });
});
