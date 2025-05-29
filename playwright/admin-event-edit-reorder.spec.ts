import { test, expect, Page } from '@playwright/test';

const MOCK_EVENT_ID = 'clxmockevent1';
const EVENT_EDIT_URL = `/admin/events/edit/${MOCK_EVENT_ID}`;

interface MockVariant {
  id: string;
  title: string;
  price: number;
  stock: number;
  displayOrder?: number | null;
  // For mocking parts of eventWithOrders if necessary
  orders?: { id: string }[];
}

interface MockEvent {
  id: string;
  title: string;
  text: string;
  location?: string | null;
  link?: string | null;
  startsAt: string;
  endsAt?: string | null;
  enabled: boolean;
  variants: MockVariant[];
  eventExtras?: { id: string; title: string; price: number }[];
  organizationId?: string; // Added based on schema, might be needed for some checks
  createdAt?: string;
  updatedAt?: string;
}

// Helper to create default event data
const createMockEventData = (variants: MockVariant[]): MockEvent => ({
  id: MOCK_EVENT_ID,
  title: 'Test Event for Reordering',
  text: 'Event description.',
  startsAt: new Date().toISOString(),
  enabled: true,
  variants,
  eventExtras: [],
  organizationId: 'mockOrgId',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

// Helper to mock tRPC calls
async function setupMocks(page: Page, eventData: MockEvent | null) {
  await page.route(
    '**/api/trpc/event.byId,user.getUserEvent*',
    async (route) => {
      const url = route.request().url();
      let jsonResponsePayload: any = [{}]; // Default to an empty array of results or errors

      if (url.includes('event.byId')) {
        if (eventData) {
          jsonResponsePayload = [{ result: { data: eventData } }];
        } else {
          // Simulate event not found
          jsonResponsePayload = [
            {
              error: {
                json: { message: 'Event not found', code: 'NOT_FOUND' },
              },
            },
          ];
        }
      } else if (url.includes('user.getUserEvent')) {
        // Mock eventWithOrders to have no orders on variants.
        // The actual structure of user.getUserEvent might be more complex,
        // but for these tests, we only care that `eventWithOrders.variants` (or similar)
        // implies no active orders for the variants being tested.
        const userEventMockData = {
          id: eventData?.id || MOCK_EVENT_ID,
          // Mimic structure that EditEventPage uses for `eventWithOrders.variants`
          variants:
            eventData?.variants.map((v) => ({
              id: v.id,
              title: v.title, // Include title as it might be part of the type
              orders: [], // Crucial: no orders, so not disabled for deletion due to orders
            })) || [],
          // Potentially other fields from the trpc.user.getUserEvent query
        };
        jsonResponsePayload = [{ result: { data: userEventMockData } }];
      }

      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify(jsonResponsePayload),
      });
    },
  );

  await page.route('**/api/trpc/event.update*', async (route) => {
    // Mock the update mutation successfully
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify([
        {
          result: {
            data: {
              id: MOCK_EVENT_ID,
              ...route.request().postDataJSON()?.['0']?.json,
            },
          },
        },
      ]),
    });
  });
}

// Helper to get variant titles in order from the page
async function getVariantTitles(page: Page): Promise<string[]> {
  await page.waitForSelector('input[id^="variant-title-"]'); // Ensure inputs are loaded
  const variantTitleInputs = await page
    .locator('input[id^="variant-title-"]')
    .elementHandles();
  const titles = [];
  for (const input of variantTitleInputs) {
    titles.push(await input.inputValue());
  }
  return titles;
}

