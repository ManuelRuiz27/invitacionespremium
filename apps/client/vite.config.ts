import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => ({
  plugins: [react()],
  ssr: { noExternal: ['@invitaciones/api-client'] },
  build: { copyPublicDir: !isSsrBuild },
  server: {
    port: 5173
  }
}));
