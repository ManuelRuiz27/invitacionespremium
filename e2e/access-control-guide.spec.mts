import { expect, test, type Page } from '@playwright/test';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { capture, type CaptureEntry } from '../scripts/access-control-guide/safe-capture.mjs';
import { runtimeHash, verifyImages } from '../scripts/access-control-guide/verify.mjs';

const admin = 'http://localhost:5374';
const client = 'http://localhost:5373';
const password = process.env.DT07_E2E_PASSWORD!;

test('UX02 real organization, both access modes, printable material and camera reception', async ({ browser }) => {
  const storage = resolve(process.env.ACCESS_GUIDE_STORAGE ?? '');
  expect(storage.startsWith(resolve('var/managed-demo') + sep)).toBe(true);
  expect(Boolean(password)).toBe(true);
  if (process.env.GUIDE_SOURCE_COMMIT) expect(process.env.GUIDE_SOURCE_COMMIT).toMatch(/^[a-f\d]{7,40}$/u);
  const stage = join(storage, 'guide');
  const inventory: CaptureEntry[] = [];
  const providerContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Mexico_City'
  });
  const salonContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: 'America/Mexico_City'
  });
  const provider = await providerContext.newPage();
  const salon = await salonContext.newPage();
  const shot = (
    page: Page,
    name: string,
    anchor: ReturnType<Page['getByRole']>,
    surface: CaptureEntry['surface'] = 'salon',
    mode: CaptureEntry['mode'] = 'NOMINAL'
  ) => capture(page, stage, name, anchor, surface, mode, inventory);
  const heading = (page: Page, name: string) => page.getByRole('heading', { name, exact: true });
  const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
  try {
    await provider.goto(`${admin}/login`);
    await shot(provider, 'admin-00-entrar', button(provider, 'Entrar al panel'), 'admin', 'AMBOS');
    await login(provider, admin, 'operacion@invitaciones.example', true);
    await provider.goto(`${admin}/clientes`);
    await button(provider, 'Crear organizacion').click();
    const dialog = provider.getByRole('dialog');
    await expect(dialog.getByLabel('Perfil operativo')).toContainText('Gestionado por InvitacionesPremium');
    await dialog.getByLabel('Nombre de la organizacion').fill('Salón Jardines del Lago');
    await dialog.getByLabel('Correo del Administrador de organizacion').fill('administracion@jardines.example');
    await dialog.getByLabel('Contraseña inicial').fill(password);
    await shot(
      provider,
      'admin-02-crear-salon',
      dialog.getByRole('button', { name: 'Crear organizacion', exact: true }),
      'admin',
      'AMBOS'
    );
    await dialog.getByRole('button', { name: 'Crear organizacion', exact: true }).click();
    await expect(provider).toHaveURL(/\/clientes\/[^/]+$/u);
    const clientId = new URL(provider.url()).pathname.split('/')[2]!;
    await shot(
      provider,
      'admin-03-preparar-salon',
      heading(provider, 'Preparar salón para control de acceso'),
      'admin',
      'AMBOS'
    );
    await button(provider, 'Agregar planner').first().click();
    await dialog.getByLabel('Correo', { exact: true }).fill('coordinacion@jardines.example');
    await dialog.getByLabel('Contraseña temporal').fill(password);
    await shot(
      provider,
      'admin-03b-responsable',
      dialog.getByRole('button', { name: 'Guardar', exact: true }),
      'admin',
      'AMBOS'
    );
    await dialog.getByRole('button', { name: 'Guardar', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(provider.getByText('coordinacion@jardines.example', { exact: true }).first()).toBeVisible();
    await salon.goto(`${client}/login`);
    await shot(salon, 'salon-00-entrar', button(salon, 'Iniciar sesión'), 'salon', 'AMBOS');
    await login(salon, client, 'coordinacion@jardines.example', false);

    for (const mode of ['NOMINAL', 'ANONYMOUS'] as const) {
      const suffix = mode === 'NOMINAL' ? '' : '-numerados';
      const eventName = mode === 'NOMINAL' ? 'Boda de Mariana y Alejandro' : 'Celebración empresarial';
      await provider.goto(`${admin}/clientes/${clientId}`);
      await provider.getByRole('link', { name: 'Crear evento', exact: true }).click();
      const intake = provider.getByRole('dialog', { name: 'Nuevo evento' });
      await intake.getByLabel('Nombre del evento').fill(eventName);
      await intake.getByLabel('Modalidad de acceso').click();
      await provider.getByRole('option', { name: mode === 'NOMINAL' ? /Nominal/u : /Anónimo/u }).click();
      await intake.getByLabel('Capacidad', { exact: true }).fill('30');
      await intake.getByLabel('Planner responsable').click();
      await provider.getByRole('option', { name: 'coordinacion@jardines.example', exact: true }).click();
      await shot(
        provider,
        `admin-04-crear-evento${suffix}`,
        intake.getByRole('button', { name: 'Crear evento' }),
        'admin',
        mode
      );
      await intake.getByRole('button', { name: 'Crear evento' }).click();
      await expect(provider).toHaveURL(/\/eventos\/[^/]+\/preparar\/datos$/u);
      const eventId = new URL(provider.url()).pathname.split('/')[2]!;
      await provider.getByLabel('Tipo social').click();
      await provider.getByRole('option', { name: 'OTHER', exact: true }).click();
      const year = new Date().getUTCFullYear() + 1;
      await provider
        .getByLabel('Fecha y hora', { exact: true })
        .fill(`${year}-11-${mode === 'NOMINAL' ? '14' : '21'}T18:00`);
      await provider.getByLabel('Zona horaria').fill('America/Mexico_City');
      await button(provider, 'Guardar datos').click();
      await expect(provider.getByText('Datos guardados.')).toBeVisible();
      await shot(provider, `admin-05-preparar-evento${suffix}`, button(provider, 'Guardar datos'), 'admin', mode);
      await provider.getByRole('link', { name: 'Accesos', exact: true }).click();
      await expect(provider.getByText('Hay requisitos pendientes antes de activar.')).toBeVisible();
      await shot(
        provider,
        `admin-06-requisitos${suffix}`,
        provider.getByText('Hay requisitos pendientes antes de activar.', { exact: true }),
        'admin',
        mode
      );
      await salon.goto(`${client}/eventos/${eventId}`);
      await shot(
        salon,
        `salon-02-resumen${suffix}`,
        salon.getByText('Solicitar activación a InvitacionesPremium', { exact: true }),
        'salon',
        mode
      );
      if (mode === 'NOMINAL') {
        await salon.getByRole('link', { name: 'Registrar invitados', exact: true }).click();
        await salon.getByRole('textbox', { name: /^Nombre/u }).fill('Sofía Navarro');
        await button(salon, 'Agregar').click();
        await expect(salon.getByRole('list', { name: 'Lista de invitados' })).toContainText('Sofía Navarro');
        await shot(salon, 'salon-03-invitados', button(salon, 'Agregar'));
        // The UI template determines the supported CSV columns.
        const download = salon.waitForEvent('download');
        await button(salon, 'Descargar plantilla').click();
        const stream = await (await download).createReadStream();
        const chunks: Buffer[] = [];
        for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
        const csvHeader = Buffer.concat(chunks)
          .toString('utf8')
          .replace(/^\uFEFF/u, '')
          .split(/\r?\n/u)[0]!;
        expect(csvHeader).toContain('name');
        await salon.locator('input[type="file"]').setInputFiles({
          name: 'invitados-jardines.csv',
          mimeType: 'text/csv',
          buffer: Buffer.from(`${csvHeader}\nDiego Torres,,\nValeria Méndez,,\nLucía Herrera,,\nAndrés Ríos,,\n`)
        });
        await expect(salon.getByText('4 registros listos para importar · 0 necesitan corrección')).toBeVisible();
        await shot(salon, 'salon-04-importar', button(salon, 'Confirmar importación'));
        await button(salon, 'Confirmar importación').click();
        await expect(salon.getByText('Invitados registrados: 5', { exact: true })).toBeVisible();
        await salon.getByRole('link', { name: 'Credenciales individuales', exact: true }).click();
        await shot(salon, 'salon-05-emitir', button(salon, 'Emitir credencial').first());
        for (let index = 0; index < 5; index++) {
          await button(salon, 'Emitir credencial').first().click();
          await expect(salon.getByText('Credencial vigente', { exact: true })).toHaveCount(index + 1);
        }
        await shot(salon, 'salon-05b-credenciales', heading(salon, 'Credenciales individuales'));
      } else {
        await provider.getByLabel('Cantidad de pases').fill('6');
        await shot(provider, 'admin-07-pases-anonimos', button(provider, 'Generar lote'), 'admin', mode);
        await button(provider, 'Generar lote').click();
        await expect(provider.getByText('Lote confirmado: 6 pases · folios 1–6.', { exact: true })).toBeVisible();
        await salon.goto(`${client}/eventos/${eventId}?seccion=accesos`);
        await button(salon, 'Revocar folio 6').click();
        await button(salon, 'Confirmar revocación').click();
        await expect(salon.getByText(/Folio 6 · Sin mesa · Revocado/u)).toBeVisible();
      }
      await salon.goto(`${client}/eventos/${eventId}?seccion=accesos`);
      await button(salon, 'Seleccionar todos los descargables').click();
      await shot(salon, `salon-06-material${suffix}`, button(salon, 'Exportar seleccionados a PDF (5)'), 'salon', mode);
      const pdf = salon.waitForEvent('download');
      await button(salon, 'Exportar seleccionados a PDF (5)').click();
      const material = await pdf;
      expect(material.suggestedFilename()).toMatch(/\.pdf$/u);
      await material.delete();
      await expect(salon.getByText('PDF preparado con los accesos seleccionados vigentes.')).toBeVisible();
      await provider.reload();
      await expect(button(provider, 'Activar evento')).toBeEnabled();
      await shot(provider, `admin-07b-listo${suffix}`, button(provider, 'Activar evento'), 'admin', mode);
      provider.once('dialog', (confirmation) => confirmation.accept());
      await button(provider, 'Activar evento').click();
      await expect(provider.getByText('El Evento quedó activo.', { exact: true })).toBeVisible();
      await shot(
        provider,
        `admin-08-evento-activo${suffix}`,
        provider.getByText('La activación ya fue realizada.', { exact: true }),
        'admin',
        mode
      );
      await salon.goto(`${client}/eventos/${eventId}?seccion=staff`);
      await salon.getByLabel('Alias del acceso').fill('Recepción principal');
      await shot(salon, `salon-09-staff${suffix}`, salon.getByRole('button', { name: /Crear acceso/u }), 'salon', mode);
      await salon.getByRole('button', { name: /Crear acceso/u }).click();
      const staffLink = salon.getByRole('link', { name: /Abrir Scanner/u });
      await expect(staffLink).toBeVisible();
      const staffUrl = (await staffLink.getAttribute('href'))!;
      await shot(salon, `salon-09b-compartir${suffix}`, button(salon, 'Copiar enlace'), 'salon', mode);
      await button(salon, 'Ocultar secreto').click();
      await salon.goto(`${client}/eventos/${eventId}?seccion=accesos`);
      const svgResponse = salon.waitForResponse((response) => response.url().endsWith('/svg'));
      const svgDownload = salon.waitForEvent('download');
      await button(salon, mode === 'NOMINAL' ? 'Descargar QR SVG' : 'Descargar SVG del folio 1')
        .first()
        .click();
      const svg = await (await svgResponse).text();
      await (await svgDownload).delete();
      const staffContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        timezoneId: 'America/Mexico_City'
      });
      try {
        const scanner = await staffContext.newPage();
        // Only camera hardware is substituted: real SVG pixels go through the product's jsQR reader and real API.
        await scanner.addInitScript(
          ({ svg }) => {
            Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
              value: async () => {
                const image = new Image();
                image.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 1200;
                const ctx = canvas.getContext('2d')!;
                const draw = () => {
                  ctx.fillStyle = '#fff';
                  ctx.fillRect(0, 0, 1200, 1200);
                  if ((window as Window & { guideShowQr?: boolean }).guideShowQr) {
                    const scale = Math.min(1200 / image.naturalWidth, 1200 / image.naturalHeight);
                    ctx.drawImage(image, 0, 0, image.naturalWidth * scale, image.naturalHeight * scale);
                  }
                };
                draw();
                setInterval(draw, 100);
                return canvas.captureStream(10);
              }
            });
          },
          { svg }
        );
        await scanner.goto(staffUrl);
        await expect(scanner.locator('video')).toBeVisible();
        await expect
          .poll(() => scanner.locator('video').evaluate((video: HTMLVideoElement) => video.readyState))
          .toBeGreaterThanOrEqual(2);
        await shot(
          scanner,
          `salon-10-scanner${suffix}`,
          scanner.getByRole('tab', { name: 'Scanner', exact: true }),
          'scanner',
          mode
        );
        await scanner.evaluate(() => {
          (window as Window & { guideShowQr?: boolean }).guideShowQr = true;
        });
        await expect(scanner.getByRole('status').filter({ hasText: /ingreso registrado/iu })).toBeVisible();
        await shot(scanner, `salon-11-ingreso${suffix}`, button(scanner, 'Siguiente escaneo'), 'scanner', mode);
      } finally {
        await staffContext.close();
      }
      await salon.goto(`${client}/eventos/${eventId}?seccion=ingresos`);
      const metrics = salon.getByLabel('Cifras del evento');
      await expect(metrics.getByText('Ingresados', { exact: true }).locator('..').locator('dd')).toHaveText('1');
      await expect(metrics.getByText('Pendientes', { exact: true }).locator('..').locator('dd')).toHaveText('4');
      await shot(salon, `salon-12-aforo${suffix}`, metrics, 'salon', mode);
      if (mode === 'ANONYMOUS') {
        await salon.goto(`${client}/eventos/${eventId}?seccion=accesos`);
        await shot(salon, 'salon-07-pases', heading(salon, 'Pases físicos'), 'salon', mode);
      }
      await provider.goto(`${admin}/eventos/${eventId}`);
      await shot(
        provider,
        `admin-09-aforo${suffix}`,
        provider.getByRole('region', { name: 'Ingresos y aforo', exact: true }),
        'admin',
        mode
      );
    }
    await provider.goto(`${admin}/clientes`);
    await expect(provider.getByText('Salón Jardines del Lago', { exact: true })).toBeVisible();
    await shot(provider, 'admin-01-clientes', button(provider, 'Crear organizacion'), 'admin', 'AMBOS');
    await salon.goto(`${client}/eventos`);
    await expect(salon.getByText('Boda de Mariana y Alejandro', { exact: true })).toBeVisible();
    await expect(salon.getByText('Celebración empresarial', { exact: true })).toBeVisible();
    await shot(
      salon,
      'salon-01-eventos',
      salon.getByText('Boda de Mariana y Alejandro', { exact: true }),
      'salon',
      'AMBOS'
    );
    // Exercise the organization administrator's real scope as well, without impersonation.
    const orgAdmin = await browser.newContext();
    try {
      const page = await orgAdmin.newPage();
      await login(page, client, 'administracion@jardines.example', false);
      await expect(page.getByText('Celebración empresarial', { exact: true })).toBeVisible();
    } finally {
      await orgAdmin.close();
    }
    await writeFile(
      join(stage, 'inventory.json'),
      JSON.stringify(
        {
          version: 1,
          sourceCommit: process.env.GUIDE_SOURCE_COMMIT,
          runtimeSha256: await runtimeHash(),
          captures: inventory
        },
        null,
        2
      ) + '\n'
    );
    await verifyImages(stage);
    const target = resolve('docs/05-implementacion/evidence/m02-b01-ux02');
    await mkdir(target, { recursive: true });
    for (const entry of inventory as { file: string }[]) await cp(join(stage, entry.file), join(target, entry.file));
    await writeFile(join(target, 'inventory.json'), await readFile(join(stage, 'inventory.json')));
  } finally {
    await providerContext.close();
    await salonContext.close();
  }
});

async function login(page: Page, origin: string, email: string, isAdmin: boolean) {
  await page.goto(`${origin}/login`);
  await page.getByLabel(/Correo electr[oó]nico/u).fill(email);
  await page.getByLabel(/Contrase[nñ]a/u).fill(password);
  await page.getByRole('button', { name: isAdmin ? 'Entrar al panel' : 'Iniciar sesión', exact: true }).click();
  await expect(page).not.toHaveURL(/\/login$/u);
}
