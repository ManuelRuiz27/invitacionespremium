const hostname = process.env.LOCAL_SMOKE_HOSTNAME?.trim() || 'localhost';
const apiOrigin = `http://${hostname}:3000`;
const apiBaseUrl = `${apiOrigin}/api/v1`;
const timeoutMs = Number(process.env.LOCAL_SMOKE_TIMEOUT_MS || 3000);

const frontends = [
  { name: 'client', origin: `http://${hostname}:5173` },
  { name: 'admin', origin: `http://${hostname}:5174` },
  { name: 'scanner', origin: `http://${hostname}:5175` },
  { name: 'landing', origin: `http://${hostname}:5176` }
];

const checks = [
  checkJson('api-health', `${apiBaseUrl}/health`),
  checkJson('landing-public-pricing', `${apiBaseUrl}/public/pricing`),
  checkSocketHandshake(`${apiOrigin}/socket.io/?EIO=4&transport=polling`),
  ...frontends.map(({ name, origin }) => checkFrontend(name, origin)),
  ...frontends.map(({ name, origin }) => checkCors(name, origin))
];

try {
  const results = await Promise.all(checks);
  process.stdout.write(`${JSON.stringify({ status: 'ok', checks: results })}\n`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${JSON.stringify({ status: 'error', message })}\n`);
  process.exitCode = 1;
}

async function checkJson(name, url) {
  const response = await request(url);
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) throw new Error(`${name} did not return JSON`);
  await response.json();
  return name;
}

async function checkFrontend(name, origin) {
  const response = await request(origin);
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  const body = await response.text();
  if (!body.includes('id="root"')) throw new Error(`${name} did not return its application shell`);
  return `${name}-shell`;
}

async function checkCors(name, origin) {
  const response = await request(`${apiBaseUrl}/health`, { headers: { Origin: origin } });
  if (!response.ok) throw new Error(`${name} API probe returned HTTP ${response.status}`);
  if (response.headers.get('access-control-allow-origin') !== origin) {
    throw new Error(`${name} origin is not allowed by API CORS`);
  }
  if (response.headers.get('access-control-allow-credentials') !== 'true') {
    throw new Error(`${name} API probe does not allow credentials`);
  }
  return `${name}-api-cors`;
}

async function checkSocketHandshake(url) {
  const origin = `http://${hostname}:5175`;
  const response = await request(url, { headers: { Origin: origin } });
  if (!response.ok) throw new Error(`realtime returned HTTP ${response.status}`);
  const body = await response.text();
  if (!body.startsWith('0')) throw new Error('realtime did not return a Socket.IO handshake');

  const handshake = JSON.parse(body.slice(1));
  if (typeof handshake.sid !== 'string') throw new Error('realtime handshake did not include a session id');
  const closeUrl = new URL(url);
  closeUrl.searchParams.set('sid', handshake.sid);
  const closeResponse = await request(closeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8', Origin: origin },
    body: '1'
  });
  if (!closeResponse.ok) throw new Error(`realtime close returned HTTP ${closeResponse.status}`);
  return 'scanner-realtime';
}

async function request(url, options = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, { ...options, signal });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${url} is unavailable: ${reason}`);
  }
}
