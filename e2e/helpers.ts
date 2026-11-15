import { expect, type Page, type TestInfo } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SHOTS = join(__dirname, 'screenshots', process.env['E2E_CONFIG'] === 'cloud' ? 'cloud' : '');
mkdirSync(SHOTS, { recursive: true });

/** A run-unique suffix, so tests never collide with data from earlier runs. */
export const unique = (prefix: string): string => `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

/**
 * Full-page screenshot named after the spec file and step:
 * `e2e/screenshots/<spec>-<NN>-<step>.png`. Also attached to the HTML report.
 */
export async function shot(page: Page, info: TestInfo, step: string): Promise<void> {
  const counter = ((info as unknown as { __shots?: number }).__shots ?? 0) + 1;
  (info as unknown as { __shots?: number }).__shots = counter;
  const spec = info.titlePath[0].replace(/\.spec\.ts$/, '').replace(/[\\/]/g, '-');
  const test = info.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const file = join(SHOTS, `${spec}-${test}-${String(counter).padStart(2, '0')}-${step}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await info.attach(step, { path: file, contentType: 'image/png' });
}

/** Creates a username + password account and lands on the todos page. */
export async function signUpWithPassword(page: Page, username = unique('user'), password = 'correct-horse-42'): Promise<string> {
  await page.goto('/login');
  await page.getByTestId('up-username').fill(username);
  await page.getByTestId('up-password').fill(password);
  await page.getByTestId('up-signup').click();
  await expect(page).toHaveURL(/\/todos/);
  await expect(page.getByTestId('me')).toBeVisible();
  return username;
}

/** Opens the newest fake email whose subject matches and returns the first link to the app. */
export async function linkFromInbox(page: Page, to: string): Promise<string> {
  await page.goto('/mail');
  const item = page.getByTestId('mail-item').filter({ hasText: to }).first();
  await expect(item).toBeVisible();
  await item.click();
  const html = await page.getByTestId('mail-body').first().innerHTML();
  const match = html.match(/https?:\/\/[^"'<\s]+\/auth\/[a-z-]+\?code=[^"'<\s]+/);
  expect(match, 'auth link in the email').not.toBeNull();
  return match![0].replaceAll('&amp;', '&');
}

/** RFC 6238 one-time code (SHA-1, 6 digits, 30 s) from a base32 secret. */
export function totp(base32Secret: string, now = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of base32Secret.replace(/[\s=]/g, '').toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error('TOTP secret is not base32');
    bits += value.toString(2).padStart(5, '0');
  }
  const key = Buffer.from(bits.match(/.{8}/g)!.map((byte) => parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
