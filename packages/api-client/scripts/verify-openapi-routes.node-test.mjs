import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { verifyOpenApiRoutes } from './verify-openapi-routes.mjs';

const requesterType = `
type ApiRequest = { method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'; path: string; response: 'json' };
type ApiRequester = <T>(options: ApiRequest) => Promise<T>;
`;

test('accepts an explicit GET wrapper', async () => {
  const result = await verifyFixture(
    `${requesterType} export const make = (request: ApiRequester) => () => request({ method: 'GET', path: '/widgets', response: 'json' });`,
    { '/api/v1/widgets': { get: {} } }
  );
  assert.equal(result.ok, true);
  assert.equal(result.checkedRoutes, 1);
});

test('treats an omitted method as GET', async () => {
  const result = await verifyFixture(
    `${requesterType} export const make = (request: ApiRequester) => () => request({ path: '/widgets', response: 'json' });`,
    { '/api/v1/widgets': { get: {} } }
  );
  assert.equal(result.ok, true);
});

test('accepts a POST wrapper', async () => {
  const result = await verifyFixture(
    `${requesterType} export const make = (request: ApiRequester) => () => request({ method: 'POST', path: '/widgets', response: 'json' });`,
    { '/api/v1/widgets': { post: {} } }
  );
  assert.equal(result.ok, true);
});

test('accepts a PUT wrapper', async () => {
  const result = await verifyFixture(
    `${requesterType} export const make = (request: ApiRequester) => () => request({ method: 'PUT', path: '/widgets/current', response: 'json' });`,
    { '/api/v1/widgets/current': { put: {} } }
  );
  assert.equal(result.ok, true);
});

test('normalizes dynamic parameters through local path helpers', async () => {
  const source = `${requesterType}
    export function make(request: ApiRequester) {
      const base = (widgetId: string) => \`/widgets/\${encodeURIComponent(widgetId)}\`;
      return (widgetId: string, partId: string) => request({
        path: \`\${base(widgetId)}/parts/\${encodeURIComponent(partId)}\`,
        response: 'json'
      });
    }`;
  const result = await verifyFixture(source, { '/api/v1/widgets/{widgetId}/parts/{partId}': { get: {} } });
  assert.equal(result.ok, true);
  assert.equal(result.routes[0]?.path, '/widgets/{}/parts/{}');
});

test('ignores query strings when comparing route identity', async () => {
  const source = `${requesterType}
    export const make = (request: ApiRequester) => (search: string) =>
      request({ path: \`/widgets?search=\${encodeURIComponent(search)}\`, response: 'json' });`;
  const result = await verifyFixture(source, { '/api/v1/widgets': { get: {} } });
  assert.equal(result.ok, true);
  assert.equal(result.routes[0]?.path, '/widgets');
});

test('rejects the right path with the wrong method', async () => {
  const result = await verifyFixture(
    `${requesterType} export const make = (request: ApiRequester) => () => request({ method: 'POST', path: '/widgets', response: 'json' });`,
    { '/api/v1/widgets': { get: {} } }
  );
  assert.equal(result.ok, false);
  assert.match(result.issues[0]?.reason ?? '', /método inexistente/);
  assert.equal(result.issues[0]?.method, 'POST');
});

test('rejects a missing route even when the wrapper compiles as TypeScript', async () => {
  const source = `${requesterType}
    export const make = (request: ApiRequester) => () =>
      request({ method: 'POST', path: '/removed-floorplan-route', response: 'json' });`;
  const compilation = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, strict: true },
    reportDiagnostics: true
  });
  assert.deepEqual(compilation.diagnostics, []);

  const result = await verifyFixture(source, { '/api/v1/widgets': { get: {} } });
  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.reason, 'ruta inexistente');
  assert.equal(result.issues[0]?.path, '/removed-floorplan-route');
});

test('rejects a path expression that cannot be resolved', async () => {
  const source = `${requesterType}
    export const make = (request: ApiRequester) => (runtimeSuffix: string) =>
      request({ path: \`/widgets/\${runtimeSuffix}\`, response: 'json' });`;
  const result = await verifyFixture(source, { '/api/v1/widgets/{widgetId}': { get: {} } });
  assert.equal(result.ok, false);
  assert.match(result.issues[0]?.reason ?? '', /path no resoluble/);
});

async function verifyFixture(source, paths) {
  const directory = await mkdtemp(join(tmpdir(), 'api-client-openapi-verifier-'));
  const sourceRoot = join(directory, 'src');
  const openapiPath = join(directory, 'openapi.json');
  await mkdir(sourceRoot);
  await Promise.all([
    writeFile(join(sourceRoot, 'client.ts'), source, 'utf8'),
    writeFile(openapiPath, JSON.stringify({ openapi: '3.0.0', paths }), 'utf8')
  ]);
  try {
    return await verifyOpenApiRoutes({ sourceRoot, openapiPath });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
