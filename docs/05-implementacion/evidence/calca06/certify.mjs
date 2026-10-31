import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import os from 'node:os';
import { chromium, expect } from '@playwright/test';
import { runtimeHash } from '../../../../scripts/access-control-guide/verify.mjs';
import { createFixtures, evidence, placements, seatPosition } from './fixtures.mjs';
import {
  api,
  admin,
  TraceUi,
  clientFixture,
  eventFixture,
  assistantFixture,
  activateFixture,
  transport,
  login,
  uploadApi,
  consumers,
  identityHash,
  redact
} from './browser-helpers.mjs';

const attempt = process.env.CALCA06_ATTEMPT ?? 'initial';
assert(/^[a-z0-9-]+$/u.test(attempt));
const scope = process.env.CALCA06_SCOPE ?? 'all';
assert(
  [
    'all',
    'tablet-support',
    'support',
    'svg-recovery-restrictions',
    'recovery-restrictions',
    'restrictions',
    'capacity'
  ].includes(scope)
);
const output = `${evidence}/attempts/${attempt}`;
await mkdir(output, { recursive: true });
const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }),
  browser = await chromium.launch();
const result = {
  attempt,
  scope,
  startedAt: new Date().toISOString(),
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  runtimeSha256: await runtimeHash(),
  certificationScripts: Object.fromEntries(
    await Promise.all(
      ['certify.mjs', 'browser-helpers.mjs', 'fixtures.mjs', 'run.mjs'].map(async (file) => [
        file,
        createHash('sha256')
          .update((await readFile(`${evidence}/${file}`, 'utf8')).replaceAll('\r\n', '\n'))
          .digest('hex')
      ])
    )
  ),
  environment: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0].model,
    logicalCpus: os.cpus().length,
    memoryBytes: os.totalmem(),
    browser: browser.version(),
    network: 'unthrottled loopback',
    physicalDevice: false
  },
  method:
    'Actual Chromium UI, Admin/Planner/Scanner/API and isolated PostgreSQL. Fictitious fixtures, serialized writes. Screenshots are native viewport captures; timing is automation wall time, not a human study. No exactly-once guarantee.',
  scenarios: [],
  timings: [],
  captures: [],
  consumers: [],
  findings: [],
  failures: []
};
let currentPage,
  currentCase = 'setup',
  fixtureAssistants = 0;
const record = async () =>
  writeFile(`${output}/results.json`, JSON.stringify({ ...result, fixtureAssistants }, null, 2) + '\n');
