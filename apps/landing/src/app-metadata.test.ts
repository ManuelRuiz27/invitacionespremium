import { createLandingConfig } from './config/landing-config';
import { appMetadata, renderLandingUrlMetadata } from './app-metadata';
import { describe, expect, it } from 'vitest';

describe('landing metadata and URL policy', () => {
  it('declares the exact product identity, title and description', () => {
    const legacyBrand = ['Soft', 'Monky'].join('-');
    expect(appMetadata.appName).toBe('Landing');
    expect(appMetadata.title).toContain('InvitacionesPremium');
    expect(appMetadata.title).toContain('Gestión digital de invitados');
    expect(appMetadata.title).not.toContain(legacyBrand);
    expect(appMetadata.description).toContain('invitaciones');
    expect(appMetadata.description).toContain('confirmaciones');
    expect(appMetadata.description).not.toContain('Plataforma SaaS');
    expect(appMetadata.description.length).toBeGreaterThan(50);
  });

  it('renders a canonical URL and Open Graph image for an explicit HTTPS site', () => {
    const config = createLandingConfig(
      {
        VITE_APP_URL: 'https://invitaciones.example',
        VITE_CLIENT_APP_URL: 'https://app.example',
        VITE_API_BASE_URL: 'https://api.example/api/v1'
      },
      { development: false }
    );
    expect(renderLandingUrlMetadata(config)).toContain('rel="canonical" href="https://invitaciones.example/"');
    expect(renderLandingUrlMetadata(config)).toContain(
      'property="og:image" content="https://invitaciones.example/og-preview.png"'
    );
    expect(config.urls.login).toBe('https://app.example/login');
  });

  it('omits canonical and og:url in production when the public URL is absent', () => {
    const metadata = renderLandingUrlMetadata(createLandingConfig({}, { development: false }));
    expect(metadata).not.toContain('canonical');
    expect(metadata).not.toContain('og:url');
    expect(metadata).not.toContain('localhost');
  });

  it.each(['javascript:alert(1)', 'https://user:secret@app.example', 'https://app.example?redirect=bad'])(
    'rejects unsafe login base URL %s',
    (clientUrl) => {
      const config = createLandingConfig({ VITE_CLIENT_APP_URL: clientUrl }, { development: false });
      expect(config.urls.login).toBeUndefined();
    }
  );

  it('rejects localhost from production public and login metadata', () => {
    const config = createLandingConfig(
      { VITE_APP_URL: 'http://localhost:5176', VITE_CLIENT_APP_URL: 'http://127.0.0.1:5173' },
      { development: false }
    );
    expect(config.urls.canonical).toBeUndefined();
    expect(config.urls.login).toBeUndefined();
  });

  it('allows documented localhost fallbacks only in development', () => {
    const config = createLandingConfig({}, { development: true });
    expect(config.urls.canonical).toBe('http://localhost:5176/');
    expect(config.urls.login).toBe('http://localhost:5173/login');
    expect(config.urls.apiBaseUrl).toBe('http://localhost:3000/api/v1');
  });
});
