import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { runtimeHash } from '../../../../scripts/access-control-guide/verify.mjs';
// Reuse only fixture/action helpers and the existing raster, never run or rewrite CALCA06 certification.
import { TraceUi, clientFixture, eventFixture, transport, login, uploadApi } from '../calca06/browser-helpers.mjs';
const output = 'docs/05-implementacion/evidence/calca-blocker02/attempts/reproduction';
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
    'Independent reproduction of CALCA06 attempt-9 only; real API/PostgreSQL, native Chromium actions, same raster, SELF_SERVICE PHYSICAL_QR; no response mocks or product state injection',
  scenarios: [],
  captures: [],
  findings: []
};
let page;
try {
  await db.connect();
  for (const code of ['FLYER', 'PHYSICAL_QR'])
    await db.query(
      'INSERT INTO service(id,code,is_active,created_at,updated_at) VALUES($1,$2,true,now(),now()) ON CONFLICT(code) DO NOTHING',
      [randomUUID(), code]
    );
  const client = await clientFixture(db);
  await db.query("UPDATE client SET operating_profile='SELF_SERVICE' WHERE id=$1", [client.id]);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 }
  ]) {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width === 1024 });
    await login(context.request);
    const send = transport(context.request);
    for (const legacy of [false, true]) {
      const event = await eventFixture(db, client, `Pase físico de prueba ${legacy ? 'heredado' : 'por Mesa'}`);
      await db.query("UPDATE event SET service_id=(SELECT id FROM service WHERE code='PHYSICAL_QR') WHERE id=$1", [
        event.id
      ]);
      const plan = await uploadApi(context.request, event, source);
      await send(
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
      if (legacy) {
        await db.query("UPDATE floorplan SET seating_mode='SEAT' WHERE id=$1", [plan.id]);
        await db.query(
          "INSERT INTO floorplan_seat(id,event_id,floorplan_id,floorplan_shape_id,label,normalized_label,x,y,created_at,updated_at) SELECT $1,$2,$3,s.id,'Lugar heredado','lugar heredado',0.3,0.45,now(),now() FROM floorplan_shape s WHERE s.floorplan_id=$3 AND s.deleted_at IS NULL LIMIT 1",
          [randomUUID(), event.id, plan.id]
        );
      }
      page = await context.newPage();
      page.setDefaultTimeout(15000);
      const ui = new TraceUi(page, event, viewport, result, output);
      await ui.open();
      await ui.enter();
      const rejected = await send('PATCH', `${event.base}/seating-mode`, { seatingMode: 'SEAT' }, 409);
      assert.equal(rejected.code, 'PHYSICAL_PASS_TABLE_INVALID');
      if (!legacy) {
        const options = await ui.details('Opciones del croquis');
        await options.locator('summary').click();
        await page.getByRole('combobox', { name: 'Acomodo' }).click();
        assert.equal(await page.getByRole('option').count(), 1);
        await expect(page.getByRole('option', { name: 'Por mesa', exact: true })).toBeVisible();
        await expect(page.getByRole('option', { name: 'Por lugar exacto', exact: true })).toHaveCount(0);
        await page.keyboard.press('Escape');
        await options.locator('summary').click();
        await ui.addTable('Mesa de Calca', { x: 0.5, y: 0.55 });
      } else {
        await expect(page.getByText(/El croquis conserva lugares heredados/u)).toBeVisible();
        await ui.chooseTable('Mesa física');
      }
      await expect(page.getByRole('button', { name: 'Trazar lugares', exact: true })).toHaveCount(0);
      await ui.capture(`${viewport.width}-${legacy ? 'legacy-seat-readonly' : 'table-only'}`);
      assert.equal(ui.writes.filter((w) => w.method === 'POST' && w.resource.endsWith('/seats')).length, 0);
      if (legacy) {
        const before = (
          await db.query('SELECT id,label,floorplan_shape_id,deleted_at FROM floorplan_seat WHERE event_id=$1', [
            event.id
          ])
        ).rows;
        const denied = await send(
          'POST',
          `${event.base}/shapes/${(await ui.state()).shapes[0].id}/seats`,
          { label: 'No autorizado', x: 0.6, y: 0.6 },
          409
        );
        assert.equal(denied.code, 'PHYSICAL_PASS_TABLE_INVALID');
        await page
          .getByRole('region', { name: 'Mesa en Calca' })
          .getByRole('button', { name: 'Cancelar', exact: true })
          .click();
        await page.getByRole('button', { name: 'Volver a Por mesa', exact: true }).click();
        await page.getByRole('dialog').getByRole('button', { name: 'Cambiar a mesas', exact: true }).click();
        await expect.poll(async () => (await ui.state()).seatingMode).toBe('TABLE');
        await expect(page.getByRole('button', { name: 'Volver a Por mesa', exact: true })).toHaveCount(0);
        assert.deepEqual(
          (
            await db.query('SELECT id,label,floorplan_shape_id,deleted_at FROM floorplan_seat WHERE event_id=$1', [
              event.id
            ])
          ).rows,
          before
        );
        await ui.capture(`${viewport.width}-legacy-returned-table`);
      }
      const state = await ui.state(),
        facts = (await db.query('SELECT count(*)::int AS seats FROM floorplan_seat WHERE event_id=$1', [event.id]))
          .rows[0];
      assert.equal(state.seatingMode, 'TABLE');
      assert.equal(facts.seats, legacy ? 1 : 0);
      result.scenarios.push({
        viewport,
        profile: 'SELF_SERVICE',
        service: 'PHYSICAL_QR',
        legacy,
        requestedSeatModeStatus: 409,
        code: rejected.code,
        uiSeatPosts: 0,
        traceOffered: false,
        finalMode: state.seatingMode,
        preservedLegacySeats: facts.seats,
        tableConstruction: !legacy,
        result: 'PASS'
      });
      await page.close();
    }
    await context.close();
  }
  result.status = 'PASS';
} catch (error) {
  result.status = 'BLOCKED';
  result.failure = { name: error.name, message: error.message.replace(/st1\.[A-Za-z0-9_-]{43}/gu, '[Staff oculto]') };
  if (page && !page.isClosed()) await page.screenshot({ path: `${output}/failure.png` });
  process.exitCode = 1;
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(result, null, 2) + '\n');
  await browser.close();
  await db.end();
}
console.log(
  JSON.stringify({ status: result.status, scenarios: result.scenarios.length, failure: result.failure }, null, 2)
);
