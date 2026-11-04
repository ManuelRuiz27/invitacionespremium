import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Browser captures exercise the real route and SDK with fictional, intercepted API data.
// They never mutate the shared database or bypass the production Managed guard.
const sharedMap = 'https://maps.google.com/?q=Salon%20Central';
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
  locationUrl: sharedMap,
  giftRegistryUrl: 'https://mesaderegalos.liverpool.com.mx/evento/123',
  confirmationEnabled: false,
  floorplanEnabled: false,
  updatedAt: '2026-11-03T12:00:00Z'
};
async function fixture(
  page: Page,
  managed = false,
  overrides: { eventDateTime?: string | null; locationUrl?: string | null } = {}
) {
  let event = { ...eventFixture, ...overrides };
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
    await page.setViewportSize({ width, height: width < 900 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const patches = await fixture(page);
    await page.goto(`/eventos/${eventId}/configuracion/datos`);
    await expect(page.getByLabel('Nombre del evento', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Datos del Evento' })).toHaveCount(0);
    const sectionTabs = page.getByRole('tablist', { name: 'Secciones de datos del evento' });
    const showSection = async (name: string) => {
      if (await sectionTabs.isVisible()) await sectionTabs.getByRole('tab', { name, exact: true }).click();
    };
    for (const [id, tab] of [
      ['celebration', 'Celebración'],
      ['event-date', 'Cuándo y dónde'],
      ['event-gifts', 'Regalos']
    ]) {
      await showSection(tab!);
      const block = page.locator(`#${id}-panel`);
      await expect(block).toBeVisible();
      const bounds = await block.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      if (width === 360 && tab === 'Cuándo y dónde') {
        await mkdir('test-results/event-data', { recursive: true });
        await page.screenshot({
          path: `test-results/event-data/mobile-${'schedule'}-360.png`,
          fullPage: true
        });
      }
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
    await showSection('Cuándo y dónde');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('input[type=time]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Abrir ubicación' })).toHaveAttribute('target', '_blank');
    await showSection('Regalos');
    await expect(page.getByRole('link', { name: 'Abrir mesa de regalos' })).toHaveAttribute(
      'rel',
      'noopener noreferrer'
    );
    await showSection('Cuándo y dónde');
    if (await page.getByRole('button', { name: '19 de junio de 2027' }).isVisible()) {
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
        await page.screenshot({ path: 'test-results/event-data/mobile-calendar-360.png' });
      }
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      await expect(trigger).toBeFocused();
    } else
      await expect(page.getByRole('button', { name: 'sábado, 19 de junio de 2027' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
    await showSection('Celebración');
    await page.getByLabel('Nombre del evento', { exact: true }).fill('Celebración de Elena y Mateo');
    await page.getByLabel('Nombre del evento', { exact: true }).blur();
    await expect(page.getByText('Cambios guardados', { exact: true })).toBeVisible();
    await expect(page.locator('#celebration-panel')).toHaveAttribute('data-validation', 'confirmed');
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
  await expect(page.getByRole('region', { name: 'Datos del evento', exact: true })).toHaveCount(0);
});

for (const width of [360, 1440]) {
  test(`edits a precise 12-hour time with compact timezone and consistent select typography at ${width}px`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: width === 360 ? 844 : 900 });
    const patches = await fixture(page);
    const mapRequests: string[] = [];
    page.on('request', (request) => {
      if (/google\.com\/maps|maps\.google/.test(request.url())) mapRequests.push(request.url());
    });
    await page.goto(`/eventos/${eventId}/configuracion/datos`);
    const service = page.getByRole('combobox', { name: 'Servicio', exact: true });
    const typography = await service.evaluate((element) => ({
      family: getComputedStyle(element).fontFamily,
      size: getComputedStyle(element).fontSize
    }));
    await service.click();
    const serviceOption = page.getByRole('option', { name: /Flyer/ });
    expect(
      await serviceOption.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize
      }))
    ).toEqual(typography);
    await page.keyboard.press('Escape');
    const tabs = page.getByRole('tablist', { name: 'Secciones de datos del evento' });
    if (await tabs.isVisible()) await tabs.getByRole('tab', { name: 'Cuándo y dónde', exact: true }).click();
    await expect(page.getByRole('link', { name: 'Abrir ubicación' })).toBeVisible();
    await expect(page.locator('iframe, input[type=time]')).toHaveCount(0);
    await page.getByRole('button', { name: /^Hora de inicio:/ }).click();
    const hour = page.getByRole('combobox', { name: 'Hora', exact: true });
    expect(
      await hour.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize
      }))
    ).toEqual(typography);
    await hour.click();
    const hourOption = page.getByRole('option', { name: '9', exact: true });
    expect(
      await hourOption.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize
      }))
    ).toEqual(typography);
    await hourOption.click();
    await page.getByRole('combobox', { name: 'Minutos' }).click();
    await page.getByRole('option', { name: '47', exact: true }).click();
    await page.getByRole('button', { name: 'p. m.', exact: true }).click();
    await page.getByRole('button', { name: 'Usar hora' }).click();
    await expect(page.getByRole('button', { name: 'Hora de inicio: 9:47 p. m.', exact: true })).toBeVisible();
    await expect(page.getByText('Cambios guardados', { exact: true })).toBeVisible();
    expect(patches.at(-1)?.eventDateTime).toBe('2027-06-20T03:47:00.000Z');
    await page.getByRole('button', { name: /^Cambiar zona horaria:/ }).click();
    const zoneInput = page.getByRole('combobox', { name: 'Zona horaria' });
    expect(
      await zoneInput.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize
      }))
    ).toEqual(typography);
    await zoneInput.fill('Tijuana');
    const zoneOption = page.getByRole('option', { name: 'Tijuana', exact: true });
    expect(
      await zoneOption.evaluate((element) => ({
        family: getComputedStyle(element).fontFamily,
        size: getComputedStyle(element).fontSize
      }))
    ).toEqual(typography);
    await zoneOption.click();
    await page.getByRole('button', { name: 'Cambiar zona', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Cambiar zona horaria: Tijuana', exact: true })).toBeVisible();
    await expect(page.getByText('Cambios guardados', { exact: true })).toBeVisible();
    expect(patches.at(-1)).toMatchObject({ timeZone: 'America/Tijuana', eventDateTime: '2027-06-20T04:47:00.000Z' });
    expect(mapRequests).toEqual([]);
    await page.screenshot({ path: `test-results/event-data/schedule-${width}.png`, fullPage: true });
  });
}

