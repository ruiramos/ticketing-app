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
import { OrdersController } from '@paypal/paypal-server-sdk';
import { EVENT_MAX_TICKETS } from '~/utils/contants';
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
  sendEmail: vi.fn().mockResolvedValue({ ok: true }),
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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

describe('order.byId (public ticket page)', () => {
  async function setup() {
    const org = await prisma.organization.create({
      data: {
        name: 'Org A',
        email: 'org-a@org.test',
        phone: '+44 1234 567890',
        address: '1 Private Road',
      },
    });
    const event = await prisma.event.create({
      data: {
        title: 'Grotto',
        text: 'Description',
        location: 'The Barn',
        organizationId: org.id,
        enabled: true,
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
        externalId: 'PAYPAL_ORDER_SECRET',
        externalTransactionId: 'CAPTURE_SECRET',
        selectedExtras: [
          {
            id: 'extra-1',
            title: 'Hot chocolate',
            description: 'internal description',
            price: 2,
            currency: 'GBP',
            eventId: event.id,
            quantity: 1,
          },
        ],
        items: [{ name: 'ITEMS_SECRET' }],
        customer: {
          payer_id: 'PAYER_ID_SECRET',
          emailAddress: 'buyer@example.com',
          name: { givenName: 'Bea', surname: 'Buyer' },
          address: { addressLine1: '42 Secret Street', postalCode: 'AB1 2CD' },
        },
        error: { message: 'ERROR_SECRET' },
        refundError: { message: 'REFUND_ERROR_SECRET' },
        amount: 12,
        currency: 'GBP',
      },
    });
    return { event, order };
  }

  test('returns what the ticket page shows, and nothing sensitive', async () => {
    const { event, order } = await setup();
    const caller = createCaller(await createContextInner({ session: null }));

    const result = await caller.order.byId({
      id: order.id,
      eventId: event.id,
    });

    expect(result).toMatchObject({
      id: order.id,
      status: 'CONFIRMED',
      paymentMethod: 'PAYPAL',
      quantity: 2,
      amount: 12,
      currency: 'GBP',
      buyer: { givenName: 'Bea', email: 'buyer@example.com' },
      selectedExtras: [{ title: 'Hot chocolate', price: 2, quantity: 1 }],
      variant: { title: '10:00 slot', price: 5 },
      event: {
        title: 'Grotto',
        location: 'The Barn',
        organization: { name: 'Org A', email: 'org-a@org.test' },
      },
    });

    const json = JSON.stringify(result);
    for (const secret of [
      'PAYPAL_ORDER_SECRET',
      'CAPTURE_SECRET',
      'PAYER_ID_SECRET',
      'Secret Street',
      'AB1 2CD',
      'ITEMS_SECRET',
      'ERROR_SECRET',
      'REFUND_ERROR_SECRET',
      'internal description',
      '1 Private Road',
      '+44 1234 567890',
    ]) {
      expect(json).not.toContain(secret);
    }
    for (const key of [
      'customer',
      'externalId',
      'externalTransactionId',
      'items',
      'error',
      'refundError',
      'note',
      'customFieldResponses',
    ]) {
      expect(result).not.toHaveProperty(key);
    }
  });

  test('null for an unknown order or the wrong event', async () => {
    const { event, order } = await setup();
    const caller = createCaller(await createContextInner({ session: null }));

    expect(
      await caller.order.byId({
        id: '00000000-0000-4000-8000-000000000000',
        eventId: event.id,
      }),
    ).toBeNull();
    expect(
      await caller.order.byId({
        id: order.id,
        eventId: '00000000-0000-4000-8000-000000000000',
      }),
    ).toBeNull();
  });
});

