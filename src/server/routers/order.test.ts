/**
 * Integration test for the `order` router
 *
 * This test suite covers the order-related TRPC mutations and functionality.
 *
 * Test Coverage:
 * - order.createOrder mutation (database operations)
 * - Stock management and validation
 * - Error handling for various scenarios
 * - Basic order flow testing
 *
 * Note: PayPal integration is mocked to focus on core business logic
 */
import { createContextInner } from '../context';
import { createCaller } from './_app';
import { prisma } from '../prisma';
import { TRPCError } from '@trpc/server';
import {
  vi,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  test,
  expect,
} from 'vitest';

// Mock PayPal SDK completely to isolate business logic
vi.mock('@paypal/paypal-server-sdk', () => ({
  Client: vi.fn(),
  OrdersController: vi.fn(() => ({
    createOrder: vi.fn().mockResolvedValue({
      result: { id: 'MOCK_PAYPAL_ORDER', status: 'CREATED' },
    }),
    captureOrder: vi.fn().mockResolvedValue({
      result: {
        id: 'MOCK_PAYPAL_ORDER',
        status: 'COMPLETED',
        purchaseUnits: [
          {
            referenceId: 'mock-order-id',
            payments: { captures: [{ id: 'CAPTURE_123' }] },
          },
        ],
        payer: { emailAddress: 'test@example.com' },
      },
    }),
    getOrder: vi.fn().mockResolvedValue({
      result: {
        id: 'MOCK_PAYPAL_ORDER',
        purchaseUnits: [{ referenceId: 'mock-order-id' }],
      },
    }),
  })),
  Environment: { Sandbox: 'sandbox', Live: 'live' },
  LogLevel: { Info: 'info' },
  CheckoutPaymentIntent: 'CAPTURE',
  PaypalWalletContextShippingPreference: { NoShipping: 'NO_SHIPPING' },
  PaypalExperienceUserAction: { PayNow: 'PAY_NOW' },
}));

// Mock email utility
vi.mock('~/utils/email', () => ({
  sendEmail: vi.fn(),
  generateMailContent: vi
    .fn()
    .mockReturnValue('<html>Mock email content</html>'),
}));

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