const mark = (id, checks) => {
  const row = { id, result: 'PASS', ...checks };
  result.scenarios.push(row);
  console.log(`${row.result} ${id}`);
};
try {
  await db.connect();
  result.environment.postgresql = (
    await db.query("SELECT current_setting('server_version') AS version")
  ).rows[0].version;
  const sources = await createFixtures();
  await db.query(
    `INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'FLYER',true,now(),now()) ON CONFLICT(code) DO NOTHING`,
    [randomUUID()]
  );
  const client = await clientFixture(db);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ].filter((viewport) => scope === 'all' || (scope === 'tablet-support' && viewport.width === 1024)))
    for (const source of sources.filter((source) => source.key !== 'svg-100')) {
      currentCase = `${source.key}-${viewport.width}`;
      console.log(`START ${currentCase}`);
      const context = await browser.newContext({
        viewport,
        hasTouch: viewport.width === 1024,
        reducedMotion: 'reduce'
      });
      await login(context.request);
      const event = await eventFixture(db, client, `Boda de Elena y Mateo · ${source.key}`);
      const page = await context.newPage();
      currentPage = page;
      page.setDefaultTimeout(15000);
      const ui = new TraceUi(page, event, viewport, result, output);
      await page.goto(`${admin}/eventos/${event.id}/preparar/croquis`);
      await expect(page.getByRole('button', { name: 'Subir plano', exact: true })).toBeVisible();
      await page.locator('input[type=file]').setInputFiles(`${evidence}/${source.file}`);
      await expect(ui.host.locator('canvas').first()).toBeVisible();
      if (source.key === 'landscape') await ui.capture(`${currentCase}-01-entry`);
      const enterSeconds = await ui.enter();
      await expect(page.getByRole('button', { name: 'Manual', exact: true })).toBeEnabled();
      const mapping = page.getByRole('button', { name: 'Mapeo SVG', exact: true });
      if (source.sourceType === 'SVG') {
        await expect(mapping).toBeEnabled();
        const meta = await ui.send('GET', `${event.base}/svg-source`);
        assert.equal(meta.selectableElements.length, 200);
        await mapping.click();
        await expect(page.getByRole('heading', { name: 'Mapeo SVG', exact: true })).toBeVisible();
        await ui.enter();
      } else {
        await expect(mapping).toBeDisabled();
        assert.equal(await mapping.getAttribute('title'), 'Disponible con un plano SVG');
      }
      await page.getByRole('button', { name: 'Manual', exact: true }).click();
      if (viewport.width === 1024) {
        await expect(page.getByRole('heading', { name: 'Agregar mesa o zona', exact: true })).toBeVisible();
        await page.keyboard.press('Escape');
      } else await expect(page.getByRole('heading', { name: 'Construcción manual' })).toBeVisible();
      await ui.enter();
      const count = source.key === 'landscape' ? 150 : 50,
        tables = [];
      let createSeconds;
      for (let index = 0; index < count / 25; index++) {
        const made = await ui.addTable(`Mesa ${index + 1}`, placements[index]);
        tables.push(made.table);
        if (index === 0) createSeconds = made.seconds;
      }
      assert.equal((await ui.state()).seats.length, 0, 'TABLE creation must not create Seats');
      await page
        .getByRole('region', { name: 'Mesa en Calca' })
        .getByRole('button', { name: 'Cancelar', exact: true })
        .click();
      const options = page
        .locator('details')
        .filter({ has: page.locator('summary').filter({ hasText: 'Opciones del croquis' }) });
      await options.locator('summary').click();
      await page.getByRole('combobox', { name: 'Acomodo' }).click();
      await page.getByRole('option', { name: 'Por lugar exacto', exact: true }).click();
      await ui.ready();
      await options.locator('summary').click();
      assert.equal((await ui.state()).seatingMode, 'SEAT');
      let first10Seconds, table25Seconds;
      for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
        const table = tables[tableIndex];
        await ui.chooseTable(table.name);
        const start = performance.now();
        await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
        for (let index = 0; index < 25; index++) {
          await ui.click(seatPosition(placements[tableIndex], index));
          await expect(page.getByText(`${index + 1} lugares confirmados`, { exact: true })).toBeVisible();
          if (index === 9 && tableIndex === 0) first10Seconds = (performance.now() - start) / 1000;
        }
        if (tableIndex === 0) table25Seconds = (performance.now() - start) / 1000;
        const details = await ui.details('Seleccionar lugar por nombre');
        await details.locator('summary').click();
        await expect(details.getByRole('button').first()).toBeDisabled();
        await details.locator('summary').click();
        if (tableIndex === 0 && source.key === 'landscape') await ui.capture(`${currentCase}-02-trace-25`);
        await page.getByRole('button', { name: 'Terminar mesa', exact: true }).click();
        await expect(page.getByLabel('Nombre o número', { exact: true })).toHaveValue(table.name);
      }
      let state = await ui.state();
      assert.equal(state.seats.length, count);
      assert.equal(
        ui.writes.filter((write) => write.method === 'POST' && write.resource.endsWith('/seats')).length,
        count
      );
      for (const table of tables) {
        const seats = state.seats.filter((seat) => seat.floorplanShapeId === table.id);
        assert.equal(seats.length, 25);
        assert.equal(new Set(seats.map((seat) => seat.label)).size, 25);
      }
      await correct(ui, tables[0], currentCase, source.key === 'landscape');
      state = await ui.state();
      assert.equal(state.seats.length, count);
      let assistant,
        initialAssigned = false;
      if (currentCase === 'landscape-1440') {
        await labelGaps(ui, tables[0]);
        state = await ui.state();
        assert.equal(state.seats.length, count);
        assistant = await assistantFixture(db, event);
        fixtureAssistants++;
        const seat = state.seats.find((seat) => seat.floorplanShapeId === tables[0].id);
        await db.query('UPDATE assistant SET floorplan_shape_id=$2,floorplan_seat_id=$3 WHERE id=$1', [
          assistant.id,
          tables[0].id,
          seat.id
        ]);
        await ui.open();
        await ui.enter();
        await ui.chooseSeat(seat, tables[0]);
        await expect(page.getByRole('button', { name: 'Bloquear', exact: true })).toBeDisabled();
        await expect(page.getByRole('button', { name: 'Eliminar lugar', exact: true })).toBeDisabled();
        assert.equal(
          (await ui.send('PATCH', `${event.base}/seats/${seat.id}`, { isBlocked: true }, 409)).code,
          'FLOORPLAN_SEAT_OCCUPIED'
        );
        assert.equal(
          (await ui.send('DELETE', `${event.base}/seats/${seat.id}`, undefined, 409)).code,
          'FLOORPLAN_SEAT_OCCUPIED'
        );
        const ids = state.seats.map((seat) => seat.id).sort();
        await page.getByRole('button', { name: 'Renumerar lugares', exact: true }).click();
        await ui.ready();
        state = await ui.state();
        assert.deepEqual(state.seats.map((seat) => seat.id).sort(), ids);
        assert.equal(
          (await db.query('SELECT floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])).rows[0]
            .floorplan_seat_id,
          seat.id
        );
        initialAssigned = true;
        mark('occupied-protection', {
          apiRejectedBlockAndDelete: true,
          uiDisabled: true,
          renumberPreservedAssignmentAndUuids: true
        });
      }
      const beforeReview = identityHash(state.seats),
        beforeReviewWrites = ui.writes.length,
        reviewSeconds = await ui.review();
      if (source.key === 'landscape') await ui.capture(`${currentCase}-04-review`);
      else await ui.capture(`${currentCase}-overview`);
      const panel = page.getByRole('region', { name: 'Revisión de distribución' });
      await panel.getByRole('button', { name: 'Volver a corregir', exact: true }).click();
      assert.equal(identityHash((await ui.state()).seats), beforeReview);
      assert.equal(ui.writes.length, beforeReviewWrites);
      await ui.review();
      const finalizeSeconds = await ui.finalize();
      assert.equal(ui.writes.filter((write) => write.resource === '/lock').length, 1);
      state = await ui.state();
      assert(state.locked);
      const finalizedIdentity = identityHash(state.seats);
      await page.reload();
      await expect(page.getByText('Distribución finalizada. Vista de solo lectura.', { exact: true })).toBeVisible();
      const reloaded = await ui.state();
      assert.equal(identityHash(reloaded.seats), finalizedIdentity);
      assert.deepEqual(reloaded.shapes, state.shapes);
      assert.deepEqual(reloaded.seats, state.seats);
      await expect(page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(0);
      if (source.key === 'landscape') await ui.capture(`${currentCase}-05-finalized`);
      await activateFixture(db, event);
      if (!assistant) {
        assistant = await assistantFixture(db, event);
        fixtureAssistants++;
      }
      const current = await ui.state(),
        firstSeat = current.seats.find(
          (seat) => seat.floorplanShapeId === tables[0].id && (!seat.occupied || initialAssigned)
        ),
        secondSeat = current.seats.find((seat) => seat.floorplanShapeId === tables[1].id && !seat.occupied);
      assert(firstSeat && secondSeat);
      const consumerResult = await consumers({
        browser,
        db,
        client,
        event,
        assistant,
        mode: 'SEAT',
        tables,
        seats: [firstSeat, secondSeat],
        record: result.consumers,
        findings: result.findings,
        capture: `${output}/${currentCase}`,
        viewport,
        initialAssigned
      });
      if (currentCase === 'landscape-1440' && consumerResult.finding === 'SEAT_UNASSIGN_RETAINS_SEAT') {
        const orphan = (
          await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])
        ).rows[0];
        assert.equal(orphan.floorplan_shape_id, null);
        assert(orphan.floorplan_seat_id);
        const projection = (await ui.state()).seats.find((seat) => seat.id === orphan.floorplan_seat_id);
        await ui.send('POST', `${event.base}/unlock`, {});
        const rejection = await ui.send('DELETE', `${event.base}/seats/${orphan.floorplan_seat_id}`, undefined, 409);
        assert.equal(rejection.code, 'FLOORPLAN_SEAT_OCCUPIED');
        await ui.send('POST', `${event.base}/lock`, {});
        result.findings.find((finding) => finding.id === 'SEAT_UNASSIGN_RETAINS_SEAT').impact = {
          apiProjectsOccupied: projection.occupied,
          providerDeleteStatus: 409,
          providerDeleteCode: rejection.code,
          unlockedForProbe: true
        };
        mark('released-seat-conflict-probe', {
          result: 'FAIL',
          expected: 'unassigned Seat is released and removable',
          observed: { apiProjectsOccupied: projection.occupied, deleteStatus: 409, deleteCode: rejection.code }
        });
      }
      result.timings.push({
        scenario: currentCase,
        enterSeconds,
        createOneTableSeconds: createSeconds,
        trace10Seconds: first10Seconds,
        trace25Seconds: table25Seconds,
        reviewSeconds,
        finalizeSeconds
      });
      mark(currentCase, {
        result: consumerResult.result,
        constructionResult: 'PASS',
        sourceType: source.sourceType,
        viewport,
        sourceSha256: source.sha256,
        places: count,
        tables: tables.length,
        uploadThroughUi: true,
        manualReachable: true,
        svgTool: source.sourceType === 'SVG' ? 'reachable' : 'disabled-with-title-only',
        tracePostsAtCoreGate: count,
        confirmedSeatsAtCoreGate: count,
        serializedConfirmedPlacement: true,
        corrections: true,
        reviewAndLock: true,
        reloadIdentitySha256: finalizedIdentity,
        plannerScanner: consumerResult.result
      });
      await context.close();
      await record();
    }
  if (['all', 'tablet-support', 'support'].includes(scope)) {
    await tableScales(client, sources[0]);
  }
  if (['all', 'tablet-support', 'support', 'svg-recovery-restrictions'].includes(scope)) {
    await svgScales(client, sources);
  }
  if (scope === 'capacity') await capacityAudit(client, sources[0]);
  else {
    if (scope !== 'restrictions') await recovery(client, sources[0]);
    await serviceRestrictions(sources[0]);
    if (scope === 'all') await capacityAudit(client, sources[0]);
  }
  assert.equal(
    fixtureAssistants,
    {
      all: 10,
      'tablet-support': 6,
      support: 2,
      'svg-recovery-restrictions': 1,
      'recovery-restrictions': 0,
      restrictions: 0,
      capacity: 0
    }[scope]
  );
  result.status = result.findings.some((finding) => ['P0', 'P1'].includes(finding.severity)) ? 'BLOCKED' : 'PASS';
  result.finishedAt = new Date().toISOString();
  await record();
  console.log(`${result.status} CALCA06 browser certification`);
} catch (error) {
  result.status = 'BLOCKED';
  result.finishedAt = new Date().toISOString();
  result.failures.push({
    scenario: currentCase,
    name: error.name,
    message: redact(error.message),
    classification: 'Unclassified until evidence review; no product fix made'
  });
  if (currentPage && !currentPage.isClosed())
    try {
      await currentPage.screenshot({
        path: `${output}/failure.png`,
        animations: 'disabled',
        mask: [currentPage.locator('video,img[alt*=QR]')]
      });
    } catch {
      /* Browser may already have closed; retain the sanitized failure. */
    }
  await record();
  console.error(redact(error.stack));
  process.exitCode = 1;
} finally {
  await browser.close();
  await db.end();
}

