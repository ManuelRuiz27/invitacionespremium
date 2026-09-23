/**
 * Captura screenshots en vivo del Croquis de Mesas e Invitación real.
 * Ejecutar con: pnpm exec node scripts/capture-live-product-proof.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'var', 'landing-product-proof', 'raw');
const assetDir = join(root, 'apps', 'landing', 'src', 'assets', 'product-proof');

await mkdir(rawDir, { recursive: true });
await mkdir(assetDir, { recursive: true });

const FLOORPLAN_URL = 'http://localhost:5173/eventos/70496d81-3296-4fa7-8eb8-fd6aa4b52f5d?seccion=mesas';
const INVITATION_URL =
  'http://localhost:5173/invitacion/ip1.35fc7108-f724-46cf-90fd-fbd5f47f8a5f.deb5a0e4a320340466559163650a21c2b791e1ed8a5adcbb07f64c2ad3c5f772.lGZhUWHGh7ifz2_75lHz3sufG1iMJNEY6wvirhVw6ZU';

const browser = await chromium.launch({ headless: true });

try {
  // --- 1) Croquis de Mesas (desktop 1440×900) ---
  console.log('Capturing floorplan…');
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1.5
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(FLOORPLAN_URL, { waitUntil: 'networkidle' });
    // Esperar el resumen de distribución o fallback 4s
    try {
      await page.getByLabel('Resumen de la distribución').waitFor({ timeout: 15_000 });
    } catch {
      await page.waitForTimeout(4000);
    }
    await page.waitForTimeout(1800); // canvas Konva termina de renderizar
    await shot(page, 'floorplan-live-desktop', rawDir, assetDir);
    console.log('  ✓ floorplan-live-desktop.avif/.webp');
    await ctx.close();
  }

  // --- 2) Invitación Flipbook (mobile 390×844) ---
  console.log('Capturing invitation flipbook…');
  {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2
    });
    const page = await ctx.newPage();
    page.setDefaultTimeout(30_000);
    await page.goto(INVITATION_URL, { waitUntil: 'networkidle' });
    try {
      await page.locator('main').first().waitFor({ timeout: 15_000 });
    } catch {
      // OK si no hay main, igual tomamos la foto
    }
    await page.waitForTimeout(2500);
    await shot(page, 'invitation-live-mobile', rawDir, assetDir);
    console.log('  ✓ invitation-live-mobile.avif/.webp');
    await ctx.close();
  }

  console.log('\n✅ Capturas completadas.');
} finally {
  await browser.close();
}

async function shot(page, name, rawDir, assetDir) {
  const raw = join(rawDir, `${name}.png`);
  await page.screenshot({ path: raw, fullPage: false, animations: 'disabled' });
  const image = sharp(raw).rotate();
  await Promise.all([
    image
      .clone()
      .webp({ quality: 82, smartSubsample: true })
      .toFile(join(assetDir, `${name}.webp`)),
    image
      .clone()
      .avif({ quality: 58, effort: 5 })
      .toFile(join(assetDir, `${name}.avif`))
  ]);
}
