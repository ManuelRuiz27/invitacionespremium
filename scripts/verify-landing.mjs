import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'var', 'landing-product-proof', 'qa');
const url = process.env.LANDING_QA_URL ?? 'http://127.0.0.1:6176';
const viewports = [
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];
const prices = [
  ['PHYSICAL_QR', 'QR / EventOps', 1, 50, 125, 250000],
  ['PHYSICAL_QR', 'QR / EventOps', 51, 100, 150, 300000],
  ['PHYSICAL_QR', 'QR / EventOps', 101, 150, 175, 350000],
  ['FLYER', 'Flyer', 1, 50, 225, 450000],
  ['FLYER', 'Flyer', 51, 100, 275, 550000],
  ['FLYER', 'Flyer', 101, 150, 325, 650000],
  ['FLIPBOOK', 'Flipbook', 1, 50, 300, 600000],
  ['FLIPBOOK', 'Flipbook', 51, 100, 350, 700000],
  ['FLIPBOOK', 'Flipbook', 101, 150, 400, 800000]
].map(([serviceCode, displayName, capacityMin, capacityMax, credits, amountMxnCents]) => ({
  serviceCode,
  displayName,
  capacityMin,
  capacityMax,
  credits,
  amountMxnCents,
  validFrom: '2026-08-27T00:00:00.000Z',
  validUntil: null
}));

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
    await page.route('**/api/v1/public/pricing', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(prices) })
    );
    await page.goto(url, { waitUntil: 'networkidle' });
    await page
      .getByRole('heading', { level: 1, name: 'Invitados organizados. Un evento más fácil de operar.' })
      .waitFor();
    for (const id of ['producto', 'servicios', 'planners', 'venues']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const result = await page.evaluate(() => ({
      hasContent: document.body.innerText.trim().length > 0,
      hasOverlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay')),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      sections: ['producto', 'como-funciona', 'servicios', 'precios', 'planners', 'venues', 'faq'].every((id) =>
        Boolean(document.getElementById(id))
      ),
      commercialNames: ['Gestión de Invitados', 'Invitación Digital', 'Invitación Premium'].every((name) =>
        document.body.innerText.includes(name)
      ),
      creditsInPricing: document.getElementById('precios')?.innerText.toLowerCase().includes('créditos') ?? false
    }));
    await page.screenshot({ path: join(output, `${viewport.name}.png`), fullPage: true, animations: 'disabled' });
    report.push({ viewport: `${viewport.width}x${viewport.height}`, ...result, consoleErrors });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (
  report.some(
    (item) =>
      !item.hasContent ||
      item.hasOverlay ||
      item.horizontalOverflow ||
      !item.sections ||
      !item.commercialNames ||
      item.creditsInPricing ||
      item.consoleErrors.length > 0
  )
)
  process.exitCode = 1;
