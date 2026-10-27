import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import sharp from 'sharp';

const api = 'http://localhost:5300/api/v1';
const admin = 'http://localhost:5374';
const client = 'http://localhost:5373';
const scanner = 'http://localhost:5375';
const password = process.env.DT07_E2E_PASSWORD!;
const requireScanner = createRequire(join(process.cwd(), 'apps/scanner/package.json'));
const decodeQr = requireScanner('jsqr') as (
  pixels: Uint8ClampedArray,
  width: number,
  height: number
) => { data: string } | null;

for (const mode of ['NOMINAL', 'ANONYMOUS'] as const) {
  test(`UX01 ${mode}: salon onboarding → contextual intake → activation → material → Staff camera → access counters`, async ({
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
      const suffix = randomUUID();
      const salonName = `UX01 ${mode} ${suffix}`;
      const plannerEmail = `planner-${suffix}@ux01.example`;
      await provider.setViewportSize({ width: 390, height: 844 });
      await provider.goto(`${admin}/clientes`);
      await provider.getByRole('button', { name: 'Crear organizacion', exact: true }).click();
      const organizationDialog = provider.getByRole('dialog');
      await expect(organizationDialog.getByLabel('Perfil operativo')).toContainText(
        'Gestionado por InvitacionesPremium'
      );
      await organizationDialog.getByLabel('Nombre de la organizacion').fill(salonName);
      await organizationDialog
        .getByLabel('Correo del Administrador de organizacion')
        .fill(`admin-${suffix}@ux01.example`);
      await organizationDialog.getByLabel('Contraseña inicial').fill(password);
      await organizationDialog.getByRole('button', { name: 'Crear organizacion', exact: true }).click();
      await expect(provider).toHaveURL(/\/clientes\/[^/]+$/u);
      const clientId = new URL(provider.url()).pathname.split('/')[2]!;
      await expect(provider.getByRole('heading', { name: 'Preparar salón para control de acceso' })).toBeVisible();
      await expect(provider.getByRole('heading', { name: 'Finanzas', exact: true })).toHaveCount(0);
      await expect(provider.getByRole('link', { name: 'Crear evento', exact: true })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
      await provider.getByRole('button', { name: 'Agregar planner', exact: true }).first().click();
      const plannerDialog = provider.getByRole('dialog');
      await plannerDialog.getByLabel('Correo', { exact: true }).fill(plannerEmail);
      await plannerDialog.getByLabel('Contraseña temporal').fill(password);
      await plannerDialog.getByRole('button', { name: 'Guardar', exact: true }).click();
      await expect(plannerDialog).toHaveCount(0);
      await expect(provider.getByText(plannerEmail, { exact: true }).first()).toBeVisible();
      await provider.getByRole('link', { name: 'Crear evento', exact: true }).click();
      const intake = provider.getByRole('dialog', { name: 'Nuevo evento' });
      await expect(intake.getByLabel('Cliente', { exact: true })).toContainText(salonName);
      await expect(intake.getByLabel('Servicio', { exact: true })).toContainText('Control de acceso');
      await intake.getByLabel('Nombre del evento').fill(`DT07 ${mode}`);
      await intake.getByLabel('Modalidad de acceso').click();
      await provider.getByRole('option', { name: mode === 'NOMINAL' ? /Nominal/u : /Anónimo/u }).click();
      await intake.getByLabel('Capacidad', { exact: true }).fill('3');
      await intake.getByLabel('Planner responsable').click();
      await provider.getByRole('option', { name: plannerEmail, exact: true }).click();
      await intake.getByRole('button', { name: 'Crear evento' }).click();
      await expect(provider).toHaveURL(/\/eventos\/[^/]+\/preparar\/datos$/u);
      const eventId = new URL(provider.url()).pathname.split('/')[2]!;
      expect(new URL(provider.url()).searchParams.has('clientId')).toBe(false);
      await provider.getByLabel('Tipo social').click();
      await provider.getByRole('option', { name: 'OTHER', exact: true }).click();
      await provider.getByLabel('Fecha y hora', { exact: true }).fill('2035-01-01T18:00');
      await provider.getByLabel('Zona horaria').fill('America/Mexico_City');
      await provider.getByRole('button', { name: 'Guardar datos' }).click();
      await expect(provider.getByText('Datos guardados.')).toBeVisible();
      await provider.getByRole('link', { name: 'Accesos', exact: true }).click();
      await expect(provider.getByText('Hay requisitos pendientes antes de activar.')).toBeVisible();
      await expect(provider.getByRole('button', { name: 'Activar evento', exact: true })).toHaveCount(0);
      await login(organization, client, plannerEmail, false);
      await organization.setViewportSize({ width: 390, height: 844 });
      await organization.goto(`${client}/eventos/${eventId}`);
      await expect(organization.getByText('Solicitar activación a InvitacionesPremium', { exact: true })).toBeVisible();
      if (mode === 'NOMINAL') {
        await expect(organization.getByRole('link', { name: 'Registrar invitados', exact: true })).toBeVisible();
      } else {
        await expect(
          organization.getByText('Esperar la generación de lotes por InvitacionesPremium', { exact: true })
        ).toBeVisible();
      }
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
        await expect(organization.getByText('Invitados registrados: 1', { exact: true })).toBeVisible();
        await expect(
          organization.getByText('Espacios restantes para registrar invitados: 2', { exact: true })
        ).toBeVisible();
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
      await expect(provider.getByText('La activación ya fue realizada.', { exact: true })).toBeVisible();
      const authoritative = await orgContext.request.get(`${api}/events/${eventId}`);
      expect(authoritative.status()).toBe(200);
      const authoritativeEvent = await authoritative.json();
      expect(authoritativeEvent).toMatchObject({
        clientId,
        status: 'ACTIVE',
        accessMode: mode,
        hasAccessMaterial: true
      });

      await provider.goto(`${admin}/eventos/${eventId}`);
      await expect(provider.getByText(plannerEmail, { exact: true })).toBeVisible();
      await expect(provider.getByText(mode === 'NOMINAL' ? 'Nominal' : 'Anónimo', { exact: true })).toBeVisible();
      await expect(provider.getByText('Confirmaciones', { exact: true })).toHaveCount(0);
      await provider.goto(`${admin}/eventos`);
      const eventRow = provider.getByRole('row').filter({ hasText: `DT07 ${mode}` });
      await expect(eventRow).toContainText(salonName);
      await expect(eventRow).toContainText('Control de acceso');
      await expect(eventRow).toContainText(mode === 'NOMINAL' ? 'Nominal' : 'Anónimo');
      await expect(eventRow).not.toContainText(authoritativeEvent.assignedPlannerUserId);

      await organization.goto(`${client}/eventos/${eventId}`);
      await expect(organization.getByRole('link', { name: 'Crear Staff', exact: true })).toBeVisible();

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
      const materialCheckbox = organization.getByRole('checkbox', {
        name: mode === 'NOMINAL' ? 'Seleccionar credencial de Invitado sin teléfono' : 'Seleccionar folio 1'
      });
      await organization.getByRole('button', { name: 'Seleccionar todos los descargables', exact: true }).click();
      await expect(materialCheckbox).toBeChecked();
      await organization.getByRole('button', { name: 'Limpiar selección', exact: true }).click();
      await expect(materialCheckbox).not.toBeChecked();
      await organization.getByRole('button', { name: 'Seleccionar todos los descargables', exact: true }).click();
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
      const submittedKeys: Array<string | undefined> = [];
      let dropCommittedResponse = true;
      await staffPage.route(`**/${mode === 'NOMINAL' ? 'nominal-access' : 'physical-passes'}/scan`, async (route) => {
        submittedKeys.push(route.request().headers()['idempotency-key']);
        if (dropCommittedResponse) {
          dropCommittedResponse = false;
          // Real server mutation, followed by a lost response. No response body is fabricated.
          const committed = await route.fetch();
          expect(committed.status()).toBe(200);
          await route.abort('connectionreset');
        } else await route.continue();
      });
      await staffPage.goto(staffUrl!);
      const retry = staffPage.getByRole('button', { name: 'Reintentar el mismo ingreso', exact: true });
      await expect(retry).toBeVisible();
      await expect(staffPage.getByRole('button', { name: 'Siguiente escaneo', exact: true })).toHaveCount(0);
      const uncertainSnapshot = await orgContext.request.get(`${api}/events/${eventId}/access-operations`);
      expect((await uncertainSnapshot.json()).entered).toBe(1);
      await retry.click();
      expect((await accepted).status()).toBe(200);
      expect(submittedKeys).toHaveLength(2);
      expect(Boolean(submittedKeys[0])).toBe(true);
      expect(new Set(submittedKeys).size).toBe(1);
      await expect(staffPage.getByRole('status').filter({ hasText: /ingreso registrado/iu })).toBeVisible();
      await expect(staffPage.getByRole('button', { name: 'Siguiente escaneo', exact: true })).toBeVisible();
      await expect(staffPage.getByRole('tab', { name: 'Buscar', exact: true })).toHaveCount(0);
      expect(
        paths.filter((path) => path.endsWith(mode === 'NOMINAL' ? '/nominal-access/scan' : '/physical-passes/scan'))
      ).toHaveLength(2);

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

test('DT09 same Organization: CSV/SEAT nominal and TABLE anonymous, two readers, reversal, reissue and terminal gates', async ({
  browser
}) => {
  const provider = await browser.newContext(),
    organization = await browser.newContext(),
    outsider = await browser.newContext();
  try {
    for (const [context, email] of [
      [provider, 'provider@dt07.example'],
      [organization, 'planner@dt07.example'],
      [outsider, 'unassigned@dt07.example']
    ] as const)
      await pilotPost(context.request, '/auth/login', { email, password }, 200);
    const planner = await (await organization.request.get(`${api}/auth/me`)).json();
    const previousPlanner = await (await outsider.request.get(`${api}/auth/me`)).json();
    const nominal = await createPilotEvent('NOMINAL'),
      anonymous = await createPilotEvent('ANONYMOUS');
    expect(nominal.clientId).toBe(anonymous.clientId);
    const events = [nominal, anonymous];
    const materials: Array<{
      eventId: string;
      mode: 'NOMINAL' | 'ANONYMOUS';
      token: string;
      oldToken: string;
      staff: string[];
      subjectId: string;
    }> = [];
    for (const event of events) {
      const mode = event.accessMode as 'NOMINAL' | 'ANONYMOUS';
      const base = `/admin/clients/${planner.clientId}/events/${event.id}`;
      const png = await sharp({ create: { width: 500, height: 500, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer();
      const upload = await provider.request.post(`${api}${base}/floorplan/file-assets`, {
        headers: { Origin: admin },
        multipart: { file: { name: 'pilot.png', mimeType: 'image/png', buffer: png } }
      });
      expect(upload.status()).toBe(201);
      const asset = await upload.json();
      await pilotPost(provider.request, `${base}/floorplan`, { imageAssetId: asset.id }, 201);
      const table = await pilotPost(
        provider.request,
        `${base}/floorplan/shapes`,
        {
          kind: 'TABLE',
          geometry: 'RECTANGLE',
          name: 'Recepción',
          capacity: 3,
          x: 0.2,
          y: 0.2,
          width: 0.4,
          height: 0.3,
          rotation: 0
        },
        201
      );
      let subjectId: string, oldToken: string, token: string;
      if (mode === 'NOMINAL') {
        await pilotPatch(provider.request, `${base}/floorplan/seating-mode`, { seatingMode: 'SEAT' });
        const seats = [];
        for (const label of ['1', '2'])
          seats.push(
            await pilotPost(
              provider.request,
              `${base}/floorplan/shapes/${table.id}/seats`,
              { label, x: Number(label) / 4, y: 0.4 },
              201
            )
          );
        const preview = await organization.request.post(`${api}/events/${event.id}/contacts/import/preview`, {
          headers: { Origin: client },
          multipart: {
            file: {
              name: 'pilot.csv',
              mimeType: 'text/csv',
              buffer: Buffer.from(
                'name,whatsapp_phone,group\nNombre repetido,,Familia\nNombre repetido,+525512345678,Familia\n'
              )
            }
          }
        });
        expect(preview.status()).toBe(201);
        const parsed = await preview.json();
        expect(parsed).toMatchObject({ validRows: 2, invalidRows: 0 });
        const commitKey = randomUUID();
        const committed = await pilotPost(
          organization.request,
          `/events/${event.id}/contacts/import/commit`,
          { previewId: parsed.previewId },
          200,
          commitKey
        );
        expect(
          await pilotPost(
            organization.request,
            `/events/${event.id}/contacts/import/commit`,
            { previewId: parsed.previewId },
            200,
            commitKey
          )
        ).toEqual(committed);
        const contacts = await (await organization.request.get(`${api}/events/${event.id}/contacts`)).json();
        expect(contacts).toHaveLength(2);
        expect(new Set(contacts.map((contact: { assistantId: string }) => contact.assistantId)).size).toBe(2);
        const credentials = [];
        for (const contact of contacts)
          credentials.push(
            await pilotPost(
              organization.request,
              `/events/${event.id}/nominal-access-credentials/assistants/${contact.assistantId}/issue`,
              {},
              201
            )
          );
        await pilotPost(
          organization.request,
          `/events/${event.id}/seating/assign-seats`,
          {
            assignments: contacts.map((contact: { assistantId: string }, index: number) => ({
              assistantId: contact.assistantId,
              seatId: seats[index]!.id
            }))
          },
          201
        );
        subjectId = credentials[0]!.assistantId;
        oldToken = await pilotQr(
          organization.request,
          `/events/${event.id}/nominal-access-credentials/${credentials[0]!.id}/svg`
        );
        await pilotPost(
          organization.request,
          `/events/${event.id}/nominal-access-credentials/${credentials[0]!.id}/revoke`,
          { revocationReasonCode: 'PILOT_REPLACEMENT' },
          200
        );
        const replacement = await pilotPost(
          organization.request,
          `/events/${event.id}/nominal-access-credentials/assistants/${subjectId}/issue`,
          {},
          201
        );
        token = await pilotQr(
          organization.request,
          `/events/${event.id}/nominal-access-credentials/${replacement.id}/svg`
        );
      } else {
        const batch = await pilotPost(
          provider.request,
          `${base}/physical-passes/generate`,
          { quantity: 2, tableShapeId: table.id },
          200
        );
        const first = batch.passes[0];
        oldToken = await pilotQr(organization.request, `/events/${event.id}/physical-passes/${first.id}/svg`);
        await pilotPost(
          organization.request,
          `/events/${event.id}/physical-passes/${first.id}/revoke`,
          { revocationReasonCode: 'PILOT_REPLACEMENT' },
          200
        );
        const replacement = await pilotPost(
          provider.request,
          `${base}/physical-passes/generate`,
          { quantity: 1, tableShapeId: table.id },
          200
        );
        expect(replacement.passes[0].passNumber).toBe(3);
        const history = await (await organization.request.get(`${api}/events/${event.id}/physical-passes`)).json();
        expect(history.map((pass: { passNumber: number; status: string }) => [pass.passNumber, pass.status])).toEqual([
          [1, 'REVOKED'],
          [2, 'UNUSED'],
          [3, 'UNUSED']
        ]);
        subjectId = replacement.passes[0].id;
        token = await pilotQr(organization.request, `/events/${event.id}/physical-passes/${subjectId}/svg`);
      }
      const readiness = await (await provider.request.get(`${api}${base}/access-readiness`)).json();
      expect(readiness).toMatchObject({ complete: true, activeMaterialCount: 2 });
      const prepared = await (await organization.request.get(`${api}/events/${event.id}`)).json();
      expect(prepared.status).toBe('READY_TO_ACTIVATE');
      await pilotPost(provider.request, `${base}/activate`, {}, 200);
      const staff = [];
      for (const alias of ['Puerta 1', 'Puerta 2'])
        staff.push(
          (await pilotPost(organization.request, `/events/${event.id}/staff-tokens`, { alias }, 201)).token as string
        );
      materials.push({ eventId: event.id as string, mode, token, oldToken, staff, subjectId });
    }
    for (const material of materials) {
      const { eventId, mode, token, oldToken, staff } = material;
      const suffix = mode === 'NOMINAL' ? 'nominal-access' : 'physical-passes';
      const scan = (qrToken: string, reader: number, key = randomUUID()) =>
        organization.request.post(`${api}/scanner/${staff[reader]}/${suffix}/scan`, {
          headers: { Origin: client, 'Idempotency-Key': key },
          data: { qrToken }
        });
      expect((await scan(oldToken, 0)).status()).toBe(404);
      const foreign = materials.find((item) => item.eventId !== eventId)!;
      expect((await scan(foreign.token, 0)).status()).toBe(404);
      const key = randomUUID();
      const results = await Promise.all([scan(token, 0, key), scan(token, 1)]);
      expect(results.map((response) => response.status()).sort()).toEqual([200, 409]);
      const successful = await results.find((response) => response.status() === 200)!.json();
      if (results[0]!.status() === 200) expect(await (await scan(token, 0, key)).json()).toEqual(successful);
      const panel = await organization.newPage();
      await panel.goto(`${client}/eventos/${eventId}?seccion=ingresos`);
      await expectOperationsFigures(panel, { activeRights: 2, entered: 1, pending: 1, availableCapacity: 1 });
      if (mode === 'NOMINAL') {
        expect(successful.seat).not.toBeNull();
        await pilotPost(organization.request, `/events/${eventId}/check-ins/${successful.checkInId}/revert`, {}, 200);
        await panel.reload();
        await expectOperationsFigures(panel, { activeRights: 2, entered: 0, pending: 2, availableCapacity: 1 });
        expect((await scan(token, 0)).status()).toBe(200);
      }
      const snapshot = await (await organization.request.get(`${api}/events/${eventId}/access-operations`)).json();
      expect(snapshot).toMatchObject({
        issuedHistorical: 3,
        revokedHistorical: 1,
        activeRights: 2,
        entered: 1,
        pending: 1
      });
      expect(snapshot.tables[0]).toMatchObject({ activeRights: 2, entered: 1, pending: 1 });
      const providerSnapshot = await (
        await provider.request.get(`${api}/admin/clients/${planner.clientId}/events/${eventId}/access-operations`)
      ).json();
      expect(providerSnapshot).not.toHaveProperty('details');
      expect(JSON.stringify(snapshot)).not.toMatch(/whatsapp|phone|nonce|signature|qrToken|staffToken/iu);
      expect((await provider.request.get(`${api}/events/${eventId}/access-operations`)).status()).toBe(403);
      expect((await outsider.request.get(`${api}/events/${eventId}/access-operations`)).status()).toBe(404);
      expect(
        (
          await outsider.request.post(`${api}/events/${eventId}/staff-tokens`, {
            headers: { Origin: client },
            data: { alias: 'Forbidden' }
          })
        ).status()
      ).toBe(404);
      // Reassignment revokes the previous Planner immediately, including cached/detail reads and material.
      await pilotPatch(provider.request, `/admin/clients/${planner.clientId}/events/${eventId}/assignment`, {
        assignedPlannerUserId: previousPlanner.id
      });
      expect((await organization.request.get(`${api}/events/${eventId}/access-operations`)).status()).toBe(404);
      await pilotPatch(provider.request, `/admin/clients/${planner.clientId}/events/${eventId}/assignment`, {
        assignedPlannerUserId: planner.id
      });
      await pilotPost(organization.request, `/events/${eventId}/${mode === 'NOMINAL' ? 'close' : 'cancel'}`, {}, 200);
      const terminalScan = await scan(token, 0);
      // Nominal resolves expired Staff first; anonymous preserves its Event-first gate.
      expect(terminalScan.status()).toBe(mode === 'NOMINAL' ? 401 : 409);
      expect(await terminalScan.json()).toMatchObject({
        code: mode === 'NOMINAL' ? 'STAFF_TOKEN_INVALID_OR_EXPIRED' : 'STAFF_EVENT_NOT_OPERATIONAL'
      });
      expect((await organization.request.get(`${api}/scanner/${staff[0]}/session`)).status()).toBe(401);
      const terminal = await (await organization.request.get(`${api}/events/${eventId}/access-operations`)).json();
      expect(terminal).toMatchObject({ entered: 1, eventStatus: mode === 'NOMINAL' ? 'CLOSED' : 'CANCELLED' });
      await panel.close();
    }
    async function createPilotEvent(accessMode: 'NOMINAL' | 'ANONYMOUS') {
      const event = await pilotPost(
        provider.request,
        `/admin/clients/${planner.clientId}/events/managed`,
        {
          name: `DT09 ${accessMode}`,
          serviceCode: 'ACCESS_CONTROL',
          accessMode,
          capacity: 3,
          assignedPlannerUserId: planner.id
        },
        201
      );
      await pilotPatch(provider.request, `/admin/clients/${planner.clientId}/events/${event.id}`, {
        socialType: 'OTHER',
        eventDateTime: '2035-01-01T18:00:00Z',
        timeZone: 'America/Mexico_City',
        floorplanEnabled: true
      });
      return event;
    }
  } finally {
    await Promise.all([provider.close(), organization.close(), outsider.close()]);
  }
});

async function pilotPost(request: APIRequestContext, path: string, data: object, status: number, key = randomUUID()) {
  const response = await request.post(`${api}${path}`, { headers: { Origin: client, 'Idempotency-Key': key }, data });
  const body = await response.json();
  expect(response.status(), `pilot HTTP ${status}, domain code ${body.code ?? 'OK'}`).toBe(status);
  return body;
}
async function pilotPatch(request: APIRequestContext, path: string, data: object) {
  const response = await request.patch(`${api}${path}`, { headers: { Origin: client }, data });
  const body = await response.json();
  expect(response.status(), `pilot PATCH domain code ${body.code ?? 'OK'}`).toBe(200);
  return body;
}
async function pilotQr(request: APIRequestContext, path: string) {
  const response = await request.get(`${api}${path}`);
  expect(response.status()).toBe(200);
  const svg = await response.body();
  const { data, info } = await sharp(svg, { density: 160 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const decoded = decodeQr(new Uint8ClampedArray(data), info.width, info.height);
  expect(Boolean(decoded)).toBe(true);
  return decoded!.data;
}
