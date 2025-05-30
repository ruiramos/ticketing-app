import { test, expect, Page, Locator } from '@playwright/test';
import { URL } from 'url';

const MOCK_EVENT_ID = 'clxtestevent1';
const EVENT_PAGE_URL = `/events/${MOCK_EVENT_ID}`;

// Constants from the app
const EVENT_MAX_TICKETS = 10;

interface MockOrder {
  id: string;
  status:
    | 'CREATED'
    | 'COMPLETED'
    | 'SAVED'
    | 'APPROVED'
    | 'PAYER_ACTION_REQUIRED'
    | 'VOIDED';
  purchaseUnits?: {
    items?: { name: string; quantity: string }[];
    amount?: { value: string };
  }[];
}

interface MockVariant {
  id: string;
  title: string;
  price: number;
  stock: number;
  displayOrder: number;
}

interface MockEventExtra {
  id: string;
  title: string;
  price: number;
  description?: string | null;
  currency?: string;
}

interface MockEventData {
  id: string;
  title: string;
  text: string;
  location?: string | null;
  link?: string | null;
  startsAt: string;
  endsAt?: string | null;
  enabled: boolean;
  variants: MockVariant[];
  eventExtras: MockEventExtra[];
}

const createMockEvent = (
  config: Partial<MockEventData> = {},
): MockEventData => ({
  id: MOCK_EVENT_ID,
  title: 'Awesome Tech Conference 2024',
  text: 'Join us for the most exciting tech conference of the year! Featuring talks from industry leaders, hands-on workshops, and networking opportunities.',
  location: 'Grand Tech Hall, Silicon City',
  startsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // One week from now
  endsAt: new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000 + 8 * 60 * 60 * 1000,
  ).toISOString(), // Duration 8 hours
  enabled: true,
  variants: [
    {
      id: 'v1',
      title: 'Early Bird Pass',
      price: 199,
      stock: 100,
      displayOrder: 0,
    },
    {
      id: 'v2',
      title: 'Standard Pass',
      price: 299,
      stock: 250,
      displayOrder: 1,
    },
    { id: 'v3', title: 'VIP Pass', price: 499, stock: 50, displayOrder: 2 },
  ],
  eventExtras: [
    {
      id: 'e1',
      title: 'Official Event T-Shirt',
      price: 25,
      description:
        'High-quality cotton t-shirt with event logo. Available in S, M, L, XL.',
      currency: 'GBP',
    },
    {
      id: 'e2',
      title: 'Sticker Pack',
      price: 5,
      description: null,
      currency: 'GBP',
    },
    {
      id: 'e3',
      title: 'Catered Lunch Voucher',
      price: 18,
      description: 'Enjoy a delicious catered lunch on site.',
      currency: 'GBP',
    },
  ],
  ...config,
});

