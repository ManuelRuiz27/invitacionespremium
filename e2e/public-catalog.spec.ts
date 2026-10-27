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
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
      local: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
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