test.describe('Event Edit Page - Variant Reordering', () => {
  test.beforeEach(async ({ page }) => {
    // Common setup before each test can go here if needed
    // For now, mocks are set per test
  });

  test.describe('Initial Sort Order', () => {
    test('1.1: should render variants sorted by displayOrder', async ({
      page,
    }) => {
      const variants: MockVariant[] = [
        {
          id: 'v2',
          title: 'Variant B (Order 0)',
          price: 10,
          stock: 100,
          displayOrder: 0,
        },
        {
          id: 'v3',
          title: 'Variant C (Order 1)',
          price: 20,
          stock: 100,
          displayOrder: 1,
        },
        {
          id: 'v1',
          title: 'Variant A (Order 2)',
          price: 30,
          stock: 100,
          displayOrder: 2,
        },
      ];
      // The component should re-sort these based on displayOrder on load
      const expectedOrder = [
        'Variant B (Order 0)',
        'Variant C (Order 1)',
        'Variant A (Order 2)',
      ];

      await setupMocks(page, createMockEventData(variants));
      await page.goto(EVENT_EDIT_URL);

      await expect(page.locator('h1').getByText('Edit Event')).toBeVisible();

      const displayedTitles = await getVariantTitles(page);
      expect(displayedTitles).toEqual(expectedOrder);
    });

    test('1.2: should handle variants with null/undefined displayOrder (sorting them by originalIndex at the end)', async ({
      page,
    }) => {
      const variants: MockVariant[] = [
        {
          id: 'v1',
          title: 'Variant A (No displayOrder)',
          price: 10,
          stock: 100,
          displayOrder: null,
        }, // Should be originalIndex 0
        {
          id: 'v2',
          title: 'Variant B (displayOrder 0)',
          price: 20,
          stock: 100,
          displayOrder: 0,
        },
        {
          id: 'v3',
          title: 'Variant C (No displayOrder)',
          price: 30,
          stock: 100,
        }, // Should be originalIndex 2
        {
          id: 'v4',
          title: 'Variant D (displayOrder 1)',
          price: 40,
          stock: 100,
          displayOrder: 1,
        },
      ];
      // Expected order: B (0), D (1), then A (originalIndex 0), then C (originalIndex 2)
      // The component's useEffect sorts by displayOrder ?? Infinity, then by originalIndex
      const expectedOrder = [
        'Variant B (displayOrder 0)',
        'Variant D (displayOrder 1)',
        'Variant A (No displayOrder)',
        'Variant C (No displayOrder)',
      ];

      await setupMocks(page, createMockEventData(variants));
      await page.goto(EVENT_EDIT_URL);

      await expect(page.locator('h1').getByText('Edit Event')).toBeVisible();

      const displayedTitles = await getVariantTitles(page);
      expect(displayedTitles).toEqual(expectedOrder);
    });
  });

  test.describe('Reordering with Up/Down Buttons', () => {
    const initialVariants: MockVariant[] = [
      { id: 'v1', title: 'Variant 1', price: 10, stock: 10, displayOrder: 0 },
      { id: 'v2', title: 'Variant 2', price: 20, stock: 20, displayOrder: 1 },
      { id: 'v3', title: 'Variant 3', price: 30, stock: 30, displayOrder: 2 },
    ];

    test('2.1: should move a variant up and update order', async ({ page }) => {
      await setupMocks(page, createMockEventData([...initialVariants])); // Use a copy
      await page.goto(EVENT_EDIT_URL);

      // Variant 2 is at index 1, Variant 1 is at index 0
      expect(await getVariantTitles(page)).toEqual([
        'Variant 1',
        'Variant 2',
        'Variant 3',
      ]);

      // Click "Up" on "Variant 2" (which is the second variant, at index 1)
      // The buttons are within the div that also contains the variant's inputs.
      // Each variant item is a "flex items-end gap-2 p-4 border rounded" div.
      // Inside this, the up/down buttons are in a "flex flex-col gap-1" div.
      await page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1)
        .locator('button[title="Move variant up"]')
        .click();

      expect(await getVariantTitles(page)).toEqual([
        'Variant 2',
        'Variant 1',
        'Variant 3',
      ]);

      // Check button states: "Variant 2" (now first) should have "Up" disabled
      const firstVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(0);
      await expect(
        firstVariantItem.locator('button[title="Move variant up"]'),
      ).toBeDisabled();
    });

    test('2.2: should move a variant down and update order', async ({
      page,
    }) => {
      await setupMocks(page, createMockEventData([...initialVariants]));
      await page.goto(EVENT_EDIT_URL);

      expect(await getVariantTitles(page)).toEqual([
        'Variant 1',
        'Variant 2',
        'Variant 3',
      ]);

      // Click "Down" on "Variant 2" (second variant, index 1)
      await page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1)
        .locator('button[title="Move variant down"]')
        .click();

      expect(await getVariantTitles(page)).toEqual([
        'Variant 1',
        'Variant 3',
        'Variant 2',
      ]);

      // Check button states: "Variant 2" (now last) should have "Down" disabled
      const lastVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(2);
      await expect(
        lastVariantItem.locator('button[title="Move variant down"]'),
      ).toBeDisabled();
    });

    test('2.3: Up/Down buttons should be disabled for first/last variant respectively', async ({
      page,
    }) => {
      await setupMocks(page, createMockEventData([...initialVariants]));
      await page.goto(EVENT_EDIT_URL);

      // First variant ("Variant 1")
      const firstVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(0);
      await expect(
        firstVariantItem.locator('button[title="Move variant up"]'),
      ).toBeDisabled();
      await expect(
        firstVariantItem.locator('button[title="Move variant down"]'),
      ).toBeEnabled();

      // Middle variant ("Variant 2")
      const middleVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1);
      await expect(
        middleVariantItem.locator('button[title="Move variant up"]'),
      ).toBeEnabled();
      await expect(
        middleVariantItem.locator('button[title="Move variant down"]'),
      ).toBeEnabled();

      // Last variant ("Variant 3")
      const lastVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(2);
      await expect(
        lastVariantItem.locator('button[title="Move variant up"]'),
      ).toBeEnabled();
      await expect(
        lastVariantItem.locator('button[title="Move variant down"]'),
      ).toBeDisabled();
    });
  });

  test.describe('Display Order after Adding a Variant', () => {
    test('3.1: should add new variant to the end with correct displayOrder (inferred by position)', async ({
      page,
    }) => {
      const initial: MockVariant[] = [
        {
          id: 'v1',
          title: 'First Variant',
          price: 10,
          stock: 10,
          displayOrder: 0,
        },
      ];
      await setupMocks(page, createMockEventData(initial));
      await page.goto(EVENT_EDIT_URL);

      expect(await getVariantTitles(page)).toEqual(['First Variant']);

      await page.getByRole('button', { name: 'Add Variant' }).click();

      // New variant has empty title by default
      const expectedTitlesAfterAdd = ['First Variant', ''];
      expect(await getVariantTitles(page)).toEqual(expectedTitlesAfterAdd);

      // Last variant (the new one) should have "Down" button disabled
      const newVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1);
      await expect(
        newVariantItem.locator('button[title="Move variant down"]'),
      ).toBeDisabled();
      // And "Up" button enabled (since there are 2 variants)
      await expect(
        newVariantItem.locator('button[title="Move variant up"]'),
      ).toBeEnabled();
    });
  });

  test.describe('Display Order after Removing a Variant', () => {
    test('4.1: should update displayOrder of remaining variants (inferred by position)', async ({
      page,
    }) => {
      const initial: MockVariant[] = [
        { id: 'v1', title: 'Variant X', price: 10, stock: 10, displayOrder: 0 },
        {
          id: 'v2',
          title: 'Variant Y (to remove)',
          price: 20,
          stock: 20,
          displayOrder: 1,
        },
        { id: 'v3', title: 'Variant Z', price: 30, stock: 30, displayOrder: 2 },
      ];
      await setupMocks(page, createMockEventData(initial));
      await page.goto(EVENT_EDIT_URL);

      expect(await getVariantTitles(page)).toEqual([
        'Variant X',
        'Variant Y (to remove)',
        'Variant Z',
      ]);

      // Remove "Variant Y" (second variant)
      // Delete button is sibling to input fields, inside the variant item div.
      // It has title="Delete variant" (or similar if disabled)
      await page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1)
        .locator('button[title="Delete variant"]')
        .click();

      const expectedTitlesAfterRemove = ['Variant X', 'Variant Z'];
      expect(await getVariantTitles(page)).toEqual(expectedTitlesAfterRemove);

      // Check "Variant Z" (which was 3rd, now 2nd) has its "Down" button disabled
      const lastVariantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(1);
      await expect(
        lastVariantItem.locator('button[title="Move variant down"]'),
      ).toBeDisabled();
      // And "Up" button should be enabled as it's not the first item (total 2 items)
      await expect(
        lastVariantItem.locator('button[title="Move variant up"]'),
      ).toBeEnabled();
    });

    test('4.2: should prevent removing the last variant and show alert / disable button', async ({
      page,
    }) => {
      const initial: MockVariant[] = [
        {
          id: 'v1',
          title: 'The Only Variant',
          price: 10,
          stock: 10,
          displayOrder: 0,
        },
      ];
      await setupMocks(page, createMockEventData(initial));
      await page.goto(EVENT_EDIT_URL);

      expect(await getVariantTitles(page)).toEqual(['The Only Variant']);

      const variantItem = page
        .locator('.flex.items-end.gap-2.p-4.border.rounded')
        .nth(0);
      const deleteButton = variantItem.locator(
        'button[aria-label*="Delete variant"], button[title*="Delete variant"], button[title*="delete last variant"]',
      );

      // Check if the button is disabled and has the correct title
      await expect(deleteButton).toBeDisabled();
      await expect(deleteButton).toHaveAttribute(
        'title',
        'Cannot delete last variant',
      );

      // Also, ensure no alert is present initially
      // (The component uses a browser alert, which needs special handling if we were to click)
      let alertMessage = '';
      page.on('dialog', async (dialog) => {
        alertMessage = dialog.message();
        await dialog.dismiss(); // or accept()
      });

      // If we were to somehow enable and click, we'd check `alertMessage`
      // For now, verifying disabled state is primary.
      // If the button was not disabled, this would test the alert:
      // if (await deleteButton.isEnabled()) {
      //   await deleteButton.click();
      //   expect(alertMessage).toBe('You must have at least one ticket variant.');
      // }

      // Verify the variant is still there
      expect(await getVariantTitles(page)).toEqual(['The Only Variant']);
    });
  });
});

// Notes:
// - Locators based on CSS classes + nth() can be brittle. data-testid attributes are recommended for robust tests.
// - Testing the exact `displayOrder` value in state is difficult with Playwright. Tests infer it from visual order and button states.
// - The mock for `event.update` in `setupMocks` is basic. It could be enhanced to capture input if needed to verify submitted `displayOrder`.
// - The `user.getUserEvent` mock assumes a structure. If the actual API returns something different that affects variant interactions (e.g., specific order details that disable buttons), the mock would need adjustment.
