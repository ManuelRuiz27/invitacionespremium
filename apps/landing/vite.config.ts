import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';
import { escapeAttribute, renderLandingUrlMetadata } from './src/app-metadata';
import { createLandingConfig } from './src/config/landing-config';

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), 'VITE_');
  const config = createLandingConfig(environment, { development: mode === 'development' });

  return {
    plugins: [
      react(),
      {
        name: 'landing-metadata',
        transformIndexHtml(html) {
          return html
            .replaceAll('__LANDING_TITLE__', escapeAttribute(config.seo.title))
            .replaceAll('__LANDING_DESCRIPTION__', escapeAttribute(config.seo.description))
            .replaceAll('__LANDING_ROBOTS__', escapeAttribute(config.seo.robots))
            .replace('<!-- __LANDING_URL_METADATA__ -->', renderLandingUrlMetadata(config));
        }
      }
    ],
    server: {
      port: 5176
    }
  };
});
