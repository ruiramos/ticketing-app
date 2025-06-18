import { test, expect } from '@playwright/test';

test.describe('Custom Sign-in Page', () => {
  test('accessing a protected route should redirect to custom sign-in page', async ({
    page,
    context,
  }) => {
    // This test assumes `/admin` is a protected route.
    // If no user is signed in, it should redirect to /auth/signin.

    // First, ensure no session cookies are set from previous tests if any.
    // This is more relevant if tests share context, but good practice.
    await context.clearCookies();

    await page.goto('/admin');

    // Verify redirection to the custom sign-in page
    await page.waitForURL('/auth/signin**', { timeout: 5000 }); // Increased timeout for potential redirects
    expect(page.url()).toContain('/auth/signin');

    // Verify distinctive elements
    // Verify distinctive elements
    const googleSignInButton = page.getByRole('button', {
      name: /Sign in with Google/i,
    });
    await expect(googleSignInButton).toBeVisible();
  });
});