async function setupMocks(
  page: Page,
  eventData: MockEventData,
  orderMocks?: { create?: any; capture?: any; getOrder?: any },
) {
  // More robust matcher for event.byId
  await page.route(
    (url) =>
      !!(
        url.href.includes('/api/trpc/event.byId') &&
        url.searchParams.get('input')?.includes(`"id":"${MOCK_EVENT_ID}"`)
      ),
    async (route) => {
      await route.fulfill({
        status: 200,
        json: [{ result: { data: { json: eventData } } }],
      });
    },
  );

  await page.route('**/api/trpc/order.createOrder*', async (route) => {
    if (orderMocks?.create?.error) {
      await route.fulfill({
        status: 200,
        json: [
          {
            error: {
              json: {
                message: orderMocks.create.error,
                ...orderMocks.create.details,
              },
            },
          },
        ],
      });
    } else {
      await route.fulfill({
        json: [
          {
            result: {
              data: {
                json: {
                  id: 'mock_order_id_123',
                  status: 'CREATED',
                  ...orderMocks?.create?.success,
                },
              },
            },
          },
        ],
      });
    }
  });

  await page.route('**/api/trpc/order.captureOrder*', async (route) => {
    if (orderMocks?.capture?.error) {
      await route.fulfill({
        status: 200,
        json: [
          {
            error: {
              json: {
                message: orderMocks.capture.error,
                ...orderMocks.capture.details,
              },
            },
          },
        ],
      });
    } else {
      const mockOrderResult: MockOrder = {
        id: 'mock_order_id_123',
        status: 'COMPLETED',
        purchaseUnits: [
          {
            items: [{ name: 'Test Item', quantity: '1' }],
            amount: { value: '10.00' },
          },
        ],
        ...orderMocks?.capture?.success,
      };
      await route.fulfill({
        json: [{ result: { data: { json: mockOrderResult } } }],
      });
    }
  });

  await page.route('**/api/trpc/order.byId*', async (route) => {
    const defaultOrderData: MockOrder = {
      id: 'mock_order_id_123',
      status: 'COMPLETED',
      purchaseUnits: [
        {
          items: [{ name: 'Test Item', quantity: '1' }],
          amount: { value: '10.00' },
        },
      ],
    };
    const orderDataToReturn =
      orderMocks?.getOrder?.success ??
      orderMocks?.capture?.success ??
      defaultOrderData;
    await route.fulfill({
      json: [{ result: { data: { json: orderDataToReturn } } }],
    });
  });
}

