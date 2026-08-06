import { readFile } from 'node:fs/promises';
import { io } from 'socket.io-client';
import { assertStagingOperation, requiredEnvironment, safeFailure, safeHttpsUrl } from './staging-safety';

interface SmokeContext {
  api: URL;
  socket: URL;
  landing: URL;
  client: URL;
  admin: URL;
  scanner: URL;
  email: string;
  password: string;
  eventId: string;
  invitationToken: string;
  staffToken: string;
}

const inspectedBodies: string[] = [];

async function smokeStaging(): Promise<void> {
  assertStagingOperation(process.argv.slice(2), process.env, { confirmationFlag: '--confirm-staging' });
  const context: SmokeContext = {
    api: safeHttpsUrl(process.env, 'STAGING_API_BASE_URL', '/api/v1'),
    socket: safeHttpsUrl(process.env, 'STAGING_SOCKET_URL', '/'),
    landing: safeHttpsUrl(process.env, 'STAGING_LANDING_URL', '/'),
    client: safeHttpsUrl(process.env, 'STAGING_CLIENT_URL', '/'),
    admin: safeHttpsUrl(process.env, 'STAGING_ADMIN_URL', '/'),
    scanner: safeHttpsUrl(process.env, 'STAGING_SCANNER_URL', '/'),
    email: requiredEnvironment(process.env, 'STAGING_DEMO_EMAIL'),
    password: requiredEnvironment(process.env, 'STAGING_DEMO_PASSWORD'),
    eventId: requiredEnvironment(process.env, 'STAGING_DEMO_EVENT_ID'),
    invitationToken: requiredEnvironment(process.env, 'STAGING_INVITATION_TOKEN'),
    staffToken: requiredEnvironment(process.env, 'STAGING_STAFF_TOKEN')
  };

  const health = await jsonFetch(new URL(`${context.api.href}/health`), { expectedStatus: 200 });
  assertRecord(health, 'health');
  if (health.status !== 'ok' || health.checks?.database?.status !== 'up')
    throw new Error('Health does not report API and database ready.');

  await Promise.all([
    inspectFrontend(context.landing, ['/']),
    inspectFrontend(context.client, [
      `/invitacion/${encodeURIComponent(context.invitationToken)}`,
      '/album/controlled-invalid-token'
    ]),
    inspectFrontend(context.admin, ['/login']),
    inspectFrontend(context.scanner, [`/scanner/${encodeURIComponent(context.staffToken)}`])
  ]);

  const allowedOrigin = context.admin.origin;
  const login = await fetch(new URL(`${context.api.href}/auth/login`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: allowedOrigin },
    body: JSON.stringify({ email: context.email, password: context.password })
  });
  if (login.status !== 200) throw new Error(`Demo login failed with HTTP ${login.status}.`);
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Demo login did not set the authentication cookie.');
  assertCors(login, allowedOrigin);
  inspectedBodies.push(await login.text());
  await jsonFetch(new URL(`${context.api.href}/auth/me`), {
    expectedStatus: 200,
    headers: { cookie, origin: allowedOrigin }
  });
  await jsonFetch(new URL(`${context.api.href}/events/${context.eventId}`), {
    expectedStatus: 200,
    headers: { cookie, origin: allowedOrigin }
  });
  await jsonFetch(new URL(`${context.api.href}/public/invitations/${encodeURIComponent(context.invitationToken)}`), {
    expectedStatus: 200
  });
  await jsonFetch(new URL(`${context.api.href}/scanner/${encodeURIComponent(context.staffToken)}/session`), {
    expectedStatus: 200
  });
  await jsonFetch(new URL(`${context.api.href}/scanner/st1.invalid/session`), { expectedStatus: 401 });

  const preflight = await fetch(new URL(`${context.api.href}/auth/login`), {
    method: 'OPTIONS',
    headers: {
      origin: allowedOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type'
    }
  });
  if (!preflight.ok) throw new Error(`Allowed CORS preflight failed with HTTP ${preflight.status}.`);
  assertCors(preflight, allowedOrigin);
  const rejectedOrigin = 'https://unauthorized.invalid';
  const rejected = await fetch(new URL(`${context.api.href}/auth/login`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: rejectedOrigin },
    body: JSON.stringify({ email: context.email, password: context.password })
  });
  if (rejected.status !== 403 || rejected.headers.get('access-control-allow-origin')) {
    throw new Error('Unauthorized Origin was not rejected safely.');
  }

  await verifySocket(context.socket, context.staffToken);
  await assertNoSecrets(context);
  process.stdout.write(`${JSON.stringify({ event: 'staging_smoke_passed', checks: 18 })}\n`);
}

