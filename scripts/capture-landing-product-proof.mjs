import { chromium } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { apiJson, createFixtureImages, demo } from './landing-product-proof-fixture.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'var', 'landing-product-proof', 'raw');
const assetDir = join(root, 'apps', 'landing', 'src', 'assets', 'product-proof');
const clientUrl = 'http://127.0.0.1:6173';
const scannerUrl = 'http://127.0.0.1:6175';
const apiBase = 'http://127.0.0.1:3999/api/v1';
const children = [];

await mkdir(rawDir, { recursive: true });
await mkdir(assetDir, { recursive: true });
const fixtureImages = await createFixtureImages();

try {
  children.push(
    startVite('apps/client', 6173, { VITE_API_BASE_URL: apiBase, VITE_SOCKET_URL: 'http://127.0.0.1:3999' })
  );
  children.push(
    startVite('apps/scanner', 6175, { VITE_API_BASE_URL: apiBase, VITE_SOCKET_URL: 'http://127.0.0.1:3999' })
  );
  await Promise.all([waitForUrl(clientUrl), waitForUrl(scannerUrl)]);
  process.stdout.write('Product Proof runtimes ready.\n');

  const browser = await chromium.launch({ headless: true });
  try {
    await capturePublic(browser);
    process.stdout.write('Captured public Invitation and RSVP.\n');
    await captureWorkspace(browser);
    process.stdout.write('Captured Client distribution and Seating.\n');
    await captureScanner(browser);
    process.stdout.write('Captured Scanner result and check-in.\n');
  } finally {
    await browser.close();
  }
} finally {
  for (const child of children) stopVite(child);
}

async function capturePublic(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await installFixture(page);
  await page.goto(`${clientUrl}/invitacion/${demo.invitationToken}`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Boda de Elena & Mateo' }).waitFor();
  await shot(page, 'flipbook-public-mobile');
  await page.getByRole('button', { name: 'Confirmar asistencia' }).last().click();
  await page.getByRole('heading', { name: 'Confirmación de asistencia' }).waitFor();
  await shot(page, 'rsvp-public-mobile');
  await context.close();
}

async function captureWorkspace(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1.5 });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await installFixture(page);
  await page.goto(`${clientUrl}/eventos/${demo.eventId}?seccion=invitaciones`, { waitUntil: 'domcontentloaded' });
  await page.getByText('5 invitaciones').waitFor();
  await shot(page, 'invitation-distribution-desktop');
  await page.goto(`${clientUrl}/eventos/${demo.eventId}?seccion=mesas`, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Resumen de la distribución').waitFor();
  await page.getByText('Olivo', { exact: true }).first().click();
  await page.getByRole('heading', { name: 'Olivo' }).waitFor();
  await shot(page, 'seating-desktop');
  await context.close();
}

async function captureScanner(browser) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  page.setDefaultTimeout(12_000);
  await installFixture(page);
  await page.goto(`${scannerUrl}/scanner/${demo.staffToken}`, { waitUntil: 'domcontentloaded' });
  await page.getByText('Staff: Acceso principal').waitFor();
  await page.getByRole('tab', { name: 'Buscar' }).click();
  await page.getByLabel('Nombre exacto del Contacto o Asistente').fill('Sofía Navarro');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: /Sofía Navarro, Daniel Ruiz/u }).click();
  await page.getByText('Asistentes pendientes').waitFor();
  await shot(page, 'scanner-result-mobile');
  await page.getByRole('button', { name: 'Registrar ingreso (2)' }).click();
  await page.getByText(/Ingreso registrado/u).waitFor();
  const success = await page.getByText(/Ingreso registrado/u).boundingBox();
  const registerAnother = await page.getByRole('button', { name: /Siguiente escaneo/u }).boundingBox();
  const clip =
    success && registerAnother
      ? {
          x: 0,
          y: Math.max(0, success.y - 48),
          width: 390,
          height: Math.min(
            844 - Math.max(0, success.y - 48),
            registerAnother.y + registerAnother.height - success.y + 104
          )
        }
      : undefined;
  await shot(page, 'checkin-success-mobile', clip);
  await context.close();
}

async function installFixture(page) {
  await page.route(`${apiBase}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes('/assets/') && path.endsWith('/content')) {
      const assetIndex = path.includes(demo.assetIds[1]) ? 1 : 0;
      await route.fulfill({ status: 200, contentType: 'image/png', body: fixtureImages.pages[assetIndex] });
      return;
    }
    if (
      path.endsWith('/file-assets/a1100000-0000-4000-8000-000000000071/content') ||
      path.includes('/scanner/demo/floorplan/content')
    ) {
      await route.fulfill({ status: 200, contentType: 'image/png', body: fixtureImages.floorplanImage });
      return;
    }
    const body = apiJson(`${url.pathname}${url.search}`, request.method());
    if (body !== undefined) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      return;
    }
    throw new Error(`Unhandled Product Proof fixture request: ${request.method()} ${url.pathname}${url.search}`);
  });
}

async function shot(page, name, clip) {
  const raw = join(rawDir, `${name}.png`);
  await page.screenshot({ path: raw, fullPage: false, animations: 'disabled', clip });
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

function stopVite(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return;
  }
  child.kill('SIGTERM');
}

function startVite(relativeCwd, port, environment) {
  const child = spawn(`pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`, {
    cwd: join(root, relativeCwd),
    env: { ...process.env, ...environment },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    windowsHide: true
  });
  child.stdout.on('data', () => undefined);
  child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  return child;
}

async function waitForUrl(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
