/**
 * Integration test for the `user` router
 *
 * This test suite covers the user-related TRPC queries and functionality.
 *
 * Test Coverage:
 * - user.getUser query with authentication
 * - user.getUserEvents query for organization events
 * - user.getUserEvent query with event validation
 * - user.getUserEventOrders query for event orders
 * - Authentication and authorization checks
 * - Error handling for missing users and events
 *
 * The tests use a clean database state for each test to ensure isolation
 * and create minimal test data (organizations, users, events) as needed.
 */
import { createContextInner } from '../context';
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

describe('user.getUser', () => {
  test('should return user data when authenticated', async () => {
    // Create test organization and user
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        email: 'org@test.com',
      },
    });

    const user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        phone: '1234567890',
        address: '123 Test St',
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
    const result = await caller.user.getUser();

    expect(result).toMatchObject({
      id: user.id,
      email: 'test@example.com',
      name: 'Test User',
      role: 'ADMIN',
      phone: '1234567890',
      address: '123 Test St',
      organization: {
        id: organization.id,
        name: 'Test Organization',
      },
    });
  });

  test('should throw UNAUTHORIZED when not authenticated', async () => {
    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    await expect(caller.user.getUser()).rejects.toThrow(TRPCError);
    await expect(caller.user.getUser()).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  test('should throw error when user email is missing', async () => {
    const ctx = await createContextInner({
      session: {
        user: { email: undefined },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);

    await expect(caller.user.getUser()).rejects.toThrow(
      'Could not get email from user',
    );
  });

  test('should not throw error when user does not exist', async () => {
    const ctx = await createContextInner({
      session: {
        user: { email: 'nonexistent@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const user = await caller.user.getUser();

    expect(user).toMatchObject({
      address: null,
      email: ctx.session!.user!.email,
      id: expect.any(String),
      role: 'USER',
      organization: null,
    });
  });
});

describe('user.getUserEvents', () => {
  test('should return user organization events', async () => {
    // Create test organization with events
    const organization = await prisma.organization.create({
      data: {
        name: 'Test Organization',
        email: 'org@test.com',
        events: {
          create: [
            {
              title: 'Event 1',
              text: 'Description 1',
              enabled: true,
              startsAt: new Date('2024-12-25T10:00:00Z'),
              endsAt: new Date('2024-12-25T18:00:00Z'),
            },
            {
              title: 'Event 2',
              text: 'Description 2',
              enabled: false,
              startsAt: new Date('2024-12-26T10:00:00Z'),
            },
          ],
        },
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

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const events = await caller.user.getUserEvents();

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      title: 'Event 1',
      enabled: true,
    });
    expect(events[1]).toMatchObject({
      title: 'Event 2',
      enabled: false,
    });
  });

  test('should return empty array when user has no organization', async () => {
    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'USER',
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const events = await caller.user.getUserEvents();

    expect(events).toEqual([]);
  });

  test('should return empty array when organization has no events', async () => {
    const organization = await prisma.organization.create({
      data: {
        name: 'Empty Organization',
        email: 'empty@test.com',
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

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const events = await caller.user.getUserEvents();

    expect(events).toEqual([]);
  });
});

describe('user.getUserEvent', () => {
  test('should return event details when user has access', async () => {
    // Create organization with user and event
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

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Event Description',
        location: 'Test Location',
        link: 'https://test.com',
        enabled: true,
        startsAt: new Date('2024-12-25T10:00:00Z'),
        endsAt: new Date('2024-12-25T18:00:00Z'),
        organizationId: organization.id,
        variants: {
          create: [
            {
              title: 'Standard Ticket',
              price: 25.99,
              currency: 'GBP',
              stock: 100,
              displayOrder: 0,
            },
          ],
        },
        eventExtras: {
          create: [
            {
              title: 'T-shirt',
              price: 15.0,
              currency: 'GBP',
            },
          ],
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
    const result = await caller.user.getUserEvent({ eventId: event.id });

    expect(result).toMatchObject({
      title: 'Test Event',
      text: 'Event Description',
      location: 'Test Location',
      link: 'https://test.com',
      enabled: true,
    });
    expect(result.variants).toHaveLength(1);
    expect(result.variants[0]).toMatchObject({
      title: 'Standard Ticket',
      price: 25.99,
      currency: 'GBP',
      stock: 100,
    });
    expect(result.eventExtras).toHaveLength(1);
    expect(result.eventExtras[0]).toMatchObject({
      title: 'T-shirt',
      price: 15.0,
    });
  });

  test('should throw FORBIDDEN when user does not have access to event', async () => {
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
        title: 'Forbidden Event',
        text: 'Description',
        organizationId: org2.id,
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
      caller.user.getUserEvent({ eventId: event.id }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.user.getUserEvent({ eventId: event.id }),
    ).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  test('should throw NOT_FOUND when event does not exist', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const _user = await prisma.user.create({
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

    await expect(
      caller.user.getUserEvent({ eventId: 'non-existent-id' }),
    ).rejects.toThrow(TRPCError);
    await expect(
      caller.user.getUserEvent({ eventId: 'non-existent-id' }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('user.getUserEventOrders', () => {
  test('should return orders for user event', async () => {
    // Create organization, user, event, and orders
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Standard Ticket',
            price: 25.99,
            currency: 'GBP',
            stock: 100,
            displayOrder: 0,
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const _orders = await prisma.order.createMany({
      data: [
        {
          eventId: event.id,
          variantId: variant!.id,
          quantity: 2,
          status: 'CONFIRMED',
          selectedExtras: [],
          items: [],
          customer: {},
          amount: 51.98,
          currency: 'GBP',
        },
        {
          eventId: event.id,
          variantId: variant!.id,
          quantity: 1,
          status: 'RESERVED',
          selectedExtras: [],
          items: [],
          customer: {},
          amount: 25.99,
          currency: 'GBP',
        },
      ],
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const result = await caller.user.getUserEventOrders({ eventId: event.id });

    expect(result.orders).toHaveLength(2);
    expect(result.orders[0]).toMatchObject({
      quantity: expect.any(Number),
      status: expect.stringMatching(/CONFIRMED|RESERVED/),
      amount: expect.any(Number),
      currency: 'GBP',
    });
    expect(result.orders[0].variant).toMatchObject({
      title: 'Standard Ticket',
      price: 25.99,
    });
  });

  test('should return empty array when event has no orders', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Event with no orders',
        text: 'Description',
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
    const result = await caller.user.getUserEventOrders({ eventId: event.id });

    expect(result.orders).toEqual([]);
  });

  test('should order results by creation date descending', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const _user = await prisma.user.create({
      data: {
        email: 'test@example.com',
        name: 'Test User',
        role: 'ADMIN',
        organizationId: organization.id,
      },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Standard Ticket',
            price: 25.99,
            currency: 'GBP',
            stock: 100,
            displayOrder: 0,
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    // Create orders with different timestamps
    const order1 = await prisma.order.create({
      data: {
        eventId: event.id,
        variantId: variant!.id,
        quantity: 1,
        status: 'CONFIRMED',
        selectedExtras: [],
        items: [],
        customer: {},
        amount: 25.99,
        currency: 'GBP',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
    });

    const order2 = await prisma.order.create({
      data: {
        eventId: event.id,
        variantId: variant!.id,
        quantity: 1,
        status: 'CONFIRMED',
        selectedExtras: [],
        items: [],
        customer: {},
        amount: 25.99,
        currency: 'GBP',
        createdAt: new Date('2024-01-02T10:00:00Z'),
      },
    });

    const ctx = await createContextInner({
      session: {
        user: { email: 'test@example.com' },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });

    const caller = createCaller(ctx);
    const result = await caller.user.getUserEventOrders({ eventId: event.id });

    expect(result.orders).toHaveLength(2);
    // Most recent order should be first
    expect(result.orders[0].id).toBe(order2.id);
    expect(result.orders[1].id).toBe(order1.id);
  });
});
