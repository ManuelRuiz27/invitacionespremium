import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto('http://127.0.0.1:6176', { waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: 'Soy Planner/agencia' }).check();
  const pricing = page.locator('#precios');
  await pricing.getByLabel('Servicio', { exact: true }).selectOption('FLIPBOOK');
  await pricing.getByLabel('Capacidad del evento').selectOption('150');
  const trigger = page.locator('#planners').getByRole('button', { name: 'Consultar condiciones para planners' });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Servicio', { exact: true })).toHaveValue('FLIPBOOK');
  await expect(dialog.getByLabel('Capacidad del evento')).toHaveValue('150');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await page.getByRole('button', { name: 'Cotizar interfaz exclusiva' }).click();
  await expect(dialog.getByLabel('Servicio', { exact: true })).toHaveValue('FLIPBOOK');
  await expect(dialog.getByLabel('Capacidad del evento')).toHaveValue('150');
  await expect(dialog.getByLabel('Mensaje (opcional)')).toHaveValue(/interfaz exclusiva/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  for (const [index, alt] of [
    [2, 'Plano de mesas de demostración del evento Boda Flyer — mesas asignadas'],
    [3, 'Vista de demostración de invitaciones y accesos individuales del evento Boda Flyer']
  ]) {
    const scene = page.locator(`[data-scene="${index}"]`);
    await scene.scrollIntoViewIfNeeded();
    await scene.getByRole('button', { name: 'Ver pantalla' }).click();
    await expect(scene.getByRole('button', { name: 'Ver pantalla' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('img', { name: alt, exact: true })).toBeVisible();
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('video')).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('video').first()).toBeAttached();
  await page.setViewportSize({ width: 360, height: 900 });
  await expect(page.getByRole('button', { name: 'Abrir menú de navegación' })).toBeVisible();
  await page.getByRole('button', { name: 'Abrir menú de navegación' }).click();
  await page.getByRole('navigation').getByRole('button', { name: 'Elegir cómo contratar' }).click();
  await expect(page.getByRole('radio', { name: 'Soy Planner/agencia' })).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await writeFile(
    'var/LAND-UX-20261102-02/qa-independent-memo.json',
    JSON.stringify(
      {
        status: 'PASS',
        selectedContextThroughStablePlannerCallback: 'FLIPBOOK/101–150',
        personalizationNotesPreserved: true,
        modalFocusRestored: true,
        proofOwnStateUpdates: true,
        reducedMotionHookUpdatesDespiteMemo: true,
        memoHeaderRespondsToMobileViewport: true,
        genericHeaderReadsCurrentSelectedIntent: true
      },
      null,
      2
    )
  );
  console.log(
    'PASS: memo keeps fresh selection/callbacks, personalization, proof state and live reduced-motion updates.'
  );
} finally {
  await browser.close();
}