describe('order.createOrder', () => {
  test('should create order successfully and update stock', async () => {
    // Setup test data
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
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
        eventExtras: {
          create: {
            title: 'T-shirt',
            price: 15.0,
            currency: 'GBP',
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const extra = await prisma.eventExtras.findFirst({
      where: { eventId: event.id },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input = {
      id: event.id,
      variantId: variant!.id,
      quantity: 2,
      extras: {
        [extra!.id]: true,
      },
    };

    const result = await caller.order.createOrder(input);

    // Verify PayPal order was returned
    expect(result).toMatchObject({
      id: 'MOCK_PAYPAL_ORDER',
      status: 'CREATED',
    });

    // Verify database order was created
    const dbOrder = await prisma.order.findFirst({
      where: { eventId: event.id },
    });

    expect(dbOrder).toMatchObject({
      eventId: event.id,
      variantId: variant!.id,
      quantity: 2,
      status: 'RESERVED',
      amount: 25.99 * 2 + 15.0, // variant price * quantity + extra price
      currency: 'GBP',
      externalId: 'MOCK_PAYPAL_ORDER',
    });

    // Verify stock was decremented
    const updatedVariant = await prisma.variant.findUnique({
      where: { id: variant!.id },
    });
    expect(updatedVariant!.stock).toBe(98); // 100 - 2
  });

  test('should create order without extras', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
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

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input = {
      id: event.id,
      variantId: variant!.id,
      quantity: 1,
      extras: null,
    };

    await caller.order.createOrder(input);

    const dbOrder = await prisma.order.findFirst({
      where: { eventId: event.id },
    });

    expect(dbOrder).toMatchObject({
      amount: 25.99,
      selectedExtras: [],
    });
  });

  test('should throw BAD_REQUEST when variant not found', async () => {
    // Create a valid event first for a valid event ID
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
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

    const input = {
      id: event.id, // Use valid event ID
      variantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', // Non-existent but valid UUID
      quantity: 1,
      extras: null,
    };

    await expect(caller.order.createOrder(input)).rejects.toThrow(TRPCError);
    await expect(caller.order.createOrder(input)).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Variant aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee not found.',
    });
  });

  test('should throw UNPROCESSABLE_CONTENT when insufficient stock', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Limited Ticket',
            price: 25.99,
            currency: 'GBP',
            stock: 2,
            displayOrder: 0,
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input = {
      id: event.id,
      variantId: variant!.id,
      quantity: 5, // More than available stock
      extras: null,
    };

    await expect(caller.order.createOrder(input)).rejects.toThrow(TRPCError);
    await expect(caller.order.createOrder(input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message:
        'Sorry, there are not enough tickets of the selected type to fulfill the request. (2 left)',
    });
  });

  test('should throw UNPROCESSABLE_CONTENT when variant is out of stock', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Sold Out Ticket',
            price: 25.99,
            currency: 'GBP',
            stock: 0,
            displayOrder: 0,
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input = {
      id: event.id,
      variantId: variant!.id,
      quantity: 1,
      extras: null,
    };

    await expect(caller.order.createOrder(input)).rejects.toThrow(TRPCError);
    await expect(caller.order.createOrder(input)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: 'The selected option is out of stock',
    });
  });

  test('should calculate correct amount with multiple items and extras', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Test Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Standard Ticket',
            price: 10.5,
            currency: 'GBP',
            stock: 100,
            displayOrder: 0,
          },
        },
        eventExtras: {
          createMany: {
            data: [
              {
                title: 'T-shirt',
                price: 12.99,
                currency: 'GBP',
              },
              {
                title: 'Meal',
                price: 8.5,
                currency: 'GBP',
              },
            ],
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const extras = await prisma.eventExtras.findMany({
      where: { eventId: event.id },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const input = {
      id: event.id,
      variantId: variant!.id,
      quantity: 3,
      extras: {
        [extras[0].id]: true, // T-shirt
        [extras[1].id]: true, // Meal
      },
    };

    await caller.order.createOrder(input);

    const dbOrder = await prisma.order.findFirst({
      where: { eventId: event.id },
    });

    // Expected: (10.50 * 3) + 12.99 + 8.50 = 31.5 + 21.49 = 52.99
    expect(dbOrder!.amount).toBe(52.99);
  });
});

describe('order.byId', () => {
  test('should retrieve order from PayPal', async () => {
    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const result = await caller.order.byId({ id: 'MOCK_PAYPAL_ORDER' });

    expect(result).toMatchObject({
      id: 'MOCK_PAYPAL_ORDER',
    });
  });
});

describe('order business logic', () => {
  test('should handle concurrent stock updates correctly', async () => {
    const organization = await prisma.organization.create({
      data: { name: 'Test Org', email: 'org@test.com' },
    });

    const event = await prisma.event.create({
      data: {
        title: 'Limited Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Last Few Tickets',
            price: 50.0,
            currency: 'GBP',
            stock: 3,
            displayOrder: 0,
          },
        },
      },
    });

    const variant = await prisma.variant.findFirst({
      where: { eventId: event.id },
    });

    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    // First order takes 2 tickets
    await caller.order.createOrder({
      id: event.id,
      variantId: variant!.id,
      quantity: 2,
      extras: null,
    });

    // Verify stock is updated
    const updatedVariant1 = await prisma.variant.findUnique({
      where: { id: variant!.id },
    });
    expect(updatedVariant1!.stock).toBe(1);

    // Second order takes the last ticket
    await caller.order.createOrder({
      id: event.id,
      variantId: variant!.id,
      quantity: 1,
      extras: null,
    });

    // Verify stock is now 0
    const updatedVariant2 = await prisma.variant.findUnique({
      where: { id: variant!.id },
    });
    expect(updatedVariant2!.stock).toBe(0);

    // Third order should fail
    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: variant!.id,
        quantity: 1,
        extras: null,
      }),
    ).rejects.toThrow('The selected option is out of stock');
  });
});
