import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'event-data.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/event-data/runs',
  use: { baseURL: 'http://127.0.0.1:5189', browserName: 'chromium', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm --filter @invitaciones/client exec vite --host 127.0.0.1 --port 5189 --strictPort',
    url: 'http://127.0.0.1:5189',
    reuseExistingServer: !process.env.CI
  }
});
