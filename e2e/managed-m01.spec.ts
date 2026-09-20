import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const EVENT_ID = '15000000-0000-4000-8000-000000000005';
const CLIENT_ID = '15000000-0000-4000-8000-000000000001';
const CROSS_TENANT_EVENT_ID = process.env.MANAGED_E2E_CROSS_TENANT_EVENT_ID ?? '15000000-0000-4000-8000-000000000102';
const ADMIN_URL = 'http://localhost:5174';
const CLIENT_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000/api/v1';

interface ManagedDemoCredentials {
  users: {
    platformAdmin: { email: string; password: string };
    planner: { email: string; password: string };
  };
}

test('certifica el journey Managed M01 y sus negativos release-critical', async ({ browser }, testInfo) => {
  const credentials = JSON.parse(
    await readFile(join(process.cwd(), 'apps/api/var/managed-demo/credentials.json'), 'utf8')
  ) as ManagedDemoCredentials;
  const requestedApiPaths: string[] = [];
  const contexts: BrowserContext[] = [];
  const pages: Array<{ name: string; page: Page }> = [];

  const createContext = async () => {
    const context = await browser.newContext();
    context.on('request', (request) => {
      const url = new URL(request.url());
      if (url.origin === 'http://localhost:3000') requestedApiPaths.push(url.pathname);
    });
    contexts.push(context);
    return context;
  };

  const adminContext = await createContext();
  const plannerContext = await createContext();
  const publicContext = await createContext();
  const scannerContext = await createContext();
  const adminPage = await adminContext.newPage();
  const plannerPage = await plannerContext.newPage();
  const publicPage = await publicContext.newPage();
  const scannerPage = await scannerContext.newPage();
  pages.push(
    { name: 'admin', page: adminPage },
    { name: 'planner', page: plannerPage },
    { name: 'public', page: publicPage },
    { name: 'scanner', page: scannerPage }
  );
  let scannerUrl = '';

  try {
    await test.step('1. Platform Admin inicia sesión', async () => {
      await loginAdmin(adminPage, credentials.users.platformAdmin);
      await expect(adminPage).toHaveURL(`${ADMIN_URL}/`);
    });

    await test.step('2. Platform Admin localiza Boda de Elena & Mateo', async () => {
      await adminPage.goto(`${ADMIN_URL}/eventos`);
      const eventRow = adminPage.getByRole('row').filter({ hasText: 'Boda de Elena & Mateo' });
      await expect(eventRow).toContainText('[DEMO] Planner Elena & Mateo');
      await expect(eventRow).toContainText('Activo');
      await eventRow.getByRole('link', { name: 'Ver detalle' }).click();
      await expect(adminPage.getByRole('heading', { name: 'Boda de Elena & Mateo' })).toBeVisible();
    });

    await test.step('3. Admin comprueba Managed, ACTIVE y preparación Provider', async () => {
      const clientResponse = await adminContext.request.get(`${API_URL}/admin/clients/${CLIENT_ID}`);
      expect(clientResponse.status()).toBe(200);
      expect(await clientResponse.json()).toMatchObject({ operatingProfile: 'MANAGED' });
      await expect(adminPage.getByText('Activo', { exact: true })).toBeVisible();
      await adminPage.getByRole('link', { name: 'Preparar evento' }).click();
      await expect(adminPage.getByRole('heading', { name: 'Preparar Boda de Elena & Mateo' })).toBeVisible();
      await expect(adminPage.getByText('Activo', { exact: true })).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Datos' })).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Invitación' })).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Croquis' })).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Registro operativo' })).toBeVisible();
      await expect(adminPage.getByRole('link', { name: 'Comercial' })).toHaveCount(0);
    });

    await test.step('4. Planner inicia sesión', async () => {
      await loginPlanner(plannerPage, credentials.users.planner);
      await expect(plannerPage).toHaveURL(`${CLIENT_URL}/eventos`);
    });

    await test.step('5. Planner comprueba superficie Managed sin Self-Service ni Finance', async () => {
      await expect(plannerPage.getByRole('button', { name: 'Nuevo evento' })).toHaveCount(0);
      await expect(plannerPage.getByRole('link', { name: 'Nuevo evento' })).toHaveCount(0);
      await expect(plannerPage.getByRole('link', { name: 'Finanzas' })).toHaveCount(0);
      await expect(plannerPage.getByText('Boda de Elena & Mateo')).toBeVisible();
    });

    await test.step('6. Planner abre el workspace', async () => {
      const eventItem = plannerPage.getByRole('listitem').filter({ hasText: 'Boda de Elena & Mateo' });
      await eventItem.getByRole('link', { name: 'Ver evento' }).click();
      await expect(plannerPage).toHaveURL(`${CLIENT_URL}/eventos/${EVENT_ID}`);
      await expect(plannerPage.getByRole('heading', { name: 'Boda de Elena & Mateo' })).toBeVisible();
    });

    await test.step('7. Invitados e Invitaciones son operables según lifecycle ACTIVE', async () => {
      await plannerPage.getByRole('link', { name: 'Invitados' }).click();
      await expect(plannerPage.getByText('Familia Luna')).toBeVisible();
      await expect(plannerPage.getByText('Diego Torres')).toBeVisible();
      await expect(plannerPage.getByRole('button', { name: /Agregar invitado/i })).toHaveCount(0);
      await plannerPage.getByRole('link', { name: 'Invitaciones' }).click();
      await expect(plannerPage.getByRole('heading', { name: 'Enviar invitaciones' })).toBeVisible();
      await expect(plannerPage.getByRole('listitem').filter({ hasText: 'Diego Torres' })).toBeVisible();
    });

    await test.step('8. Abre la Invitación pública real de Diego Torres', async () => {
      const diego = plannerPage.getByRole('listitem').filter({ hasText: 'Diego Torres' });
      const invitationUrl = await diego.getByRole('link', { name: 'Abrir invitación' }).getAttribute('href');
      expect(invitationUrl).toBeTruthy();
      await publicPage.goto(invitationUrl!);
      await expect(publicPage.getByRole('heading', { name: 'Boda de Elena & Mateo' })).toBeVisible();
      await expect(publicPage.getByRole('heading', { name: 'Tu asistencia' })).toBeVisible();
    });

    await test.step('9. Diego Torres realiza RSVP real', async () => {
      await publicPage.getByLabel('Tu asistencia').getByRole('button', { name: 'Confirmar asistencia' }).click();
      const dialog = publicPage.getByRole('dialog', { name: 'Confirmación de asistencia' });
      await expect(dialog).toBeVisible();
      const responsePromise = publicPage.waitForResponse(
        (response) => response.url().includes('/public/invitations/') && response.url().endsWith('/confirm')
      );
      await dialog.getByRole('button', { name: 'Confirmar asistencia' }).click();
      expect((await responsePromise).status()).toBe(200);
      await expect(publicPage.getByText('Tu confirmación quedó guardada.')).toBeVisible();
      await expect(publicPage.getByText('Asistencia confirmada')).toBeVisible();
    });

    await test.step('10. Planner observa Confirmada', async () => {
      await plannerPage.reload();
      const diego = plannerPage.getByRole('listitem').filter({ hasText: 'Diego Torres' });
      await expect(diego.getByText('Confirmada', { exact: true })).toBeVisible();
    });

    await test.step('11. Planner abre Seating sobre el Croquis Provider', async () => {
      await plannerPage.getByRole('link', { name: 'Mesas y distribución' }).click();
      await expect(plannerPage.getByRole('heading', { name: 'Mesas y distribución' })).toBeVisible();
      await expect(plannerPage.getByLabel('Resumen de la distribución')).toContainText('2');
      await plannerPage.getByText('Mesas y zonas (3)', { exact: true }).click();
      await expect(plannerPage.getByRole('button', { name: 'Mesa Elena · 4' })).toBeVisible();
      await expect(plannerPage.getByRole('button', { name: 'Mesa Mateo · 4' })).toBeVisible();
    });

    await test.step('12. Desasigna a Diego Torres y verifica persistencia tras reload', async () => {
      await plannerPage.getByRole('button', { name: 'Mesa Elena · 4' }).click();
      await plannerPage.getByRole('tab', { name: /En esta mesa/ }).click();
      const diego = plannerPage.getByRole('listitem').filter({ hasText: 'Diego Torres' });
      await expect(diego).toBeVisible();
      const responsePromise = plannerPage.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.url().includes(`/events/${EVENT_ID}/seating/`)
      );
      await diego.getByRole('button', { name: 'Quitar Mesa' }).click();
      expect((await responsePromise).status()).toBe(200);
      await expect(diego).toHaveCount(0);

      await plannerPage.reload();
      await plannerPage.getByText('Mesas y zonas (3)', { exact: true }).click();
      await plannerPage.getByRole('button', { name: 'Mesa Elena · 4' }).click();
      const unassigned = plannerPage.getByRole('list', { name: 'Asistentes sin mesa' });
      await expect(unassigned.getByText('Diego Torres')).toBeVisible();
      await plannerPage.getByRole('tab', { name: /En esta mesa/ }).click();
      await expect(
        plannerPage.getByRole('list', { name: 'Asistentes en Mesa Elena' }).getByText('Diego Torres')
      ).toHaveCount(0);
    });

    await test.step('13. Planner crea un acceso Staff desde UI', async () => {
      await plannerPage.getByRole('link', { name: 'Staff' }).click();
      await plannerPage.getByLabel('Alias del acceso').fill('Recepción MG-05');
      const responsePromise = plannerPage.waitForResponse(
        (response) =>
          response.request().method() === 'POST' && response.url().endsWith(`/events/${EVENT_ID}/staff-tokens`)
      );
      await plannerPage.getByRole('button', { name: 'Crear acceso' }).click();
      expect((await responsePromise).status()).toBe(201);
      await expect(plannerPage.getByRole('heading', { name: 'Acceso recién creado: Recepción MG-05' })).toBeVisible();
      scannerUrl = await plannerPage.getByLabel('Enlace Scanner').inputValue();
      expect(scannerUrl).toMatch(/^http:\/\/localhost:5175\/scanner\/st1\./u);
    });

    await test.step('14. Staff abre Scanner con el token generado por UI', async () => {
      await scannerPage.goto(scannerUrl);
      await expect(scannerPage.getByRole('heading', { name: 'Boda de Elena & Mateo' })).toBeVisible();
      await expect(scannerPage.getByText('Evento activo · operativo')).toBeVisible();
      await expect(scannerPage.getByText('Staff: Recepción MG-05')).toBeVisible();
    });

    await test.step('15. Scanner completa check-in real de Familia Luna mediante Search', async () => {
      await scannerPage.getByRole('tab', { name: 'Buscar' }).click();
      await scannerPage.getByLabel('Nombre exacto del Contacto o Asistente').fill('Familia Luna');
      const searchResponse = scannerPage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/search')
      );
      await scannerPage.getByRole('button', { name: 'Buscar' }).click();
      expect((await searchResponse).status()).toBe(200);
      await scannerPage.getByRole('button', { name: /Andrea Luna, Bruno Luna, Clara Luna/ }).click();
      await expect(scannerPage.getByRole('heading', { name: 'Asistentes pendientes' })).toBeVisible();
      const checkInResponse = scannerPage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith('/check-in')
      );
      await scannerPage.getByRole('button', { name: 'Registrar ingreso (3)' }).click();
      expect((await checkInResponse).status()).toBe(200);
      await expect(scannerPage.getByText('Ingreso registrado: Andrea Luna, Bruno Luna, Clara Luna.')).toBeVisible();
      await expect(scannerPage.getByText('La disponibilidad cambió. Escanea o busca nuevamente.')).toHaveCount(0);
    });

    await test.step('16. Check-in persiste y Planner refleja el estado operativo', async () => {
      await scannerPage.reload();
      await scannerPage.getByRole('tab', { name: 'Buscar' }).click();
      await scannerPage.getByLabel('Nombre exacto del Contacto o Asistente').fill('Familia Luna');
      await scannerPage.getByRole('button', { name: 'Buscar' }).click();
      await scannerPage.getByRole('button', { name: /Sin Asistentes pendientes/ }).click();
      await expect(
        scannerPage.getByText('Todos los Asistentes confirmados de esta Invitación ya ingresaron.')
      ).toBeVisible();

      await plannerPage.goto(`${CLIENT_URL}/eventos/${EVENT_ID}?seccion=mesas`);
      await plannerPage.getByText('Mesas y zonas (3)', { exact: true }).click();
      await plannerPage.getByRole('button', { name: 'Mesa Mateo · 4' }).click();
      await plannerPage.getByRole('tab', { name: /En esta mesa/ }).click();
      const tableList = plannerPage.getByRole('list', { name: 'Asistentes en Mesa Mateo' });
      await expect(tableList.getByText('Ingreso registrado')).toHaveCount(3);
    });

    await test.step('17. Planner cierra el Evento mediante UI', async () => {
      await plannerPage.goto(`${CLIENT_URL}/eventos/${EVENT_ID}`);
      await plannerPage.getByRole('button', { name: 'Cerrar evento' }).click();
      const dialog = plannerPage.getByRole('dialog', { name: 'Cerrar evento' });
      const closeResponse = plannerPage.waitForResponse(
        (response) => response.request().method() === 'POST' && response.url().endsWith(`/events/${EVENT_ID}/close`)
      );
      await dialog.getByRole('button', { name: 'Cerrar evento' }).click();
      expect((await closeResponse).status()).toBe(200);
      await expect(plannerPage.getByText('Cerrado', { exact: true })).toBeVisible();
    });

    await test.step('18. CLOSED persiste, Client queda read-only y Scanner deja de operar', async () => {
      await plannerPage.reload();
      await expect(plannerPage.getByText('Cerrado', { exact: true })).toBeVisible();
      await plannerPage.goto(`${CLIENT_URL}/eventos/${EVENT_ID}?seccion=mesas`);
      await expect(
        plannerPage.getByText('Este Evento está en modo de consulta. La distribución no admite cambios.')
      ).toBeVisible();
      await scannerPage.reload();
      await expect(
        scannerPage.getByText(
          /El Evento está cerrado, cancelado, archivado o fuera de operación|Token Staff revocado, expirado o inválido/
        )
      ).toBeVisible();
    });

    await test.step('Negativos Managed y aislamiento de tenant/API', async () => {
      await assertRedirectedToEvents(plannerPage, `${CLIENT_URL}/finanzas`);
      await assertRedirectedToEvents(plannerPage, `${CLIENT_URL}/eventos/nuevo`);
      await assertRedirectedToEvents(plannerPage, `${CLIENT_URL}/eventos/${EVENT_ID}/configuracion/datos`);

      await plannerPage.goto(`${CLIENT_URL}/eventos/${CROSS_TENANT_EVENT_ID}`);
      await expect(plannerPage.getByRole('heading', { name: 'Este evento no está disponible.' })).toBeVisible();
      await expect(plannerPage.getByText('[E2E] Evento no asignado')).toHaveCount(0);

      const forbidden = await plannerContext.request.post(`${API_URL}/events/${EVENT_ID}/design/flipbook`, {
        headers: { Origin: CLIENT_URL }
      });
      expect(forbidden.status()).toBe(403);
      expect(await forbidden.json()).toMatchObject({ code: 'CLIENT_MANAGED_CAPABILITY_FORBIDDEN' });
    });

    await test.step('El recorrido no consume rutas financieras', async () => {
      const financialPath = requestedApiPaths.find((path) =>
        /\/(finance|prices|payments|receipts|ledger|credit(?:s|-line)?)(?:\/|$)/u.test(path)
      );
      expect(financialPath, `Unexpected financial request: ${financialPath}`).toBeUndefined();
    });
  } catch (error) {
    await Promise.allSettled(
      pages.map(({ name, page }) => page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true }))
    );
    throw error;
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});

async function loginAdmin(page: Page, credentials: { email: string; password: string }) {
  await page.goto(`${ADMIN_URL}/login`);
  await page.getByLabel('Correo electronico').fill(credentials.email);
  await page.getByLabel('Contrasena').fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar al panel' }).click();
}

async function loginPlanner(page: Page, credentials: { email: string; password: string }) {
  await page.goto(`${CLIENT_URL}/login`);
  await page.getByLabel('Correo electrónico').fill(credentials.email);
  await page.getByLabel('Contraseña').fill(credentials.password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
}

async function assertRedirectedToEvents(page: Page, url: string) {
  await page.goto(url);
  await expect(page).toHaveURL(`${CLIENT_URL}/eventos`);
  await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible();
}
