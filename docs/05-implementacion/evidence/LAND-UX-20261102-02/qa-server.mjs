// Local QA harness only. Reuses the running local API without changing its CORS
// configuration and never creates data or deploys services.
import { createServer } from '../../../../apps/landing/node_modules/vite/dist/node/index.js';
import { fileURLToPath } from 'node:url';

process.env.VITE_API_BASE_URL = 'http://127.0.0.1:6176/api/v1';
const server = await createServer({
  root: fileURLToPath(new URL('../../../../apps/landing', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 6176,
    strictPort: true,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } }
  }
});
await server.listen();
server.printUrls();
