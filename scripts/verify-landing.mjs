import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(
  process.env.LANDING_QA_OUTPUT ?? join(root, 'var', 'landing-product-proof', 'qa', 'LAND-UX-20261102-02')
);
const url = process.env.LANDING_QA_URL ?? 'http://127.0.0.1:6176';
const plannerCta = 'Consultar condiciones para planners';
const venueCta = 'Solicitar propuesta para mi salón';
const privateCta = 'Cotizar interfaz exclusiva';
const viewports = [
  { name: 'mobile-320', width: 320, height: 844 },
  { name: 'mobile-360', width: 360, height: 844 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet-768', width: 768, height: 1000 },
  { name: 'tablet-1024', width: 1024, height: 900 },
  { name: 'desktop-1440', width: 1440, height: 1000 }
];

await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (message) => message.type() === 'error' && consoleErrors.push(message.text()));
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('heading', { level: 1, name: 'Menos listas dispersas. Más control de tu evento.' }).waitFor();
    await expect(page.locator('video')).toHaveCount(0);
    const screenshot = async (name, locator) => {
      if (![360, 1440].includes(viewport.width)) return;
      // A tall element screenshot otherwise composites the fixed header halfway
      // through the image. Only section captures hide it; viewport/full captures
      // preserve the actual header and all layout checks run without this style.
      const buffer = locator
        ? await locator.screenshot({ animations: 'disabled', style: 'header { visibility: hidden !important; }' })
        : await page.screenshot({ animations: 'disabled' });
      await sharp(buffer)
        .webp({ quality: 82 })
        .toFile(join(output, `${viewport.name}-${name}.webp`));
    };
    await screenshot('hero');
    await screenshot('perfiles', page.locator('#como-contratar'));

    // The PVP oracle comes from the same live public API as the browser, never a fixture.
    const pricesResponse = await page.request.get(new URL('/api/v1/public/pricing', url).href);
    expect(pricesResponse.ok()).toBe(true);
    const prices = await pricesResponse.json();
    const pricing = page.locator('#precios');
    const expectedPrice = (sku, capacityMax) => {
      const price = prices.find((entry) => entry.serviceCode === sku && entry.capacityMax === capacityMax);
      expect(price).toBeTruthy();
      return `${new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(price.amountMxnCents / 100)} MXN antes de IVA`;
    };
    await pricing.getByRole('button', { name: 'Elegir cómo contratar' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Organizo mi evento' })).toBeFocused();
    await expect(page.locator('#como-contratar input:checked')).toHaveCount(0);
    await page.keyboard.press('Space');
    await pricing.getByLabel('Servicio', { exact: true }).selectOption('FLYER');
    await pricing.getByLabel('Capacidad del evento').selectOption('100');
    await expect(pricing.getByText(expectedPrice('FLYER', 100), { exact: true })).toBeVisible();
    await pricing.getByRole('button', { name: 'Conocer cómo funciona' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('radio', { name: 'Soy Planner/agencia' }).check();
    await expect(pricing.getByLabel('Servicio', { exact: true })).toHaveValue('FLYER');
    await expect(pricing.getByLabel('Capacidad del evento')).toHaveValue('100');
    await expect(pricing.getByText(expectedPrice('FLYER', 100), { exact: true })).toBeVisible();
    await pricing.getByLabel('Servicio', { exact: true }).selectOption('FLIPBOOK');
    await pricing.getByLabel('Capacidad del evento').selectOption('150');
    await expect(pricing.getByText(expectedPrice('FLIPBOOK', 150), { exact: true })).toBeVisible();
    await screenshot('pricing-planner', pricing);
    const selectedCta = pricing.getByRole('button', { name: plannerCta });
    await selectedCta.focus();
    await page.keyboard.press('Enter');
    const selectedDialog = page.getByRole('dialog');
    await expect(selectedDialog.getByLabel('Servicio', { exact: true })).toHaveValue('FLIPBOOK');
    await expect(selectedDialog.getByLabel('Capacidad del evento')).toHaveValue('150');
    await screenshot('modal-planner');
    await selectedDialog.getByLabel('Servicio', { exact: true }).selectOption('FLYER');
    await selectedDialog.getByLabel('Capacidad del evento').selectOption('100');
    await page.keyboard.press('Escape');
    await expect(selectedDialog).toBeHidden();
    await expect(selectedCta).toBeFocused();
    await page.getByRole('radio', { name: 'Tengo salón o jardín' }).check();
    await expect(pricing.getByLabel('Servicio', { exact: true })).toHaveValue('FLIPBOOK');
    await expect(pricing.getByLabel('Capacidad del evento')).toHaveValue('150');
    await pricing.getByLabel('Servicio', { exact: true }).selectOption('PHYSICAL_QR');
    await pricing.getByLabel('Capacidad del evento').selectOption('50');
    await expect(pricing.getByText(expectedPrice('PHYSICAL_QR', 50), { exact: true })).toBeVisible();
    await expect(pricing.getByText(/eventos efectivamente cobrados del mes anterior/)).toBeVisible();
    await expect(pricing.getByText('Sin confirmación pública de asistencia ni álbum', { exact: true })).toBeVisible();
    await screenshot('pricing-venue', pricing);
    await pricing.getByRole('button', { name: venueCta }).click();
    await expect(selectedDialog.getByLabel('Servicio', { exact: true })).toHaveValue('PHYSICAL_QR');
    await expect(selectedDialog.getByLabel('Capacidad del evento')).toHaveValue('50');
    await screenshot('modal-venue');
    await page.keyboard.press('Escape');
    await expect(selectedDialog).toBeHidden();

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
        sections: [
          'como-contratar',
          'producto',
          'como-funciona',
          'servicios',
          'precios',
          'planners',
          'venues',
          'faq'
        ].every((id) => Boolean(document.getElementById(id))),
        navigationTargets: [...document.querySelectorAll('a[href^="#"]')].every((link) =>
          Boolean(document.getElementById(link.getAttribute('href').slice(1)))
        ),
        commercialNames: ['QR / EventOps', 'Flyer digital', 'Flipbook Premium'].every((name) =>
          bodyText.includes(name)
        ),
        managedCopy:
          bodyText.includes('Nosotros preparamos. Tú operas el evento.') &&
          bodyText.includes('Consultar condiciones para planners'),
        releaseCopy:
          bodyText.includes('validaciones operativas finales') &&
          bodyText.includes('Desarrollo a medida sujeto a alcance'),
        futureCommercialCopyHidden:
          !/créditos|planner partner|crear cuenta de planner|álbum del evento|reporte del evento/i.test(bodyText),
        demoLabels: !/\breal\b|BOda/.test(
          [...document.querySelectorAll('[alt], [aria-label]')]
            .map((element) => element.getAttribute('alt') ?? element.getAttribute('aria-label'))
            .join(' ')
        ),
        customerLanguage: !/\b(?:SKU|bracket|lead|DTO|API|Provider|M-1|RSVP|Scanner|Staff|Venue|PVP)\b/i.test(
          bodyText +
            ' ' +
            [...document.querySelectorAll('[alt], [aria-label], meta[name="description"]')]
              .map(
                (element) =>
                  element.getAttribute('alt') ?? element.getAttribute('aria-label') ?? element.getAttribute('content')
              )
              .join(' ')
        ),
        contextualJourneys: true,
        reducedMotion: document.querySelectorAll('video').length === 0
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

    // Generic desktop/mobile conversion always asks for an explicit intent.
    if (await page.getByRole('button', { name: 'Abrir menú de navegación' }).isVisible()) {
      await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
    }
    await page
      .locator('header')
      .getByRole('button', { name: 'Elegir cómo contratar' })
      .count()
      .then(async (count) => {
        const trigger = count
          ? page.locator('header').getByRole('button', { name: 'Elegir cómo contratar' })
          : page.getByRole('navigation').getByRole('button', { name: 'Elegir cómo contratar' });
        await trigger.click();
      });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('radio', { name: 'Tengo salón o jardín' })).toBeFocused();
    result.genericCta = true;

    await page.evaluate(() => window.scrollTo(0, 0));
    await sharp(await page.screenshot({ fullPage: true, animations: 'disabled' }))
      .resize({ width: Math.min(viewport.width, 1440), height: 16000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 70 })
      .toFile(join(output, `${viewport.name}-full.webp`));
    report.push({ viewport: `${viewport.width}x${viewport.height}`, ...result, consoleErrors });
    await context.close();
  }
} finally {
  await browser.close();
}

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(output, 'responsive-report.json'), `${JSON.stringify(report, null, 2)}\n`);
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
      !item.demoLabels ||
      !item.customerLanguage ||
      !item.contextualJourneys ||
      !item.reducedMotion ||
      !item.genericCta ||
      !item.futureCommercialCopyHidden ||
      item.consoleErrors.length > 0
  )
)
  process.exitCode = 1;
