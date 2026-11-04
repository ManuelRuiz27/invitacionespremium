import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

// Real route, shell and SDK; only network responses are fictional. No shared DB writes.
const evidence = 'docs/05-implementacion/evidence/UI02-GUESTS-20261104';
const eventId = 'ac1c081a-3893-47ce-a63d-aa2d33bf57e1';
const event = {
  id: eventId,
  name: 'Boda de Elena y Mateo',
  assignedPlannerUserId: 'planner-fixture',
  serviceId: 'flyer',
  serviceCode: 'FLYER',
  socialType: 'WEDDING',
  status: 'CONFIGURED',
  capacity: 120,
  timeZone: 'America/Mexico_City',
  eventDateTime: '2027-06-19T23:00:00.000Z',
  confirmationEnabled: false,
  floorplanEnabled: false,
  updatedAt: '2026-11-04T12:00:00Z'
};
const names = [
  'María Fernanda López',
  'Carlos Hernández',
  'Valentina Torres',
  'Diego Martínez',
  'Camila Rivera',
  'Sebastián Moreno'
];
const fixtureGroups = [
  { id: 'family', eventId, name: 'Familia' },
  { id: 'friends', eventId, name: 'Amistades' }
];

async function fixture(page: Page, { managed = false, active = false, empty = false } = {}) {
  let contacts = empty
    ? []
    : names.map((name, index) => ({
        id: `contact-${index}`,
        eventId,
        name,
        whatsappPhone: `+52550000000${index}`,
        groupId: index % 2 ? 'friends' : 'family',
        anonymizedAt: null
      }));
  const groups = [...fixtureGroups];
  const writes: Array<{ path: string; method: string; body: Record<string, unknown> }> = [];
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const json = (data: unknown) => route.fulfill({ json: data });
    if (method === 'OPTIONS') return route.fulfill({ status: 204 });
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
    if (path.endsWith('/services')) return json([{ id: 'flyer', code: 'FLYER', priceRules: [] }]);
    if (path.endsWith(`/events/${eventId}`)) return json({ ...event, status: active ? 'ACTIVE' : event.status });
    if (path.endsWith('/events')) return json([event]);
    if (method === 'GET' && path.endsWith('/invitations'))
      return json(
        contacts.map((contact) => ({
          id: `inv-${contact.id}`,
          contactId: contact.id,
          assistants: [{ id: `assistant-${contact.id}` }]
        }))
      );
    if (method === 'GET' && path.endsWith('/contacts')) return json(contacts);
    if (method === 'GET' && path.endsWith('/groups')) return json(groups);
    if (method === 'POST' && path.endsWith('/groups')) {
      const body = req.postDataJSON();
      writes.push({ path, method, body });
      const created = { ...body, id: 'new-group', eventId };
      groups.push(created);
      return json(created);
    }
    if (method === 'POST' && path.endsWith('/contacts')) {
      const body = req.postDataJSON();
      writes.push({ path, method, body });
      const created = { ...body, id: 'new-contact', eventId, anonymizedAt: null };
      contacts.push(created);
      return json(created);
    }
    const contactId = path.split('/contacts/')[1];
    if (contactId && ['PATCH', 'DELETE'].includes(method)) {
      const body = method === 'PATCH' ? req.postDataJSON() : {};
      writes.push({ path, method, body });
      contacts = contacts.flatMap((contact) =>
        contact.id !== contactId ? [contact] : method === 'DELETE' ? [] : [{ ...contact, ...body }]
      );
      if (method === 'DELETE') return route.fulfill({ status: 204 });
      return json(contacts.find((contact) => contact.id === contactId));
    }
    return route.fulfill({ status: 404, json: { error: { code: 'FIXTURE_NOT_FOUND', message: 'No fixture' } } });
  });
  return writes;
}

for (const width of [360, 768, 1440]) {
  test(`guests layout, keyboard and dialogs at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (reason) => errors.push(reason.message));
    await fixture(page);
    await page.goto(`/eventos/${eventId}/configuracion/contactos`);
    const list = page.getByRole('list', { name: 'Lista de invitados' });
    await expect(list.getByRole('listitem')).toHaveCount(6);
    await expect(page.locator('h1')).toHaveText(event.name);
    await expect(page.locator('h2')).toHaveText('Invitados');
    await expect(page.getByRole('tab', { name: 'Invitados', selected: true })).toHaveAttribute('aria-current', 'step');
    await expect(page.getByText('Sin cambios pendientes')).toHaveCount(0);
    await expect(page.getByText(/Completa los pasos/)).toHaveCount(0);
    await expect(page.getByRole('textbox', { name: 'Nombre', exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const bounds = await list.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(1060);
    if (width === 360) expect(bounds!.x).toBe(16);
    if (width === 1440) {
      expect((await list.getByRole('listitem').nth(3).boundingBox())!.y).toBeLessThan(900);
      await expect(page.getByRole('button', { name: 'Agregar invitado', exact: true })).toBeInViewport();
    }
    const menu = page.getByRole('button', { name: `Opciones de ${names[0]}` });
    const target = await menu.boundingBox();
    expect(target!.width).toBeGreaterThanOrEqual(44);
    expect(target!.height).toBeGreaterThanOrEqual(44);
    await mkdir(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/guests-${width}.png`, fullPage: true });
    await menu.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Editar' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toBeFocused();
    const add = page.getByRole('button', { name: 'Agregar invitado', exact: true });
    await add.click();
    const dialog = page.getByRole('dialog', { name: 'Agregar invitado' });
    await expect(dialog.getByRole('textbox', { name: 'Nombre', exact: true })).toBeFocused();
    const dialogBounds = await dialog.boundingBox();
    expect(dialogBounds!.x).toBeGreaterThanOrEqual(0);
    expect(dialogBounds!.x + dialogBounds!.width).toBeLessThanOrEqual(width);
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(add).toBeFocused();
    expect(errors).toEqual([]);
  });
}

