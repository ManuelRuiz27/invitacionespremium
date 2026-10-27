import { expect, test } from '@playwright/test';

const api = 'http://localhost:5300/api/v1';
const admin = 'http://localhost:5374';
const landing = 'http://localhost:5376';

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
