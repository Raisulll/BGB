// Browser tests (specs #41, #42, #57): the web app in Chrome, Edge and Firefox, on desktop, laptop,
// tablet and phone screens, against a running BIRDS server with the demonstration data.
//
//   E2E_BASE=http://localhost:4001 npx playwright test
//
// Use a COPY of the demo database: the tests file and approve incidents. BIRDS allows one session per
// user, so the tests run one at a time. Firefox: the Playwright build (npx playwright install firefox).
import { defineConfig, devices } from '@playwright/test';

const desktop = { viewport: { width: 1440, height: 900 } };

export default defineConfig({
  testDir: './e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e-results/results.json' }]],
  outputDir: 'e2e-results/artifacts',
  use: {
    baseURL: process.env.E2E_BASE || 'http://localhost:4001',
    screenshot: 'only-on-failure',
    trace: 'off',
    locale: 'en-GB',
    timezoneId: 'Asia/Dhaka',
  },
  projects: [
    { name: 'Chrome desktop', use: { ...devices['Desktop Chrome'], channel: 'chrome', ...desktop } },
    { name: 'Edge desktop', use: { ...devices['Desktop Edge'], channel: 'msedge', ...desktop } },
    { name: 'Firefox desktop', use: { ...devices['Desktop Firefox'], ...desktop } },
    { name: 'Chrome laptop', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 720 } } },
    { name: 'Chrome tablet', use: { ...devices['Galaxy Tab S4'], channel: 'chrome', viewport: { width: 820, height: 1180 } } },
    { name: 'Chrome phone', use: { ...devices['Pixel 7'], channel: 'chrome' } },
  ],
});
