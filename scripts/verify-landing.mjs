import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'var', 'landing-product-proof', 'qa');
const url = process.env.LANDING_QA_URL ?? 'http://127.0.0.1:6176';
const plannerCta = 'Demo para Planners';
const venueCta = 'Solicitar propuesta para mi salón';
const privateCta = 'Cotizar interfaz exclusiva';
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
    await page.getByRole('heading', { level: 1, name: 'Invitaciones memorables. Accesos bajo control.' }).waitFor();

    for (const id of ['producto', 'servicios', 'precios', 'planners', 'venues']) {
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
        sections: ['producto', 'como-funciona', 'servicios', 'precios', 'planners', 'venues', 'faq'].every((id) =>
          Boolean(document.getElementById(id))
        ),
        navigationTargets: [...document.querySelectorAll('a[href^="#"]')].every((link) =>
          Boolean(document.getElementById(link.getAttribute('href').slice(1)))
        ),
        commercialNames: ['QR / EventOps', 'Flyer digital', 'Flipbook Premium'].every((name) =>
          bodyText.includes(name)
        ),
        managedCopy:
          bodyText.includes('Nosotros preparamos. Tú operas el evento.') && bodyText.includes('Demo para Planners'),
        releaseCopy:
          bodyText.includes('validaciones operativas finales') &&
          bodyText.includes('Desarrollo a medida sujeto a alcance'),
        futureCommercialCopyHidden:
          !/créditos|planner partner|crear cuenta de planner|álbum del evento|reporte del evento/i.test(bodyText)
      };
    });

    if (await page.getByRole('button', { name: 'Abrir menú de navegación' }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
      await page
        .getByRole('navigation', { name: 'Navegación principal' })
        .getByText('Salones', { exact: true })
        .click();
    } else {
      await page
        .getByRole('navigation', { name: 'Navegación principal' })
        .getByRole('link', { name: 'Salones' })
        .click();
    }
    await page
      .getByRole('heading', { name: 'Tu salón recibe invitados. Nosotros preparamos la tecnología.' })
      .waitFor();
    const venueButton = page.locator('#venues').getByRole('button', { name: venueCta });
    await venueButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Propuesta para tu salón o jardín' }).waitFor();
    await dialog.getByRole('textbox', { name: 'Nombre de contacto' }).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    const focusRestored = await venueButton.evaluate((button) => document.activeElement === button);
    await page.getByRole('button', { name: privateCta }).click();
    await dialog.waitFor();
    const privateContext = await dialog.getByRole('textbox', { name: 'Mensaje (opcional)' }).inputValue();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await page.locator('#planners').getByRole('button', { name: plannerCta }).click();
    await dialog.getByRole('heading', { name: 'Condiciones para Planners y agencias' }).waitFor();
    const plannerContext = await dialog.getByRole('textbox', { name: 'Mensaje (opcional)' }).inputValue();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    result.commercialDialogs =
      focusRestored && privateContext.includes('interfaz exclusiva para mi salón') && plannerContext === '';

    await page.evaluate(() => window.scrollTo(0, 0));
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
      !item.navigationTargets ||
      !item.commercialNames ||
      !item.managedCopy ||
      !item.releaseCopy ||
      !item.commercialDialogs ||
      !item.futureCommercialCopyHidden ||
      item.consoleErrors.length > 0
  )
)
  process.exitCode = 1;
