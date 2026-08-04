import { createLandingConfig, type LandingConfig } from './config/landing-config';

const baseConfig = createLandingConfig({}, { development: false });

export const appMetadata = {
  appName: 'Landing',
  title: baseConfig.seo.title,
  description: baseConfig.seo.description,
  robots: baseConfig.seo.robots
} as const;

export function renderLandingUrlMetadata(config: LandingConfig): string {
  const tags: string[] = [];
  if (config.urls.canonical) {
    tags.push(`<link rel="canonical" href="${escapeAttribute(config.urls.canonical)}" />`);
    tags.push(`<meta property="og:url" content="${escapeAttribute(config.urls.canonical)}" />`);
  }
  if (config.urls.ogImage) {
    tags.push(`<meta property="og:image" content="${escapeAttribute(config.urls.ogImage)}" />`);
    tags.push('<meta property="og:image:width" content="1734" />');
    tags.push('<meta property="og:image:height" content="907" />');
  }
  return tags.join('\n    ');
}

export function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}
