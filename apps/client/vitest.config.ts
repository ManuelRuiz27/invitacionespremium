import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@gullabs/react-flipbook': fileURLToPath(new URL('./src/test/react-flipbook.mock.tsx', import.meta.url))
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Keep bounded DOM-scale tests isolated from other CPU-heavy MUI route trees.
    maxWorkers: 1,
    testTimeout: 15_000,
    restoreMocks: true
  }
});
