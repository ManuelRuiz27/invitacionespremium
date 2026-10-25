import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'managed-m01.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['./e2e/private-reporter.mjs']],
  outputDir: 'test-results/managed-m01',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.MANAGED_E2E_CLIENT_URL ?? 'http://localhost:5173',
    screenshot: 'off',
    trace: 'off',
    video: 'off'
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }]
});
