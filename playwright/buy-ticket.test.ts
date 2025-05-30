import { test, expect } from '@playwright/test';
// import { execSync } from 'child_process'; // Removed
import { PrismaClient } from '~/generated/prisma/client'; // Path based on seed.ts
import { seedSummerFairEvent } from '../prisma/seed'; // Corrected relative path

test.skip('Buy Ticket Flow', () => {
  test.beforeAll(async () => {
    console.log('Setting up test database programmatically...');
    const prisma = new PrismaClient();
    try {
      console.log('Clearing existing test data...');
      // Order of deletion: from models with foreign keys to models they refer to,
      // or simply children before parents if ON DELETE CASCADE is not reliably set/assumed.
      await prisma.order.deleteMany({});
      // Assuming Users are tied to Organizations. If Users can exist without an org or have other dependencies,
      // their deletion might need to be timed differently or handled with care.
      // The seed creates users under an organization.
      await prisma.user.deleteMany({});
      await prisma.variant.deleteMany({});
      await prisma.eventExtras.deleteMany({});
      await prisma.event.deleteMany({});
      await prisma.organization.deleteMany({});

      console.log('Existing data cleared. Seeding test event...');
      await seedSummerFairEvent(prisma);
      console.log('Database programmatic seeding complete.');
    } catch (error) {
      console.error('Error during programmatic database setup:', error);
      // It's important to throw the error to ensure Playwright knows setup failed.
      throw error;
    } finally {
      await prisma.$disconnect();
      console.log('Prisma client disconnected after database setup.');
    }
  }, /* Optional: Add a timeout for beforeAll if DB operations are very long */ 60000); // e.g., 60 seconds timeout for beforeAll

  test('should allow a user to buy a ticket for an event', async ({ page }) => {
    const paypalUserEmail = process.env.PAYPAL_USER_EMAIL;
    const paypalUserPassword = process.env.PAYPAL_USER_PASSWORD;

    if (!paypalUserEmail || !paypalUserPassword) {
      throw new Error(
        'PayPal sandbox credentials (PAYPAL_USER_EMAIL, PAYPAL_USER_PASSWORD) are not set. Please ensure they are defined in your test environment (e.g., in the .env.test file).',
      );
    }

    // 1. Navigate to Event Page
    await page.goto('/');
    await page.getByRole('link', { name: /Summer fair/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Summer fair' }),
    ).toBeVisible({ timeout: 10000 });

    // 2. Select Ticket Variant
    await page.getByRole('combobox', { name: /ticket type/i }).click();
    await page.getByRole('option', { name: /10:00am - 10:15am - £5/i }).click();

    // 3. Initiate PayPal Checkout
    await page
      .frameLocator('[name*="zoid_prerender_frame__paypal_buttons"]')
      .getByRole('link', { name: 'PayPal' })
      .click();

    // await page.locator(payPalButtonSelector).click();

    // 4. Handle PayPal Sandbox Login & Payment
    let paypalPage = page;
    try {
      const popup = await page.waitForEvent('popup', { timeout: 15000 });
      paypalPage = popup;
      await paypalPage.waitForLoadState('domcontentloaded', { timeout: 20000 });
    } catch (e) {
      console.log(
        'No PayPal popup detected, assuming iframe or error. Test will likely fail if login is in a separate window.',
      );
    }

    await paypalPage.waitForSelector('input#email', { timeout: 20000 });
    await paypalPage.locator('input#email').fill(paypalUserEmail);
    if (
      await paypalPage.locator('button#btnNext').isVisible({ timeout: 5000 })
    ) {
      // Added timeout for isVisible check
      await paypalPage.locator('button#btnNext').click();
    }

    await paypalPage.waitForSelector('input#password', { timeout: 10000 });
    await paypalPage.locator('input#password').fill(paypalUserPassword);
    await paypalPage.locator('button#btnLogin').click();

    await paypalPage.waitForSelector('button#payment-submit-btn', {
      timeout: 20000,
    });
    await paypalPage.locator('button#payment-submit-btn').click();

    // 5. Verify Purchase Confirmation
    await page.waitForURL(/\/[0-9a-fA-F-]+$/, { timeout: 20000 });

    const confirmationMessage = 'Thank you, your order is now confirmed!';
    await expect(page.getByText(confirmationMessage)).toBeVisible({
      timeout: 15000,
    });

    await expect(
      page.getByText(/Ticket for 10:00am - 10:15am \(x1\)/i),
    ).toBeVisible();
    await expect(page.getByText(/Order ID:/i)).toBeVisible();
  });
});
