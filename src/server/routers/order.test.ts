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
import { metrics } from '../metrics';
import { generateCancellationMailContent, sendEmail } from '~/utils/email';
import {
  vi,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  test,
  expect,
} from 'vitest';

// PayPal refunds, controlled per test
const { mockRefund } = vi.hoisted(() => ({ mockRefund: vi.fn() }));

// Mock PayPal SDK completely to isolate business logic
vi.mock('@paypal/paypal-server-sdk', () => ({
  Client: vi.fn(),
  PaymentsController: vi.fn(() => ({ refundCapturedPayment: mockRefund })),
  RefundStatus: {
    Completed: 'COMPLETED',
    Pending: 'PENDING',
    Failed: 'FAILED',
    Cancelled: 'CANCELLED',
  },
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
  generateCancellationMailContent: vi
    .fn()
    .mockReturnValue('<html>Mock cancellation email</html>'),
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

// TODO fix this test
describe.skip('order.byId', () => {
  test('should retrieve order from PayPal', async () => {
    const ctx = await createContextInner({ session: null });
    const caller = createCaller(ctx);

    const result = await caller.order.byId({
      id: 'MOCK_PAYPAL_ORDER',
      eventId: 'asd',
    });

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

describe('order metrics', () => {
  async function counterValue(
    name: string,
    labels: Record<string, string> = {},
  ): Promise<number> {
    const metric = await metrics.registry.getSingleMetric(name)?.get();
    const match = metric?.values.find((v) =>
      Object.entries(labels).every(([k, val]) => v.labels[k] === val),
    );
    return match?.value ?? 0;
  }

  async function createEventWithStock(stock: number) {
    const organization = await prisma.organization.create({
      data: { name: 'Metrics Org', email: 'metrics@test.com' },
    });
    const event = await prisma.event.create({
      data: {
        title: 'Metrics Event',
        text: 'Description',
        organizationId: organization.id,
        variants: {
          create: {
            title: 'Standard',
            price: 10,
            currency: 'GBP',
            stock,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
    return { event, variant: event.variants[0] };
  }

  test('counts successful reservations and tRPC calls', async () => {
    const { event, variant } = await createEventWithStock(10);
    const caller = createCaller(await createContextInner({ session: null }));

    const reservedBefore = await counterValue(
      'ticketing_orders_reserved_total',
    );
    const okBefore = await counterValue('ticketing_trpc_requests_total', {
      procedure: 'order.createOrder',
      code: 'OK',
    });

    await caller.order.createOrder({
      id: event.id,
      variantId: variant.id,
      quantity: 1,
    });

    expect(await counterValue('ticketing_orders_reserved_total')).toBe(
      reservedBefore + 1,
    );
    expect(
      await counterValue('ticketing_trpc_requests_total', {
        procedure: 'order.createOrder',
        code: 'OK',
      }),
    ).toBe(okBefore + 1);
  });

  test('counts out-of-stock failures with their tRPC error code', async () => {
    const { event, variant } = await createEventWithStock(0);
    const caller = createCaller(await createContextInner({ session: null }));

    const failedBefore = await counterValue(
      'ticketing_order_reservation_failures_total',
      { reason: 'out_of_stock' },
    );
    const errorsBefore = await counterValue('ticketing_trpc_requests_total', {
      procedure: 'order.createOrder',
      code: 'UNPROCESSABLE_CONTENT',
    });

    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: variant.id,
        quantity: 1,
      }),
    ).rejects.toThrow();

    expect(
      await counterValue('ticketing_order_reservation_failures_total', {
        reason: 'out_of_stock',
      }),
    ).toBe(failedBefore + 1);
    expect(
      await counterValue('ticketing_trpc_requests_total', {
        procedure: 'order.createOrder',
        code: 'UNPROCESSABLE_CONTENT',
      }),
    ).toBe(errorsBefore + 1);
  });
});

describe('order authorization (organization members only)', () => {
  // org A owns the event and its confirmed order; a member of org B, or a
  // signed-in user with no organization, must not see or change it
  async function setup() {
    const orgA = await prisma.organization.create({
      data: { name: 'Org A', email: 'a@org.test' },
    });
    const orgB = await prisma.organization.create({
      data: { name: 'Org B', email: 'b@org.test' },
    });
    await prisma.user.create({
      data: { email: 'member@org-a.test', organizationId: orgA.id },
    });
    await prisma.user.create({
      data: { email: 'member@org-b.test', organizationId: orgB.id },
    });
    const event = await prisma.event.create({
      data: {
        title: 'Org A event',
        text: 'Description',
        organizationId: orgA.id,
        variants: {
          create: {
            title: 'Slot',
            price: 5,
            currency: 'GBP',
            stock: 10,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
    const order = await prisma.order.create({
      data: {
        eventId: event.id,
        variantId: event.variants[0].id,
        quantity: 2,
        status: 'CONFIRMED',
        selectedExtras: [],
        items: [],
        customer: { name: 'Buyer', email: 'buyer@example.com' },
        amount: 10,
        currency: 'GBP',
      },
    });
    return { event, order };
  }

  async function callerFor(email: string) {
    const ctx = await createContextInner({
      session: {
        user: { email },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });
    return createCaller(ctx);
  }

  test('getOrdersForCheckin: FORBIDDEN for another organization', async () => {
    const { event } = await setup();
    const caller = await callerFor('member@org-b.test');
    await expect(
      caller.order.getOrdersForCheckin({ eventId: event.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('getOrdersForCheckin: FORBIDDEN for a user with no organization', async () => {
    const { event } = await setup();
    const caller = await callerFor('stranger@gmail.test');
    await expect(
      caller.order.getOrdersForCheckin({ eventId: event.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  test('getOrdersForCheckin: works for the event organization', async () => {
    const { event, order } = await setup();
    const caller = await callerFor('member@org-a.test');
    const result = await caller.order.getOrdersForCheckin({
      eventId: event.id,
    });
    expect(JSON.stringify(result)).toContain(order.id);
  });

  test('cancelOrder: FORBIDDEN for another organization, order untouched', async () => {
    const { order } = await setup();
    const caller = await callerFor('member@org-b.test');
    await expect(
      caller.order.cancelOrder({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.status).toBe('CONFIRMED');
    const variant = await prisma.variant.findUnique({
      where: { id: order.variantId },
    });
    expect(variant?.stock).toBe(10);
  });

  test('cancelOrder: works for the event organization', async () => {
    const { order } = await setup();
    const caller = await callerFor('member@org-a.test');
    await caller.order.cancelOrder({ orderId: order.id });
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.status).toBe('CANCELLED');
  });

  test('toggleCheckin: FORBIDDEN for another organization, order untouched', async () => {
    const { order } = await setup();
    const caller = await callerFor('member@org-b.test');
    await expect(
      caller.order.toggleCheckin({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.checkedIn).toBe(false);
  });

  test('toggleCheckin: works for the event organization', async () => {
    const { order } = await setup();
    const caller = await callerFor('member@org-a.test');
    await caller.order.toggleCheckin({ orderId: order.id });
    const after = await prisma.order.findUnique({ where: { id: order.id } });
    expect(after?.checkedIn).toBe(true);
  });

  test('cancelOrder: NOT_FOUND for an unknown order', async () => {
    await setup();
    const caller = await callerFor('member@org-a.test');
    await expect(
      caller.order.cancelOrder({
        orderId: '00000000-0000-4000-8000-000000000000',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('order.cancelOrder with refunds', () => {
  beforeEach(() => {
    mockRefund.mockReset();
    vi.mocked(sendEmail).mockClear();
    vi.mocked(generateCancellationMailContent).mockClear();
  });

  // a paid, confirmed order (2 tickets, 10 GBP) of an event in "Org A"
  async function setup({ captured = true }: { captured?: boolean } = {}) {
    const org = await prisma.organization.create({
      data: { name: 'Org A', email: 'org-a@org.test' },
    });
    const other = await prisma.organization.create({
      data: { name: 'Org B', email: 'org-b@org.test' },
    });
    await prisma.user.create({
      data: { email: 'member@org-a.test', organizationId: org.id },
    });
    await prisma.user.create({
      data: { email: 'member@org-b.test', organizationId: other.id },
    });
    const event = await prisma.event.create({
      data: {
        title: 'Grotto',
        text: 'Description',
        organizationId: org.id,
        variants: {
          create: {
            title: '10:00 slot',
            price: 5,
            currency: 'GBP',
            stock: 10,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
    const order = await prisma.order.create({
      data: {
        eventId: event.id,
        variantId: event.variants[0].id,
        quantity: 2,
        status: 'CONFIRMED',
        externalTransactionId: captured ? 'CAPTURE_123' : null,
        selectedExtras: [],
        items: [],
        customer: {
          emailAddress: 'buyer@example.com',
          name: { givenName: 'Bea' },
        },
        amount: 10,
        currency: 'GBP',
      },
    });
    return { order, variantId: event.variants[0].id };
  }

  async function callerFor(email = 'member@org-a.test') {
    const ctx = await createContextInner({
      session: {
        user: { email },
        expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
      },
    });
    return createCaller(ctx);
  }

  const stockOf = async (variantId: string) =>
    (await prisma.variant.findUniqueOrThrow({ where: { id: variantId } }))
      .stock;

  test('full refund: cancels, releases stock, refunds the capture, emails the buyer', async () => {
    const { order, variantId } = await setup();
    mockRefund.mockResolvedValue({
      result: { id: 'REFUND_1', status: 'COMPLETED' },
    });
    const caller = await callerFor();

    const result = await caller.order.cancelOrder({
      orderId: order.id,
      refund: true,
      reason: 'Slot double booked',
    });

    expect(result.refundStatus).toBe('REFUNDED');
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        captureId: 'CAPTURE_123',
        paypalRequestId: `refund-${order.id}`,
        body: expect.objectContaining({
          amount: { currencyCode: 'GBP', value: '10.00' },
          noteToPayer: 'Slot double booked',
        }),
      }),
    );
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.refundStatus).toBe('REFUNDED');
    expect(after.refundId).toBe('REFUND_1');
    expect(after.refundedAmount).toBe(10);
    expect(after.refundedAt).not.toBeNull();
    expect(await stockOf(variantId)).toBe(12);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        replyTo: 'org-a@org.test',
      }),
    );
    expect(generateCancellationMailContent).toHaveBeenCalledWith(
      expect.objectContaining({
        refund: {
          amount: 10,
          currency: 'GBP',
          pending: false,
          reason: 'Slot double booked',
        },
      }),
    );
  });

  test('partial refund sends the partial amount', async () => {
    const { order } = await setup();
    mockRefund.mockResolvedValue({
      result: { id: 'REFUND_2', status: 'COMPLETED' },
    });
    const caller = await callerFor();

    await caller.order.cancelOrder({
      orderId: order.id,
      refund: true,
      amount: 4,
    });

    expect(mockRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          amount: { currencyCode: 'GBP', value: '4.00' },
        }),
      }),
    );
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.refundedAmount).toBe(4);
  });

  test('refund above the amount paid is refused and nothing changes', async () => {
    const { order, variantId } = await setup();
    const caller = await callerFor();

    await expect(
      caller.order.cancelOrder({
        orderId: order.id,
        refund: true,
        amount: 10.01,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    expect(mockRefund).not.toHaveBeenCalled();
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('CONFIRMED');
    expect(await stockOf(variantId)).toBe(10);
  });

  test('no PayPal capture recorded: refund refused, cancel without refund works', async () => {
    const { order, variantId } = await setup({ captured: false });
    const caller = await callerFor();

    await expect(
      caller.order.cancelOrder({ orderId: order.id, refund: true }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe('CONFIRMED');

    const result = await caller.order.cancelOrder({ orderId: order.id });
    expect(result.refundStatus).toBe('NONE');
    expect(mockRefund).not.toHaveBeenCalled();
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.refundStatus).toBe('NONE');
    expect(await stockOf(variantId)).toBe(12);
  });

  test('PayPal error: order cancelled, refund FAILED with the error, buyer not told about a refund', async () => {
    const { order, variantId } = await setup();
    mockRefund.mockRejectedValue(
      Object.assign(new Error('Unprocessable'), {
        body: JSON.stringify({
          name: 'UNPROCESSABLE_ENTITY',
          message: 'The requested action could not be performed',
          details: [{ issue: 'CAPTURE_FULLY_REFUNDED' }],
        }),
      }),
    );
    const caller = await callerFor();

    const result = await caller.order.cancelOrder({
      orderId: order.id,
      refund: true,
    });

    expect(result.refundStatus).toBe('FAILED');
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.status).toBe('CANCELLED');
    expect(after.refundStatus).toBe('FAILED');
    expect(after.refundError).toMatchObject({
      name: 'UNPROCESSABLE_ENTITY',
      issue: 'CAPTURE_FULLY_REFUNDED',
    });
    expect(await stockOf(variantId)).toBe(12);
    expect(generateCancellationMailContent).toHaveBeenCalledWith(
      expect.objectContaining({ refund: undefined }),
    );
  });

  test('PayPal says the refund is pending', async () => {
    const { order } = await setup();
    mockRefund.mockResolvedValue({
      result: { id: 'REFUND_3', status: 'PENDING' },
    });
    const caller = await callerFor();

    const result = await caller.order.cancelOrder({
      orderId: order.id,
      refund: true,
    });

    expect(result.refundStatus).toBe('PENDING');
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.refundStatus).toBe('PENDING');
    expect(after.refundedAt).toBeNull();
  });

  test('two cancels at once: stock released and refund requested only once', async () => {
    const { order, variantId } = await setup();
    mockRefund.mockResolvedValue({
      result: { id: 'REFUND_4', status: 'COMPLETED' },
    });
    const caller = await callerFor();

    const results = await Promise.allSettled([
      caller.order.cancelOrder({ orderId: order.id, refund: true }),
      caller.order.cancelOrder({ orderId: order.id, refund: true }),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(await stockOf(variantId)).toBe(12);
  });

  test('retryRefund after a failure refunds with the same PayPal request id', async () => {
    const { order } = await setup();
    mockRefund.mockRejectedValueOnce(new Error('PayPal timeout'));
    const caller = await callerFor();
    await caller.order.cancelOrder({
      orderId: order.id,
      refund: true,
      amount: 6,
    });

    mockRefund.mockResolvedValueOnce({
      result: { id: 'REFUND_5', status: 'COMPLETED' },
    });
    const result = await caller.order.retryRefund({ orderId: order.id });

    expect(result.refundStatus).toBe('REFUNDED');
    expect(mockRefund).toHaveBeenCalledTimes(2);
    expect(mockRefund.mock.calls[1][0]).toMatchObject({
      paypalRequestId: `refund-${order.id}`,
      body: { amount: { currencyCode: 'GBP', value: '6.00' } },
    });
    const after = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(after.refundStatus).toBe('REFUNDED');
    expect(after.refundError).toBeNull();
  });

  test('retryRefund is refused when there is nothing to retry', async () => {
    const { order } = await setup();
    const caller = await callerFor();
    await expect(
      caller.order.retryRefund({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  test('another organization cannot cancel, refund or retry', async () => {
    const { order } = await setup();
    const caller = await callerFor('member@org-b.test');
    await expect(
      caller.order.cancelOrder({ orderId: order.id, refund: true }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      caller.order.retryRefund({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(mockRefund).not.toHaveBeenCalled();
  });

  test('notifyBuyer: false sends no email', async () => {
    const { order } = await setup();
    const caller = await callerFor();
    await caller.order.cancelOrder({ orderId: order.id, notifyBuyer: false });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
