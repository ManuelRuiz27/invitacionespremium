/* global window, document, requestAnimationFrame, getComputedStyle, innerWidth */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { runtimeHash } from '../../../../scripts/access-control-guide/verify.mjs';
import {
  clientFixture,
  eventFixture,
  assistantFixture,
  activateFixture,
  transport,
  login,
  uploadApi,
  clientUrl
} from '../calca06/browser-helpers.mjs';
import { placements, seatPosition } from '../calca06/fixtures.mjs';

const output = 'docs/05-implementacion/evidence/calca-blocker05/attempts/reproduction';
await mkdir(output, { recursive: true });
const sources = JSON.parse(await readFile('docs/05-implementacion/evidence/calca06/fixtures.json', 'utf8'));
const originalSeatPoint = JSON.parse(
  await readFile('docs/05-implementacion/evidence/calca-blocker04/attempts/reproduction/results.json', 'utf8')
).originalPoint;
const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }),
  browser = await chromium.launch();
const result = {
  runtimeSha256: await runtimeHash(),
  sources: sources.filter((source) => ['landscape', 'portrait'].includes(source.key)),
  originalSeatPoint,
  method:
    'Focused original attempt-7 landscape raster and TABLE placement pattern, real services/PostgreSQL, native pointer/touch, no injected product state/styles. Separate fallback probe delays the lazy Konva module via network interception only. Not full CALCA06.',
  scenarios: [],
  geometry: [],
  captures: [],
  consumers: [],
  seats: [],
  status: 'RUNNING'
};
let currentPage;
const settle = (page) =>
  page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
const activate = async (locator) => {
  if (await locator.page().evaluate(() => navigator.maxTouchPoints > 0)) await locator.tap();
  else await locator.click();
};
const closePanel = async (page) => {
  // A confirmed move can precede the existing Dialog's exit transition.
  // Wait for that modal to release the assignment panel before tapping Close.
  await expect(page.locator('.MuiDialog-root')).toHaveCount(0);
  const close = page.getByRole('button', { name: 'Cerrar panel de Mesa', exact: true });
  const drawer = page.locator('[data-testid="seating-tablet-drawer"], [data-testid="seating-mobile-drawer"]');
  if (await drawer.count()) {
    await expect(close).toBeVisible();
    await activate(close);
  } else if (await close.isVisible()) await activate(close);
  await expect(page.getByTestId('seating-tablet-drawer')).toHaveCount(0);
  await expect(page.getByTestId('seating-mobile-drawer')).toHaveCount(0);
  await settle(page);
};
const selector = (page) => page.locator('input[role="combobox"]');
const capture = async (page, name, meta) => {
  await page.evaluate(() => document.fonts.ready);
  const file = `${name}.png`;
  await page.screenshot({ path: `${output}/${file}`, animations: 'disabled' });
  result.captures.push({
    file,
    viewport: page.viewportSize(),
    sha256: createHash('sha256')
      .update(await readFile(`${output}/${file}`))
      .digest('hex'),
    ...meta
  });
};
const scene = (page) =>
  page.evaluate(() => {
    const host = document.querySelector('[data-testid="floorplan-renderer-host"]');
    const stage = window.Konva?.stages.find((s) => host.contains(s.container()));
    if (!stage) return null;
    const b = stage.getContent().getBoundingClientRect(),
      rx = b.width / stage.width(),
      ry = b.height / stage.height();
    const center = (g) => {
      const p = g.getAbsoluteTransform().point({ x: 0, y: 0 });
      return { x: b.left + p.x * rx, y: b.top + p.y * ry };
    };
    return {
      width: stage.width(),
      height: stage.height(),
      scale: stage.scaleX(),
      x: stage.x(),
      y: stage.y(),
      shapes: stage.find('.floorplan-shape').map((g) => ({
        x: g.x(),
        y: g.y(),
        center: center(g),
        selected: g.findOne('.floorplan-shape-body')?.strokeWidth() === 3
      })),
      seats: stage.find('.floorplan-seat').map((g) => ({
        x: g.x() / stage.width(),
        y: g.y() / stage.height(),
        center: center(g),
        selected: Math.abs(g.findOne('Circle').strokeWidth() * stage.scaleX() - 3) < 0.001
      }))
    };
  });
