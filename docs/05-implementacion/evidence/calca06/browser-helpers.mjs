import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { evidence } from './fixtures.mjs';

export const api = 'http://localhost:5300/api/v1',
  admin = 'http://localhost:5374',
  clientUrl = 'http://localhost:5373',
  scannerUrl = 'http://localhost:5375';
export const redact = (value) =>
  String(value)
    .replace(/st1\.[A-Za-z0-9_-]{43}/gu, '[Staff oculto]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[database]');
export const identityHash = (seats) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        seats
          .map(({ id, label, floorplanShapeId }) => ({ id, label, floorplanShapeId }))
          .sort((a, b) => a.id.localeCompare(b.id))
      )
    )
    .digest('hex');
export const escapeRe = (value) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

export async function clientFixture(db) {
  const id = randomUUID(),
    plannerId = randomUUID(),
    email = `${plannerId}@calca.example`;
  await db.query(
    `INSERT INTO client(id,type,operating_profile,name,status,created_at,updated_at) VALUES($1,'PLANNER','MANAGED','[DEMO] Planner Elena y Mateo','ACTIVE',now(),now())`,
    [id]
  );
  await db.query(
    `INSERT INTO app_user(id,email,password_hash,role,client_id,created_at,updated_at) SELECT $1,$2,password_hash,'INDEPENDENT_PLANNER',$3,now(),now() FROM app_user WHERE email='operacion@invitaciones.example'`,
    [plannerId, email, id]
  );
  return { id, plannerId, email };
}
export async function eventFixture(db, client, name) {
  const id = randomUUID();
  await db.query(
    `INSERT INTO event(id,client_id,created_by_user_id,assigned_planner_user_id,service_id,name,status,event_date_time,time_zone,capacity,confirmation_enabled,floorplan_enabled,created_at,updated_at) SELECT $1,$2,u.id,$3,s.id,$4,'configured','2027-11-15T18:00:00Z','America/Mexico_City',150,false,true,now(),now() FROM app_user u CROSS JOIN service s WHERE u.email='operacion@invitaciones.example' AND s.code='FLYER'`,
    [id, client.id, client.plannerId, name]
  );
  return { id, base: `/admin/clients/${client.id}/events/${id}/floorplan` };
}
export function transport(request) {
  return async (method, path, data, expected = 200) => {
    const response = await request.fetch(`${api}${path}`, {
      method,
      headers: { Origin: admin, 'Idempotency-Key': randomUUID() },
      ...(data ? { data } : {})
    });
    assert.equal(response.status(), expected, redact(`${method} ${path}: ${response.status()}`));
    return expected === 204 ? undefined : response.json();
  };
}
export async function login(request, email = 'operacion@invitaciones.example') {
  return transport(request)('POST', '/auth/login', { email, password: process.env.DT07_E2E_PASSWORD });
}
export async function uploadApi(request, event, source) {
  const bytes = await readFile(`${evidence}/${source.file}`);
  const response = await request.post(`${api}${event.base}/file-assets`, {
    headers: { Origin: admin },
    multipart: {
      ...(source.sourceType === 'SVG' ? { fileType: 'FLOORPLAN_SVG' } : {}),
      file: { name: source.file.split('/').at(-1), mimeType: source.mime, buffer: bytes }
    }
  });
  assert.equal(response.status(), 201);
  return transport(request)('POST', event.base, { imageAssetId: (await response.json()).id }, 201);
}
export async function activateFixture(db, event) {
  // Only test setup: complete the existing Managed snapshot and legal transitions.
  // Activation itself is covered by the unmodified M01 harness in qa:full.
  await db.query(`UPDATE event SET status='configured' WHERE id=$1 AND status='draft'`, [event.id]);
  await db.query(`UPDATE event SET status='ready_to_activate' WHERE id=$1 AND status='configured'`, [event.id]);
  await db.query(
    `UPDATE event SET status='active',activated_at=now(),activated_service_id=service_id,activated_by_user_id=(SELECT id FROM app_user WHERE email='operacion@invitaciones.example'),activation_idempotency_key=$2 WHERE id=$1`,
    [event.id, randomUUID()]
  );
}
export async function assistantFixture(db, event) {
  const contact = randomUUID(),
    invitation = randomUUID(),
    id = randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(
      `INSERT INTO contact(id,event_id,name,whatsapp_phone_normalized,created_at,updated_at) VALUES($1,$2,'Contacto de prueba','+525500000001',now(),now())`,
      [contact, event.id]
    );
    await db.query(
      `INSERT INTO invitation(id,event_id,contact_id,invitation_token_nonce,qr_token_nonce,response_status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'CONFIRMED',now(),now())`,
      [invitation, event.id, contact, randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]
    );
    await db.query(
      `INSERT INTO assistant(id,event_id,invitation_id,name,is_primary,response_status,created_at,updated_at) VALUES($1,$2,$3,'Invitado de prueba',true,'CONFIRMED',now(),now())`,
      [id, event.id, invitation]
    );
    await db.query('COMMIT');
    return { id };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
export class TraceUi {
  constructor(page, event, viewport, record, output) {
    Object.assign(this, { page, event, viewport, record, output });
    this.host = page.getByTestId('floorplan-renderer-host');
    this.writes = [];
    page.on('request', (request) => {
      if (['POST', 'PATCH', 'DELETE'].includes(request.method()) && request.url().includes('/floorplan'))
        this.writes.push({
          method: request.method(),
          resource: new URL(request.url()).pathname.split('/floorplan')[1] || '/',
          at: performance.now()
        });
    });
  }
  get send() {
    return transport(this.page.request);
  }
  get state() {
    return () => this.send('GET', this.event.base);
  }
  async ready() {
    await expect(this.page.getByText('Guardado', { exact: true })).toBeVisible();
  }
  async open() {
    await this.page.goto(`${admin}/eventos/${this.event.id}/preparar/croquis`);
    await expect(this.host.locator('canvas').first()).toBeVisible();
  }
  async enter() {
    const start = performance.now();
    await this.page.getByRole('button', { name: 'Calcar distribución', exact: true }).click();
    await expect(this.page.getByRole('region', { name: 'Herramientas de Calca' })).toBeVisible();
    return (performance.now() - start) / 1000;
  }
  async click(point) {
    const b = await this.host.boundingBox();
    assert(b && b.width > 0 && b.height > 0);
    const x = b.x + b.width * point.x,
      y = b.y + b.height * point.y;
    assert(
      x >= 0 && x < this.viewport.width && y >= 0 && y < this.viewport.height,
      'Placement must be in the visible canvas'
    );
    if (this.viewport.width === 1024) await this.page.touchscreen.tap(x, y);
    else await this.page.mouse.click(x, y);
  }
  async details(text) {
    return this.page.locator('details').filter({ has: this.page.locator('summary').filter({ hasText: text }) });
  }
  async chooseTable(name) {
    const panel = this.page.getByRole('region', { name: 'Mesa en Calca' });
    if (await panel.isVisible()) await panel.getByRole('button', { name: 'Cancelar', exact: true }).click();
    const details = await this.details('Mesas y zonas');
    const activate = async (locator, phase) => {
      try {
        await locator.click();
      } catch (error) {
        if (error.name !== 'TimeoutError' || !error.message.includes('intercepts pointer events')) throw error;
        const count = (await this.state()).shapes.length;
        let finding = this.record.findings.find((item) => item.id === 'DENSE_NAME_LIST_OVERLAP');
        if (!finding) {
          finding = {
            id: 'DENSE_NAME_LIST_OVERLAP',
            severity: 'P1',
            problem: 'Canvas overlaps dense table-name list; pointer activation is blocked',
            occurrences: []
          };
          this.record.findings.push(finding);
        }
        const screenshot = `name-list-${count}-${this.viewport.width}-${phase}-${finding.occurrences.length}`;
        finding.occurrences.push({
          tables: count,
          viewport: this.viewport,
          phase,
          pointerTimeoutMs: 15000,
          evidence: `${screenshot}.png`,
          keyboardFallback: true
        });
        await this.capture(screenshot);
        await locator.focus();
        await locator.press('Enter');
      }
    };
    if ((await details.getAttribute('open')) === null) await activate(details.locator('summary'), 'open');
    await activate(details.getByRole('button', { name: new RegExp(`^${escapeRe(name)} ·`, 'u') }), 'select');
    await activate(details.locator('summary'), 'close');
    await expect(this.page.getByLabel('Nombre o número', { exact: true })).toHaveValue(name);
  }
  async chooseSeat(seat, table, additive = false) {
    const details = await this.details('Seleccionar lugar por nombre');
    if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
    await details
      .getByRole('button', { name: new RegExp(`^${escapeRe(seat.label)} · ${escapeRe(table.name)} ·`, 'u') })
      .click({ modifiers: additive ? ['Shift'] : [] });
    await details.locator('summary').click();
    await expect(this.page.getByRole('region', { name: 'Corrección de lugares' })).toBeVisible();
  }
  async addTable(name, point, capacity = 25) {
    const before = await this.state(),
      start = performance.now();
    await this.page
      .getByRole('region', { name: 'Herramientas de Calca' })
      .getByRole('button', { name: 'Agregar mesa', exact: true })
      .click();
    await this.click(point);
    const panel = this.page.getByRole('region', { name: 'Mesa en Calca' });
    await expect(panel).toBeVisible();
    await panel.getByLabel('Nombre o número', { exact: true }).fill(name);
    const capacityInput = panel.getByLabel('Número de lugares', { exact: true });
    if (await capacityInput.count()) await capacityInput.fill(String(capacity));
    const refresh = this.page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname.endsWith('/floorplan') &&
        response.status() === 200
    );
    await panel.getByRole('button', { name: 'Agregar mesa', exact: true }).click();
    await refresh;
    await this.ready();
    const seconds = (performance.now() - start) / 1000;
    await expect(this.page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(
      before.seatingMode === 'SEAT' ? 1 : 0
    );
    const current = await this.state();
    assert.equal(current.shapes.length, before.shapes.length + 1);
    const table = current.shapes.find((table) => table.name === name);
    assert(table);
    assert.equal(current.seats.length, before.seats.length);
    return { table, seconds };
  }
  async drag(seat, dx, dy) {
    const b = await this.host.boundingBox();
    await this.page.mouse.move(b.x + b.width * seat.x, b.y + b.height * seat.y);
    await this.page.mouse.down();
    await this.page.mouse.move(b.x + b.width * (seat.x + dx), b.y + b.height * (seat.y + dy), { steps: 10 });
    await this.page.mouse.up();
    await this.ready();
  }
  async review() {
    const start = performance.now();
    await this.page.getByRole('button', { name: 'Revisar distribución', exact: true }).click();
    await expect(this.page.getByRole('region', { name: 'Revisión de distribución' })).toBeVisible();
    return (performance.now() - start) / 1000;
  }
  async finalize() {
    const start = performance.now(),
      refresh = this.page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          new URL(response.url()).pathname.endsWith('/floorplan') &&
          response.status() === 200
      );
    await this.page
      .getByRole('region', { name: 'Revisión de distribución' })
      .getByRole('button', { name: 'Finalizar distribución', exact: true })
      .click();
    await expect(this.page.getByText('Distribución finalizada. Vista de solo lectura.', { exact: true })).toBeVisible();
    await refresh;
    await this.ready();
    return (performance.now() - start) / 1000;
  }
  async capture(name) {
    await this.page.evaluate(() => document.fonts.ready);
    const file = `${name}.png`;
    await this.page.screenshot({
      path: `${this.output}/${file}`,
      animations: 'disabled',
      mask: [this.page.locator('video')]
    });
    const metrics = await this.page.evaluate(() => {
      const host = document.querySelector('[data-testid="floorplan-renderer-host"]');
      const rect = host?.getBoundingClientRect(),
        surface = host?.parentElement?.getBoundingClientRect();
      const box = (r) => (r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null);
      return {
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
        blockingModal: [...document.querySelectorAll('.MuiModal-root .MuiBackdrop-root')].some(
          (el) => el.getClientRects().length > 0
        ),
        canvas: box(rect),
        surface: box(surface),
        surfaceFraction: surface ? (surface.width * surface.height) / (innerWidth * innerHeight) : null,
        controls: [...document.querySelectorAll('button,summary,[role=button],[role=combobox],input:not([type=file])')]
          .filter((el) => {
            const r = el.getBoundingClientRect(),
              x = r.x + r.width / 2,
              y = r.y + r.height / 2;
            if (!r.width || !r.height || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
            const hit = document.elementFromPoint(x, y);
            return hit && (el === hit || el.contains(hit));
          })
          .map((el) => {
            const r = el.getBoundingClientRect();
            return {
              label: el.getAttribute('aria-label') || el.labels?.[0]?.textContent.trim() || el.textContent.trim(),
              tag: el.tagName.toLowerCase(),
              width: r.width,
              height: r.height,
              disabled: el.disabled || false
            };
          })
      };
    });
    this.record.captures.push({
      file,
      viewport: this.viewport,
      metrics,
      sha256: createHash('sha256')
        .update(await readFile(`${this.output}/${file}`))
        .digest('hex')
    });
    assert(!metrics.horizontalOverflow, `Horizontal overflow: ${name}`);
    if (name.includes('trace') || name.includes('correct') || name.includes('review'))
      assert(!metrics.blockingModal, `Blocking modal: ${name}`);
    return metrics;
  }
}

export async function consumers({
  browser,
  db,
  client,
  event,
  assistant,
  mode,
  tables,
  seats,
  record,
  findings,
  capture,
  viewport,
  initialAssigned = false
}) {
  const planner = await browser.newContext({ viewport });
  await login(planner.request, client.email);
  const page = await planner.newPage();
  page.setDefaultTimeout(15000);
  await page.goto(`${clientUrl}/eventos/${event.id}?seccion=mesas`);
  const host = page.getByTestId('floorplan-renderer-host');
  await expect(host.locator('canvas').first()).toBeVisible();
  const scale = mode === 'SEAT' ? 1.2 ** 4 : 1;
  if (mode === 'SEAT')
    for (let index = 0; index < 4; index++)
      await page.getByRole('button', { name: 'Acercar plano', exact: true }).click();
  const target = async (index) => {
    const drawer = page.locator('.MuiDrawer-root.MuiModal-root');
    if (await drawer.count()) await page.keyboard.press('Escape');
    if (mode === 'TABLE') {
      const details = page
        .locator('details')
        .filter({ has: page.locator('summary').filter({ hasText: 'Mesas y zonas' }) });
      if ((await details.getAttribute('open')) === null) await details.locator('summary').click();
      await details.getByRole('button', { name: new RegExp(`^${escapeRe(tables[index].name)} ·`, 'u') }).click();
      await details.locator('summary').click();
      return;
    }
    const b = await host.boundingBox();
    const point =
      mode === 'TABLE'
        ? { x: tables[index].x + tables[index].width / 2, y: tables[index].y + tables[index].height / 2 }
        : seats[index];
    await host.click({ position: { x: b.width * point.x * scale, y: b.height * point.y * scale } });
  };
  const unassign = async (stage) => {
    const before = (
      await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])
    ).rows[0];
    const response = page.waitForResponse(
      (response) => response.request().method() === 'PATCH' && response.url().endsWith(`/seating/${assistant.id}`)
    );
    await page.getByRole('button', { name: 'Quitar Mesa', exact: true }).click();
    assert.equal((await response).status(), 200);
    const after = (
      await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])
    ).rows[0];
    if (mode === 'SEAT' && after.floorplan_shape_id === null && after.floorplan_seat_id !== null) {
      const authoritative = await transport(planner.request)('GET', `/events/${event.id}/floorplan`);
      const stillOccupied = authoritative.seats.find((seat) => seat.id === after.floorplan_seat_id)?.occupied;
      const failure = {
        id: 'SEAT_UNASSIGN_RETAINS_SEAT',
        severity: 'P0',
        problem:
          'Confirmed unassign clears parent TABLE but retains floorplanSeatId; persisted parent/place pair is inconsistent',
        expected: { table: null, seat: null, occupied: false },
        observed: {
          httpStatus: 200,
          tableCleared: true,
          seatRetained: true,
          apiProjectsOccupied: stillOccupied,
          sameSeatId: before.floorplan_seat_id === after.floorplan_seat_id,
          beforeHadTable: before.floorplan_shape_id !== null,
          beforeHadSeat: before.floorplan_seat_id !== null
        },
        viewport,
        stage
      };
      if (!findings.some((finding) => finding.id === failure.id)) findings.push(failure);
      if (capture) await page.screenshot({ path: `${capture}-unassign-failure.png`, animations: 'disabled' });
      record.push({
        mode,
        viewport,
        result: 'FAIL',
        assign: stage === 'final',
        move: stage === 'final',
        scannerLocalization: stage === 'final',
        unassign: false,
        failure
      });
      return false;
    }
    assert.equal(after.floorplan_shape_id, null);
    assert.equal(after.floorplan_seat_id, null);
    return true;
  };
  if (initialAssigned) {
    await target(0);
    await page.getByRole('tab', { name: /En esta mesa/u }).click();
    if (!(await unassign('initial-preassigned'))) {
      await planner.close();
      return { result: 'FAIL', finding: 'SEAT_UNASSIGN_RETAINS_SEAT' };
    }
  }
  await target(0);
  await page.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
  await page.getByRole('button', { name: /^Asignar 1 a /u }).click();
  const parent = async () =>
    (await db.query('SELECT floorplan_shape_id FROM assistant WHERE id=$1', [assistant.id])).rows[0].floorplan_shape_id;
  await expect.poll(parent).toBe(tables[0].id);
  let preciseTarget = true;
  if (mode === 'SEAT') {
    const assigned = (await db.query('SELECT floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])).rows[0]
      .floorplan_seat_id;
    preciseTarget = assigned === seats[0].id;
    if (!preciseTarget) {
      const finding = {
        id: 'DENSE_SEAT_HIT_TARGET',
        severity: 'P1',
        problem:
          'A native click at a Seat center selected a different Seat in the dense Planner layout, including after using current zoom controls',
        viewport,
        zoom: scale,
        expectedSeatSha256: createHash('sha256').update(seats[0].id).digest('hex'),
        observedSeatSha256: createHash('sha256').update(assigned).digest('hex'),
        intendedNormalizedPoint: { x: seats[0].x, y: seats[0].y }
      };
      if (!findings.some((item) => item.id === finding.id)) findings.push(finding);
      if (capture) await page.screenshot({ path: `${capture}-exact-target-failure.png`, animations: 'disabled' });
    }
  }
  await page.getByRole('tab', { name: /En esta mesa/u }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
  await page
    .getByRole('button', { name: mode === 'TABLE' ? 'Cambiar mesa de 1' : 'Cambiar lugar exacto', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', {
      exact: mode === 'SEAT',
      name:
        mode === 'TABLE'
          ? new RegExp(`^${escapeRe(tables[1].name)}`, 'u')
          : `${tables[1].name} · Lugar ${seats[1].label}`
    })
    .click();
  await expect.poll(parent).toBe(tables[1].id);
  if (capture) await page.screenshot({ path: `${capture}-planner.png`, animations: 'disabled' });
  const staff = await transport(planner.request)(
    'POST',
    `/events/${event.id}/staff-tokens`,
    { alias: 'Localización de prueba' },
    201
  );
  const scanner = await browser.newContext({ viewport });
  const scan = await scanner.newPage();
  scan.setDefaultTimeout(15000);
  await scan.goto(`${scannerUrl}/scanner/${staff.token}`);
  await scan.getByRole('tab', { name: 'Buscar', exact: true }).click();
  await scan.getByLabel('Nombre exacto del Contacto o Asistente').fill('Invitado de prueba');
  await scan.getByRole('button', { name: 'Buscar', exact: true }).click();
  await scan.getByRole('button', { name: /Invitado de prueba/u }).click();
  await expect(scan.getByText(tables[1].name, { exact: false }).first()).toBeVisible();
  if (mode === 'SEAT') await expect(scan.getByText(new RegExp(escapeRe(seats[1].label), 'u')).first()).toBeVisible();
  await scan.getByRole('tab', { name: 'Croquis', exact: true }).click();
  await expect(scan.getByRole('img', { name: 'Croquis del recinto del Evento' })).toBeVisible();
  assert.equal(
    await scan.getByRole('button', { name: /Agregar mesa|Trazar lugares|Finalizar distribución|Renumerar/u }).count(),
    0
  );
  const body = await scan.locator('body').innerText();
  assert(!body.includes('+525500000001') && !body.includes(client.email));
  const localization = await transport(scanner.request)('POST', `/scanner/${staff.token}/search`, {
    query: 'Invitado de prueba'
  });
  const minimal = localization.results[0].pendingAssistants[0];
  assert.deepEqual(Object.keys(minimal.table).sort(), ['id', 'name']);
  assert.equal(minimal.table.id, tables[1].id);
  if (mode === 'SEAT') {
    assert.deepEqual(Object.keys(minimal.seat).sort(), ['id', 'label', 'x', 'y']);
    assert.equal(minimal.seat.id, seats[1].id);
    assert.equal(minimal.seat.label, seats[1].label);
  }
  assert(!('email' in minimal) && !('whatsappPhoneNormalized' in minimal));
  if (capture)
    await scan.screenshot({
      path: `${capture}-scanner.png`,
      animations: 'disabled',
      mask: [scan.locator('video,canvas')]
    });
  await target(1);
  await page.getByRole('tab', { name: /En esta mesa/u }).click();
  const unassigned = await unassign('final');
  await scanner.close();
  await planner.close();
  if (unassigned)
    record.push({
      mode,
      assign: true,
      move: true,
      unassign: true,
      scannerLocalization: true,
      readOnlyGeometry: true,
      minimalFields: true
    });
  return {
    result: unassigned && preciseTarget ? 'PASS' : 'FAIL',
    finding: unassigned ? (preciseTarget ? undefined : 'DENSE_SEAT_HIT_TARGET') : 'SEAT_UNASSIGN_RETAINS_SEAT'
  };
}