for (const width of [900, 1199]) {
  test(`keeps the calendar modal and empty location compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1200 });
    await fixture(page, false, { locationUrl: null });
    await page.goto(`/eventos/${eventId}/configuracion/datos`);
    const tabs = page.getByRole('tablist', { name: 'Secciones de datos del evento' });
    await tabs.getByRole('tab', { name: 'Cuándo y dónde', exact: true }).click();
    await expect(page.getByRole('button', { name: 'sábado, 19 de junio de 2027' })).toHaveCount(0);
    await page.getByRole('button', { name: '19 de junio de 2027' }).click();
    await expect(page.getByRole('dialog', { name: 'Elegir fecha del evento' })).toBeVisible();
    await page.keyboard.press('Escape');
    const block = page.locator('#event-date-panel');
    expect((await page.getByLabel('Ubicación', { exact: true }).boundingBox())!.height).toBeLessThan(60);
    expect((await page.getByLabel('Ubicación', { exact: true }).boundingBox())!.width).toBeGreaterThan(width / 2);
    await expect(page.getByTitle('Mapa de la ubicación del evento')).toHaveCount(0);
    await expect(block.getByRole('heading')).toHaveCount(0);
    await expect(tabs.getByRole('tab')).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Datos del Evento' })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  });
}

test('keeps the selected date when leaving is blocked and saves it after completing the time', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const patches = await fixture(page, false, { eventDateTime: null, locationUrl: null });
  await page.goto(`/eventos/${eventId}/configuracion/datos`);
  const tabs = page.getByRole('tablist', { name: 'Secciones de datos del evento' });
  await tabs.getByRole('tab', { name: 'Cuándo y dónde', exact: true }).click();
  await page.getByRole('button', { name: 'Elegir fecha del evento' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /, 15 de / })
    .click();
  const chosenDay = await page
    .locator('#event-date-panel')
    .getByRole('button', { name: /^15 de / })
    .innerText();
  await tabs.getByRole('tab', { name: 'Celebración', exact: true }).click();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/eventos/${eventId}/configuracion/datos$`));
  await expect(tabs.getByRole('tab', { name: 'Cuándo y dónde', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('button', { name: chosenDay, exact: true })).toBeVisible();
  expect(patches).toEqual([]);
  await page.getByRole('button', { name: /^Hora de inicio:/ }).click();
  await page.getByRole('combobox', { name: 'Hora', exact: true }).click();
  await page.getByRole('option', { name: '6', exact: true }).click();
  await page.getByRole('combobox', { name: 'Minutos' }).click();
  await page.getByRole('option', { name: '30', exact: true }).click();
  await page.getByRole('button', { name: 'p. m.', exact: true }).click();
  await page.getByRole('button', { name: 'Usar hora' }).click();
  await page.getByRole('button', { name: 'Salir', exact: true }).click();
  await expect(page).toHaveURL(/\/eventos$/);
  expect(patches.at(-1)?.eventDateTime).toMatch(/T00:30:00.000Z$/);
});
