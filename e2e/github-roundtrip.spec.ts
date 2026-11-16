import { expect, test } from '@playwright/test';
import { shot, totp } from './helpers';

// Full round trip with a dedicated GitHub test account. Its credentials come
// from the environment (CI secrets). The backend must run a real GitHub OAuth
// app whose callback is this backend's /oauth/github/callback. Without them
// the test is skipped.
//
// Playwright writes every `fill` value into the trace and the HTML report
// (step title `Fill "<value>"`). So this file never records a trace, a failure
// screenshot or a video, and CI runs it apart (tag @secrets) with the list
// reporter only: nothing it produces is uploaded.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('GitHub OAuth: full round trip with the test account @secrets', async ({ page }, info) => {
  const login = process.env['E2E_GITHUB_LOGIN'];
  const password = process.env['E2E_GITHUB_PASSWORD'];
  const totpSecret = process.env['E2E_GITHUB_TOTP_SECRET'];
  // A passkey registered for the test account (scripts/register-github-passkey.mjs
  // or the DevTools WebAuthn panel): it replaces both the password and 2FA.
  const passkey = {
    id: process.env['E2E_GITHUB_PASSKEY_ID'],
    key: process.env['E2E_GITHUB_PASSKEY_KEY'],
    user: process.env['E2E_GITHUB_PASSKEY_USER'],
  };
  const usePasskey = !!(passkey.id && passkey.key && passkey.user);
  // CI artifacts of a public repository are public: no screenshot of the
  // test account's pages there.
  const proof = process.env['CI'] ? async (_step: string) => undefined : (step: string) => shot(page, info, step);
  test.skip(!usePasskey && (!login || !password), 'Neither E2E_GITHUB_PASSKEY_* nor E2E_GITHUB_LOGIN / E2E_GITHUB_PASSWORD are set');
  test.setTimeout(usePasskey || totpSecret ? 90_000 : 180_000);
  if (usePasskey) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('WebAuthn.enable');
    const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
      options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
    });
    await cdp.send('WebAuthn.addCredential', {
      authenticatorId,
      credential: {
        credentialId: passkey.id!,
        isResidentCredential: true,
        rpId: 'github.com',
        privateKey: passkey.key!,
        userHandle: passkey.user!,
        // GitHub may refuse a counter that does not grow: seconds since the
        // epoch always exceed the previous run's.
        signCount: Math.floor(Date.now() / 1000),
      },
    });
  }
  await page.goto('/login');
  await page.getByTestId('tab-oauth').click();
  await page.getByTestId('gh-signin').click();
  await page.waitForURL(/github\.com\/login/);
  if (usePasskey) {
    await page.getByRole('button', { name: /sign in with a passkey/i }).click();
  } else {
    await page.locator('#login_field').fill(login!);
    await page.locator('#password').fill(password!);
    await page.locator('input[name="commit"]').click();
  }
  // A refused sign-in stays on /session: report GitHub's own message (or its
  // CAPTCHA) instead of a bare timeout. Nothing here echoes the credentials.
  await page.waitForLoadState('load');
  if (new URL(page.url()).pathname === '/session') {
    const flash = (await page.locator('.flash-error, .js-flash-alert').allInnerTexts()).join(' ').trim();
    const captcha = await page.locator('iframe[src*="captcha"], #octocaptcha-token, [data-octocaptcha]').count();
    const heading = (await page.locator('h1').allInnerTexts()).join(' | ').trim();
    // Shapes only (lengths, stray whitespace), never the values themselves.
    const shape = (v: string) => `len=${v.length} trimmed=${v.trim().length}`;
    throw new Error(
      `GitHub refused the sign-in: flash="${flash}" captcha=${captcha > 0} h1="${heading}" ` +
        (usePasskey ? 'passkey' : `login(${shape(login!)} isTestAccount=${login!.trim() === 'ttbdsv'}) password(${shape(password!)} equalsTotpSecret=${password === totpSecret})`),
    );
  }

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
      if (totpSecret) {
        // The account may prefer passkeys (/sessions/two-factor/webauthn):
        // switch to the authenticator-app form, which is always offered.
        if (!path.endsWith('/two-factor/app')) await page.goto('https://github.com/sessions/two-factor/app');
        await page.locator('#app_totp').fill(totp(totpSecret));
      } else if (process.env['CI']) {
        throw new Error('GitHub asks for a 2FA code: set E2E_GITHUB_TOTP_SECRET');
      }
      // Locally (headed) without the key, whoever runs the test types the code.
      await page.waitForURL((url) => !url.pathname.includes('two-factor'), { timeout: totpSecret ? 30_000 : 120_000 });
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
