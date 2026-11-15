// Checks a GitHub test account's password on the real login page, without the
// app or Convex. The password is read from E2E_GITHUB_PASSWORD and never printed.
// GitHub refuses passwords over git and the API, so the web form is the only check.
//
//   E2E_GITHUB_LOGIN=<login> E2E_GITHUB_PASSWORD="$(wl-paste -n)" node scripts/check-github-password.mjs
import { chromium } from '@playwright/test';

const login = process.env.E2E_GITHUB_LOGIN;
const password = process.env.E2E_GITHUB_PASSWORD;
if (!login || !password) {
  console.error('Set E2E_GITHUB_LOGIN and E2E_GITHUB_PASSWORD');
  process.exit(2);
}
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? 'chrome' });
try {
  const page = await browser.newPage();
  await page.goto('https://github.com/login');
  await page.locator('#login_field').fill(login);
  await page.locator('#password').fill(password);
  await page.locator('input[name="commit"]').click();
  await page.waitForLoadState('load');
  const path = new URL(page.url()).pathname;
  if (path === '/session') {
    const flash = (await page.locator('.flash-error, .js-flash-alert').allInnerTexts()).join(' ').trim();
    console.log(`REFUSED (${flash}) · password length ${password.length}`);
    process.exitCode = 1;
  } else {
    // A 2FA or device-verification page means the password was accepted.
    console.log(`ACCEPTED · next page ${path}`);
  }
} finally {
  await browser.close();
}
