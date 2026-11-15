import { expect, test } from '@playwright/test';
import { linkFromInbox, shot, signUpWithPassword, unique } from './helpers';

test.describe('Convex Auth', () => {
  test('guard redirects anonymous visitors to /login', async ({ page }, info) => {
    await page.goto('/todos');
    await expect(page).toHaveURL(/\/login\?next=%2Ftodos/);
    await expect(page.getByTestId('login-link')).toBeVisible();
    await shot(page, info, 'redirected-to-login');
  });

  test('username + password: sign up, sign out, wrong password, sign in', async ({ page }, info) => {
    const username = await signUpWithPassword(page);
    await shot(page, info, 'signed-up');

    await page.getByTestId('me').click();
    await expect(page.getByTestId('account-method')).toHaveText('usernamePassword');
    // injectAuthToken: the session JWT, decoded for its expiry.
    await expect(page.getByTestId('session-expiry')).toHaveText(/^\d\d:\d\d:\d\d$/);
    await shot(page, info, 'account');

    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId('login-link')).toBeVisible();

    await page.getByTestId('up-username').fill(username);
    await page.getByTestId('up-password').fill('wrong-password-1');
    await page.getByTestId('up-signin').click();
    await expect(page.getByTestId('login-error')).toContainText('invalid credentials');
    await shot(page, info, 'wrong-password');

    await page.getByTestId('up-password').fill('correct-horse-42');
    await page.getByTestId('up-signin').click();
    await expect(page).toHaveURL(/\/todos/);
    await shot(page, info, 'signed-in-again');
  });

  test('username + password: change password from the account page', async ({ page }, info) => {
    const username = await signUpWithPassword(page);
    await page.goto('/account');
    await page.getByTestId('cp-current').fill('correct-horse-42');
    await page.getByTestId('cp-new').fill('battery-staple-43');
    await page.getByTestId('cp-save').click();
    await expect(page.getByTestId('account-message')).toHaveText('Password changed.');
    await shot(page, info, 'password-changed');

    await page.getByTestId('sign-out').click();
    await page.getByTestId('up-username').fill(username);
    await page.getByTestId('up-password').fill('battery-staple-43');
    await page.getByTestId('up-signin').click();
    await expect(page).toHaveURL(/\/todos/);
  });

  test('email + password: sign up through the emailed link, then recover the password', async ({ page }, info) => {
    const email = `${unique('mail')}@example.com`;
    await page.goto('/login');
    await page.getByTestId('tab-email').click();
    await page.getByTestId('ep-email').fill(email);
    await page.getByTestId('ep-password').fill('correct-horse-42');
    await page.getByTestId('ep-signup').click();
    await expect(page.getByTestId('login-notice')).toContainText(email);
    await shot(page, info, 'confirmation-sent');

    // Signing in before confirming the address is refused.
    await page.getByTestId('ep-signin').click();
    await expect(page.getByTestId('login-error')).toBeVisible();

    const confirm = await linkFromInbox(page, email);
    await shot(page, info, 'fake-mailbox');
    expect(confirm).toContain('/auth/validate-email?code=');
    await page.goto(confirm);
    await expect(page.getByTestId('link-state')).toContainText('Email confirmed');
    await shot(page, info, 'email-confirmed');

    await page.goto('/account');
    await expect(page.getByTestId('account-email')).toHaveText(email);
    await page.getByTestId('sign-out').click();

    // Password recovery.
    await page.getByTestId('tab-email').click();
    await page.getByTestId('ep-email').fill(email);
    await page.getByTestId('ep-forgot').click();
    await expect(page.getByTestId('login-notice')).toContainText('reset link');
    const reset = await linkFromInbox(page, email);
    expect(reset).toContain('/auth/reset-password?code=');
    await page.goto(reset);
    await page.getByTestId('reset-password').fill('brand-new-pass-44');
    await shot(page, info, 'reset-form');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('link-state')).toContainText('Password changed');
    await shot(page, info, 'password-reset');
  });

  test('passkey: create an account and sign back in with a virtual authenticator', async ({ page }, info) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    });
    const username = unique('pk');
    await page.goto('/login');
    await page.getByTestId('tab-passkey').click();
    await page.getByTestId('pk-username').fill(username);
    await shot(page, info, 'passkey-form');
    await page.getByTestId('pk-continue').click();
    await expect(page).toHaveURL(/\/todos/);
    await page.goto('/account');
    await expect(page.getByTestId('account-method')).toHaveText('usernamePasskey');
    await expect(page.getByTestId('pk-item')).toHaveCount(1);
    await shot(page, info, 'passkey-account');

    await expect(page.getByTestId('account-name')).toHaveText(username);

    // Signing out lands on /login, where the passkey autofill (conditional
    // mediation) is armed: the virtual authenticator answers it, so the user is
    // signed back in without typing anything.
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/todos/);
    await expect(page.getByTestId('me')).toHaveText(username);
    await shot(page, info, 'passkey-autofill-signed-in');
  });

  test('GitHub OAuth: starts the flow and redirects to github.com', async ({ page }, info) => {
    await page.goto('/login');
    await page.getByTestId('tab-github').click();
    await shot(page, info, 'github-tab');
    await page.getByTestId('gh-signin').click();
    await page.waitForURL(/github\.com\/login/);
    const url = new URL(page.url());
    const authorize = new URL(url.searchParams.get('return_to') ?? url.toString(), 'https://github.com');
    expect(authorize.pathname).toBe('/login/oauth/authorize');
    expect(authorize.searchParams.get('redirect_uri')).toMatch(/\/oauth\/github\/callback$/);
    await shot(page, info, 'github-login');
  });

  test('GitHub OAuth: an error returned by the callback is shown', async ({ page }, info) => {
    await page.goto('/login?convexAuthError=access_denied');
    await page.getByTestId('tab-github').click();
    await expect(page.getByTestId('oauth-error')).toContainText('access denied');
    await shot(page, info, 'oauth-error');
  });
});