test('browser CRUD, contextual groups, filters and explicit deletion', async ({ page }) => {
  const writes = await fixture(page);
  await page.goto(`/eventos/${eventId}/configuracion/contactos`);
  await page.getByRole('button', { name: 'Agregar invitado', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'Agregar invitado' });
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Lucía Ejemplo');
  await dialog.getByLabel('Número de WhatsApp').fill('+525500000099');
  await dialog.getByRole('button', { name: 'Crear grupo' }).click();
  await dialog.getByLabel('Nuevo grupo').fill('Compañeros');
  await dialog.getByRole('button', { name: 'Guardar grupo' }).click();
  await expect(dialog.getByRole('combobox', { name: 'Grupo', exact: true })).toContainText('Compañeros');
  await dialog.getByRole('button', { name: 'Agregar', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const list = page.getByRole('list', { name: 'Lista de invitados' });
  await expect(list.getByRole('listitem')).toHaveCount(7);
  expect(writes.at(-1)?.body).toEqual({ name: 'Lucía Ejemplo', whatsappPhone: '+525500000099', groupId: 'new-group' });
  await page.getByLabel('Buscar invitado').fill('lucia');
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Opciones de Lucía Ejemplo' }).click();
  await page.getByRole('menuitem', { name: 'Editar' }).click();
  dialog = page.getByRole('dialog', { name: 'Editar invitado' });
  await dialog.getByRole('textbox', { name: 'Nombre', exact: true }).fill('Lucía Ejemplo Corregida');
  await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(list).toContainText('Lucía Ejemplo Corregida');
  await page.getByLabel('Buscar invitado').clear();
  await page.getByRole('combobox', { name: 'Filtrar por grupo' }).click();
  await page.getByRole('option', { name: 'Compañeros' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('button', { name: 'Opciones de Lucía Ejemplo Corregida' }).click();
  await page.getByRole('menuitem', { name: 'Eliminar' }).click();
  expect(writes.some((write) => write.method === 'DELETE')).toBe(false);
  await page.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(0);
  expect(writes.at(-1)?.method).toBe('DELETE');
});

test('Managed retains consultation and hides all modifications for ACTIVE events', async ({ page }) => {
  const writes = await fixture(page, { managed: true, active: true });
  await page.goto(`/eventos/${eventId}?seccion=invitados`);
  await expect(page.getByRole('list', { name: 'Lista de invitados' }).getByRole('listitem')).toHaveCount(6);
  await expect(page.getByText(/modo de consulta/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Agregar invitado|Importar lista|Opciones de/ })).toHaveCount(0);
  await page.getByLabel('Buscar invitado').fill('valentina');
  await expect(page.getByRole('list', { name: 'Lista de invitados' }).getByRole('listitem')).toHaveCount(1);
  expect(writes).toEqual([]);
});

test('empty state offers an action and CSV rows stay uncommittable on validation failure', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 844 });
  await fixture(page, { empty: true });
  await page.route('**/contacts/import/preview', (route) =>
    route.fulfill({
      json: {
        previewId: 'invalid',
        totalRows: 1,
        validRows: 0,
        invalidRows: 1,
        expiresAt: '2027-01-01T00:00:00Z',
        rows: [
          {
            rowNumber: 2,
            name: 'Invitado Ejemplo',
            normalizedPhone: null,
            group: null,
            groupId: null,
            groupResolution: 'NONE',
            errors: ['CONTACT_PHONE_INVALID']
          }
        ]
      }
    })
  );
  await page.goto(`/eventos/${eventId}/configuracion/contactos`);
  await expect(page.getByText('Aún no hay invitados registrados.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agregar el primer invitado' })).toBeVisible();
  await page.getByRole('button', { name: 'Importar lista' }).click();
  await page.getByLabel('Seleccionar archivo CSV').setInputFiles({
    name: 'invitados.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('name,whatsapp_phone,group\nInvitado Ejemplo,incorrecto,')
  });
  await expect(page.getByText(/Fila 2: Invitado Ejemplo/)).toContainText('CONTACT_PHONE_INVALID');
  await expect(page.getByRole('button', { name: 'Confirmar importación' })).toBeDisabled();
  await page.screenshot({ path: `${evidence}/csv-errors-360.png`, fullPage: true });
});