test.skip('Event Detail Page UI/UX', () => {
  test.describe('EventItem Layout', () => {
    const eventData = createMockEvent();
    test.beforeEach(async ({ page }) => {
      await setupMocks(page, eventData);
    });

    test('1.1: should have two-column layout on desktop', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.goto(EVENT_PAGE_URL);

      // The main container for EventItem is expected to be <div class="flex flex-col md:flex-row ...">
      const eventItemContainer = page.locator('.flex.flex-col.md\\:flex-row');
      await expect(eventItemContainer).toBeVisible();
      // On desktop, it should behave as row. We can check computed style or structure.
      // For structure: expect two direct children div elements representing columns.
      const leftColumn = eventItemContainer.locator('> div').nth(0);
      const rightColumn = eventItemContainer.locator('> div').nth(1);
      await expect(leftColumn).toHaveClass(/md:w-1\/2/); // Or md:w-2/3
      await expect(rightColumn).toHaveClass(/md:w-1\/2/); // Or md:w-1/3

      // Check content of left column
      await expect(
        leftColumn.getByRole('heading', { name: eventData.title }),
      ).toBeVisible();
      await expect(
        leftColumn.getByText(eventData.text.substring(0, 50)),
      ).toBeVisible(); // Check part of text
      await expect(leftColumn.locator('.lucide-calendar-days')).toBeVisible();
      await expect(leftColumn.locator('.lucide-clock')).toBeVisible();
      await expect(leftColumn.locator('.lucide-map-pin')).toBeVisible();

      // Check content of right column (EventForm)
      await expect(rightColumn.getByText('Ticket type')).toBeVisible();
    });

    test('1.2: should have single-column layout on mobile', async ({
      page,
    }) => {
      await page.setViewportSize({ width: 375, height: 667 }); // Mobile viewport
      await page.goto(EVENT_PAGE_URL);

      const eventItemContainer = page
        .locator('div > .flex.flex-col.md\\:flex-row')
        .first(); // More specific if nested
      await expect(eventItemContainer).toBeVisible();

      // On mobile, it should behave as column. Check computed style.
      // For flex-col, the direct children (columns) would typically have full width or controlled by flex properties.
      // It's harder to directly test flex-direction with Playwright's built-in matchers without getComputedStyle.
      // Instead, we can infer by checking if the columns take full width or stack.
      // E.g. the right column (form) should appear below the left (details).
      // We can check the bounding box of the two column divs.
      const leftColumn = eventItemContainer.locator('> div').nth(0);
      const rightColumn = eventItemContainer.locator('> div').nth(1);

      const leftBox = await leftColumn.boundingBox();
      const rightBox = await rightColumn.boundingBox();

      expect(leftBox).not.toBeNull();
      expect(rightBox).not.toBeNull();
      if (leftBox && rightBox) {
        // If stacked, top of rightBox should be >= bottom of leftBox (approx)
        expect(rightBox.y).toBeGreaterThanOrEqual(
          leftBox.y + leftBox.height - 5,
        ); // -5 for tolerance
      }
    });
  });

  test.describe('EventForm - Dynamic Variant Display', () => {
    test('2.1.1: should render radio buttons for <= 3 variants', async ({
      page,
    }) => {
      const eventData = createMockEvent({
        variants: [
          {
            id: 'v1',
            title: 'Variant A',
            price: 10,
            stock: 10,
            displayOrder: 0,
          },
          {
            id: 'v2',
            title: 'Variant B',
            price: 20,
            stock: 5,
            displayOrder: 1,
          },
        ],
      });
      await setupMocks(page, eventData);
      await page.goto(EVENT_PAGE_URL);

      await expect(page.getByRole('radiogroup')).toBeVisible();
      await expect(page.getByRole('combobox')).not.toBeVisible(); // Select should not be visible
      await expect(page.getByLabel(/Variant A.*Stock: 10/)).toBeVisible();
      await expect(
        page.getByLabel(/Variant B.*Last few! Stock: 5/),
      ).toBeVisible();
    });

    test('2.1.2: should render select dropdown for > 3 variants', async ({
      page,
    }) => {
      const eventData = createMockEvent({
        variants: [
          { id: 'v1', title: 'V A', price: 10, stock: 10, displayOrder: 0 },
          { id: 'v2', title: 'V B', price: 20, stock: 0, displayOrder: 1 }, // Sold out
          { id: 'v3', title: 'V C', price: 30, stock: 3, displayOrder: 2 }, // Last few
          { id: 'v4', title: 'V D', price: 40, stock: 30, displayOrder: 3 },
        ],
      });
      await setupMocks(page, eventData);
      await page.goto(EVENT_PAGE_URL);

      await expect(
        page.getByRole('combobox', { name: /Ticket type/i }),
      ).toBeVisible();
      await expect(page.getByRole('radiogroup')).not.toBeVisible();

      // Check select items stock display
      await page.getByRole('combobox', { name: /Ticket type/i }).click();
      await expect(
        page.getByRole('option', { name: /V A.*Stock: 10/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('option', { name: /V B.*Sold out/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('option', { name: /V C.*Last few! Stock: 3/ }),
      ).toBeVisible();
      await expect(
        page.getByRole('option', { name: /V D.*Stock: 30/ }),
      ).toBeVisible();
    });
  });

  test.describe('EventForm - Stock-Aware Quantity Control', () => {
    const eventData = createMockEvent({
      variants: [
        {
          id: 'v-normal',
          title: 'Normal Stock',
          price: 20,
          stock: 15,
          displayOrder: 0,
        }, // More than EVENT_MAX_TICKETS
        {
          id: 'v-limited',
          title: 'Limited Stock',
          price: 20,
          stock: 3,
          displayOrder: 1,
        }, // Less than EVENT_MAX_TICKETS
        {
          id: 'v-soldout',
          title: 'Sold Out',
          price: 20,
          stock: 0,
          displayOrder: 2,
        },
      ],
    });
    test.beforeEach(async ({ page }) => {
      await setupMocks(page, eventData);
      await page.goto(EVENT_PAGE_URL);
    });

    test('3.1: select variant with ample stock (limited by EVENT_MAX_TICKETS)', async ({
      page,
    }) => {
      await page.getByLabel(/Normal Stock/).click(); // Assuming radio buttons are used
      const quantityInput = page.getByLabel('Quantity');
      await expect(quantityInput).toBeEnabled();
      await expect(quantityInput).toHaveAttribute(
        'max',
        String(EVENT_MAX_TICKETS),
      );

      await quantityInput.fill(String(EVENT_MAX_TICKETS + 5)); // Try to exceed max
      await expect(quantityInput).toHaveValue(String(EVENT_MAX_TICKETS)); // Should be capped
      await expect(page.getByRole('button', { name: '+' })).toBeDisabled();
    });

    test('3.2: select variant with limited stock (less than EVENT_MAX_TICKETS)', async ({
      page,
    }) => {
      await page.getByLabel(/Limited Stock/).click();
      const quantityInput = page.getByLabel('Quantity');
      await expect(quantityInput).toBeEnabled();
      await expect(quantityInput).toHaveAttribute('max', '3');

      await quantityInput.fill('5');
      await expect(quantityInput).toHaveValue('3');
      await expect(page.getByRole('button', { name: '+' })).toBeDisabled();
    });

    test('3.3: select sold-out variant', async ({ page }) => {
      await page.getByLabel(/Sold Out/).click();
      const quantityInput = page.getByLabel('Quantity');
      await expect(quantityInput).toBeDisabled(); // Or readOnly and value 0
      await expect(quantityInput).toHaveValue('0');

      // PayPal button should be disabled
      // The PayPalButton component now has a 'disabled' prop.
      // We need a way to select the PayPal button. Let's assume it's the one with text "Checkout" or similar, or a specific test ID.
      // For now, let's assume a generic way or that it's part of a form.
      // The test `PayPalButton disabled={...}` is in the component.
      // We can check if a button that would eventually lead to PayPal is disabled.
      // This requires knowing how PayPalButton is rendered or if it's wrapped.
      // The form's PayPalButton has `disabled={isPurchaseDisabled || quantity === 0 ...}`
      // Since quantity is 0 and isPurchaseDisabled is true for sold out, it should be disabled.
      // Let's find a button within the form that might be the PayPal button.
      // A more direct test would be to add a data-testid to the PayPalButton wrapper.
      await expect(
        page
          .locator('form button')
          .filter({ hasText: /paypal/i })
          .first(),
      ).toBeDisabled();
    });
  });

  test.describe('EventForm - Add-on Descriptions', () => {
    const eventData = createMockEvent({
      // Uses default extras from createMockEvent
      eventExtras: [
        {
          id: 'e1',
          title: 'Event T-Shirt',
          price: 25,
          description: 'Official event merchandise, 100% cotton.',
          currency: 'GBP',
        },
        {
          id: 'e2',
          title: 'Sticker Pack',
          price: 5,
          description: null,
          currency: 'GBP',
        }, // No description
      ],
    });
    test.beforeEach(async ({ page }) => {
      await setupMocks(page, eventData);
      await page.goto(EVENT_PAGE_URL);
    });

    test('4.1: should display description for add-on that has it', async ({
      page,
    }) => {
      // Locate the container for the "Event T-Shirt" add-on more reliably
      const tShirtLabel = page.getByText('Event T-Shirt', { exact: true });
      // Assuming the structure <div class="flex items-start ..."><Checkbox /><div class="grid ..."><Label /><p id="descId" /></div></div>
      const tShirtContainer = tShirtLabel.locator(
        'xpath=ancestor::div[contains(@class, "flex") and contains(@class, "items-start")]',
      );

      const description = tShirtContainer.locator('p');
      await expect(description).toBeVisible();
      await expect(description).toHaveText(
        'Official event merchandise, 100% cotton.',
      );
      await expect(description).toHaveClass(/text-xs/);
      await expect(description).toHaveClass(/text-muted-foreground/);

      const checkbox = tShirtContainer.getByRole('checkbox');
      const descId = await description.getAttribute('id');
      expect(descId).toBeTruthy(); // Ensure descId is not null or empty
      await expect(checkbox).toHaveAttribute('aria-describedby', descId!);
    });

    test('4.2: should not display description for add-on without it', async ({
      page,
    }) => {
      const stickerLabel = page.getByText('Sticker Pack', { exact: true });
      const stickerContainer = stickerLabel.locator(
        'xpath=ancestor::div[contains(@class, "flex") and contains(@class, "items-start")]',
      );

      // Description p tag should not exist or not be visible within this specific add-on's container
      await expect(stickerContainer.locator('p')).not.toBeVisible();
    });
  });

  test.describe('EventForm - Loading/Error States', () => {
    test('5.1: should display loading indicator during order creation', async ({
      page,
    }) => {
      const eventData = createMockEvent({
        variants: [
          { id: 'v1', title: 'Test', price: 10, stock: 1, displayOrder: 0 },
        ],
      });
      await setupMocks(page, eventData, {
        create: { success: {}, delay: 2000 }, // Mock delay to see loading
      });

      await page.route('**/api/trpc/order.createOrder*', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1000)); // add delay
        await route.fulfill({
          json: [
            {
              result: {
                data: { json: { id: 'mock_order_id_123', status: 'CREATED' } },
              },
            },
          ],
        });
      });

      await page.goto(EVENT_PAGE_URL);
      await page.getByLabel(/Test/).click(); // Select the variant

      // Click PayPal button (assuming it's not the real PayPal button but our wrapper)
      // This requires knowing the selector for the PayPal button.
      // For now, this test is conceptual for the loading indicator part.
      // If PayPalButton is a simple button, we click it. If it's an iframe, it's more complex.
      // The component has <PayPalButton ... />
      // The loading indicator is outside/after PayPalButton component in the DOM

      // To test this properly, we'd need to trigger the state that makes the indicator appear.
      // This means `createOrderMutation.isLoading` should be true.
      // We can't directly click the PayPal button in test if it loads external scripts/iframe.
      // Instead, we can test the component's behavior by simulating the mutation's state.
      // This is hard without direct component state manipulation in Playwright.

      // For now, we'll check if the text appears after some action that triggers it.
      // This part is tricky due to PayPal external interactions.
      // Awaiting a more direct way to trigger the loading state if possible.
      // If the button is a real button before PayPal SDK takes over:
      const payPalButtonContainer = page
        .locator('form div')
        .filter({ hasText: 'Total' })
        .locator('xpath=./following-sibling::div[1]'); // Try to locate PayPal button area

      // This part is more of a unit/component test. For e2e, we'd observe.
      // Let's assume clicking a "Proceed to Payment" button IF our PayPalButton was a simple wrapper.
      // Since it's not, this specific loading text test is hard to make stable for the *internal* loading of PayPal.
      // The text "Preparing your order..." is shown when createOrderMutation.isLoading is true.
      // We can test this by ensuring our mock for createOrder takes time.

      const promise = page.waitForResponse('**/api/trpc/order.createOrder*');
      // Click the actual PayPal button if it's rendered by our app first
      // This assumes the PayPal button is rendered and clickable, then our logic runs.
      // The actual PayPal button is complex. The custom `onClick` runs first.
      await payPalButtonContainer.locator('div[role="button"]').click(); // This is a guess for PayPal button

      await expect(page.getByText('Preparing your order...')).toBeVisible({
        timeout: 500,
      }); // Visible quickly
      await promise; // wait for network call to finish
      await expect(page.getByText('Preparing your order...')).not.toBeVisible();
    });

    test('5.2: should display custom error message on createOrder failure', async ({
      page,
    }) => {
      const eventData = createMockEvent({
        variants: [
          { id: 'v1', title: 'Test', price: 10, stock: 1, displayOrder: 0 },
        ],
      });
      const errorMessage =
        'The selected ticket may have recently sold out or changed. Please refresh and try again.';
      await setupMocks(page, eventData, {
        create: {
          error: 'stock issue',
          details: {
            /* any other tRPC error details */
          },
        },
      });
      await page.goto(EVENT_PAGE_URL);
      await page.getByLabel(/Test/).click();

      // Similar to above, triggering the PayPal flow to get to the error.
      const payPalButtonContainer = page
        .locator('form div')
        .filter({ hasText: 'Total' })
        .locator('xpath=./following-sibling::div[1]');
      await payPalButtonContainer.locator('div[role="button"]').click();

      await expect(page.getByText(errorMessage)).toBeVisible();
    });
  });
});
