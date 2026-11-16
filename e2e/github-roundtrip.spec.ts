import { expect, test } from '@playwright/test';
import { shot } from './helpers';

// Full round trip with a dedicated GitHub test account, signed in with a
// passkey kept for CI (E2E_GITHUB_PASSKEY_ID / _KEY / _USER, see the README).
// A passkey satisfies both the password and 2FA, and spares the emailed
// device check. The backend must run a real GitHub OAuth app whose callback is
// this backend's /oauth/github/callback. Without the secrets the test is skipped.
//
// The private key must never reach a trace or a report: this file records no
// trace, failure screenshot or video, and CI runs it apart (tag @secrets) with
// the list reporter only, so nothing it produces is uploaded.
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

test('GitHub OAuth: full round trip with the test account @secrets', async ({ page }, info) => {
  const passkey = {
    id: process.env['E2E_GITHUB_PASSKEY_ID'],
    key: process.env['E2E_GITHUB_PASSKEY_KEY'],
    user: process.env['E2E_GITHUB_PASSKEY_USER'],
  };
  test.skip(!(passkey.id && passkey.key && passkey.user), 'E2E_GITHUB_PASSKEY_ID / _KEY / _USER are not set');
  test.setTimeout(90_000);
  // CI artifacts of a public repository are public: no screenshot of the
  // test account's pages there.
  const proof = process.env['CI'] ? async (_step: string) => undefined : (step: string) => shot(page, info, step);

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

  await page.goto('/login');
  await page.getByTestId('tab-oauth').click();
  await page.getByTestId('gh-signin').click();
  await page.waitForURL(/github\.com\/login/);
  await page.getByRole('button', { name: /sign in with a passkey/i }).click();

  // A refused sign-in stays on /login or /session: report GitHub's own message
  // (or its CAPTCHA) instead of a bare timeout.
  const app = /localhost:4200\/todos/;
  await page.waitForURL((url) => app.test(url.href) || url.pathname !== '/login', { timeout: 30_000 }).catch(() => undefined);
  if (['/login', '/session'].includes(new URL(page.url()).pathname)) {
    const flash = (await page.locator('.flash-error, .js-flash-alert').allInnerTexts()).join(' ').trim();
    const captcha = await page.locator('iframe[src*="captcha"], #octocaptcha-token, [data-octocaptcha]').count();
    throw new Error(`GitHub refused the passkey sign-in: flash="${flash}" captcha=${captcha > 0}`);
  }

  // GitHub may show the authorization screen (first sign-in to the app), or
  // go straight back to the app.
  for (let step = 0; step < 3 && !app.test(page.url()); step++) {
    await page.waitForURL((url) => app.test(url.href) || /two-factor|oauth\/authorize|verified-device/.test(url.pathname), { timeout: 30_000 });
    const path = new URL(page.url()).pathname;
    if (/two-factor|verified-device/.test(path)) {
      throw new Error(`GitHub asks for a second factor after the passkey (${path}): the passkey was not accepted as one`);
    }
    if (path.includes('oauth/authorize')) {
      // Once the app is authorized, GitHub only passes through this URL on its
      // way back to the app: click Authorize only if the screen really shows.
      const authorize = page.locator('button[name="authorize"][value="1"]');
      const next = await Promise.race([
        page.waitForURL(app, { timeout: 30_000 }).then(() => 'app' as const, () => undefined),
        authorize.waitFor({ timeout: 30_000 }).then(() => 'authorize' as const, () => undefined),
      ]);
      if (next === 'authorize') {
        await proof('github-authorize');
        await authorize.click();
        await page.waitForURL((url) => !url.pathname.includes('oauth/authorize'), { timeout: 30_000 });
      }
    }
  }
  await expect(page).toHaveURL(app);
  await page.goto('/account');
  await expect(page.getByTestId('account-method')).toHaveText('github');
  await proof('github-signed-in');
});
