import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Browser captures exercise the real route and SDK with fictional, intercepted API data.
// They never mutate the shared database or bypass the production Managed guard.
const eventId = 'ac1c081a-3893-47ce-a63d-aa2d33bf57e1';
const eventFixture = {
  id: eventId,
  assignedPlannerUserId: 'planner-fixture',
  serviceId: 'flyer',
  serviceCode: 'FLYER',
  name: 'Boda de Elena y Mateo',
  socialType: 'WEDDING',
  status: 'CONFIGURED',
  capacity: 120,
  timeZone: 'America/Mexico_City',
  eventDateTime: '2027-06-19T23:00:00.000Z',
  locationUrl: 'https://maps.google.com/?q=Salon%20Central',
  giftRegistryUrl: 'https://mesaderegalos.liverpool.com.mx/evento/123',
  confirmationEnabled: false,
  floorplanEnabled: false,
  updatedAt: '2026-11-03T12:00:00Z'
};
async function fixture(page: Page, managed = false) {
  let event = { ...eventFixture };
  const patches: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const json = (body: unknown) => route.fulfill({ json: body });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path.endsWith('/auth/me'))
      return json({
        id: 'planner-fixture',
        email: 'planner@example.test',
        role: 'INDEPENDENT_PLANNER',
        clientId: 'client-fixture',
        clientType: 'PLANNER',
        clientOperatingProfile: managed ? 'MANAGED' : 'SELF_SERVICE',
        clientStatus: 'ACTIVE'
      });
    if (path.endsWith('/services'))
      return json([
        { id: 'flyer', code: 'FLYER', priceRules: [] },
        { id: 'flipbook', code: 'FLIPBOOK', priceRules: [] }
      ]);
    if (path.endsWith(`/events/${eventId}`)) {
      if (request.method() === 'PATCH') {
        const patch = request.postDataJSON();
        patches.push(patch);
        event = { ...event, ...patch };
      }
      return json(event);
    }
    if (path.endsWith('/events')) return json([event]);
    return route.fulfill({ status: 404, json: { error: { code: 'FIXTURE_NOT_FOUND', message: 'No fixture' } } });
  });
  return patches;
}

for (const width of [320, 360, 390, 768, 1024, 1440]) {
  test(`event data responsive and accessible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const patches = await fixture(page);
    await page.goto(`/eventos/${eventId}/configuracion/datos`);
    await expect(page.getByRole('heading', { name: 'Tu celebración' })).toBeVisible();
    for (const title of ['Tu celebración', 'Fecha y hora del evento', 'Lugar del evento', 'Mesa de regalos']) {
      const block = page.getByRole('region', { name: title, exact: true });
      await expect(block).toBeVisible();
      const bounds = await block.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
    }
    const overflow = await page.evaluate(() => ({
      width: window.innerWidth,
      scroll: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll('body *')]
        .filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8)
        .map((node) => ({
          tag: node.tagName,
          className: node.getAttribute('class'),
          right: node.getBoundingClientRect().right
        }))
    }));
    expect(overflow.scroll, JSON.stringify(overflow)).toBeLessThanOrEqual(width);
    await expect(page.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('link', { name: 'Abrir mesa de regalos' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    if (width < 900) {
      const trigger = page.getByRole('button', { name: '19 de junio de 2027' });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Elegir fecha del evento' });
      await expect(dialog).toBeVisible();
      const day = dialog.getByRole('button', { name: 'sábado, 19 de junio de 2027' });
      const bounds = await day.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
      if (width === 360) {
        await mkdir('test-results/event-data', { recursive: true });
        await page.screenshot({ path: 'test-results/event-data/mobile-calendar-360.png', fullPage: true });
      }
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    } else
      await expect(page.getByRole('button', { name: 'sábado, 19 de junio de 2027' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    await page.getByLabel('Nombre del evento', { exact: true }).fill('Celebración de Elena y Mateo');
    await page.getByRole('heading', { name: 'Datos del Evento' }).click();
    await expect(page.getByText('Cambios guardados', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Tu celebración' })).toHaveAttribute('data-validation', 'confirmed');
    expect(patches.at(-1)?.name).toBe('Celebración de Elena y Mateo');
    if (width === 1440 || width === 360) {
      await mkdir('test-results/event-data', { recursive: true });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: `test-results/event-data/${width === 1440 ? 'desktop' : 'mobile'}-${width}.png`,
        fullPage: true
      });
    }
    expect(errors).toEqual([]);
  });
}

test('Managed requests never mount the technical editor', async ({ page }) => {
  await fixture(page, true);
  await page.goto(`/eventos/${eventId}/configuracion/datos`);
  await expect(page).toHaveURL(/\/eventos$/);
  await expect(page.getByRole('heading', { name: 'Datos del Evento' })).toHaveCount(0);
});