async function inspectFrontend(base: URL, routes: string[]): Promise<void> {
  for (const route of routes) {
    const response = await fetch(new URL(route, base), { redirect: 'follow' });
    if (!response.ok || response.status === 404 || response.url.startsWith('http:')) {
      throw new Error(`Frontend direct route failed for ${base.hostname}.`);
    }
    const html = await response.text();
    inspectedBodies.push(html);
    if (containsConfiguredLoopbackUrl(html))
      throw new Error(`Loopback application URL found in ${base.hostname} HTML.`);
    const assets = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/giu)].map((match) => match[1]).filter(Boolean);
    for (const asset of assets) {
      const body = await (await fetch(new URL(asset!, response.url))).text();
      inspectedBodies.push(body);
      if (containsConfiguredLoopbackUrl(body))
        throw new Error(`Loopback application URL found in ${base.hostname} build.`);
    }
  }
}

async function jsonFetch(
  url: URL,
  options: { expectedStatus: number; headers?: Record<string, string> }
): Promise<unknown> {
  const response = await fetch(url, options.headers ? { headers: options.headers } : {});
  const text = await response.text();
  inspectedBodies.push(text);
  if (response.status !== options.expectedStatus)
    throw new Error(`Unexpected HTTP ${response.status} from ${url.pathname}.`);
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Non-JSON response from ${url.pathname}.`);
  }
}

async function verifySocket(socketBase: URL, staffToken: string): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const socket = io(new URL('/realtime', socketBase).href, {
      path: '/socket.io',
      transports: ['websocket'],
      reconnection: true,
      auth: { protocolVersion: 1, actorMode: 'STAFF_TOKEN', staffToken, roomType: 'scanner' },
      timeout: 10_000
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Socket.IO connection timed out.'));
    }, 12_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.disconnect();
      resolvePromise();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.disconnect();
      reject(new Error(`Socket.IO connection failed: ${error.name}.`));
    });
  });
}

function assertCors(response: Response, origin: string): void {
  if (
    response.headers.get('access-control-allow-origin') !== origin ||
    response.headers.get('access-control-allow-credentials') !== 'true'
  ) {
    throw new Error('CORS response does not match the exact credentialed Origin.');
  }
}

async function assertNoSecrets(context: SmokeContext): Promise<void> {
  const examined = inspectedBodies.join('\n');
  for (const marker of ['passwordHash', 'tokenDigestSha256', 'DATABASE_URL']) {
    if (examined.includes(marker)) throw new Error(`Sensitive field ${marker} found in examined responses.`);
  }
  for (const secretValue of [context.password, context.staffToken]) {
    if (examined.includes(secretValue)) throw new Error('A staging secret was reflected in examined responses.');
  }
  const logPath = process.env.STAGING_LOG_EXPORT_PATH?.trim();
  if (!logPath) return;
  const logs = await readFile(resolveLogPath(logPath), 'utf8');
  for (const value of [
    context.password,
    context.staffToken,
    requiredEnvironment(process.env, 'STAGING_DATABASE_URL')
  ]) {
    if (logs.includes(value)) throw new Error('A staging secret was found in the provided log export.');
  }
  if (/set-cookie|authorization:\s*bearer|password["'=:\s]+[^*\s]/iu.test(logs))
    throw new Error('Potential credential material found in the provided log export.');
}

function containsConfiguredLoopbackUrl(value: string): boolean {
  // React Router itself embeds a generic http://localhost URL as an internal fallback. A configured
  // application URL is distinguishable by its port or contractual API path.
  return /https?:\\?\/\\?\/(?:localhost|127\.0\.0\.1|\[::1\])(?:[:\\]\d+|\\?\/api\\?\/v1)/iu.test(value);
}

function resolveLogPath(path: string): string {
  if (!/^(?:[A-Za-z]:[\\/]|\/)/u.test(path)) throw new Error('STAGING_LOG_EXPORT_PATH must be absolute.');
  return path;
}

function assertRecord(
  value: unknown,
  label: string
): asserts value is { status?: unknown; checks?: { database?: { status?: unknown } } } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} response is invalid.`);
}

void smokeStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_smoke_failed', error)}\n`);
  process.exitCode = 1;
});
