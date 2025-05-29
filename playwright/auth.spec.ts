import { test, expect, Page } from '@playwright/test';

test.describe('Custom Sign-in Page', () => {
  test('should redirect to custom sign-in page and initiate Google sign-in', async ({ page }) => {
    // 1. Navigate to the default NextAuth sign-in URL
    // This should redirect to our custom page due to the `pages` option.
    await page.goto('/api/auth/signin');

    // 2. Verify redirection to the custom sign-in page
    await page.waitForURL('/auth/signin');
    expect(page.url()).toContain('/auth/signin');

    // 3. Verify distinctive elements from the custom sign-in page are visible
    // Check for the "Sign In" heading (CardTitle in signin.tsx likely renders as h3)
    await expect(page.locator('h3:has-text("Sign In")')).toBeVisible();
    
    // Check for the "Sign in with Google" button
    const googleSignInButton = page.getByRole('button', { name: /Sign in with Google/i });
    await expect(googleSignInButton).toBeVisible();

    // 4. Verify Sign-in Flow Initiation
    // Click the "Sign in with Google" button
    // We expect this to navigate away to Google's sign-in page.
    // We can use a promise to wait for the new page/url that opens or the current page navigates.
    
    // Option A: If it navigates in the same tab
    await googleSignInButton.click();
    
    // Wait for the URL to change to Google's authentication page
    // Using a flexible matcher for the URL
    await page.waitForURL((url) => url.href.startsWith('https://accounts.google.com/'), { timeout: 10000 });

    expect(page.url()).toMatch(/^https:\/\/accounts\.google\.com\//);

    // At this point, the test has verified that the custom sign-in page is used
    // and that it correctly initiates the Google sign-in flow.
    // Further interaction with Google's page is out of scope for this test.
  });

  test('accessing a protected route should redirect to custom sign-in page', async ({ page, context }) => {
    // This test assumes `/admin` is a protected route.
    // If no user is signed in, it should redirect to /auth/signin.

    // First, ensure no session cookies are set from previous tests if any.
    // This is more relevant if tests share context, but good practice.
    await context.clearCookies();

    await page.goto('/admin');

    // Verify redirection to the custom sign-in page
    await page.waitForURL('/auth/signin**', { timeout: 15000 }); // Increased timeout for potential redirects
    expect(page.url()).toContain('/auth/signin');

    // Verify distinctive elements
    // Verify distinctive elements
    await expect(page.locator('h3:has-text("Sign In")')).toBeVisible();
    const googleSignInButton = page.getByRole('button', { name: /Sign in with Google/i });
    await expect(googleSignInButton).toBeVisible();
  });
});
