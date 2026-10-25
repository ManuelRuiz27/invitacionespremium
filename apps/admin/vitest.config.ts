import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Full MUI route trees in jsdom are CPU-heavy; avoid competing UI renderers.
    maxWorkers: 1,
    testTimeout: 15_000
  }
});
