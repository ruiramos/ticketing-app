import { test, expect } from '@playwright/test';

test.describe('Disabled Event Behavior', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the application
    await page.goto('/');
  });

  test('should show event information but disable purchasing for disabled events', async ({
    page,
  }) => {
    // Navigate to the disabled event we seeded
    await page.goto('/events/disabled-event-12345');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that the disabled warning is shown
    await expect(
      page.locator('text=Event Currently Unavailable'),
    ).toBeVisible();
    await expect(
      page.locator(
        'text=This event is currently disabled and tickets are not available for purchase',
      ),
    ).toBeVisible();

    // Check that the header shows "Event Information" instead of "Book Your Experience"
    await expect(page.locator('text=Event Information')).toBeVisible();
    await expect(page.locator('text=Book Your Experience')).not.toBeVisible();
  });

  test('should display event details for disabled events', async ({ page }) => {
    // Navigate to the disabled event
    await page.goto('/events/disabled-event-12345');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that event details are still visible
    await expect(
      page.locator('h1', {
        hasText: 'Winter Workshop (Currently Unavailable)',
      }),
    ).toBeVisible();
    await expect(
      page.locator('text=Community Center, Main Hall'),
    ).toBeVisible();
    await expect(
      page.locator('text=Join us for an exciting winter workshop experience!'),
    ).toBeVisible();

    // Check that disabled warning is shown
    await expect(
      page.locator('text=Event Currently Unavailable'),
    ).toBeVisible();
    await expect(
      page.locator('text=This event is currently disabled'),
    ).toBeVisible();
  });

  test('should disable all purchase controls for disabled events', async ({
    page,
  }) => {
    // Navigate to the disabled event
    await page.goto('/events/disabled-event-12345');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that time slot selection shows disabled state
    await expect(page.locator('text=Event unavailable')).toBeVisible();

    // Check that sections have reduced opacity (disabled styling)
    const disabledSections = page.locator('.opacity-50');
    const sectionCount = await disabledSections.count();
    expect(sectionCount).toBeGreaterThan(0); // Should have disabled sections

    // Check that PayPal button is not rendered at all
    await expect(page.locator('iframe[title*="PayPal"]')).not.toBeVisible();
    await expect(page.locator('[data-paypal-button]')).not.toBeVisible();
  });

  test('should show "Event Information" instead of "Book Your Experience" for disabled events', async ({
    page,
  }) => {
    // Navigate to the disabled event
    await page.goto('/events/disabled-event-12345');

    // Wait for the page to load
    await page.waitForLoadState('networkidle');

    // Check that the header text is changed
    await expect(page.locator('text=Event Information')).toBeVisible();
    await expect(page.locator('text=Book Your Experience')).not.toBeVisible();
  });

  test('should allow viewing event details but prevent ticket purchase for disabled events', async ({
    page,
  }) => {
    // This test verifies the core functionality:
    // 1. Event details are visible
    // 2. Purchase functionality is disabled

    // Navigate to the disabled event
    await page.goto('/events/disabled-event-12345');
    await page.waitForLoadState('networkidle');

    // Verify event information is displayed
    await expect(
      page.locator('h1', {
        hasText: 'Winter Workshop (Currently Unavailable)',
      }),
    ).toBeVisible();
    await expect(page.locator('text=Important Information')).toBeVisible();
    await expect(
      page.locator('text=Interactive learning sessions'),
    ).toBeVisible();

    // Verify purchase controls are disabled - check that select trigger shows disabled state
    const selectTrigger = page.locator('button[role="combobox"]').first();
    await expect(selectTrigger).toBeVisible();

    // Try to click the select - it should not open because it's disabled
    await selectTrigger.click({ force: true });
    await expect(page.locator('[data-state="open"]')).not.toBeVisible(); // Select should not open

    // Verify the disabled state warning is prominent
    await expect(
      page.locator('text=Event Currently Unavailable'),
    ).toBeVisible();
    await expect(
      page.locator(
        'text=Please check back later or contact us for more information',
      ),
    ).toBeVisible();

    // Verify PayPal button is not rendered at all
    await expect(page.locator('iframe[title*="PayPal"]')).not.toBeVisible();
    await expect(page.locator('[data-paypal-button]')).not.toBeVisible();

    // Verify trust indicators are also not shown
    await expect(page.locator('text=Secure Payment')).not.toBeVisible();
    await expect(page.locator('text=Instant Confirmation')).not.toBeVisible();
  });

  test('should show "Book Your Experience" for enabled events', async ({
    page,
  }) => {
    // Navigate to the enabled event for comparison
    await page.goto('/events/c0cb00ae-fd1a-45ff-985f-38950f605a56');
    await page.waitForLoadState('networkidle');

    // Check that the header text shows booking functionality
    await expect(page.locator('text=Book Your Experience')).toBeVisible();
    await expect(page.locator('text=Event Information')).not.toBeVisible();

    // Check that disabled warning is not shown
    await expect(
      page.locator('text=Event Currently Unavailable'),
    ).not.toBeVisible();

    // Check that PayPal button area exists (even if not fully loaded)
    await expect(
      page.locator('iframe[title*="PayPal"], [data-paypal-button]'),
    ).toBeVisible();

    // Check that trust indicators are shown
    await expect(page.locator('text=Secure Payment')).toBeVisible();
    await expect(page.locator('text=Instant Confirmation')).toBeVisible();
  });
});

// Helper function to get the disabled event ID from seed data
function getDisabledEventId() {
  return 'disabled-event-12345';
}

// Helper function to get the enabled event ID from seed data
function getEnabledEventId() {
  return 'c0cb00ae-fd1a-45ff-985f-38950f605a56';
}
