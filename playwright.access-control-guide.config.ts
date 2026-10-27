import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'access-control-guide.spec.mts',
  workers: 1,
  retries: 0,
  timeout: 600_000,
  expect: { timeout: 15_000 },
  reporter: [['./e2e/private-reporter.mjs']],
  outputDir: 'test-results/access-control-guide',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    actionTimeout: 25_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