async function correct(ui, table, id, capture) {
  const { page } = ui;
  let state = await ui.state();
  const first = state.seats.find((seat) => seat.floorplanShapeId === table.id),
    second = state.seats.filter((seat) => seat.floorplanShapeId === table.id)[1];
  assert(first && second);
  await ui.chooseSeat(first, table);
  await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
  await page.getByLabel('Nombre del lugar', { exact: true }).fill('Cabecera principal con etiqueta completa');
  await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
  await ui.ready();
  await expect(page.getByTestId('floorplan-seat-label')).toContainText('Cabecera principal con etiqueta completa');
  const renamed = (await ui.state()).seats.find((seat) => seat.id === first.id);
  assert.equal(renamed.floorplanShapeId, table.id);
  await ui.drag(renamed, 0.16, 0.08);
  await expect
    .poll(async () => (await ui.state()).seats.find((seat) => seat.id === first.id).x)
    .toBeCloseTo(first.x + 0.16, 2);
  state = await ui.state();
  const moved = state.seats.find((seat) => seat.id === first.id);
  assert(moved.x > table.x + table.width);
  await ui.chooseSeat(second, table, true);
  const relative = { x: moved.x - second.x, y: moved.y - second.y };
  await ui.drag(second, 0.01, 0.01);
  await expect
    .poll(async () => (await ui.state()).seats.find((seat) => seat.id === second.id).x)
    .toBeCloseTo(second.x + 0.01, 2);
  state = await ui.state();
  const afterA = state.seats.find((seat) => seat.id === first.id),
    afterB = state.seats.find((seat) => seat.id === second.id);
  assert(Math.abs(afterA.x - afterB.x - relative.x) < 0.001 && Math.abs(afterA.y - afterB.y - relative.y) < 0.001);
  await ui.chooseSeat(afterA, table);
  await page.getByRole('button', { name: 'Duplicar lugar', exact: true }).click();
  await ui.ready();
  const duplicate = (await ui.state()).seats.find((seat) => !state.seats.some((old) => old.id === seat.id));
  assert(duplicate && !duplicate.occupied);
  await page.getByRole('button', { name: 'Bloquear', exact: true }).click();
  await ui.ready();
  await expect(page.getByRole('button', { name: 'Desbloquear', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Desbloquear', exact: true }).click();
  await ui.ready();
  await page.getByRole('button', { name: 'Eliminar lugar', exact: true }).click();
  await ui.ready();
  assert.equal((await ui.state()).seats.length, state.seats.length);
  await ui.chooseSeat(afterA, table);
  if (capture) await ui.capture(`${id}-03-correction`);
  const before = (await ui.state()).seats.map((seat) => seat.id).sort();
  await page.getByRole('button', { name: 'Renumerar lugares', exact: true }).click();
  await ui.ready();
  assert.deepEqual((await ui.state()).seats.map((seat) => seat.id).sort(), before);
}

async function tableScales(client, source) {
  currentCase = 'TABLE-scale';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context.request);
  const send = transport(context.request),
    event = await eventFixture(db, client, 'Regresión gráfica de Mesas'),
    tables = [];
  await uploadApi(context.request, event, source);
  for (const count of [50, 100, 200]) {
    for (let index = tables.length; index < count; index++)
      tables.push(
        await send(
          'POST',
          `${event.base}/shapes`,
          {
            kind: 'TABLE',
            geometry: 'CIRCLE',
            name: `Mesa ${String(index + 1).padStart(3, '0')}`,
            capacity: 1,
            x: 0.035 + (index % 20) * 0.046,
            y: 0.19 + Math.floor(index / 20) * 0.068,
            width: 0.027,
            height: 0.027,
            rotation: 0
          },
          201
        )
      );
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 }
    ]) {
      const page = await context.newPage();
      currentPage = page;
      await page.setViewportSize(viewport);
      page.setDefaultTimeout(15000);
      const ui = new TraceUi(page, event, viewport, result, output);
      await ui.open();
      await ui.enter();
      await ui.chooseTable(tables.at(-1).name);
      await expect(page.getByLabel('Número de lugares', { exact: true })).toHaveValue('1');
      await page
        .getByRole('region', { name: 'Mesa en Calca' })
        .getByRole('button', { name: 'Cancelar', exact: true })
        .click();
      const state = await ui.state();
      assert.equal(state.shapes.length, count);
      assert.equal(state.seats.length, 0);
      assert.equal(ui.writes.length, 0);
      if (count === 200) await ui.capture(`table-200-${viewport.width}-trace`);
      await ui.review();
      const review = page.getByRole('region', { name: 'Revisión de distribución' });
      await expect(
        review.getByText(`${count} mesas · 0 zonas · ${count} lugares de capacidad configurada`, { exact: true })
      ).toBeVisible();
      if (count === 50) await ui.capture(`table-50-${viewport.width}-review`);
      mark(`TABLE-${count}-${viewport.width}`, {
        result: result.findings.some(
          (finding) =>
            finding.id === 'DENSE_NAME_LIST_OVERLAP' &&
            finding.occurrences.some((item) => item.tables === count && item.viewport.width === viewport.width)
        )
          ? 'FAIL'
          : 'PASS',
        tables: count,
        viewport,
        configuredEventCapacity: 150,
        graphicRegressionOnly: true,
        createSeats: 0,
        selectedByName: true,
        authoritativeReview: true
      });
      await page.close();
    }
  }
  await send('POST', `${event.base}/lock`, {});
  await activateFixture(db, event);
  const assistant = await assistantFixture(db, event);
  fixtureAssistants++;
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ])
    await consumers({
      browser,
      db,
      client,
      event,
      assistant,
      mode: 'TABLE',
      tables: tables.slice(0, 2),
      seats: [],
      record: result.consumers,
      findings: result.findings,
      viewport
    });
  mark('TABLE-consumers', {
    tables: 200,
    configuredEventCapacity: 150,
    plannerAssignMoveUnassign: true,
    scannerReadOnly: true
  });
  await context.close();
  await record();
}

