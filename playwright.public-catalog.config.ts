import { defineConfig } from '@playwright/test';
import accessControl from './playwright.access-control.config';

export default defineConfig({
  ...accessControl,
  testMatch: 'public-catalog.spec.ts',
  timeout: 150_000,
  outputDir: 'test-results/public-catalog'
});
