import { defineConfig, devices } from '@playwright/test';

/**
 * Runtime half of the compatibility matrix: serves every app built by
 * `compat/run.sh` and drives it against the convex-agl backend
 * (`npx convex dev` must be running; COMPAT_APPS must match run.sh).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'compat.spec.ts',
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: process.env['PW_CHANNEL'] ?? 'chrome' } }],
});
