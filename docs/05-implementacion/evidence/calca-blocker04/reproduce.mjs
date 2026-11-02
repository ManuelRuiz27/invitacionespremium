/* global window, document, requestAnimationFrame */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { runtimeHash } from '../../../../scripts/access-control-guide/verify.mjs';
import {
  TraceUi,
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
const output = 'docs/05-implementacion/evidence/calca-blocker04/attempts/reproduction';
await mkdir(output, { recursive: true });
const source = JSON.parse(await readFile('docs/05-implementacion/evidence/calca06/fixtures.json', 'utf8')).find(
  (s) => s.key === 'portrait'
);
const original = JSON.parse(
  await readFile('docs/05-implementacion/evidence/calca06/attempts/attempt-4/results.json', 'utf8')
).findings.find((f) => f.id === 'DENSE_SEAT_HIT_TARGET');
const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }),
  browser = await chromium.launch();
const result = {
  runtimeSha256: await runtimeHash(),
  sourceSha256: source.sha256,
  originalPoint: original.intendedNormalizedPoint,
  method:
    'Original portrait raster, 50-place pattern and exact normalized failing point from attempt-4. Fresh fictitious UUIDs, real services and native pointer/touch. Read-only Konva scene geometry and pointer-up observer, no injected product state/styles. Not full CALCA06.',
  captures: [],
  geometry: [],
  assignments: [],
  scenarios: [],
  status: 'RUNNING'
};
let currentPage;
try {
  await db.connect();
  const admin = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await login(admin.request);
  await db.query(
    "INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'FLYER',true,now(),now()) ON CONFLICT(code) DO NOTHING",
    [randomUUID()]
  );
  const client = await clientFixture(db),
    event = await eventFixture(db, client, 'Selección precisa en plano vertical denso');
  const send = transport(admin.request);
  await uploadApi(admin.request, event, source);
  const tables = [];
  for (const [index, p] of placements.slice(0, 2).entries())
    tables.push(
      await send(
        'POST',
        `${event.base}/shapes`,
        {
          kind: 'TABLE',
          geometry: 'CIRCLE',
          name: `Mesa ${index + 1}`,
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
  await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' });
  for (const [tableIndex, table] of tables.entries()) {
    for (let i = 0; i < 25; i++) {
      let point = seatPosition(placements[tableIndex], i);
      if (tableIndex === 0 && i === 0) point = original.intendedNormalizedPoint;
      if (tableIndex === 0 && i === 1) point = { x: point.x + 0.01, y: point.y + 0.01 };
      await send('POST', `${event.base}/shapes/${table.id}/seats`, { ...point, label: `Lugar ${i + 1}` }, 201);
    }
  }
  let state = await send('GET', event.base);
  assert.equal(state.seats.length, 50);
  const target = state.seats.find((s) => s.floorplanShapeId === tables[0].id && s.label === 'Lugar 1');
  assert.deepEqual({ x: target.x, y: target.y }, original.intendedNormalizedPoint);
  const neighbor = state.seats
    .filter((s) => s.id !== target.id)
    .sort(
      (a, b) =>
        (a.x - target.x) ** 2 + (a.y - target.y) ** 2 * 2.25 - ((b.x - target.x) ** 2 + (b.y - target.y) ** 2 * 2.25)
    )[0];
  const adminPage = await admin.newPage();
  const builder = new TraceUi(adminPage, event, { width: 1440, height: 900 }, result, output);
  await builder.open();
  await builder.enter();
  await builder.review();
  await builder.finalize();
  await adminPage.close();
  await activateFixture(db, event);
  const person = await assistantFixture(db, event);
  await admin.close();
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width === 1024 });
    await login(context.request, client.email);
    const page = await context.newPage();
    currentPage = page;
    page.setDefaultTimeout(15000);
    const assignments = [],
      geometryWrites = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/seating/assign-seats'))
        assignments.push(request.postDataJSON());
      if (
        ['POST', 'PATCH', 'DELETE'].includes(request.method()) &&
        /\/floorplan\/(?:shapes|seats)/u.test(request.url())
      )
        geometryWrites.push(request.method());
    });
    await page.addInitScript(() => {
      window.__calca04Pointers = [];
      document.addEventListener(
        'pointerup',
        (e) => {
          if (e.target.closest?.('[data-testid="floorplan-renderer-host"]'))
            window.__calca04Pointers.push({ clientX: e.clientX, clientY: e.clientY, type: e.pointerType });
        },
        true
      );
    });
    await page.goto(`${clientUrl}/eventos/${event.id}?seccion=mesas`);
    const host = page.getByTestId('floorplan-renderer-host');
    await expect(host.locator('canvas').first()).toBeVisible();
    const ui = new TraceUi(page, event, viewport, result, output);
    const scene = () =>
      page.evaluate(() => {
        const stage = window.Konva.stages.find((s) =>
          document.querySelector('[data-testid="floorplan-renderer-host"]').contains(s.container())
        );
        const b = stage.getContent().getBoundingClientRect();
        const rx = b.width / stage.width(),
          ry = b.height / stage.height();
        return {
          scale: stage.scaleX(),
          x: stage.x(),
          y: stage.y(),
          width: stage.width(),
          height: stage.height(),
          bounds: { left: b.left, top: b.top, width: b.width, height: b.height },
          nodes: stage.find('.floorplan-seat').map((g) => {
            const p = g.getAbsoluteTransform().point({ x: 0, y: 0 });
            return {
              normalizedX: g.x() / stage.width(),
              normalizedY: g.y() / stage.height(),
              center: { x: b.left + p.x * rx, y: b.top + p.y * ry },
              selected: Math.abs(g.findOne('Circle').strokeWidth() * stage.scaleX() - 3) < 0.001
            };
          })
        };
      });
    const selected = async () => {
      const nodes = (await scene()).nodes.filter((n) => n.selected);
      assert(nodes.length <= 1);
      if (!nodes.length) return null;
      const matches = state.seats.filter(
        (s) => Math.abs(s.x - nodes[0].normalizedX) < 1e-8 && Math.abs(s.y - nodes[0].normalizedY) < 1e-8
      );
      assert.equal(matches.length, 1);
      return matches[0].id;
    };
    const nodeFor = (s, snapshot) =>
      snapshot.nodes.find((n) => Math.abs(n.normalizedX - s.x) < 1e-8 && Math.abs(n.normalizedY - s.y) < 1e-8);
    const closeDrawer = async () => {
      const drawer = page.locator('.MuiDrawer-root.MuiModal-root');
      if (await drawer.count()) {
        await page.keyboard.press('Escape');
        await drawer.waitFor({ state: 'hidden' });
      }
    };
    const settle = () =>
      page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bring = async (s) => {
      await closeDrawer();
      await settle();
      const previous = await selected();
      await page.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
      for (let i = 0; i < 35; i++) {
        const snapshot = await scene(),
          center = nodeFor(s, snapshot).center,
          box = await host.boundingBox();
        const left = Math.max(box.x + 25, 25),
          right = Math.min(box.x + box.width - 25, viewport.width === 1024 ? 540 : viewport.width - 25);
        const top = Math.max(box.y + 110, 140),
          bottom = Math.min(box.y + box.height - 25, viewport.height - 45);
        const dx = Math.max(-120, Math.min(120, (left + right) / 2 - center.x)),
          dy = Math.max(-90, Math.min(90, (top + bottom) / 2 - center.y));
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) break;
        const start = { x: (left + right) / 2, y: (top + bottom) / 2 };
        await page.mouse.move(start.x, start.y);
        await page.mouse.down();
        await page.mouse.move(start.x + dx, start.y + dy, { steps: 8 });
        await page.mouse.up();
        await settle();
      }
      await page.getByRole('button', { name: 'Activar modo mover plano', exact: true }).click();
      await settle();
      assert.equal(await selected(), previous, 'Pan must not change Seat selection');
    };
    const fit = async (scale) => {
      await closeDrawer();
      await page.getByRole('button', { name: 'Ajustar plano a la vista', exact: true }).click();
      await settle();
      if (scale === 4) {
        await bring(target);
        const previous = await selected();
        const center = nodeFor(target, await scene()).center;
        await page.mouse.move(center.x, center.y);
        for (let i = 0; i < 15; i++) {
          await page.mouse.wheel(0, -80);
          await settle();
        }
        assert.equal(await selected(), previous, 'Wheel must not change Seat selection');
      } else
        for (let i = 0; i < (scale === 1 ? 0 : 4); i++)
          await page.getByRole('button', { name: 'Acercar plano', exact: true }).click();
      await expect.poll(async () => (await scene()).scale).toBeCloseTo(scale, 5);
    };
    const choose = async (s, label) => {
      await bring(s);
      const before = await scene(),
        expected = nodeFor(s, before).center;
      const count = await page.evaluate(() => window.__calca04Pointers.length);
      if (viewport.width === 1024) await page.touchscreen.tap(expected.x, expected.y);
      else await page.mouse.click(expected.x, expected.y);
      const observed = await page.evaluate((i) => window.__calca04Pointers.slice(i).at(-1), count);
      if (!observed) {
        result.geometry.push({
          viewport,
          label,
          expected: { id: s.id, center: expected },
          bounds: before.bounds,
          host: await host.boundingBox(),
          gesture: null,
          result: 'OUTSIDE_CANVAS'
        });
        throw new Error('Harness gesture did not reach canvas');
      }
      const others = state.seats
        .filter((p) => p.id !== s.id)
        .map((p) => ({ id: p.id, center: nodeFor(p, before).center }))
        .sort(
          (a, b) =>
            Math.hypot(a.center.x - observed.clientX, a.center.y - observed.clientY) -
            Math.hypot(b.center.x - observed.clientX, b.center.y - observed.clientY)
        );
      const competing = others[0];
      const entry = {
        viewport,
        label,
        scale: before.scale,
        translation: { x: before.x, y: before.y },
        gesture: observed,
        expected: { id: s.id, normalized: { x: s.x, y: s.y }, center: expected },
        nearestCompeting: competing,
        expectedDistance: Math.hypot(expected.x - observed.clientX, expected.y - observed.clientY),
        competingDistance: Math.hypot(competing.center.x - observed.clientX, competing.center.y - observed.clientY),
        radiusScreenPx: 22,
        resolvedSeatId: await selected(),
        result: 'PENDING'
      };
      result.geometry.push(entry);
      try {
        await expect.poll(selected).toBe(s.id);
        entry.resolvedSeatId = await selected();
        entry.result = 'PASS';
      } catch (error) {
        entry.resolvedSeatId = await selected();
        entry.result = 'FAIL';
        throw error;
      }
    };
    const captureSelected = async (seat, name) => {
      // Opening the existing assignment panel resizes/clips the stage. Pan back
      // through its toolbar so the confirmed selection is visible in the PNG.
      await bring(seat);
      assert.equal(await selected(), seat.id);
      const snapshot = await scene(),
        center = nodeFor(seat, snapshot).center,
        box = await host.boundingBox();
      assert(center.x > Math.max(0, box.x) && center.x < Math.min(viewport.width, box.x + box.width));
      assert(center.y > Math.max(0, box.y) && center.y < Math.min(viewport.height, box.y + box.height));
      await ui.capture(name);
      result.captures.at(-1).selectedSeat = { id: seat.id, center, scale: snapshot.scale };
    };
    assert.equal(await selected(), null);
    await fit(2.0736);
    await bring(target);
    assert.equal(await selected(), null);
    await ui.capture(`${viewport.width}-01-dense-before-selection`);
    await choose(target, 'original-attempt-4');
    await captureSelected(target, `${viewport.width}-02-expected-selected`);
    await choose(neighbor, 'nearest-neighbor');
    await captureSelected(neighbor, `${viewport.width}-03-neighbor-selected`);
    for (const scale of [1, 2.0736, 4]) {
      await fit(scale);
      const neighbors = state.seats
        .filter((s) => s.floorplanShapeId === target.floorplanShapeId)
        .sort(
          (a, b) =>
            Math.hypot(a.x - target.x, (a.y - target.y) * 1.5) - Math.hypot(b.x - target.x, (b.y - target.y) * 1.5)
        )
        .slice(0, 5);
      for (const s of neighbors) await choose(s, `neighbor-series-${scale}`);
    }
    await fit(2.0736);
    await choose(target, 'assignment-target');
    await page.getByRole('checkbox', { name: 'Seleccionar Invitado de prueba', exact: true }).check();
    await page.getByRole('button', { name: /^Asignar 1 a /u }).click();
    await expect
      .poll(
        async () =>
          (await db.query('SELECT floorplan_seat_id FROM assistant WHERE id=$1', [person.id])).rows[0].floorplan_seat_id
      )
      .toBe(target.id);
    assert.equal(assignments.length, 1);
    assert.equal(assignments[0].assignments[0].seatId, target.id);
    const persisted = (
      await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [person.id])
    ).rows[0];
    assert.equal(persisted.floorplan_shape_id, target.floorplanShapeId);
    await page.reload();
    await expect(host.locator('canvas').first()).toBeVisible();
    await choose(target, 'reload-occupied-target');
    await expect(page.getByText(`Mesa ${tables[0].name} · Lugar ${target.label}`, { exact: true })).toBeVisible();
    result.assignments.push({
      viewport,
      apiSeatId: assignments[0].assignments[0].seatId,
      expectedSeatId: target.id,
      parentId: persisted.floorplan_shape_id,
      reloadedSeatId: await selected(),
      label: target.label,
      result: 'PASS'
    });
    await page.getByRole('button', { name: 'Quitar Mesa', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await db.query('SELECT floorplan_seat_id FROM assistant WHERE id=$1', [person.id])).rows[0].floorplan_seat_id
      )
      .toBe(null);
    assert.equal(geometryWrites.length, 0);
    state = await transport(context.request)('GET', `/events/${event.id}/floorplan`);
    assert.equal(state.seats.length, 50);
    result.scenarios.push({
      viewport,
      selectedCenters: result.geometry.filter((g) => g.viewport.width === viewport.width).length,
      seatCount: 50,
      plannerGeometryWrites: 0,
      exactAssignmentPosts: assignments.length,
      result: 'PASS'
    });
    await context.close();
  }
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
