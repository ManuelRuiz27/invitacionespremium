import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist-floorplan-profile',
    emptyOutDir: true,
    rollupOptions: { input: resolve(import.meta.dirname, 'floorplan-profile.html') }
  }
});
