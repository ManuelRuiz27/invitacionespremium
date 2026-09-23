/**
 * Captura el Croquis de Mesas real autenticándose con credenciales de desarrollo.
 * Ejecutar con: pnpm exec node scripts/capture-floorplan-authenticated.mjs
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

// Credenciales de seed local (no son PII, son fixture de desarrollo)
const EMAIL = 'planner@example.com';
const PASS = 'change-me-at-least-12-chars';
const EVENT_ID = '70496d81-3296-4fa7-8eb8-fd6aa4b52f5d';
const CLIENT_BASE = 'http://localhost:5173';

const browser = await chromium.launch({ headless: true });

try {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1.5,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30_000);

  // 1) Autenticarse en la app
  console.log('Authenticating…');
  await page.goto(`${CLIENT_BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/correo electr[oó]nico/i).fill(EMAIL);
  await page.getByLabel(/contrase[ñn]a/i).fill(PASS);
  await page.getByRole('button', { name: /iniciar sesi[oó]n/i }).click();
  // Esperar redirección al dashboard
  await page.waitForURL(/\/eventos|\/dashboard/, { timeout: 15_000 });
  console.log('  ✓ Authenticated. Current URL:', page.url());

  // 2) Navegar al croquis de mesas del evento de referencia
  console.log('Navigating to floorplan…');
  await page.goto(`${CLIENT_BASE}/eventos/${EVENT_ID}?seccion=mesas`, { waitUntil: 'networkidle' });
  
  // Esperar que cargue el Konva canvas
  try {
    await page.getByLabel('Resumen de la distribución').waitFor({ timeout: 20_000 });
    console.log('  ✓ Found distribution summary');
  } catch {
    console.log('  ⚠ Distribution summary not found, waiting 5s…');
    await page.waitForTimeout(5000);
  }
  await page.waitForTimeout(2000); // Konva render complete

  // 3) Screenshot
  const raw = join(rawDir, 'floorplan-live-desktop.png');
  await page.screenshot({ path: raw, fullPage: false, animations: 'disabled' });
  console.log('  ✓ Screenshot saved:', raw);

  const img = sharp(raw).rotate();
  await Promise.all([
    img.clone().webp({ quality: 82, smartSubsample: true }).toFile(join(assetDir, 'floorplan-live-desktop.webp')),
    img.clone().avif({ quality: 58, effort: 5 }).toFile(join(assetDir, 'floorplan-live-desktop.avif')),
  ]);
  console.log('  ✓ Exported floorplan-live-desktop.avif/.webp');

  // 4) Intentar clic en una mesa para mostrar el panel lateral
  try {
    const canvas = page.locator('canvas').first();
    const box = await canvas.boundingBox();
    if (box) {
      // Clic en el centro del canvas para seleccionar una mesa
      await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.4);
      await page.waitForTimeout(1500);
      const raw2 = join(rawDir, 'floorplan-live-desktop-selected.png');
      await page.screenshot({ path: raw2, fullPage: false, animations: 'disabled' });
      const img2 = sharp(raw2).rotate();
      await Promise.all([
        img2.clone().webp({ quality: 82, smartSubsample: true }).toFile(join(assetDir, 'floorplan-live-desktop-selected.webp')),
        img2.clone().avif({ quality: 58, effort: 5 }).toFile(join(assetDir, 'floorplan-live-desktop-selected.avif')),
      ]);
      console.log('  ✓ Exported floorplan-live-desktop-selected.avif/.webp');
    }
  } catch (e) {
    console.log('  ⚠ Could not capture selected state:', e.message);
  }

  await ctx.close();
  console.log('\n✅ Floorplan capture complete.');
} finally {
  await browser.close();
}