async function labelGaps(ui, table) {
  const { page } = ui;
  let state = await ui.state();
  const one = state.seats.find((seat) => seat.floorplanShapeId === table.id && seat.label === 'Lugar 1'),
    two = state.seats.find((seat) => seat.floorplanShapeId === table.id && seat.label === 'Lugar 2'),
    four = state.seats.find((seat) => seat.floorplanShapeId === table.id && seat.label === 'Lugar 4');
  assert(one && two && four);
  const count = state.seats.length;
  await ui.chooseSeat(one, table);
  await page.getByRole('button', { name: 'Renombrar', exact: true }).click();
  await page.getByLabel('Nombre del lugar', { exact: true }).fill('Preferente');
  await page.getByRole('button', { name: 'Guardar nombre', exact: true }).click();
  await ui.ready();
  await ui.chooseSeat(two, table);
  await page.getByRole('button', { name: 'Eliminar lugar', exact: true }).click();
  await ui.ready();
  await page.getByRole('button', { name: 'Manual', exact: true }).click();
  await ui.chooseTable(table.name);
  await page.getByRole('button', { name: 'Agregar lugar', exact: true }).click();
  await ui.click({ x: 0.85, y: 0.5 });
  await ui.ready();
  state = await ui.state();
  const manual = state.seats.find((seat) => seat.floorplanShapeId === table.id && seat.label === 'Lugar 1');
  assert(manual && manual.id !== one.id);
  assert.equal(state.seats.length, count);
  await ui.enter();
  await ui.chooseSeat(four, table);
  await page.getByRole('button', { name: 'Eliminar lugar', exact: true }).click();
  await ui.ready();
  await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
  await ui.click({ x: 0.85, y: 0.65 });
  await expect(page.getByText('25 lugares confirmados', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Terminar mesa', exact: true }).click();
  state = await ui.state();
  const traced = state.seats.find((seat) => seat.floorplanShapeId === table.id && seat.label === 'Lugar 2');
  assert(traced && traced.id !== two.id);
  assert.equal(state.seats.length, count);
  assert.equal(
    new Set(state.seats.filter((seat) => seat.floorplanShapeId === table.id).map((seat) => seat.label)).size,
    25
  );
  mark('Manual-Trace-label-gaps', {
    manualLabel: 'Lugar 1',
    traceLabel: 'Lugar 2',
    newIdentities: true,
    existingParentPreserved: true,
    finalSeatCount: count
  });
}

async function svgScales(client, sources) {
  for (const source of sources.filter((source) => source.sourceType === 'SVG')) {
    currentCase = `SVG-${source.selectableElements}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
    await login(context.request);
    const event = await eventFixture(db, client, `SVG ${source.selectableElements} elementos`);
    await uploadApi(context.request, event, source);
    const send = transport(context.request),
      metadata = await send('GET', `${event.base}/svg-source`);
    assert.equal(metadata.selectableElements.length, source.selectableElements);
    assert.equal(
      new Set(metadata.selectableElements.map((element) => element.sourceElementId)).size,
      source.selectableElements
    );
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 }
    ]) {
      const page = await context.newPage();
      currentPage = page;
      await page.setViewportSize(viewport);
      page.setDefaultTimeout(15000);
      const ui = new TraceUi(page, event, viewport, result, output);
      await ui.open();
      await ui.enter();
      if (source.selectableElements === 200) await ui.capture(`svg-200-${viewport.width}-trace`);
      await page.getByRole('button', { name: 'Mapeo SVG', exact: true }).click();
      for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Acercar plano', exact: true }).click();
      await ui.host.scrollIntoViewIfNeeded();
      const bbox = metadata.selectableElements[0].bbox,
        b = await ui.host.boundingBox();
      await ui.host.click({
        position: {
          x: b.width * (bbox.x + bbox.width / 2) * 1.2 ** 4,
          y: b.height * (bbox.y + bbox.height / 2) * 1.2 ** 4
        }
      });
      await expect(page.getByRole('heading', { name: /^Clasificar /u })).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
      assert.equal((await ui.state()).shapes.length, 0);
      mark(`SVG-${source.selectableElements}-${viewport.width}`, {
        viewport,
        canonicalSelectableElements: metadata.selectableElements.length,
        nativeSelection: true,
        cancelCreatesNoShape: true
      });
      await page.close();
    }
    const hostile = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><foreignObject width="10" height="10"/></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" onload="alert(1)"/></svg>',
      '<!DOCTYPE svg [<!ENTITY xxe SYSTEM "file:///invalid-calca-fixture">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>&xxe;</text></svg>',
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><image href="https://invalid.example/fixture.png" width="10" height="10"/></svg>'
    ];
    if (source.selectableElements === 100)
      for (const [index, xml] of hostile.entries()) {
        const response = await context.request.post(`${api}${event.base}/file-assets`, {
          headers: { Origin: admin },
          multipart: {
            fileType: 'FLOORPLAN_SVG',
            file: { name: 'hostile.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(xml) }
          }
        });
        assert.equal(response.status(), 400, `Hostile SVG ${index}`);
      }
    if (source.selectableElements === 100)
      mark('SVG-security-negatives', {
        hostileUploadsRejected: 5,
        expectedStatus: 400,
        scripts: true,
        foreignObject: true,
        eventHandlers: true,
        dtdXxe: true,
        externalReferences: true
      });
    await context.close();
  }
  currentCase = 'SVG-replacement-preservation';
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context.request);
  const send = transport(context.request),
    event = await eventFixture(db, client, 'Reemplazo SVG de prueba');
  await uploadApi(
    context.request,
    event,
    sources.find((source) => source.key === 'svg-200')
  );
  const metadata = await send('GET', `${event.base}/svg-source`),
    mapped = await send(
      'POST',
      `${event.base}/svg-mappings`,
      {
        sourceElementId: metadata.selectableElements[0].sourceElementId,
        kind: 'TABLE',
        name: 'Mesa vinculada para reemplazo',
        capacity: 25
      },
      201
    );
  await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' });
  const seat = await send(
    'POST',
    `${event.base}/shapes/${mapped.id}/seats`,
    { label: 'Lugar de regresión SVG', x: 0.8, y: 0.8 },
    201
  );
  await send('POST', `${event.base}/lock`, {});
  await activateFixture(db, event);
  const assistant = await assistantFixture(db, event);
  fixtureAssistants++;
  const planner = await browser.newContext();
  await login(planner.request, client.email);
  await transport(planner.request)(
    'POST',
    `/events/${event.id}/seating/assign-seats`,
    {
      assignments: [{ assistantId: assistant.id, seatId: seat.id }]
    },
    201
  );
  await send('POST', `${event.base}/unlock`, {});
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(15000);
  const ui = new TraceUi(page, event, { width: 1440, height: 900 }, result, output);
  await ui.open();
  await ui.enter();
  const before = await ui.state(),
    snapshot = identityHash(before.seats);
  const replacement = sources.find((source) => source.key === 'svg-100');
  await page.locator('input[type=file]').setInputFiles(`${evidence}/${replacement.file}`);
  const dialog = page.getByRole('dialog', { name: '¿Reemplazar el plano SVG?' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  assert.equal((await ui.state()).image.fileAssetId, before.image.fileAssetId);
  await page.locator('input[type=file]').setInputFiles(`${evidence}/${replacement.file}`);
  await dialog.getByRole('button', { name: 'Reemplazar y desvincular', exact: true }).click();
  await ui.ready();
  await expect.poll(async () => (await ui.state()).image.fileAssetId).not.toBe(before.image.fileAssetId);
  const after = await ui.state();
  assert.equal(identityHash(after.seats), snapshot);
  assert.deepEqual(after.shapes.map((shape) => shape.id).sort(), before.shapes.map((shape) => shape.id).sort());
  assert(after.shapes.every((shape) => shape.sourceElementId === null));
  assert.equal(
    (await db.query('SELECT floorplan_seat_id FROM assistant WHERE id=$1', [assistant.id])).rows[0].floorplan_seat_id,
    seat.id
  );
  assert.equal((await send('GET', `${event.base}/svg-source`)).selectableElements.length, 100);
  mark(currentCase, {
    cancelPreservesSource: true,
    explicitDetachConfirmation: true,
    shapeUuidsPreserved: true,
    seatIdentitySha256: snapshot,
    assignmentPreserved: true,
    bindingsCleared: true,
    newCanonicalElements: 100
  });
  await planner.close();
  await context.close();
  await record();
}

async function nativeGestures(ui) {
  const { page } = ui,
    before = ui.writes.length;
  await page.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
  let b = await ui.host.boundingBox();
  await ui.click({ x: 0.7, y: 0.65 });
  await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.6 + 35, b.y + b.height * 0.5 - 20, { steps: 6 });
  await page.mouse.up();
  if (ui.viewport.width === 1024) {
    const cdp = await page.context().newCDPSession(page),
      x = b.x + b.width * 0.5,
      y = b.y + b.height * 0.5;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 0, x, y }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 0, x: x + 20, y: y - 15 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 0, x: x - 35, y },
        { id: 1, x: x + 35, y }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 0, x: x - 55, y: y - 10 },
        { id: 1, x: x + 55, y: y + 10 }
      ]
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
  } else await page.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
  await page.getByRole('button', { name: 'Acercar plano', exact: true }).click();
  await page.getByRole('button', { name: 'Alejar plano', exact: true }).click();
  await page.getByRole('button', { name: 'Ajustar plano a la vista', exact: true }).click();
  b = await ui.host.boundingBox();
  await page.mouse.move(b.x + b.width * 0.65, b.y + b.height * 0.65);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.65 + 30, b.y + b.height * 0.65, { steps: 6 });
  await page.mouse.up();
  assert.equal(ui.writes.length, before, 'Pan, pinch, zoom, drag and toolbar must not mutate the Floorplan');
}

async function recovery(client, source) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    currentCase = `recovery-${viewport.width}`;
    const context = await browser.newContext({ viewport, hasTouch: true });
    await login(context.request);
    const send = transport(context.request),
      event = await eventFixture(db, client, 'Recuperación de Calca');
    await uploadApi(context.request, event, source);
    const tables = [];
    for (let i = 0; i < 2; i++)
      tables.push(
        await send(
          'POST',
          `${event.base}/shapes`,
          {
            kind: 'TABLE',
            geometry: 'CIRCLE',
            name: `Mesa ${i + 1}`,
            capacity: 25,
            x: 0.2 + i * 0.3,
            y: 0.3,
            width: 0.08,
            height: 0.08,
            rotation: 0
          },
          201
        )
      );
    const table = tables[0];
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(15000);
    const ui = new TraceUi(page, event, viewport, result, output);
    await ui.open();
    await ui.enter();
    await expect(page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(0);
    await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' });
    await ui.open();
    await ui.enter();
    await expect(page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(0);
    await ui.chooseTable(table.name);
    await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
    await nativeGestures(ui);
    assert.equal((await ui.state()).seats.length, 0);
    const countPosts = () =>
      ui.writes.filter((write) => write.method === 'POST' && write.resource.endsWith('/seats')).length;
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(
      `**/shapes/${table.id}/seats`,
      async (route) => {
        await held;
        await route.continue();
      },
      { times: 1 }
    );
    await ui.click({ x: 0.3, y: 0.45 });
    await expect.poll(countPosts).toBe(1);
    await ui.click({ x: 0.35, y: 0.45 });
    assert.equal(countPosts(), 1);
    release();
    await expect(page.getByText('1 lugares confirmados', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Terminar mesa', exact: true }).click();
    await expect(page.getByLabel('Nombre o número', { exact: true })).toHaveValue(table.name);
    await ui.click({ x: 0.8, y: 0.8 });
    assert.equal(countPosts(), 1);
    assert.equal((await ui.state()).seats.length, 1);
    const faults = [];
    for (const [status, code] of [
      [409, 'FLOORPLAN_CONCURRENCY_CONFLICT'],
      [429, 'RATE_LIMITED'],
      [503, 'INTERNAL_ERROR']
    ]) {
      await ui.chooseTable(table.name);
      await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
      const before = countPosts(),
        count = (await ui.state()).seats.length;
      await page.route(
        `**/shapes/${table.id}/seats`,
        (route) =>
          route.fulfill({
            status,
            contentType: 'application/json',
            body: JSON.stringify({ code, message: 'Deliberate QA transport fault' })
          }),
        { times: 1 }
      );
      await ui.click({ x: 0.4, y: 0.5 });
      await expect(page.getByText(/Trazado detenido\. Revisa los lugares confirmados/u)).toBeVisible();
      await expect(page.getByRole('button', { name: 'Terminar mesa', exact: true })).toHaveCount(0);
      assert.equal(countPosts(), before + 1);
      assert.equal((await ui.state()).seats.length, count);
      await ui.click({ x: 0.8, y: 0.8 });
      assert.equal(countPosts(), before + 1);
      faults.push({ status, attempts: 1, committed: 0, replayed: 0, stopped: true });
    }
    await ui.chooseTable(table.name);
    await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
    let before = countPosts();
    await page.route(`**/shapes/${table.id}/seats`, (route) => route.abort('timedout'), { times: 1 });
    await ui.click({ x: 0.45, y: 0.5 });
    await expect(page.getByText(/Trazado detenido\. Revisa los lugares confirmados/u)).toBeVisible();
    assert.equal(countPosts(), before + 1);
    assert.equal((await ui.state()).seats.length, 1);
    faults.push({ status: 'transport-timeout-before-send', attempts: 1, committed: 0, replayed: 0, stopped: true });
    await ui.chooseTable(table.name);
    await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
    before = countPosts();
    let lostSeat;
    await page.route(
      `**/shapes/${table.id}/seats`,
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        lostSeat = await response.json();
        await route.abort('failed');
      },
      { times: 1 }
    );
    await ui.click({ x: 0.5, y: 0.5 });
    await expect(page.getByText(/Trazado detenido\. Revisa los lugares confirmados/u)).toBeVisible();
    const recovered = await ui.state();
    assert.equal(countPosts(), before + 1);
    assert.equal(recovered.seats.length, 2);
    assert(
      recovered.seats.some(
        (seat) => seat.id === lostSeat.id && seat.label === lostSeat.label && seat.floorplanShapeId === table.id
      )
    );
    faults.push({ status: 'lost-response-after-real-commit', attempts: 1, committed: 1, replayed: 0, stopped: true });
    await ui.chooseTable(table.name);
    await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
    before = countPosts();
    await page.route(
      `**/events/${event.id}/floorplan`,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'QA refresh failure' })
        }),
      { times: 1 }
    );
    await ui.click({ x: 0.55, y: 0.5 });
    await expect(
      page.getByText('Guardado · falta actualizar. La acción no se repetirá.', { exact: true })
    ).toBeVisible();
    assert.equal(countPosts(), before + 1);
    await page.getByRole('button', { name: 'Actualizar plano', exact: true }).click();
    await ui.ready();
    assert.equal(countPosts(), before + 1);
    assert.equal((await ui.state()).seats.length, 3);
    faults.push({ status: 'confirmed-write-refresh-503', attempts: 1, committed: 1, replayed: 0, stopped: true });
    await ui.chooseTable(table.name);
    await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
    await send('POST', `${event.base}/lock`, {});
    before = countPosts();
    await ui.click({ x: 0.6, y: 0.5 });
    await expect(page.getByText('Distribución finalizada. Vista de solo lectura.', { exact: true })).toBeVisible();
    assert.equal(countPosts(), before + 1);
    assert.equal((await ui.state()).seats.length, 3);
    await expect(page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(0);
    faults.push({ status: 'real-concurrent-layout-lock-409', attempts: 1, committed: 0, replayed: 0, stopped: true });
    await send('POST', `${event.base}/unlock`, {});
    await ui.open();
    await ui.enter();
    await ui.review();
    await page.route(
      `**/events/${event.id}/floorplan`,
      (route) =>
        route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'INTERNAL_ERROR', message: 'QA lock refresh failure' })
        }),
      { times: 1 }
    );
    await page
      .getByRole('region', { name: 'Revisión de distribución' })
      .getByRole('button', { name: 'Finalizar distribución', exact: true })
      .click();
    await expect(
      page.getByText('Guardado · falta actualizar. La acción no se repetirá.', { exact: true })
    ).toBeVisible();
    assert.equal(ui.writes.filter((write) => write.resource === '/lock').length, 1);
    await expect(page.getByRole('button', { name: 'Editar distribución', exact: true })).toBeDisabled();
    await ui.capture(`recovery-${viewport.width}-lock-confirmed-refresh-failed`);
    await page.getByRole('button', { name: 'Actualizar plano', exact: true }).click();
    await ui.ready();
    assert.equal(ui.writes.filter((write) => write.resource === '/lock').length, 1);
    await page.getByRole('button', { name: 'Editar distribución', exact: true }).click();
    await ui.ready();
    await expect(page.getByRole('region', { name: 'Herramientas de Calca' })).toBeVisible();
    await ui.review();
    await page.route(
      `**/events/${event.id}/floorplan/lock`,
      async (route) => {
        const response = await route.fetch();
        assert.equal(response.status(), 200);
        await route.abort('failed');
      },
      { times: 1 }
    );
    await page
      .getByRole('region', { name: 'Revisión de distribución' })
      .getByRole('button', { name: 'Finalizar distribución', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Actualizar plano', exact: true })).toBeVisible();
    assert.equal(ui.writes.filter((write) => write.resource === '/lock').length, 2);
    await ui.capture(`recovery-${viewport.width}-lock-uncertain`);
    await page.getByRole('button', { name: 'Actualizar plano', exact: true }).click();
    await expect(page.getByText('Distribución finalizada. Vista de solo lectura.', { exact: true })).toBeVisible();
    await ui.ready();
    assert.equal(ui.writes.filter((write) => write.resource === '/lock').length, 2);
    const identity = identityHash((await ui.state()).seats);
    await page.reload();
    await expect(page.getByText('Distribución finalizada. Vista de solo lectura.', { exact: true })).toBeVisible();
    assert.equal(identityHash((await ui.state()).seats), identity);
    mark(currentCase, {
      viewport,
      tableModeNoTrace: true,
      noParentNoTrace: true,
      lockedNoTrace: true,
      pendingDoubleGesturePosts: 1,
      panZoomDragToolbarWrites: 0,
      touchPinchExercised: viewport.width === 1024,
      finishKeepsParent: true,
      afterFinishSeatPosts: 0,
      faults,
      lockIntentions: 2,
      lockPosts: 2,
      unlockPosts: 1,
      confirmedLockRefreshFailureNoReplay: true,
      lostLockResponseNoReplay: true,
      finalIdentitySha256: identity
    });
    await context.close();
    await record();
  }
}

async function capacityAudit(client, source) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await login(context.request);
  const event = await eventFixture(db, client, 'Capacidad autoritativa tras cambio de modo');
  await uploadApi(context.request, event, source);
  const send = transport(context.request);
  for (const [index, capacity] of [12, 24].entries())
    await send(
      'POST',
      `${event.base}/shapes`,
      {
        kind: 'TABLE',
        geometry: 'CIRCLE',
        name: `Mesa ${index + 1}`,
        capacity,
        x: 0.24 + index * 0.25,
        y: 0.35,
        width: 0.08,
        height: 0.08,
        rotation: 0
      },
      201
    );
  await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' });
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    currentCase = `SEAT-capacity-after-mode-change-${viewport.width}`;
    const page = await context.newPage();
    currentPage = page;
    await page.setViewportSize(viewport);
    page.setDefaultTimeout(15000);
    const ui = new TraceUi(page, event, viewport, result, output);
    await ui.open();
    await ui.enter();
    await ui.review();
    const current = await ui.state();
    const tables = current.shapes
      .filter((shape) => shape.kind === 'TABLE')
      .map((table) => ({
        name: table.name,
        idSha256: createHash('sha256').update(table.id).digest('hex'),
        apiCapacity: table.capacity,
        defined: current.seats.filter((seat) => seat.floorplanShapeId === table.id).length,
        activeUnblocked: current.seats.filter((seat) => seat.floorplanShapeId === table.id && !seat.isBlocked).length
      }));
    assert.equal(current.seatingMode, 'SEAT');
    assert.equal(current.seats.length, 0);
    assert.equal(ui.writes.length, 0);
    await expect(page.getByText('Sin lugares definidos', { exact: true })).toHaveCount(2);
    await ui.capture(`capacity-${viewport.width}-review-zero-places`);
    const synchronized = tables.every((table) => table.apiCapacity === table.activeUnblocked);
    mark(currentCase, {
      result: synchronized ? 'PASS' : 'FAIL',
      viewport,
      tables,
      seatWrites: 0,
      warningVisible: true,
      frontendSummaryUsesCurrentApi: true
    });
    if (!synchronized && !result.findings.some((finding) => finding.id === 'SEAT_MODE_CAPACITY_DESYNC'))
      result.findings.push({
        id: 'SEAT_MODE_CAPACITY_DESYNC',
        severity: 'P1',
        problem:
          'TABLE to SEAT retains nonzero manual capacities on tables with zero active Seats; authoritative capacity disagrees with detailed seating contract',
        contract: 'FLOORPLAN_DETAILED_SEATING_CONTRACT.md §7',
        observed: tables,
        evidence: `capacity-${viewport.width}-review-zero-places.png`,
        action: 'Separate backend correction; no frontend readiness rule or fix added'
      });
    await page.close();
    await record();
  }
  await context.close();
}

async function serviceRestrictions(source) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    currentCase = `PHYSICAL_QR-restriction-${viewport.width}`;
    const context = await browser.newContext({ viewport, hasTouch: true });
    await login(context.request);
    const legacyClient = await clientFixture(db);
    await db.query("UPDATE client SET operating_profile='SELF_SERVICE' WHERE id=$1", [legacyClient.id]);
    await db.query(
      "INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'PHYSICAL_QR',true,now(),now()) ON CONFLICT(code) DO NOTHING",
      [randomUUID()]
    );
    const event = await eventFixture(db, legacyClient, 'Pase físico por Mesa · fixture de elegibilidad');
    await db.query("UPDATE event SET service_id=(SELECT id FROM service WHERE code='PHYSICAL_QR') WHERE id=$1", [
      event.id
    ]);
    await uploadApi(context.request, event, source);
    const send = transport(context.request);
    const table = await send(
      'POST',
      `${event.base}/shapes`,
      {
        kind: 'TABLE',
        geometry: 'CIRCLE',
        name: 'Mesa física',
        capacity: 25,
        x: 0.2,
        y: 0.3,
        width: 0.08,
        height: 0.08,
        rotation: 0
      },
      201
    );
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(15000);
    const ui = new TraceUi(page, event, viewport, result, output);
    await ui.open();
    await ui.enter();
    const options = page
      .locator('details')
      .filter({ has: page.locator('summary').filter({ hasText: 'Opciones del croquis' }) });
    await options.locator('summary').click();
    await page.getByRole('combobox', { name: 'Acomodo' }).click();
    const seatOption = page.getByRole('option', { name: 'Por lugar exacto', exact: true });
    const offered = (await seatOption.count()) > 0;
    let status;
    if (offered) {
      const response = page.waitForResponse(
        (response) => response.request().method() === 'PATCH' && response.url().endsWith('/seating-mode')
      );
      await seatOption.click();
      status = (await response).status();
    } else {
      await page.keyboard.press('Escape');
      status = (
        await context.request.patch(`${api}${event.base}/seating-mode`, {
          headers: { Origin: admin },
          data: { seatingMode: 'SEAT' }
        })
      ).status();
    }
    await options.locator('summary').click();
    let current = await ui.state(),
      tracingOffered = false,
      tracedPlaces = 0;
    if (current.seatingMode === 'SEAT') {
      await ui.chooseTable(table.name);
      tracingOffered = await page.getByRole('button', { name: 'Trazar lugares', exact: true }).isEnabled();
      if (tracingOffered) {
        await page.getByRole('button', { name: 'Trazar lugares', exact: true }).click();
        await ui.click({ x: 0.3, y: 0.45 });
        await expect(page.getByText('1 lugares confirmados', { exact: true })).toBeVisible();
        tracedPlaces = (await ui.state()).seats.length;
        await ui.capture(`physical-${viewport.width}-observed-trace`);
        await page.getByRole('button', { name: 'Terminar mesa', exact: true }).click();
      }
      current = await ui.state();
    }
    const facts = (
      await db.query(
        'SELECT s.code AS service, c.operating_profile AS profile, f.seating_mode AS mode, (SELECT count(*)::int FROM floorplan_seat WHERE event_id=e.id AND deleted_at IS NULL) AS seats FROM event e JOIN client c ON c.id=e.client_id JOIN service s ON s.id=e.service_id JOIN floorplan f ON f.event_id=e.id WHERE e.id=$1',
        [event.id]
      )
    ).rows[0];
    assert.equal(facts.service, 'PHYSICAL_QR');
    const eligible = !offered && status !== 200 && current.seatingMode === 'TABLE' && tracedPlaces === 0;
    result.scenarios.push({
      id: currentCase,
      result: eligible ? 'PASS' : 'FAIL',
      viewport,
      expected: 'PHYSICAL_QR remains TABLE-only; no exact Seat construction',
      observed: { seatOptionOffered: offered, seatingModeStatus: status, tracingOffered, tracedPlaces, ...facts }
    });
    if (!eligible && !result.findings.some((finding) => finding.id === 'PHYSICAL_QR_TABLE_ONLY'))
      result.findings.push({
        id: 'PHYSICAL_QR_TABLE_ONLY',
        severity: 'P1',
        contract: 'FLOORPLAN_DETAILED_SEATING_CONTRACT.md §19 and FLOORPLAN_TRACE_MODE_UX.md §8',
        problem: 'Exact Seat mode/tracing available for a TABLE-only physical-pass service',
        action: 'Separate corrective ticket; no fix in CALCA-06',
        evidence: `physical-${viewport.width}-observed-trace.png`
      });
    console.log(`${eligible ? 'PASS' : 'FAIL'} ${currentCase}`);
    await context.close();
    await record();
  }
  currentCase = 'ANONYMOUS-TABLE-only';
  const organizationId = randomUUID(),
    plannerId = randomUUID(),
    eventId = randomUUID();
  await db.query(
    "INSERT INTO client(id,type,operating_profile,name,status,created_at,updated_at) VALUES($1,'ORGANIZATION','MANAGED','[DEMO] Salón de prueba','ACTIVE',now(),now())",
    [organizationId]
  );
  await db.query(
    "INSERT INTO app_user(id,email,password_hash,role,client_id,created_at,updated_at) SELECT $1,$2,password_hash,'ORGANIZATION_PLANNER',$3,now(),now() FROM app_user WHERE email='operacion@invitaciones.example'",
    [plannerId, `${plannerId}@calca.example`, organizationId]
  );
  await db.query(
    "INSERT INTO event(id,client_id,created_by_user_id,assigned_planner_user_id,service_id,access_mode,name,status,event_date_time,time_zone,capacity,confirmation_enabled,floorplan_enabled,created_at,updated_at) SELECT $1,$2,u.id,$3,s.id,'ANONYMOUS','Accesos anónimos de prueba','configured','2027-11-15T18:00:00Z','America/Mexico_City',150,false,true,now(),now() FROM app_user u CROSS JOIN service s WHERE u.email='operacion@invitaciones.example' AND s.code='ACCESS_CONTROL'",
    [eventId, organizationId, plannerId]
  );
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context.request);
  const event = { id: eventId, base: `/admin/clients/${organizationId}/events/${eventId}/floorplan` };
  await uploadApi(context.request, event, source);
  const send = transport(context.request);
  await send(
    'POST',
    `${event.base}/shapes`,
    {
      kind: 'TABLE',
      geometry: 'CIRCLE',
      name: 'Mesa anónima',
      capacity: 25,
      x: 0.2,
      y: 0.3,
      width: 0.08,
      height: 0.08,
      rotation: 0
    },
    201
  );
  const rejected = await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' }, 409);
  assert.equal(rejected.code, 'PHYSICAL_PASS_TABLE_INVALID');
  assert.equal((await send('GET', event.base)).seatingMode, 'TABLE');
  mark(currentCase, { apiRejectsExactMode: true, status: 409, seatsCreated: 0 });
  await context.close();
  await record();
}
