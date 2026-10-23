import { expect, test, type Page } from '@playwright/test';

const api = 'http://localhost:5300/api/v1';
const admin = 'http://localhost:5374';
const client = 'http://localhost:5373';
const scanner = 'http://localhost:5375';
const password = process.env.DT07_E2E_PASSWORD!;

for (const mode of ['NOMINAL', 'ANONYMOUS'] as const) {
  test(`DT08 ${mode}: Provider activation → authoritative access counters → Staff camera → updated counters`, async ({
    browser
  }) => {
    const providerContext = await browser.newContext();
    const orgContext = await browser.newContext();
    const staffContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const paths: string[] = [];
    for (const context of [providerContext, orgContext, staffContext])
      context.on('request', (request) => {
        const url = new URL(request.url());
        if (url.origin === 'http://localhost:5300')
          paths.push(url.pathname.replace(/\/scanner\/[^/]+/u, '/scanner/[staff]'));
      });
    const provider = await providerContext.newPage(),
      organization = await orgContext.newPage();
    organization.on('response', async (response) => {
      if (response.status() >= 400 && response.url().startsWith(api)) {
        const body = await response.json().catch(() => ({}));
        console.error(
          `[DT07 ${mode}] Organization HTTP`,
          response.status(),
          new URL(response.url()).pathname,
          body.code
        );
      }
    });
    try {
      await login(provider, admin, 'provider@dt07.example', true);
      await provider.goto(`${admin}/eventos`);
      await provider.getByRole('button', { name: 'Nuevo evento', exact: true }).click();
      const intake = provider.getByRole('dialog', { name: 'Nuevo evento' });
      await intake.getByLabel('Cliente', { exact: true }).click();
      await provider.getByRole('option', { name: /\[DT07\] Organización/u }).click();
      await intake.getByLabel('Nombre del evento').fill(`DT07 ${mode}`);
      await intake.getByLabel('Modalidad de acceso').click();
      await provider.getByRole('option', { name: mode === 'NOMINAL' ? /Nominal/u : /Anónimo/u }).click();
      await intake.getByLabel('Capacidad', { exact: true }).fill('3');
      await intake.getByLabel('Planner responsable').click();
      await provider.getByRole('option', { name: 'planner@dt07.example', exact: true }).click();
      await intake.getByRole('button', { name: 'Crear evento' }).click();
      await expect(provider).toHaveURL(/\/eventos\/[^/]+\/preparar\/datos$/u);
      const eventId = new URL(provider.url()).pathname.split('/')[2]!;
      await provider.getByLabel('Tipo social').click();
      await provider.getByRole('option', { name: 'OTHER', exact: true }).click();
      await provider.getByLabel('Fecha y hora', { exact: true }).fill('2035-01-01T18:00');
      await provider.getByLabel('Zona horaria').fill('America/Mexico_City');
      await provider.getByRole('button', { name: 'Guardar datos' }).click();
      await expect(provider.getByText('Datos guardados.')).toBeVisible();
      await provider.getByRole('link', { name: 'Accesos', exact: true }).click();
      await expect(provider.getByText('Hay requisitos pendientes antes de activar.')).toBeVisible();
      await expect(provider.getByRole('button', { name: 'Activar evento', exact: true })).toHaveCount(0);
      await login(organization, client, 'planner@dt07.example', false);
      await organization.goto(`${client}/eventos/${eventId}?seccion=${mode === 'NOMINAL' ? 'invitados' : 'accesos'}`);

      if (mode === 'NOMINAL') {
        await organization.getByRole('textbox', { name: /^Nombre/u }).fill('Invitado sin teléfono');
        const contactCreated = organization.waitForResponse(
          (response) => response.request().method() === 'POST' && response.url().endsWith('/contacts')
        );
        await organization.getByRole('button', { name: 'Agregar', exact: true }).click();
        const creation = await contactCreated;
        expect(creation.status(), `contact creation status: ${(await creation.json()).code ?? 'OK'}`).toBe(201);
        await expect(organization.getByRole('list', { name: 'Lista de invitados' })).toContainText(
          'Invitado sin teléfono'
        );
        await organization.getByRole('link', { name: 'Credenciales individuales' }).click();
        await organization.getByRole('button', { name: 'Emitir credencial', exact: true }).click();
        await expect(organization.getByText('Credencial vigente', { exact: true })).toBeVisible();
      } else {
        await expect(organization.getByText(/Solicita la generación del lote/u)).toBeVisible();
        await expect(organization.getByRole('link', { name: 'Invitados', exact: true })).toHaveCount(0);
        await expect(organization.getByRole('button', { name: /Generar/u })).toHaveCount(0);
        await provider.getByLabel('Cantidad de pases').fill('1');
        await provider.getByRole('button', { name: 'Generar lote', exact: true }).click();
        await expect(provider.getByText('Lote confirmado: 1 pases · folios 1–1.', { exact: true })).toBeVisible();
      }

      await provider.reload();
      await expect(provider.getByRole('button', { name: 'Activar evento', exact: true })).toBeEnabled();
      provider.once('dialog', (dialog) => dialog.accept());
      await provider.getByRole('button', { name: 'Activar evento', exact: true }).click();
      await expect(provider.getByText('El Evento quedó activo.', { exact: true })).toBeVisible();
      const authoritative = await orgContext.request.get(`${api}/events/${eventId}`);
      expect(authoritative.status()).toBe(200);
      const authoritativeEvent = await authoritative.json();
      expect(authoritativeEvent).toMatchObject({ status: 'ACTIVE', accessMode: mode, hasAccessMaterial: true });

      await organization.goto(`${client}/eventos/${eventId}?seccion=ingresos`);
      await expectOperationsFigures(organization, { activeRights: 1, entered: 0, pending: 1, availableCapacity: 2 });
      const beforeOperations = await orgContext.request.get(`${api}/events/${eventId}/access-operations`);
      expect(beforeOperations.status()).toBe(200);
      expect(await beforeOperations.json()).toMatchObject({
        eventId,
        accessMode: mode,
        capacity: 3,
        issuedHistorical: 1,
        revokedHistorical: 0,
        activeRights: 1,
        entered: 0,
        pending: 1,
        availableCapacity: 2,
        detailTotal: 1
      });

      // Use the actual downloadable SVG as a virtual camera source: jsQR still decodes pixels in CameraReader.
      await organization.goto(`${client}/eventos/${eventId}?seccion=accesos`);
      const downloadButton = organization.getByRole('button', {
        name: mode === 'NOMINAL' ? 'Descargar QR SVG' : 'Descargar SVG del folio 1',
        exact: true
      });
      const svgResponse = organization.waitForResponse((response) => response.url().endsWith('/svg'));
      const download = organization.waitForEvent('download');
      await downloadButton.click();
      const svg = await (await svgResponse).text();
      expect((await download).suggestedFilename()).toMatch(/\.svg$/u);
      await organization
        .getByRole('checkbox', {
          name: mode === 'NOMINAL' ? 'Seleccionar credencial de Invitado sin teléfono' : 'Seleccionar folio 1'
        })
        .check();
      const pdfDownload = organization.waitForEvent('download');
      await organization.getByRole('button', { name: 'Exportar seleccionados a PDF (1)', exact: true }).click();
      expect((await pdfDownload).suggestedFilename()).toMatch(/\.pdf$/u);
      await organization.getByRole('link', { name: 'Staff', exact: true }).click();
      await organization.getByLabel('Alias del acceso').fill('Puerta DT07');
      await organization.getByRole('button', { name: /Crear acceso/u }).click();
      const staffLink = organization.getByRole('link', { name: /Abrir Scanner/u });
      await expect(staffLink).toBeVisible();
      const staffUrl = await staffLink.getAttribute('href');
      expect(staffUrl?.startsWith(scanner)).toBe(true);
      const staffPage = await staffContext.newPage();
      await staffPage.addInitScript(
        ({ svg }) => {
          Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            value: async () => {
              const image = new Image();
              image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
              await image.decode();
              const canvas = document.createElement('canvas');
              canvas.width = 1200;
              canvas.height = 1200;
              const ctx = canvas.getContext('2d')!;
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, 1200, 1200);
              const scale = Math.min(1200 / image.naturalWidth, 1200 / image.naturalHeight);
              const draw = () => ctx.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
              draw();
              const stream = canvas.captureStream(10);
              setInterval(draw, 100);
              return stream;
            }
          });
        },
        { svg }
      );
      const accepted = staffPage.waitForResponse((response) =>
        response.url().endsWith(mode === 'NOMINAL' ? '/nominal-access/scan' : '/physical-passes/scan')
      );
      await staffPage.goto(staffUrl!);
      expect((await accepted).status()).toBe(200);
      await expect(staffPage.getByRole('status').filter({ hasText: /ingreso registrado/iu })).toBeVisible();
      await expect(staffPage.getByRole('button', { name: 'Siguiente escaneo', exact: true })).toBeVisible();
      await expect(staffPage.getByRole('tab', { name: 'Buscar', exact: true })).toHaveCount(0);
      expect(
        paths.filter((path) => path.endsWith(mode === 'NOMINAL' ? '/nominal-access/scan' : '/physical-passes/scan'))
      ).toHaveLength(1);

      await organization.goto(`${client}/eventos/${eventId}?seccion=ingresos`);
      await expectOperationsFigures(organization, { activeRights: 1, entered: 1, pending: 0, availableCapacity: 2 });
      const afterOperations = await orgContext.request.get(`${api}/events/${eventId}/access-operations`);
      expect(afterOperations.status()).toBe(200);
      const operation = await afterOperations.json();
      expect(operation).toMatchObject({
        eventId,
        accessMode: mode,
        activeRights: 1,
        entered: 1,
        pending: 0,
        availableCapacity: 2,
        details: [
          mode === 'NOMINAL' ? { name: 'Invitado sin teléfono', status: 'ENTERED' } : { passNumber: 1, status: 'USED' }
        ]
      });
      const aggregate = await providerContext.request.get(
        `${api}/admin/clients/${authoritativeEvent.clientId}/events/${eventId}/access-operations`
      );
      expect(aggregate.status()).toBe(200);
      const providerOperation = await aggregate.json();
      expect(providerOperation).toMatchObject({ eventId, accessMode: mode, activeRights: 1, entered: 1, pending: 0 });
      expect(providerOperation).not.toHaveProperty('details');
      expect(JSON.stringify(providerOperation)).not.toContain('Invitado sin teléfono');
      const refreshedOperations = organization.waitForResponse((response) =>
        response.url().endsWith('/access-operations')
      );
      await organization.getByRole('button', { name: 'Actualizar', exact: true }).click();
      expect((await refreshedOperations).status()).toBe(200);
      await expectOperationsFigures(organization, { activeRights: 1, entered: 1, pending: 0, availableCapacity: 2 });
      expect(
        paths.some((path) => /finance|ledger|intake-quote|commercial-quote|\/confirm$|\/check-in$/u.test(path))
      ).toBe(false);
      expect(paths.some((path) => /^\/api\/v1\/events\/[^/]+\/physical-passes\/generate$/u.test(path))).toBe(false);
      expect(paths.some((path) => /\/invitations(?:\/|$)/u.test(path))).toBe(false);

      const outsider = await browser.newContext();
      try {
        const auth = await outsider.request.post(`${api}/auth/login`, {
          headers: { Origin: client },
          data: { email: 'unassigned@dt07.example', password }
        });
        expect(auth.status()).toBe(200);
        expect((await outsider.request.get(`${api}/events/${eventId}`)).status()).toBe(404);
        expect((await outsider.request.get(`${api}/events/${eventId}/access-operations`)).status()).toBe(404);
      } finally {
        await outsider.close();
      }
    } catch (error) {
      // Diagnose UI failures without logging Staff URLs or QR material.
      console.error(`[DT07 ${mode}] Organization headings:`, await organization.getByRole('heading').allTextContents());
      console.error(`[DT07 ${mode}] Organization notices:`, await organization.getByRole('alert').allTextContents());
      throw error;
    } finally {
      await Promise.all([providerContext.close(), orgContext.close(), staffContext.close()]);
    }
  });
}

async function expectOperationsFigures(
  page: Page,
  expected: { activeRights: number; entered: number; pending: number; availableCapacity: number }
) {
  const labels = {
    activeRights: 'Accesos vigentes',
    entered: 'Ingresados',
    pending: 'Pendientes',
    availableCapacity: 'Capacidad disponible'
  } as const;
  for (const key of Object.keys(labels) as Array<keyof typeof labels>) {
    const metric = page
      .getByLabel('Cifras del evento')
      .getByText(labels[key], { exact: true })
      .locator('..')
      .locator('dd');
    await expect(metric).toHaveText(String(expected[key]));
  }
}

async function login(page: Page, url: string, email: string, provider: boolean) {
  await page.goto(`${url}/login`);
  await page.getByLabel(/Correo electr[oó]nico/u).fill(email);
  await page.getByLabel(/Contrase[nñ]a/u).fill(password);
  await page.getByRole('button', { name: provider ? 'Entrar al panel' : 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/login$/u);
}
