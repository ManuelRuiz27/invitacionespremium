/**
 * QA Visual — InvitacionesPremium Layout Normalization
 * Commits: 4cce2fc + 7cd9e76
 *
 * Captures screenshots across all surfaces and viewports.
 * Requires apps running at ports 5173 (client), 5174 (admin), 5175 (scanner), 5176 (landing).
 *
 * Usage: node scripts/qa-visual-layout.mjs
 */
import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const OUT_DIR = 'C:/Users/ruiz_/.gemini/antigravity/brain/06e41cd8-a262-4c13-af32-34f4ab059c18/screenshots';

const VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 720 },
  { name: 'mobile-360', width: 360, height: 800 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'tablet-1024', width: 1024, height: 768 },
  { name: 'desktop-1280', width: 1280, height: 800 },
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'desktop-1920', width: 1920, height: 1080 }
];

// Surfaces: id, url, vpFilter (null = all), desc
const SURFACES = [
  // LANDING (5176)
  {
    id: 'landing-home',
    url: 'http://localhost:5176/',
    vpFilter: ['mobile-390', 'tablet-768', 'desktop-1280', 'desktop-1440'],
    desc: 'Landing Home'
  },

  // CLIENT - public routes (no auth)
  {
    id: 'public-flyer',
    url: 'http://localhost:5173/e/demo',
    vpFilter: ['mobile-360', 'mobile-390', 'tablet-768'],
    desc: 'Flyer público'
  },
  {
    id: 'public-rsvp',
    url: 'http://localhost:5173/rsvp/demo',
    vpFilter: ['mobile-360', 'mobile-390'],
    desc: 'RSVP / Confirmación'
  },

  // CLIENT - auth routes (captures redirect/login state)
  {
    id: 'client-login',
    url: 'http://localhost:5173/login',
    vpFilter: ['mobile-390', 'desktop-1280'],
    desc: 'Client Login'
  },
  {
    id: 'client-dashboard',
    url: 'http://localhost:5173/',
    vpFilter: ['mobile-390', 'tablet-768', 'desktop-1280', 'desktop-1440'],
    desc: 'Client Dashboard'
  },
  {
    id: 'client-wizard',
    url: 'http://localhost:5173/eventos/new',
    vpFilter: ['mobile-390', 'tablet-768', 'desktop-1280'],
    desc: 'Wizard nuevo evento'
  },
  {
    id: 'client-guests',
    url: 'http://localhost:5173/invitados',
    vpFilter: ['mobile-390', 'desktop-1280'],
    desc: 'Client Invitados'
  },

  // ADMIN - auth routes
  {
    id: 'admin-login',
    url: 'http://localhost:5174/login',
    vpFilter: ['mobile-390', 'desktop-1280'],
    desc: 'Admin Login'
  },
  {
    id: 'admin-dashboard',
    url: 'http://localhost:5174/',
    vpFilter: ['mobile-390', 'tablet-768', 'desktop-1280', 'desktop-1440', 'desktop-1920'],
    desc: 'Admin Dashboard'
  },
  {
    id: 'admin-events',
    url: 'http://localhost:5174/eventos',
    vpFilter: ['tablet-1024', 'desktop-1280', 'desktop-1440'],
    desc: 'Admin Eventos'
  },
  {
    id: 'admin-clients',
    url: 'http://localhost:5174/clientes',
    vpFilter: ['desktop-1280', 'desktop-1440'],
    desc: 'Admin Clientes'
  },
  {
    id: 'admin-leads',
    url: 'http://localhost:5174/commercial-leads',
    vpFilter: ['desktop-1280'],
    desc: 'Admin Commercial Leads'
  },

  // SCANNER (5175)
  {
    id: 'scanner-home',
    url: 'http://localhost:5175/',
    vpFilter: ['mobile-320', 'mobile-360', 'mobile-390', 'tablet-768'],
    desc: 'Scanner Home'
  },
  {
    id: 'scanner-login',
    url: 'http://localhost:5175/login',
    vpFilter: ['mobile-360', 'mobile-390'],
    desc: 'Scanner Login'
  }
];

async function captureAll() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const vp of VIEWPORTS) {
    for (const surface of SURFACES) {
      if (surface.vpFilter && !surface.vpFilter.includes(vp.name)) continue;

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      const filename = `${surface.id}__${vp.name}.png`;
      const filepath = path.join(OUT_DIR, filename);

      try {
        await page.goto(surface.url, { waitUntil: 'networkidle', timeout: 18000 });
        await page.waitForTimeout(600);

        // Measure horizontal overflow
        const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
        const innerW = await page.evaluate(() => window.innerWidth);
        const hasHorizOverflow = scrollW > innerW + 2;

        // Detect error pages
        const pageTitle = await page.title();
        const hasError =
          pageTitle.toLowerCase().includes('error') ||
          (await page.evaluate(
            () =>
              document.body?.innerText?.includes('Cannot GET') || document.body?.innerText?.includes('ERR_') || false
          ));

        // Detect current URL (after redirects)
        const finalUrl = page.url();

        await page.screenshot({ path: filepath, fullPage: false });

        results.push({
          surface: surface.id,
          desc: surface.desc,
          viewport: vp.name,
          width: vp.width,
          file: filename,
          finalUrl,
          hasHorizOverflow,
          scrollWidth: scrollW,
          innerWidth: innerW,
          hasError,
          status: 'OK'
        });
        process.stdout.write(
          `✓ ${filename}${hasHorizOverflow ? ' [OVERFLOW!]' : ''}${hasError ? ' [ERROR PAGE]' : ''}\n`
        );
      } catch (err) {
        results.push({
          surface: surface.id,
          desc: surface.desc,
          viewport: vp.name,
          width: vp.width,
          file: filename,
          hasHorizOverflow: null,
          hasError: null,
          status: `ERROR: ${err.message.slice(0, 120)}`
        });
        process.stdout.write(`✗ ${filename}: ${err.message.slice(0, 80)}\n`);
      }

      await context.close();
    }
  }

  await browser.close();

  // Write results JSON
  const resultsPath = path.join(OUT_DIR, 'qa-results.json');
  fs.writeFileSync(resultsPath, JSON.stringify(results, null, 2));

  console.log(`\n${'='.repeat(60)}`);
  console.log(`QA Visual Results`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total captures: ${results.length}`);
  const errors = results.filter((r) => r.status !== 'OK');
  const overflows = results.filter((r) => r.hasHorizOverflow === true);
  console.log(`Capture errors: ${errors.length}`);
  console.log(`Horizontal overflows: ${overflows.length}`);
  if (errors.length) {
    console.log('\nFailed captures:');
    errors.forEach((e) => console.log(`  ✗ ${e.surface} @ ${e.viewport}: ${e.status}`));
  }
  if (overflows.length) {
    console.log('\nOverflow detected:');
    overflows.forEach((o) =>
      console.log(`  ⚠ ${o.surface} @ ${o.viewport} (scrollW=${o.scrollWidth}, innerW=${o.innerWidth})`)
    );
  }
  console.log(`\nResults: ${resultsPath}`);
}

captureAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
