import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'access-control.spec.ts',
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: [['./e2e/private-reporter.mjs']],
  outputDir: 'test-results/access-control',
  use: { ...devices['Desktop Chrome'], actionTimeout: 25_000, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
