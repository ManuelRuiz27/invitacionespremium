/**
 * Captura video de las primeras 3 páginas de la invitación real "Boda de Prueba".
 * Guarda el resultado como WebM en apps/landing/src/assets/product-proof/.
 *
 * Ejecutar con: pnpm exec node scripts/capture-invitation-video.mjs
 */
import { chromium } from '@playwright/test';
import { mkdir, copyFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'var', 'landing-product-proof', 'raw');
const assetDir = join(root, 'apps', 'landing', 'src', 'assets', 'product-proof');

await mkdir(rawDir, { recursive: true });
await mkdir(assetDir, { recursive: true });

const INVITATION_URL =
  'http://localhost:5173/invitacion/ip1.35fc7108-f724-46cf-90fd-fbd5f47f8a5f.deb5a0e4a320340466559163650a21c2b791e1ed8a5adcbb07f64c2ad3c5f772.lGZhUWHGh7ifz2_75lHz3sufG1iMJNEY6wvirhVw6ZU';

const browser = await chromium.launch({ headless: true });

console.log('Recording invitation flipbook pages 1-3…');
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  recordVideo: {
    dir: rawDir,
    size: { width: 390, height: 844 }
  }
});

const page = await ctx.newPage();
page.setDefaultTimeout(30_000);

// Navegar a la invitación real
await page.goto(INVITATION_URL, { waitUntil: 'networkidle' });

// Esperar que cargue el flipbook (página 1)
try {
  await page.locator('main').first().waitFor({ timeout: 15_000 });
} catch {
  // continuar aunque no aparezca main
}
await page.waitForTimeout(2000); // página 1 visible

// Algunos flipbooks muestran primero "Abrir invitación" — hacer clic si existe
const openBtn = page.getByRole('button', { name: /abrir invitaci[oó]n/i });
if ((await openBtn.count()) > 0) {
  console.log('  → Clicking "Abrir invitación"…');
  await openBtn.last().click();
  await page.waitForTimeout(1800);
}

// También buscar el link "Abrir invitación" (puede ser un enlace)
const openLink = page.getByRole('link', { name: /abrir invitaci[oó]n/i });
if ((await openLink.count()) > 0) {
  console.log('  → Clicking "Abrir invitación" link…');
  await openLink.last().click();
  await page.waitForTimeout(1800);
}

await page.waitForTimeout(1500); // mostrar página 1 durante 1.5s más

// Navegar a página 2
const nextBtn = page.getByRole('button', { name: /siguiente/i });
const nextCount = await nextBtn.count();
console.log(`  Found ${nextCount} "Siguiente" buttons`);
if (nextCount > 0) {
  console.log('  → Clicking to page 2…');
  await nextBtn.last().click();
  await page.waitForTimeout(2500); // mostrar página 2 durante 2.5s

  // Navegar a página 3
  const nextBtn2 = page.getByRole('button', { name: /siguiente/i });
  if ((await nextBtn2.count()) > 0) {
    console.log('  → Clicking to page 3…');
    await nextBtn2.last().click();
    await page.waitForTimeout(2500); // mostrar página 3 durante 2.5s
  }
} else {
  // Buscar por texto o aria-label alternativo
  const altNext = page.locator('button').filter({ hasText: 'Siguiente' });
  const altCount = await altNext.count();
  console.log(`  Found ${altCount} alt next buttons`);
  if (altCount > 0) {
    await altNext.last().click();
    await page.waitForTimeout(2500);
    const altNext2 = page.locator('button').filter({ hasText: 'Siguiente' });
    if ((await altNext2.count()) > 0) {
      await altNext2.last().click();
      await page.waitForTimeout(2500);
    }
  } else {
    console.log('  ⚠ No navigation found, recording page 1 only');
    await page.waitForTimeout(3000);
  }
}

// Obtener referencia al video antes de cerrar
const video = page.video();

// Cerrar el contexto para finalizar el video
await ctx.close();
await browser.close();

// Copiar el video al directorio de assets
if (video) {
  const tempPath = await video.path();
  if (tempPath) {
    const destPath = join(assetDir, 'invitation-flipbook-pages123.webm');
    await copyFile(tempPath, destPath);
    console.log('  ✓ Saved:', destPath);
  } else {
    console.log('  ⚠ Video path not available');
  }
} else {
  console.log('  ⚠ No video object available');
}

console.log('\n✅ Video capture complete.');