const shapeNode = (snapshot, table) => {
  const side = table.width * Math.min(snapshot.width, snapshot.height);
  return snapshot.shapes.find(
    (g) =>
      Math.abs(g.x - (table.x * snapshot.width + side / 2)) < 0.001 &&
      Math.abs(g.y - (table.y * snapshot.height + side / 2)) < 0.001
  );
};
const assertSelected = async (page, table, fallback = false) => {
  await expect(selector(page)).toHaveValue(table.name);
  if (fallback)
    await expect(
      page
        .getByTestId('floorplan-renderer-host')
        .getByRole('button', { name: `Seleccionar mesa ${table.name}`, exact: true, includeHidden: true })
    ).toHaveAttribute('aria-pressed', 'true');
  else await expect.poll(async () => shapeNode(await scene(page), table)?.selected).toBe(true);
};
const choose = async (page, table, fallback = false) => {
  await closePanel(page);
  const input = selector(page);
  await activate(input);
  await input.fill(table.name);
  await activate(page.getByRole('option', { name: table.name, exact: true }));
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await assertSelected(page, table, fallback);
};
async function geometry(page, context, table = null) {
  const measured = await page.evaluate(() => {
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
    };
    const host = document.querySelector('[data-testid="floorplan-renderer-host"]'),
      selector = document.querySelector('.MuiAutocomplete-root'),
      summary = document.querySelector('[aria-label="Resumen de la distribución"]');
    const renderer =
      host.querySelector('canvas') ?? host.querySelector('[aria-label="Plano interactivo de mesas y zonas"]');
    const h = box(host),
      raw = box(renderer),
      painted = {
        x: Math.max(h.x, raw.x),
        y: Math.max(h.y, raw.y),
        right: Math.min(h.right, raw.right),
        bottom: Math.min(h.bottom, raw.bottom)
      };
    const overlap = (r) =>
      Math.max(0, Math.min(painted.right, r.right) - Math.max(painted.x, r.x)) *
      Math.max(0, Math.min(painted.bottom, r.bottom) - Math.max(painted.y, r.y));
    return {
      host: h,
      canvas: raw,
      paintedCanvas: painted,
      selector: box(selector),
      summary: box(summary),
      selectorOverlap: overlap(box(selector)),
      summaryOverlap: overlap(box(summary)),
      containment: getComputedStyle(host).contain,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1,
      stalePoppers: document.querySelectorAll('.MuiAutocomplete-popper').length,
      selectedName: selector.querySelector('input').value
    };
  });
  assert.equal(measured.selectorOverlap, 0);
  assert.equal(measured.summaryOverlap, 0);
  assert.equal(measured.horizontalOverflow, false);
  assert.equal(measured.stalePoppers, 0);
  assert.equal(measured.containment, 'paint');
  const controls = [];
  for (const control of [
    page.getByLabel('Resumen de la distribución'),
    page.getByRole('button', { name: 'Ajustar plano a la vista', exact: true })
  ]) {
    await control.scrollIntoViewIfNeeded();
    const hit = await control.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        x = r.x + r.width / 2,
        y = r.y + r.height / 2,
        top = document.elementFromPoint(x, y);
      return {
        x,
        y,
        tag: top?.tagName,
        label: top?.getAttribute('aria-label') ?? top?.textContent?.slice(0, 80),
        belongsToControl: el.contains(top),
        canvas: top?.tagName === 'CANVAS'
      };
    });
    assert(hit.belongsToControl && !hit.canvas);
    await activate(control);
    controls.push(hit);
  }
  await expect(page.locator('input[role="combobox"]')).toHaveCount(1);
  const entry = {
    ...context,
    viewport: page.viewportSize(),
    selectedTable: table ? { id: table.id, name: table.name } : null,
    ...measured,
    elementFromPoint: controls,
    result: 'PASS'
  };
  result.geometry.push(entry);
  return entry;
}
try {
  await db.connect();
  const admin = await browser.newContext();
  await login(admin.request);
  const send = transport(admin.request);
  await db.query(
    "INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'FLYER',true,now(),now()) ON CONFLICT(code) DO NOTHING",
    [randomUUID()]
  );
  const client = await clientFixture(db),
    fixtures = [];
  for (const count of [50, 100, 200]) {
    const event = await eventFixture(db, client, `Selector escalable · ${count} mesas`);
    await uploadApi(
      admin.request,
      event,
      sources.find((s) => s.key === 'landscape')
    );
    const tables = [];
    for (let i = 0; i < count; i++)
      tables.push(
        await send(
          'POST',
          `${event.base}/shapes`,
          {
            kind: 'TABLE',
            geometry: 'CIRCLE',
            name:
              count === 50 && i >= 47 && i <= 48
                ? `Familia Pérez y amistades con nombre humano extenso · grupo ${i - 46}`
                : `Mesa ${String(i + 1).padStart(3, '0')}`,
            capacity: 1,
            x: 0.035 + (i % 20) * 0.046,
            y: 0.19 + Math.floor(i / 20) * 0.068,
            width: 0.027,
            height: 0.027,
            rotation: 0
          },
          201
        )
      );
    if (count === 50)
      await send(
        'POST',
        `${event.base}/shapes`,
        {
          kind: 'DECORATIVE_ZONE',
          geometry: 'RECTANGLE',
          name: 'Escenario no asignable',
          capacity: 0,
          x: 0.1,
          y: 0.05,
          width: 0.1,
          height: 0.04,
          rotation: 0
        },
        201
      );
    await send('POST', `${event.base}/lock`, {});
    await activateFixture(db, event);
    fixtures.push({ count, event, tables });
  }
  const tablePerson = await assistantFixture(db, fixtures[2].event);
  for (const fixture of fixtures)
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 1024, height: 768 }
    ]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width === 1024 });
      await login(context.request, client.email);
      const page = await context.newPage();
      currentPage = page;
      page.setDefaultTimeout(15000);
      let gets = 0;
      const writes = [];
      page.on('request', (r) => {
        if (r.method() === 'GET' && /\/floorplan(?:\?|\/|$)/u.test(r.url())) gets++;
        if (['POST', 'PATCH', 'DELETE'].includes(r.method()) && r.url().includes('/floorplan')) writes.push(r.method());
      });
      await page.goto(`${clientUrl}/eventos/${fixture.event.id}?seccion=mesas`);
      await expect(page.getByTestId('floorplan-renderer-host').locator('canvas').first()).toBeVisible();
      assert.equal(await page.locator('summary').filter({ hasText: 'Mesas y zonas' }).count(), 0);
      const input = selector(page);
      await activate(input);
      await input.fill('Mesa 0');
      await expect(page.getByRole('option').first()).toBeVisible();
      const afterPartial = gets;
      await input.fill('ninguna mesa');
      await expect(page.getByText('No hay mesas con ese nombre.', { exact: true })).toBeVisible();
      assert.equal(gets, afterPartial);
      await page.keyboard.press('Escape');
      if (fixture.count === 50) {
        await activate(input);
        await input.fill('Familia Pérez');
        await expect(page.getByRole('option')).toHaveCount(2);
        await page.keyboard.press('Escape');
        await activate(input);
        await input.fill('Escenario');
        await expect(page.getByRole('option')).toHaveCount(0);
        await page.keyboard.press('Escape');
      }
      const indices =
        fixture.count === 200
          ? [0, 22, 44, 66, 88, 110, 132, 154, 176, 199]
          : [0, Math.floor(fixture.count / 2), fixture.count - 1];
      for (const [cycle, index] of indices.entries()) {
        const table = fixture.tables[index];
        await closePanel(page);
        await activate(input);
        await input.fill('');
        await expect(page.getByRole('option')).toHaveCount(fixture.count);
        const list = await page.getByRole('listbox').evaluate((el) => {
          const r = el.getBoundingClientRect();
          return {
            height: r.height,
            clientHeight: el.clientHeight,
            scrollHeight: el.scrollHeight,
            optionMin: Math.min(...[...el.children].map((c) => c.getBoundingClientRect().height))
          };
        });
        assert(list.height <= Math.min(320, viewport.height * 0.4) + 1);
        assert(list.optionMin >= 44);
        assert(list.scrollHeight > list.clientHeight);
        if (
          cycle === 0 &&
          ((fixture.count === 100 && viewport.width === 1024) || (fixture.count === 200 && viewport.width === 1440))
        )
          await capture(page, `${fixture.count}-${viewport.width}-selector-open`, { tables: fixture.count, list });
        const reads = gets;
        await input.fill(table.name);
        await expect(page.getByRole('option')).toHaveCount(1);
        assert.equal(gets, reads);
        if (cycle === 1) await input.press('Enter');
        else await activate(page.getByRole('option', { name: table.name, exact: true }));
        await assertSelected(page, table);
        await expect(page.locator('.MuiAutocomplete-popper')).toHaveCount(0);
        if (viewport.width === 1024) await expect(page.getByTestId('seating-tablet-drawer')).toBeVisible();
        if (cycle === 1 && fixture.count === 200 && viewport.width === 1440)
          await capture(page, '200-1440-after-selection', {
            tables: 200,
            selected: { id: table.id, name: table.name }
          });
        await closePanel(page);
        await expect(input).toHaveValue('');
        const g = await geometry(page, {
          tables: fixture.count,
          cycle,
          previousSelection: { id: table.id, name: table.name }
        });
        if (cycle === 1 && fixture.count === 100 && viewport.width === 1024)
          await capture(page, '100-1024-after-selection-close', { geometry: g });
        if (cycle === indices.length - 1 && fixture.count === 200 && viewport.width === 1024)
          await capture(page, '200-1024-after-drawer-close', { geometry: g });
      }
      // Native canvas -> same selector and parent highlight, independent of name selection.
      await page.getByRole('button', { name: 'Ajustar plano a la vista', exact: true }).click();
      const snap = await scene(page),
        table = fixture.tables[0],
        point = shapeNode(snap, table).center;
      await page.mouse.move(point.x, point.y);
      if (viewport.width === 1024) await page.touchscreen.tap(point.x, point.y);
      else await page.mouse.click(point.x, point.y);
      await assertSelected(page, table);
      await closePanel(page);
      if (fixture.count === 200 && viewport.width === 1440) {
        await choose(page, table);
        await page.setViewportSize({ width: 1024, height: 768 });
        await expect(page.getByTestId('seating-tablet-drawer')).toBeVisible();
        await closePanel(page);
        await geometry(page, { tables: 200, phase: '1440-to-1024' });
        await page.setViewportSize(viewport);
        await settle(page);
        await geometry(page, { tables: 200, phase: '1024-to-1440' });
      }
      assert.equal(writes.length, 0);
      result.scenarios.push({
        tables: fixture.count,
        viewport,
        nameCycles: indices.length,
        clientSideFilter: true,
        canvasSynchronization: true,
        geometryWrites: 0,
        result: 'PASS'
      });
      process.stdout.write(`[calca-blocker05] TABLE ${fixture.count} / ${viewport.width} PASS\n`);
      await context.close();
    }
  // Delayed lazy module exercises the real DOM Suspense fallback, without changing product state or styles.
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width === 1024 });
    await login(context.request, client.email);
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(15000);
    let delayed = 0;
    await page.route('**/*FloorplanKonvaRenderer*', () => {
      delayed++;
    });
    await page.goto(`${clientUrl}/eventos/${fixtures[2].event.id}?seccion=mesas`);
    await expect(page.getByAltText('Plano del lugar', { exact: true })).toBeVisible();
    await expect.poll(() => delayed).toBeGreaterThan(0);
    await choose(page, fixtures[2].tables[100], true);
    await closePanel(page);
    await geometry(page, { tables: 200, renderer: 'DOM-fallback' });
    result.scenarios.push({ tables: 200, viewport, renderer: 'DOM-fallback', delayedLazyModule: true, result: 'PASS' });
    await context.close();
  }
  // TABLE assign/move/unassign through unchanged UI, real DB readback.
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(context.request, client.email);
  const page = await context.newPage();
  currentPage = page;
  page.setDefaultTimeout(15000);
  const main = fixtures[2];
  await page.goto(`${clientUrl}/eventos/${main.event.id}?seccion=mesas`);
  await expect(selector(page)).toBeVisible();
  await choose(page, main.tables[0]);
  await page.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
  await page.getByRole('button', { name: `Asignar 1 a ${main.tables[0].name}`, exact: true }).click();
  const readPerson = async (id) =>
    (await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [id])).rows[0];
  await expect.poll(async () => (await readPerson(tablePerson.id)).floorplan_shape_id).toBe(main.tables[0].id);
  await page.getByRole('tab', { name: /En esta mesa/u }).click();
  await page.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
  await page.getByRole('button', { name: 'Cambiar mesa de 1', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button')
    .filter({ has: page.getByText(main.tables[1].name, { exact: true }) })
    .click();
  await expect.poll(async () => (await readPerson(tablePerson.id)).floorplan_shape_id).toBe(main.tables[1].id);
  await choose(page, main.tables[1]);
  await page.getByRole('tab', { name: /En esta mesa/u }).click();
  await page.getByRole('button', { name: 'Quitar Mesa', exact: true }).click();
  await expect.poll(() => readPerson(tablePerson.id)).toEqual({ floorplan_shape_id: null, floorplan_seat_id: null });
  result.consumers.push({ mode: 'TABLE', assign: true, move: true, unassign: true, dbVerified: true, result: 'PASS' });
  process.stdout.write('[calca-blocker05] TABLE assign/move/unassign DB PASS\n');
  await context.close();
  // BLOCKER-04 dense seats and Seat -> parent -> selector, plus exact assignment regression.
  const seatEvent = await eventFixture(db, client, 'Lugares densos · selector coherente');
  await uploadApi(
    admin.request,
    seatEvent,
    sources.find((s) => s.key === 'portrait')
  );
  const parents = [];
  for (const [i, p] of placements.slice(0, 2).entries())
    parents.push(
      await send(
        'POST',
        `${seatEvent.base}/shapes`,
        {
          kind: 'TABLE',
          geometry: 'CIRCLE',
          name: `Mesa de lugares ${i + 1}`,
          capacity: 25,
          x: p.x - 0.04,
          y: p.y - 0.04,
          width: 0.08,
          height: 0.08,
          rotation: 0
        },
        201
      )
    );
  await send('PATCH', `${seatEvent.base}/seating-mode`, { seatingMode: 'SEAT' });
  for (const [j, t] of parents.entries())
    for (let i = 0; i < 25; i++)
      await send(
        'POST',
        `${seatEvent.base}/shapes/${t.id}/seats`,
        {
          ...(j === 0 && i === 0
            ? originalSeatPoint
            : j === 0 && i === 1
              ? { x: seatPosition(placements[j], i).x + 0.01, y: seatPosition(placements[j], i).y + 0.01 }
              : seatPosition(placements[j], i)),
          label: `Lugar ${i + 1}`
        },
        201
      );
  const seats = (await send('GET', seatEvent.base)).seats;
  await send('POST', `${seatEvent.base}/lock`, {});
  await activateFixture(db, seatEvent);
  const seatPerson = await assistantFixture(db, seatEvent);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    const c = await browser.newContext({ viewport, hasTouch: viewport.width === 1024 });
    await login(c.request, client.email);
    const p = await c.newPage();
    currentPage = p;
    p.setDefaultTimeout(15000);
    await p.goto(`${clientUrl}/eventos/${seatEvent.id}?seccion=mesas`);
    await expect(p.getByTestId('floorplan-renderer-host').locator('canvas').first()).toBeVisible();
    const input = selector(p);
    let postSeatId;
    p.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/seating/assign-seats'))
        postSeatId = r.postDataJSON().assignments[0].seatId;
    });
    const seatNode = (s, snap) => snap.seats.find((n) => Math.abs(n.x - s.x) < 1e-8 && Math.abs(n.y - s.y) < 1e-8);
    const pick = async (s) => {
      await closePanel(p);
      await p.getByRole('button', { name: 'Ajustar plano a la vista', exact: true }).click();
      for (let i = 0; i < 4; i++) await p.getByRole('button', { name: 'Acercar plano', exact: true }).click();
      await p.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
      for (let i = 0; i < 30; i++) {
        const snap = await scene(p),
          center = seatNode(s, snap).center,
          b = await p.getByTestId('floorplan-renderer-host').boundingBox(),
          goal = {
            x: (b.x + Math.min(b.x + b.width, viewport.width)) / 2,
            y: (Math.max(b.y + 110, 140) + viewport.height - 45) / 2
          },
          dx = Math.max(-120, Math.min(120, goal.x - center.x)),
          dy = Math.max(-90, Math.min(90, goal.y - center.y));
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
        await p.mouse.move(goal.x, goal.y);
        await p.mouse.down();
        await p.mouse.move(goal.x + dx, goal.y + dy, { steps: 8 });
        await p.mouse.up();
        await settle(p);
      }
      await p.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
      const snap = await scene(p),
        point = seatNode(s, snap).center;
      if (viewport.width === 1024) await p.touchscreen.tap(point.x, point.y);
      else await p.mouse.click(point.x, point.y);
      await expect.poll(async () => seatNode(s, await scene(p))?.selected).toBe(true);
      const parent = parents.find((t) => t.id === s.floorplanShapeId);
      await expect(input).toHaveValue(parent.name);
      result.seats.push({
        viewport,
        seatId: s.id,
        parentId: parent.id,
        parentName: parent.name,
        point,
        scale: snap.scale,
        result: 'PASS'
      });
    };
    const target = seats.find((s) => s.floorplanShapeId === parents[0].id && s.label === 'Lugar 1');
    const targets = seats
      .filter((s) => s.floorplanShapeId === parents[0].id)
      .sort(
        (a, b) =>
          Math.hypot(a.x - target.x, (a.y - target.y) * 1.5) - Math.hypot(b.x - target.x, (b.y - target.y) * 1.5)
      )
      .slice(0, 5);
    for (const s of targets) await pick(s);
    await pick(targets[0]);
    await p.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
    await p.getByRole('button', { name: /^Asignar 1 a /u }).click();
    await expect.poll(async () => (await readPerson(seatPerson.id)).floorplan_seat_id).toBe(targets[0].id);
    assert.equal(postSeatId, targets[0].id);
    await p.getByRole('tab', { name: /En esta mesa/u }).click();
    await p.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
    await p.getByRole('button', { name: 'Cambiar lugar exacto', exact: true }).click();
    const destination = seats.find((s) => s.floorplanShapeId === parents[1].id);
    await p
      .getByRole('dialog')
      .getByRole('button', { name: `${parents[1].name} · Lugar ${destination.label}`, exact: true })
      .click();
    await expect.poll(async () => (await readPerson(seatPerson.id)).floorplan_seat_id).toBe(destination.id);
    await choose(p, parents[1]);
    await p.getByRole('tab', { name: /En esta mesa/u }).click();
    await p.getByRole('button', { name: 'Quitar Mesa', exact: true }).click();
    await expect.poll(() => readPerson(seatPerson.id)).toEqual({ floorplan_shape_id: null, floorplan_seat_id: null });
    result.consumers.push({
      mode: 'SEAT',
      viewport,
      assign: true,
      move: true,
      unassign: true,
      dbVerified: true,
      result: 'PASS'
    });
    process.stdout.write(`[calca-blocker05] SEAT ${viewport.width} assign/move/unassign DB PASS\n`);
    await c.close();
  }
  await admin.close();
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.error = error.message;
  if (currentPage && !currentPage.isClosed())
    await currentPage.screenshot({ path: `${output}/failure.png`, animations: 'disabled' });
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n');
  await browser.close();
  await db.end();
}
