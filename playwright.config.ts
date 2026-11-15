import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the convex-agl demo against a real Convex deployment.
 * Start the backend first: `CONVEX_AGENT_MODE=anonymous npx convex dev`.
 * Screenshots of every step land in `e2e/screenshots/`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/report' }]],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  // Uses the installed Google Chrome (no browser download); set PW_CHANNEL=chromium for Playwright's own build.
  projects: [{ name: 'chrome', use: { ...devices['Desktop Chrome'], channel: process.env['PW_CHANNEL'] ?? 'chrome' } }],
  webServer: {
    command: 'npx ng serve convex-agl --port 4200',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
