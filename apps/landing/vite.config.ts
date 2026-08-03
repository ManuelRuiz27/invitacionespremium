import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  process.env.VITE_APP_URL = env.VITE_APP_URL || process.env.VITE_APP_URL || 'http://localhost:5176';
  process.env.VITE_CLIENT_APP_URL = env.VITE_CLIENT_APP_URL || process.env.VITE_CLIENT_APP_URL || 'http://localhost:5173';

  return {
    plugins: [react()],
    server: {
      port: 5176
    }
  };
});
