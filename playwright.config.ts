import { defineConfig, devices } from '@playwright/test';

// The bench drives itself in the browser: the spec just opens the page with
// ?samples=…&autorun=1 and waits for window.__benchEncodeResult.
// No local dataset needed — samples come from cdn.pixkeep.app (R2).
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 60 * 1000, // a full 4-image sweep can take ~40 min on WebKit
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'off', screenshot: 'off', video: 'off' },
  webServer: process.env.BENCH_LIVE
    ? undefined // run against the deployed lab.pixkeep.app
    : {
        command: 'npm run build && npm run preview',
        url: 'http://localhost:4322',
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
      },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
