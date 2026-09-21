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

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page
      .getByRole('heading', { level: 1, name: 'Tú organizas el evento. Nosotros preparamos la operación digital.' })
      .waitFor();

    for (const id of ['producto', 'servicios', 'planners']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    const result = await page.evaluate(() => {
      const bodyText = document.body.innerText;
      return {
        hasContent: bodyText.trim().length > 0,
        hasOverlay: Boolean(document.querySelector('.vite-error-overlay, #webpack-dev-server-client-overlay')),
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        sections: ['producto', 'como-funciona', 'servicios', 'planners', 'faq'].every((id) =>
          Boolean(document.getElementById(id))
        ),
        futureSectionsHidden: !document.getElementById('precios') && !document.getElementById('venues'),
        commercialNames: ['Gestión de Invitados', 'Invitación Digital', 'Invitación Premium'].every((name) =>
          bodyText.includes(name)
        ),
        managedCopy:
          bodyText.includes('Nosotros preparamos. Tú operas el evento.') &&
          bodyText.includes('Solicitar una demo'),
        futureCommercialCopyHidden:
          !/créditos|planner partner|crear cuenta de planner|álbum del evento|reporte del evento/i.test(bodyText)
      };
    });

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
      !item.futureSectionsHidden ||
      !item.commercialNames ||
      !item.managedCopy ||
      !item.futureCommercialCopyHidden ||
      item.consoleErrors.length > 0
  )
)
  process.exitCode = 1;
