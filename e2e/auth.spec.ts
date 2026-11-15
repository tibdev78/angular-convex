import { expect, test } from '@playwright/test';
import { linkFromInbox, shot, signUpWithPassword, totp, unique } from './helpers';

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
    await page.getByTestId('tab-oauth').click();
    await shot(page, info, 'github-tab');
    await page.getByTestId('gh-signin').click();
    await page.waitForURL(/github\.com\/login/);
    const url = new URL(page.url());
    const authorize = new URL(url.searchParams.get('return_to') ?? url.toString(), 'https://github.com');
    expect(authorize.pathname).toBe('/login/oauth/authorize');
    expect(authorize.searchParams.get('redirect_uri')).toMatch(/\/oauth\/github\/callback$/);
    await shot(page, info, 'github-login');
  });

  // Full round trip with a dedicated GitHub test account. Its credentials come
  // from the environment (CI secrets) and are never printed. The backend must
  // run a real GitHub OAuth app whose callback is this backend's
  // /oauth/github/callback. Without them the test is skipped.
  test('GitHub OAuth: full round trip with the test account', async ({ page }, info) => {
    const login = process.env['E2E_GITHUB_LOGIN'];
    const password = process.env['E2E_GITHUB_PASSWORD'];
    const totpSecret = process.env['E2E_GITHUB_TOTP_SECRET'];
    // CI artifacts of a public repository are public: no screenshot of the
    // test account's pages there.
    const proof = process.env['CI'] ? async (_step: string) => undefined : (step: string) => shot(page, info, step);
    test.skip(!login || !password, 'E2E_GITHUB_LOGIN / E2E_GITHUB_PASSWORD are not set');
    test.setTimeout(90_000);
    await page.goto('/login');
    await page.getByTestId('tab-oauth').click();
    await page.getByTestId('gh-signin').click();
    await page.waitForURL(/github\.com\/login/);
    await page.locator('#login_field').fill(login!);
    await page.locator('#password').fill(password!);
    await page.locator('input[name="commit"]').click();

    // After the password GitHub asks for the TOTP code (2FA account), may show
    // the authorization screen (first sign-in to the app), or goes straight back.
    const app = /localhost:4200\/todos/;
    for (let step = 0; step < 4 && !app.test(page.url()); step++) {
      await page.waitForURL((url) => app.test(url.href) || /two-factor|oauth\/authorize|verified-device/.test(url.pathname), { timeout: 30_000 });
      const path = new URL(page.url()).pathname;
      if (path.includes('verified-device')) {
        throw new Error('GitHub asks for an emailed device code: enable TOTP 2FA on the test account and set E2E_GITHUB_TOTP_SECRET');
      }
      if (path.includes('two-factor')) {
        if (!totpSecret) throw new Error('GitHub asks for a 2FA code: set E2E_GITHUB_TOTP_SECRET');
        await page.locator('#app_totp').fill(totp(totpSecret));
        await page.waitForURL((url) => !url.pathname.includes('two-factor'), { timeout: 30_000 });
      } else if (path.includes('oauth/authorize')) {
        await proof('github-authorize');
        await page.locator('button[name="authorize"][value="1"]').click();
        await page.waitForURL((url) => !url.pathname.includes('oauth/authorize'), { timeout: 30_000 });
      }
    }
    await expect(page).toHaveURL(app);
    await page.goto('/account');
    await expect(page.getByTestId('account-method')).toHaveText('github');
    await proof('github-signed-in');
  });

  test('Google OAuth: OpenID Connect redirect with PKCE to accounts.google.com', async ({ page }, info) => {
    await page.goto('/login');
    await page.getByTestId('tab-oauth').click();
    // Read the authorize request itself: with a placeholder client id (CI),
    // Google answers it with an error page whose URL no longer carries it.
    const authorize = page.waitForRequest(
      (r) => r.url().startsWith('https://accounts.google.com/') && new URL(r.url()).searchParams.has('client_id'),
    );
    await page.getByTestId('google-signin').click();
    const params = new URL((await authorize).url()).searchParams;
    await page.waitForURL(/accounts\.google\.com/);
    expect(params.get('redirect_uri')).toMatch(/\/oauth\/google\/callback$/);
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('scope')).toContain('openid');
    expect(params.get('client_id')).toBeTruthy();
    await shot(page, info, 'google-account-chooser');
  });

  test('Apple OAuth: unavailable until the AUTH_APPLE_* variables are set, then redirects to Apple', async ({ page }, info) => {
    await page.goto('/login');
    await page.getByTestId('tab-oauth').click();
    const apple = page.getByTestId('apple-signin');
    // Wait for the oauthProviders query to answer before reading the state.
    await expect(page.getByTestId('google-signin')).toBeEnabled();
    if (await apple.isDisabled()) {
      await expect(page.getByTestId('apple-unconfigured')).toContainText('AUTH_APPLE_');
      await shot(page, info, 'apple-not-configured');
      return;
    }
    await apple.click();
    await page.waitForURL(/appleid\.apple\.com/);
    expect(new URL(page.url()).searchParams.get('redirect_uri')).toMatch(/\/oauth\/apple\/callback$/);
    await shot(page, info, 'apple-authorize');
  });

  test('GitHub OAuth: an error returned by the callback is shown', async ({ page }, info) => {
    await page.goto('/login?convexAuthError=access_denied');
    await page.getByTestId('tab-oauth').click();
    await expect(page.getByTestId('oauth-error')).toContainText('access denied');
    await shot(page, info, 'oauth-error');
  });

  test('demo OIDC provider: consent, code exchange, signed id_token, same account on return', async ({ page }, info) => {
    const email = `${unique('ada')}@example.test`.toLowerCase();
    await page.goto('/login?next=%2Faccount');
    await page.getByTestId('tab-oauth').click();
    await page.getByTestId('idp-signin').click();
    // The provider's consent page, served by the backend's /idp/authorize.
    await page.waitForURL(/\/idp\/authorize\?/);
    const authorize = new URL(page.url());
    expect(authorize.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorize.searchParams.get('redirect_uri')).toMatch(/\/oauth\/demo\/callback$/);
    await page.getByTestId('idp-name').fill('Ada Lovelace');
    await page.getByTestId('idp-email').fill(email);
    await shot(page, info, 'idp-consent');
    await page.getByTestId('idp-allow').click();

    // Callback → /login?convexAuthCode=… → redeemed → `next`.
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('account-method')).toHaveText('demoIdp');
    await expect(page.getByTestId('account-name')).toHaveText('Ada Lovelace');
    await expect(page.getByTestId('account-email')).toHaveText(email);
    const userId = await page.getByTestId('account-id').textContent();
    await shot(page, info, 'idp-signed-in');

    // Signing in again with the same email finds the same account (renamed by onSignIn).
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/login?next=%2Faccount');
    await page.getByTestId('tab-oauth').click();
    await page.getByTestId('idp-signin').click();
    await page.waitForURL(/\/idp\/authorize\?/);
    await page.getByTestId('idp-name').fill('Ada King');
    await page.getByTestId('idp-email').fill(email);
    await page.getByTestId('idp-allow').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('account-name')).toHaveText('Ada King');
    await expect(page.getByTestId('account-id')).toHaveText(userId!);
    await expect(page.getByTestId('account-email')).toHaveText(email);
    await shot(page, info, 'idp-signed-in-again');
  });

  test('demo OIDC provider: denying consent comes back as access denied', async ({ page }, info) => {
    await page.goto('/login');
    await page.getByTestId('tab-oauth').click();
    await page.getByTestId('idp-signin').click();
    await page.waitForURL(/\/idp\/authorize\?/);
    await page.getByTestId('idp-deny').click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByTestId('tab-oauth').click();
    await expect(page.getByTestId('oauth-error')).toContainText('access denied');
    await expect(page.getByTestId('login-link')).toBeVisible();
    await shot(page, info, 'idp-denied');
  });

  test('anonymous: a new account per sign-in', async ({ page }, info) => {
    await page.goto('/login?next=%2Faccount');
    await page.getByTestId('tab-anonymous').click();
    await shot(page, info, 'anonymous-tab');
    await page.getByTestId('anon-signin').click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByTestId('account-method')).toHaveText('anonymous');
    await shot(page, info, 'anonymous-account');
  });
});
