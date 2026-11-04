import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'guests-wizard.spec.ts',
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: 'test-results/guests-wizard',
  use: { baseURL: 'http://127.0.0.1:5190', browserName: 'chromium', screenshot: 'only-on-failure' },
  webServer: {
    command: 'pnpm --filter @invitaciones/client exec vite --host 127.0.0.1 --port 5190 --strictPort',
    url: 'http://127.0.0.1:5190',
    reuseExistingServer: !process.env.CI
  }
});