describe('order.createManualOrder', () => {
  beforeEach(() => {
    mockRefund.mockReset();
    vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true });
  });

  // an event of "Org A" (10 tickets at 5 EUR, a 2 EUR extra, a custom
  // field), plus another event with its own variant
  async function setup({ stock = 10 }: { stock?: number } = {}) {
    const org = await prisma.organization.create({
      data: { name: 'Org A', email: 'org-a@org.test' },
    });
    const other = await prisma.organization.create({
      data: { name: 'Org B', email: 'org-b@org.test' },
    });
    const member = await prisma.user.create({
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
        enabled: false, // off sale online: door sales still work
        customFields: [
          {
            id: 'dietary',
            name: 'dietary',
            label: 'Dietary requirements',
            type: 'text',
            required: true,
            displayOrder: 0,
          },
        ],
        variants: {
          create: {
            title: '10:00 slot',
            price: 5,
            currency: 'EUR',
            stock,
            displayOrder: 0,
          },
        },
        eventExtras: {
          create: { title: 'Hot chocolate', price: 2, currency: 'EUR' },
        },
      },
      include: { variants: true, eventExtras: true },
    });
    const otherEvent = await prisma.event.create({
      data: {
        title: 'Other',
        text: 'Description',
        organizationId: other.id,
        variants: {
          create: {
            title: 'Other slot',
            price: 1,
            currency: 'GBP',
            stock: 10,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
    return {
      event,
      variantId: event.variants[0].id,
      extraId: event.eventExtras[0].id,
      otherVariantId: otherEvent.variants[0].id,
      memberId: member.id,
    };
  }

  async function callerFor(email = 'member@org-a.test') {
    return createCaller(
      await createContextInner({
        session: {
          user: { email },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
      }),
    );
  }

  const stockOf = async (variantId: string) =>
    (await prisma.variant.findUniqueOrThrow({ where: { id: variantId } }))
      .stock;

  test('takes the tickets out of stock and confirms the order at the price', async () => {
    const { event, variantId, extraId, memberId } = await setup();
    const caller = await callerFor();
    const before = await metrics.manualOrders.get();
    const cashBefore =
      before.values.find((v) => v.labels.payment_method === 'cash')?.value ?? 0;

    const result = await caller.order.createManualOrder({
      eventId: event.id,
      variantId,
      quantity: 3,
      extras: [extraId],
      buyerName: '  Jane van der Berg ',
      customFields: { dietary: 'Vegan', unknown: 'ignored' },
      paymentMethod: 'CASH',
      note: 'Paid at the door',
    });

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: result.id },
    });
    expect(order).toMatchObject({
      eventId: event.id,
      variantId,
      quantity: 3,
      status: 'CONFIRMED',
      paymentMethod: 'CASH',
      amount: 17, // 3 x 5 + 2
      currency: 'EUR',
      note: 'Paid at the door',
      createdById: memberId,
      externalId: null,
      externalTransactionId: null,
      customer: { name: { givenName: 'Jane', surname: 'van der Berg' } },
      customFieldResponses: {
        dietary: {
          fieldId: 'dietary',
          fieldLabel: 'Dietary requirements',
          value: 'Vegan',
        },
      },
    });
    expect(order.selectedExtras).toMatchObject([
      { id: extraId, title: 'Hot chocolate', price: 2, quantity: 1 },
    ]);
    expect(await stockOf(variantId)).toBe(7);

    // no email address: nothing sent
    expect(result).toMatchObject({ emailed: false, emailError: null });
    expect(sendEmail).not.toHaveBeenCalled();

    const after = await metrics.manualOrders.get();
    expect(
      after.values.find((v) => v.labels.payment_method === 'cash')?.value,
    ).toBe(cashBefore + 1);

    // shows up for check-in and in the revenue summary
    const checkin = await caller.order.getOrdersForCheckin({
      eventId: event.id,
      search: 'jane',
    });
    expect(checkin.map((o) => o.id)).toEqual([order.id]);
    const summary = await caller.user.getUserEventOrdersSummary({
      eventId: event.id,
    });
    expect(summary).toMatchObject({
      totalOrders: 1,
      totalTickets: 3,
      totalRevenue: 17,
      addonRevenue: 2,
      byPaymentMethod: { CASH: { orders: 1, revenue: 17 } },
    });
  });

  test('records the amount actually paid', async () => {
    const { event, variantId } = await setup();
    const caller = await callerFor();

    const { id } = await caller.order.createManualOrder({
      eventId: event.id,
      variantId,
      quantity: 2,
      buyerName: 'Bob',
      paymentMethod: 'BANK_TRANSFER',
      amount: 8.499,
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.amount).toBe(8.5);
    expect(order.paymentMethod).toBe('BANK_TRANSFER');
    expect(order.customer).toEqual({ name: { givenName: 'Bob', surname: '' } });
  });

  test('COMP orders are free, whatever amount is sent', async () => {
    const { event, variantId, extraId } = await setup();
    const caller = await callerFor();

    const { id } = await caller.order.createManualOrder({
      eventId: event.id,
      variantId,
      quantity: 2,
      extras: [extraId],
      buyerName: 'Guest',
      paymentMethod: 'COMP',
      amount: 25,
    });

    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.amount).toBe(0);
    expect(order.paymentMethod).toBe('COMP');
    expect(await stockOf(variantId)).toBe(8);

    // the free extra doesn't turn ticket revenue negative
    const summary = await caller.user.getUserEventOrdersSummary({
      eventId: event.id,
    });
    expect(summary).toMatchObject({
      totalRevenue: 0,
      addonRevenue: 0,
      ticketRevenue: 0,
      byPaymentMethod: { COMP: { orders: 1, revenue: 0 } },
    });
  });

  test('will not oversell, and nothing is created', async () => {
    const { event, variantId } = await setup({ stock: 2 });
    const caller = await callerFor();

    await expect(
      caller.order.createManualOrder({
        eventId: event.id,
        variantId,
        quantity: 3,
        buyerName: 'Too many',
        paymentMethod: 'CASH',
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: expect.stringContaining('(2 left)'),
    });
    expect(await stockOf(variantId)).toBe(2);
    expect(await prisma.order.count()).toBe(0);

    await prisma.variant.update({
      where: { id: variantId },
      data: { stock: 0 },
    });
    await expect(
      caller.order.createManualOrder({
        eventId: event.id,
        variantId,
        quantity: 1,
        buyerName: 'Sold out',
        paymentMethod: 'CASH',
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_CONTENT',
      message: 'The selected option is out of stock',
    });
    expect(await prisma.order.count()).toBe(0);
  });

  test("refuses another event's variant", async () => {
    const { event, otherVariantId } = await setup();
    const caller = await callerFor();

    await expect(
      caller.order.createManualOrder({
        eventId: event.id,
        variantId: otherVariantId,
        quantity: 1,
        buyerName: 'Sneaky',
        paymentMethod: 'COMP',
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await stockOf(otherVariantId)).toBe(10);
    expect(await prisma.order.count()).toBe(0);
  });

  test('only members of the event organization', async () => {
    const { event, variantId } = await setup();
    const input = {
      eventId: event.id,
      variantId,
      quantity: 1,
      buyerName: 'Nope',
      paymentMethod: 'COMP' as const,
    };

    await expect(
      (await callerFor('member@org-b.test')).order.createManualOrder(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      (await callerFor('stranger@gmail.test')).order.createManualOrder(input),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(
      createCaller(
        await createContextInner({ session: null }),
      ).order.createManualOrder(input),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(await stockOf(variantId)).toBe(10);
    expect(await prisma.order.count()).toBe(0);
  });

  test('emails the tickets when there is an address, unless told not to', async () => {
    const { event, variantId } = await setup();
    const caller = await callerFor();
    const base = {
      eventId: event.id,
      variantId,
      quantity: 1,
      buyerName: 'Ann Other',
      paymentMethod: 'CARD_IN_PERSON' as const,
    };

    const emailed = await caller.order.createManualOrder({
      ...base,
      buyerEmail: 'ann@example.com',
    });
    expect(emailed).toMatchObject({ emailed: true, emailError: null });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'ann@example.com',
        replyTo: 'org-a@org.test',
      }),
    );
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: emailed.id },
    });
    expect(order.customer).toEqual({
      name: { givenName: 'Ann', surname: 'Other' },
      emailAddress: 'ann@example.com',
    });
    expect(order.confirmationEmailSentAt).not.toBeNull();

    const notEmailed = await caller.order.createManualOrder({
      ...base,
      buyerEmail: 'ann@example.com',
      sendEmail: false,
    });
    expect(notEmailed.emailed).toBe(false);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // a failed send doesn't undo the order; the organiser is told
    vi.mocked(sendEmail).mockResolvedValueOnce({
      ok: false,
      error: '401 Unauthorized',
    });
    const failed = await caller.order.createManualOrder({
      ...base,
      buyerEmail: 'ann@example.com',
    });
    expect(failed).toMatchObject({
      emailed: false,
      emailError: '401 Unauthorized',
    });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: failed.id } }))
        .status,
    ).toBe('CONFIRMED');
    expect(await stockOf(variantId)).toBe(7);
  });

  test('cancelling releases the stock without PayPal; refunds are refused', async () => {
    const { event, variantId } = await setup();
    const caller = await callerFor();
    const { id } = await caller.order.createManualOrder({
      eventId: event.id,
      variantId,
      quantity: 4,
      buyerName: 'Cash Buyer',
      paymentMethod: 'CASH',
    });
    expect(await stockOf(variantId)).toBe(6);

    await expect(
      caller.order.cancelOrder({ orderId: id, refund: true }),
    ).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: expect.stringContaining("wasn't paid through PayPal"),
    });

    const result = await caller.order.cancelOrder({ orderId: id });
    expect(result.refundStatus).toBe('NONE');
    expect(mockRefund).not.toHaveBeenCalled();
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order.status).toBe('CANCELLED');
    expect(order.refundStatus).toBe('NONE');
    expect(await stockOf(variantId)).toBe(10);
  });
});

