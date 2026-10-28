import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { AdminManagedPlan } from '../packages/api-client/src/index';

const api = 'http://localhost:5300/api/v1';
const admin = 'http://localhost:5374';
const landing = 'http://localhost:5376';

test('PR02: six managed plans → accepted contract → new price version → immutable old terms and new contract', async ({
  page
}) => {
  await page.goto(`${admin}/login`);
  await page.getByLabel(/correo/i).fill('provider@dt07.example');
  await page.getByLabel(/contrase/i).fill(process.env.DT07_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/u);
  await page.setViewportSize({ width: 390, height: 844 });
  const catalogResponse = await page.request.get(`${api}/admin/managed-plans`);
  expect(catalogResponse.status()).toBe(200);
  const plans: AdminManagedPlan[] = await catalogResponse.json();
  expect(plans).toHaveLength(6);
  const essential = plans.find((plan) => plan.modality === 'STANDARD' && plan.tier === 'ESSENTIAL')!;
  const initial = essential.versions.find((version) => version.id === essential.currentVersionId)!;
  expect(initial).toMatchObject({
    monthlyAmountMxnCents: 790000,
    initialFeeMxnCents: 490000,
    extraEventAmountMxnCents: 125000,
    contractMonths: 12,
    eventCapacity: 150
  });
  const pricesBefore = await (await page.request.get(`${api}/admin/prices`)).json();
  const first = await createManagedSalon(page);
  const start = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  await assignEssential(page, first, start);
  const firstContracts = await (await page.request.get(`${api}/admin/clients/${first}/managed-contracts`)).json();
  expect(firstContracts).toHaveLength(1);
  const accepted = firstContracts[0];
  expect(accepted.terms).toMatchObject({ monthlyAmountMxnCents: 790000, planVersionId: initial.id });
  const commercial = page.getByRole('region', { name: 'Plan comercial', exact: true });
  await expect(commercial.getByText('$7,900.00 MXN / mes', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Consumo de eventos del contrato' })).toBeVisible();
  const usageBefore = await (
    await page.request.get(`${api}/admin/clients/${first}/managed-contracts/${accepted.id}/consumption`)
  ).json();
  expect(usageBefore).toMatchObject({ usedEvents: 0, extraordinaryEvents: 0, availableEvents: 4 });

  await page.goto(`${admin}/catalogo`);
  await page.getByRole('tab', { name: 'Planes Gestionados', exact: true }).click();
  const card = page.getByRole('article', { name: 'Estándar Gestionado · Esencial', exact: true });
  await expect(
    page.getByRole('article').filter({ has: page.getByRole('button', { name: /Nueva versión de/ }) })
  ).toHaveCount(6);
  await card.getByRole('button', { name: 'Nueva versión de Esencial', exact: true }).click();
  const versionDialog = page.getByRole('dialog');
  await versionDialog.getByLabel('Mensualidad MXN', { exact: true }).fill('8100.25');
  await expect(versionDialog.getByRole('checkbox', { name: 'Aplicar desde ahora' })).toBeChecked();
  await versionDialog.getByRole('button', { name: 'Guardar nueva versión', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(card.getByText('$8,100.25 MXN / mes', { exact: true })).toBeVisible();
  await card.getByRole('button', { name: 'Historial de Esencial', exact: true }).click();
  const history = page.getByRole('dialog');
  await expect(history.getByText('$7,900.00 MXN / mes', { exact: true })).toBeVisible();
  await expect(history.getByText('$8,100.25 MXN / mes', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Cerrar historial', exact: true }).click();

  await page.goto(`${admin}/clientes/${first}`);
  await expect(
    page.getByRole('region', { name: 'Plan comercial', exact: true }).getByText('$7,900.00 MXN / mes', { exact: true })
  ).toBeVisible();
  expect(await (await page.request.get(`${api}/admin/clients/${first}/managed-contracts`)).json()).toEqual(
    firstContracts
  );
  const second = await createManagedSalon(page);
  await assignEssential(page, second, start);
  const secondContracts = await (await page.request.get(`${api}/admin/clients/${second}/managed-contracts`)).json();
  expect(secondContracts[0].terms.monthlyAmountMxnCents).toBe(810025);
  expect(secondContracts[0].planVersionId).not.toBe(initial.id);
  expect(await (await page.request.get(`${api}/admin/prices`)).json()).toEqual(pricesBefore);
});

async function createManagedSalon(page: Page) {
  const suffix = randomUUID();
  const response = await page.request.post(`${api}/admin/clients/organizations`, {
    headers: { Origin: admin },
    data: {
      name: `PR02 salón ${suffix}`,
      adminEmail: `admin-${suffix}@pr02.example`,
      adminPassword: process.env.DT07_E2E_PASSWORD!,
      operatingProfile: 'MANAGED'
    }
  });
  expect(response.status()).toBe(201);
  return (await response.json()).client.id as string;
}

test('PR03: partial payment → full settlement → audited reversal → individually confirmed extraordinary on mobile', async ({
  page
}, testInfo) => {
  await page.goto(`${admin}/login`);
  await page.getByLabel(/correo/i).fill('provider@dt07.example');
  await page.getByLabel(/contrase/i).fill(process.env.DT07_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/u);
  await page.setViewportSize({ width: 390, height: 844 });
  const clientId = await createManagedSalon(page);
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
  await assignEssential(page, clientId, today);
  const contracts = await (await page.request.get(`${api}/admin/clients/${clientId}/managed-contracts`)).json();
  const path = `${api}/admin/clients/${clientId}/managed-contracts/${contracts[0].id}/collections`;
  const panel = page.getByRole('region', { name: 'Cobros y pagos', exact: true });
  const obligations = panel.getByRole('table', { name: 'Obligaciones comerciales' });
  await expect(obligations.getByRole('row')).toHaveCount(14);
  const month = obligations
    .getByRole('row')
    .filter({ has: page.getByRole('rowheader', { name: 'Mensualidad 1', exact: true }) });
  await month.getByRole('button', { name: 'Registrar pago' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Importe neto MXN', { exact: true }).fill('1000.00');
  await dialog.getByLabel('Referencia (opcional)', { exact: true }).fill('PR03 banco manual');
  await expect(dialog.getByRole('button', { name: 'Confirmar registro' })).toBeDisabled();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(month.getByText('Parcial', { exact: true })).toBeVisible();
  await expect(panel.getByText('Referencia: PR03 banco manual', { exact: true })).toBeVisible();
  let state = await (await page.request.get(path)).json();
  expect(state.obligations[1]).toMatchObject({ paidMxnCents: 100000, status: 'PARTIAL' });
  await month.getByRole('button', { name: 'Registrar pago' }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(month.getByText('Pagado', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Revertir pago', exact: true }).first().click();
  await dialog.getByLabel('Motivo de reversión', { exact: true }).fill('Transferencia duplicada en registro');
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByText('Pago revertido', { exact: true })).toBeVisible();
  state = await (await page.request.get(path)).json();
  expect(state.obligations[1]).toMatchObject({ balanceMxnCents: 100000, status: 'PARTIAL' });
  expect(state.history.map((entry: { kind: string }) => entry.kind)).toEqual(['PAYMENT', 'PAYMENT', 'REVERSAL']);
  const plannerResponse = await page.request.post(`${api}/admin/clients/${clientId}/users/planner`, {
    headers: { Origin: admin },
    data: { email: `pr03-${randomUUID()}@example.test`, password: process.env.DT07_E2E_PASSWORD! }
  });
  expect(plannerResponse.status()).toBe(201);
  const planner = await plannerResponse.json();
  for (let index = 0; index < 5; index++) {
    const created = await page.request.post(`${api}/admin/clients/${clientId}/events/managed`, {
      headers: { Origin: admin, 'Idempotency-Key': randomUUID() },
      data: {
        name: `PR03 evento ${index + 1}`,
        serviceCode: 'ACCESS_CONTROL',
        accessMode: 'ANONYMOUS',
        capacity: 1,
        assignedPlannerUserId: planner.id
      }
    });
    expect(created.status()).toBe(201);
    const event = await created.json();
    const eventPath = `${api}/admin/clients/${clientId}/events/${event.id}`;
    expect(
      (
        await page.request.patch(eventPath, {
          headers: { Origin: admin },
          data: { socialType: 'OTHER', eventDateTime: '2035-01-01T18:00:00Z', timeZone: 'America/Mexico_City' }
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post(`${eventPath}/physical-passes/generate`, {
          headers: { Origin: admin, 'Idempotency-Key': randomUUID() },
          data: { quantity: 1 }
        })
      ).status()
    ).toBe(200);
    expect(
      (
        await page.request.post(`${eventPath}/activate`, {
          headers: { Origin: admin, 'Idempotency-Key': randomUUID() },
          data: {}
        })
      ).status()
    ).toBe(200);
  }
  await panel.getByRole('button', { name: 'Actualizar cobros', exact: true }).click();
  await expect(panel.getByText('PR03 evento 5', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Confirmar extraordinario', exact: true }).click();
  await dialog.getByRole('checkbox').check();
  await dialog.getByRole('button', { name: 'Confirmar registro' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(panel.getByText('Cargo confirmado', { exact: true })).toBeVisible();
  await expect(obligations.getByRole('row')).toHaveCount(15);
  state = await (await page.request.get(path)).json();
  expect(state.obligations.at(-1)).toMatchObject({
    concept: 'EXTRAORDINARY',
    amountMxnCents: contracts[0].terms.extraEventAmountMxnCents
  });
  expect(state.history.filter((entry: { kind: string }) => entry.kind === 'EXTRA_CONFIRM')).toHaveLength(1);
  await page.reload();
  await expect(panel.getByText('Pago revertido', { exact: true })).toBeVisible();
  await expect(panel.getByText('Cargo confirmado', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath('pr03-collections-mobile.png') });
});

async function assignEssential(page: Page, clientId: string, startsOn: string) {
  await page.goto(`${admin}/clientes/${clientId}`);
  await page.getByRole('button', { name: 'Asignar plan comercial', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Modalidad comercial', { exact: true }).click();
  await page.getByRole('option', { name: 'Estándar Gestionado', exact: true }).click();
  await dialog.getByLabel('Plan', { exact: true }).click();
  await page.getByRole('option', { name: 'Esencial', exact: true }).click();
  await dialog.getByLabel('Versión comercial aceptada', { exact: true }).click();
  await page.getByRole('option', { name: /^Esencial · desde/u }).click();
  await dialog.getByLabel('Inicio contractual', { exact: true }).fill(startsOn);
  await dialog.getByRole('button', { name: 'Registrar contrato aceptado', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByText('Contrato comercial registrado con los términos aceptados.', { exact: true })
  ).toBeVisible();
}

test('PR01: inactive service → missing rate → nine public rates → future replacement → refreshed landing', async ({
  page,
  context
}) => {
  await page.goto(`${admin}/login`);
  await page.getByLabel(/correo/i).fill('provider@dt07.example');
  await page.getByLabel(/contrase/i).fill(process.env.DT07_E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar al panel', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/u);
  await page.goto(`${admin}/catalogo`);
  await page.getByRole('tab', { name: 'Precios' }).click();
  await expect(page.getByText('6 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
  const flyerCell = page.getByRole('article', { name: 'Flyer · 1–50 personas' });
  await expect(flyerCell.getByText('Tarifa vigente faltante')).toBeVisible();

  const publicPage = await context.newPage();
  let publicRequests = 0;
  publicPage.on('request', async (request) => {
    if (request.url() === `${api}/public/pricing`) {
      publicRequests += 1;
      expect((await request.allHeaders()).cookie).toBeUndefined();
    }
  });
  await publicPage.goto(landing);
  await expect(publicPage.getByText('Los precios públicos están temporalmente no disponibles.')).toBeVisible();
  await expect(publicPage.locator('[data-service-code]')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Servicios', exact: true }).click();
  const flyerRow = page.getByRole('row').filter({ has: page.getByRole('cell', { name: 'Flyer', exact: true }) });
  await flyerRow.getByRole('button', { name: 'Actualizar estado' }).click();
  await page.getByRole('combobox', { name: 'Estado' }).click();
  await page.getByRole('option', { name: 'Activo', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: 'Precios' }).click();
  await expect(page.getByText('8 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
  await flyerCell.getByRole('button', { name: 'Configurar tarifa' }).click();
  await page.getByLabel('Creditos', { exact: true }).fill('225');
  const initialFrom = await page.evaluate(() => {
    const date = new Date(Date.now() - 1000);
    const pad = (number: number) => String(number).padStart(2, '0');
    // datetime-local canonically omits zero seconds; Playwright requires that exact value.
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`.replace(
      /:00$/u,
      ''
    );
  });
  await page.getByLabel('Inicio de vigencia').fill(initialFrom);
  await page.getByRole('button', { name: 'Confirmar precio' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('9 de 9 tarifas publicadas y coincidentes con el historial vigente.')).toBeVisible();
  await publicPage.reload();
  await expect(publicPage.locator('[data-service-code]')).toHaveCount(3);
  await expect(publicPage.locator('[data-service-code="FLYER"]').getByText('$4,500')).toBeVisible();

  const before = await (await page.request.get(`${api}/admin/prices`)).json();
  const current = before.find(
    (price: { serviceCode: string; commercialChannel: string; capacityMin: number; validUntil: string | null }) =>
      price.serviceCode === 'FLYER' &&
      price.commercialChannel === 'STANDARD' &&
      price.capacityMin === 1 &&
      price.validUntil === null
  );
  expect(current.credits).toBe(225);
  await flyerCell.getByRole('button', { name: 'Programar cambio' }).click();
  await page.getByLabel('Creditos', { exact: true }).fill('250');
  const future = await page.evaluate(() => {
    const date = new Date(Date.now() + 20_000);
    date.setMilliseconds(0);
    const pad = (number: number) => String(number).padStart(2, '0');
    return {
      iso: date.toISOString(),
      local:
        `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`.replace(
          /:00$/u,
          ''
        )
    };
  });
  await page.getByLabel('Inicio de vigencia').fill(future.local);
  await page.getByRole('button', { name: 'Confirmar precio' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(flyerCell.getByText(/Programada: 250 créditos/u)).toBeVisible();
  const publicCredits = async () => {
    const response = await publicPage.request.get(`${api}/public/pricing`);
    expect(response.ok()).toBe(true);
    const prices = await response.json();
    expect(prices).toHaveLength(9);
    return prices.find(
      (price: { serviceCode: string; capacityMin: number }) => price.serviceCode === 'FLYER' && price.capacityMin === 1
    ).credits;
  };
  expect(await publicCredits()).toBe(225);
  await expect.poll(publicCredits, { timeout: 35_000, intervals: [500, 1000] }).toBe(250);
  await publicPage.reload();
  await expect(publicPage.locator('[data-service-code="FLYER"]').getByText('$5,000')).toBeVisible();
  await page.getByRole('button', { name: 'Actualizar catálogo' }).click();
  await expect(flyerCell.getByText(/250 créditos/u)).toBeVisible();
  await expect(flyerCell.getByText(/Programada:/u)).toHaveCount(0);
  const history = await (await page.request.get(`${api}/admin/prices`)).json();
  expect(history).toHaveLength(before.length + 1);
  expect(history.find((price: { id: string }) => price.id === current.id)).toMatchObject({
    credits: 225,
    validFrom: current.validFrom,
    validUntil: future.iso
  });
  const duplicate = await page.request.post(`${api}/admin/prices`, {
    headers: { Origin: admin },
    data: {
      serviceId: current.serviceId,
      commercialChannel: 'STANDARD',
      capacityMin: 1,
      capacityMax: 50,
      credits: 250,
      validFrom: future.iso
    }
  });
  expect(duplicate.status()).toBe(409);
  expect(await (await page.request.get(`${api}/admin/prices`)).json()).toHaveLength(history.length);
  expect(publicRequests).toBeGreaterThanOrEqual(3);
  await publicPage.close();
});
