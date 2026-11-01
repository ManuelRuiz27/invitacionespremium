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
  transport,
  login,
  uploadApi
} from '../calca06/browser-helpers.mjs';
const output = 'docs/05-implementacion/evidence/calca-blocker03b/attempts/reproduction';
await mkdir(output, { recursive: true });
const source = JSON.parse(await readFile('docs/05-implementacion/evidence/calca06/fixtures.json', 'utf8')).find(
  (s) => s.key === 'landscape'
);
const { Client } = createRequire(resolve('apps/api/package.json'))('pg');
const db = new Client({ connectionString: process.env.DATABASE_URL }),
  browser = await chromium.launch();
const result = {
  runtimeSha256: await runtimeHash(),
  method:
    'Independent native CALCA06 attempt-10 and pending-precision reproduction only. Real Admin/API/PostgreSQL, same raster. No response mocks or product state/style injection; no CALCA06 certification rerun.',
  scenarios: [],
  captures: [],
  status: 'RUNNING'
};
try {
  await db.connect();
  await db.query(
    "INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,'FLYER',true,now(),now()) ON CONFLICT(code) DO NOTHING",
    [randomUUID()]
  );
  const client = await clientFixture(db);
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
  await login(context.request);
  const send = transport(context.request),
    cases = [];
  for (const pending of [false, true]) {
    const event = await eventFixture(
      db,
      client,
      pending ? 'Mesa pendiente de lugar exacto' : 'Capacidad autoritativa tras cambio de modo'
    );
    await uploadApi(context.request, event, source);
    const tables = [];
    for (const [index, capacity] of (pending ? [12] : [12, 24]).entries())
      tables.push(
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
        )
      );
    let person;
    if (pending) {
      person = await assistantFixture(db, event);
      await db.query('UPDATE assistant SET floorplan_shape_id=$1 WHERE id=$2', [tables[0].id, person.id]);
    }
    await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' });
    cases.push({ event, tables, person, pending });
  }
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    for (const { event, tables, person, pending } of cases) {
      const page = await context.newPage();
      await page.setViewportSize(viewport);
      page.setDefaultTimeout(15000);
      const ui = new TraceUi(page, event, viewport, result, output);
      await ui.open();
      await ui.enter();
      await ui.review();
      const current = await ui.state();
      assert.equal(current.seatingMode, 'SEAT');
      assert.equal(current.seats.length, 0);
      assert.deepEqual(
        current.shapes.map((s) => s.capacity),
        tables.map(() => 0)
      );
      const persisted = (
        await db.query('SELECT capacity FROM floorplan_shape WHERE event_id=$1 AND deleted_at IS NULL ORDER BY name', [
          event.id
        ])
      ).rows.map((s) => s.capacity);
      assert.deepEqual(
        persisted,
        tables.map(() => 0)
      );
      if (pending) {
        const row = (
          await db.query('SELECT floorplan_shape_id,floorplan_seat_id FROM assistant WHERE id=$1', [person.id])
        ).rows[0];
        assert.equal(row.floorplan_shape_id, tables[0].id);
        assert.equal(row.floorplan_seat_id, null);
      }
      const review = page.getByRole('region', { name: 'Revisión de distribución' });
      for (const table of tables)
        await expect(
          review.getByText(`${table.name}: 0 asignables · 0 definidos · 0 bloqueados`, { exact: true })
        ).toBeVisible();
      await expect(review.getByText('Sin lugares definidos', { exact: true })).toHaveCount(tables.length);
      await expect(review.getByRole('button', { name: 'Finalizar distribución', exact: true })).toBeEnabled();
      assert.equal(ui.writes.length, 0);
      await ui.capture(`capacity-${viewport.width}-${pending ? 'pending-precision' : 'zero-places'}`);
      result.scenarios.push({
        viewport,
        pendingPeople: pending ? 1 : 0,
        before: tables.map((t) => t.capacity),
        apiAfter: current.shapes.map((s) => s.capacity),
        dbAfter: persisted,
        seatWrites: 0,
        tableAssignmentPreserved: pending,
        exactSeatFabricated: false,
        warningsInformational: true,
        result: 'PASS'
      });
      await page.close();
    }
  }
  await context.close();
  result.status = 'PASS';
} catch (error) {
  result.status = 'FAIL';
  result.error = error.message;
  throw error;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n');
  await browser.close();
  await db.end();
}