describe('order.createOrder checks', () => {
  async function createEvent({
    enabled = true,
    currency = 'GBP',
  }: { enabled?: boolean; currency?: string } = {}) {
    const organization = await prisma.organization.create({
      data: { name: 'Checks Org', email: 'checks@test.com' },
    });
    return prisma.event.create({
      data: {
        title: 'Checks Event',
        text: 'Description',
        organizationId: organization.id,
        enabled,
        variants: {
          create: {
            title: 'Standard',
            price: 10,
            currency,
            stock: 50,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
  }

  test('rejects orders for an event that is not on sale', async () => {
    const event = await createEvent({ enabled: false });
    const caller = createCaller(await createContextInner({ session: null }));

    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: event.variants[0].id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    const variant = await prisma.variant.findUnique({
      where: { id: event.variants[0].id },
    });
    expect(variant!.stock).toBe(50);
    expect(await prisma.order.count()).toBe(0);
  });

  test('rejects a variant from another event', async () => {
    const event = await createEvent();
    const other = await createEvent();
    const caller = createCaller(await createContextInner({ session: null }));

    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: other.variants[0].id,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await prisma.order.count()).toBe(0);
  });

  test('rejects more than the maximum tickets per order', async () => {
    const event = await createEvent();
    const caller = createCaller(await createContextInner({ session: null }));

    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: event.variants[0].id,
        quantity: EVENT_MAX_TICKETS + 1,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(
      caller.order.createOrder({
        id: event.id,
        variantId: event.variants[0].id,
        quantity: 1.5,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await caller.order.createOrder({
      id: event.id,
      variantId: event.variants[0].id,
      quantity: EVENT_MAX_TICKETS,
    });
    expect(await prisma.order.count()).toBe(1);
  });

  test("sends PayPal the order's currency", async () => {
    const event = await createEvent({ currency: 'EUR' });
    const caller = createCaller(await createContextInner({ session: null }));

    await caller.order.createOrder({
      id: event.id,
      variantId: event.variants[0].id,
      quantity: 2,
    });

    const paypalCreateOrder = vi.mocked(OrdersController).mock.results[0].value
      .createOrder as ReturnType<typeof vi.fn>;
    const unit = paypalCreateOrder.mock.lastCall![0].body.purchaseUnits[0];
    expect(unit.amount).toMatchObject({
      currencyCode: 'EUR',
      value: '20.00',
      breakdown: { itemTotal: { currencyCode: 'EUR', value: '20.00' } },
    });
    expect(unit.items[0].unitAmount.currencyCode).toBe('EUR');
  });
});

describe('order.releaseOrder', () => {
  async function reserve(quantity: number) {
    const organization = await prisma.organization.create({
      data: { name: 'Release Org', email: 'release@test.com' },
    });
    const event = await prisma.event.create({
      data: {
        title: 'Release Event',
        text: 'Description',
        organizationId: organization.id,
        enabled: true,
        variants: {
          create: {
            title: 'Standard',
            price: 10,
            currency: 'GBP',
            stock: 20,
            displayOrder: 0,
          },
        },
      },
      include: { variants: true },
    });
    const caller = createCaller(await createContextInner({ session: null }));
    const paypalOrder = await caller.order.createOrder({
      id: event.id,
      variantId: event.variants[0].id,
      quantity,
    });
    const stock = async () =>
      (await prisma.variant.findUnique({
        where: { id: event.variants[0].id },
      }))!.stock;
    return { caller, paypalOrderId: paypalOrder.id!, stock };
  }

  test('puts an abandoned reservation back on sale once', async () => {
    const { caller, paypalOrderId, stock } = await reserve(3);
    expect(await stock()).toBe(17);

    await expect(
      caller.order.releaseOrder({ id: paypalOrderId, reason: 'cancelled' }),
    ).resolves.toEqual({ released: true });
    expect(await stock()).toBe(20);
    expect((await prisma.order.findFirst())!.status).toBe('EXPIRED');

    // again (e.g. onCancel and onError both fire): nothing more released
    await expect(
      caller.order.releaseOrder({ id: paypalOrderId, reason: 'error' }),
    ).resolves.toEqual({ released: false });
    expect(await stock()).toBe(20);
  });

  test('leaves paid orders alone', async () => {
    const { caller, paypalOrderId, stock } = await reserve(2);
    await prisma.order.updateMany({ data: { status: 'CONFIRMED' } });

    await expect(
      caller.order.releaseOrder({ id: paypalOrderId, reason: 'cancelled' }),
    ).resolves.toEqual({ released: false });
    expect(await stock()).toBe(18);
    expect((await prisma.order.findFirst())!.status).toBe('CONFIRMED');
  });

  test('ignores unknown ids', async () => {
    const caller = createCaller(await createContextInner({ session: null }));
    await expect(
      caller.order.releaseOrder({ id: 'NOPE', reason: 'cancelled' }),
    ).resolves.toEqual({ released: false });
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
        enabled: true,
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
        enabled: true,
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
        enabled: true,
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
        reason: 'Slot double booked',
        refund: {
          amount: 10,
          currency: 'GBP',
          pending: false,
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

describe('ticket emails', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset().mockResolvedValue({ ok: true });
  });

  async function setup(status: 'CONFIRMED' | 'RESERVED' = 'CONFIRMED') {
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
        enabled: true,
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
        status,
        externalId: 'PAYPAL_ORDER_1',
        selectedExtras: [],
        items: [],
        customer:
          status === 'CONFIRMED'
            ? { emailAddress: 'buyer@example.com', name: { givenName: 'Bea' } }
            : {},
        amount: 10,
        currency: 'GBP',
      },
    });
    return { order };
  }

  async function callerFor(email = 'member@org-a.test') {
    return createCaller(
      await createContextInner({
        session: {
          user: { email },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(),
        },
      }),
    );
  }

  const reload = (id: string) =>
    prisma.order.findUniqueOrThrow({ where: { id } });

  test('capture emails the buyer and records it on the order', async () => {
    const { order } = await setup('RESERVED');
    const paypal = vi.mocked(OrdersController).mock.results[0].value as {
      getOrder: ReturnType<typeof vi.fn>;
      captureOrder: ReturnType<typeof vi.fn>;
    };
    const unit = { referenceId: order.id };
    paypal.getOrder.mockResolvedValueOnce({
      result: { id: 'PAYPAL_ORDER_1', purchaseUnits: [unit] },
    });
    paypal.captureOrder.mockResolvedValueOnce({
      result: {
        id: 'PAYPAL_ORDER_1',
        status: 'COMPLETED',
        purchaseUnits: [
          { ...unit, payments: { captures: [{ id: 'CAPTURE_9' }] } },
        ],
        payer: { emailAddress: 'payer@example.com' },
      },
    });

    await createCaller(
      await createContextInner({ session: null }),
    ).order.captureOrder({ id: 'PAYPAL_ORDER_1' });

    // the email isn't awaited by captureOrder
    await vi.waitFor(async () =>
      expect((await reload(order.id)).confirmationEmailSentAt).not.toBeNull(),
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'payer@example.com',
        replyTo: 'org-a@org.test',
      }),
    );
    expect((await reload(order.id)).confirmationEmailError).toBeNull();
  });

  test('organisers can resend, to the buyer or another address', async () => {
    const { order } = await setup();
    const caller = await callerFor();

    await caller.order.resendConfirmation({ orderId: order.id });
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'buyer@example.com' }),
    );
    expect((await reload(order.id)).confirmationEmailSentAt).not.toBeNull();

    await caller.order.resendConfirmation({
      orderId: order.id,
      email: ' other@example.com ',
    });
    expect(sendEmail).toHaveBeenLastCalledWith(
      expect.objectContaining({ to: 'other@example.com' }),
    );
  });

  test('a failed send is recorded and reported, and a later success clears it', async () => {
    const { order } = await setup();
    const caller = await callerFor();
    vi.mocked(sendEmail).mockResolvedValueOnce({
      ok: false,
      error: '401 Unauthorized',
    });

    await expect(
      caller.order.resendConfirmation({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
    let after = await reload(order.id);
    expect(after.confirmationEmailError).toBe('401 Unauthorized');
    expect(after.confirmationEmailSentAt).toBeNull();

    await caller.order.resendConfirmation({ orderId: order.id });
    after = await reload(order.id);
    expect(after.confirmationEmailError).toBeNull();
    expect(after.confirmationEmailSentAt).not.toBeNull();
  });

  test('only confirmed orders, and only by the organisation', async () => {
    const { order } = await setup('RESERVED');
    await expect(
      (await callerFor()).order.resendConfirmation({ orderId: order.id }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'CONFIRMED' },
    });
    await expect(
      (await callerFor('member@org-b.test')).order.resendConfirmation({
        orderId: order.id,
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
