// Registers a passkey for the GitHub e2e test account inside a virtual
// authenticator, then stores it as three repository secrets for CI. A password
// manager refuses a second passkey for an account it already holds one for
// (WebAuthn excludeCredentials), and its key could not reach CI anyway.
//
//   node scripts/register-github-passkey.mjs
//
// A visible Chrome opens on github.com/login. Whoever runs the script signs in,
// opens Settings → Password and authentication → Add a passkey, and names it.
// The script waits for the credential, then pipes each part to
// `gh secret set` (E2E_GITHUB_PASSKEY_ID / _KEY / _USER). Nothing is printed
// but lengths. The passkey can be revoked from the same GitHub page.
import { execFileSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const repo = process.env.GH_REPO ?? 'tibdev78/angular-convex';
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome', headless: false });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await page.goto('https://github.com/login');
  console.log('Sign in, then Settings → Password and authentication → Add a passkey (this tab only).');

  let credential;
  const deadline = Date.now() + 15 * 60_000;
  while (!credential && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
    credential = credentials.find((c) => c.rpId === 'github.com');
  }
  if (!credential) throw new Error('No github.com passkey was created within 15 minutes');

  const secrets = {
    E2E_GITHUB_PASSKEY_ID: credential.credentialId,
    E2E_GITHUB_PASSKEY_KEY: credential.privateKey,
    E2E_GITHUB_PASSKEY_USER: credential.userHandle ?? '',
  };
  for (const [name, value] of Object.entries(secrets)) {
    if (!value) throw new Error(`${name} is empty`);
    execFileSync('gh', ['secret', 'set', name, '--repo', repo], { input: value, stdio: ['pipe', 'inherit', 'inherit'] });
  }
  console.log(`Stored · id ${secrets.E2E_GITHUB_PASSKEY_ID.length} chars · key ${secrets.E2E_GITHUB_PASSKEY_KEY.length} chars`);
  // Leave a moment for GitHub's own confirmation page before closing.
  await page.waitForTimeout(3000);
} finally {
  await browser.close();
}
