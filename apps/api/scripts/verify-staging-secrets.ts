import { assertStagingOperation, requiredEnvironment, safeFailure, safeHttpsUrl } from './staging-safety';

interface DemoVerification {
  email: string;
  eventId: string;
  auth: unknown;
  event: unknown;
  invitation: unknown;
  staffSession: unknown;
}

const DEMO_INVITATION_ID = '14000000-0000-4000-8000-000000000031';

export function assertDemoSecretConsistency(input: DemoVerification): void {
  const auth = record(input.auth, 'auth');
  const user = record(auth.user, 'auth user');
  const event = record(input.event, 'event');
  const invitation = record(input.invitation, 'invitation');
  const invitationView = record(invitation.invitation, 'invitation view');
  const staff = record(input.staffSession, 'staff session');
  const staffEvent = record(staff.event, 'staff event');
  if (
    user.email !== input.email ||
    typeof user.clientId !== 'string' ||
    event.id !== input.eventId ||
    event.clientId !== user.clientId ||
    invitationView.id !== DEMO_INVITATION_ID ||
    staffEvent.id !== input.eventId
  ) {
    throw new Error('Configured staging demo credentials are stale or cross a demo Client/Event boundary.');
  }
}

export async function verifyStagingSecrets(
  args = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
  request: typeof fetch = fetch
): Promise<void> {
  assertStagingOperation(args, environment, { confirmationFlag: '--confirm-staging' });
  const api = safeHttpsUrl(environment, 'STAGING_API_BASE_URL', '/api/v1');
  const origin = safeHttpsUrl(environment, 'STAGING_ADMIN_URL', '/').origin;
  const email = requiredEnvironment(environment, 'STAGING_DEMO_EMAIL');
  const password = requiredEnvironment(environment, 'STAGING_DEMO_PASSWORD');
  const eventId = requiredEnvironment(environment, 'STAGING_DEMO_EVENT_ID');
  const invitationToken = requiredEnvironment(environment, 'STAGING_INVITATION_TOKEN');
  const staffToken = requiredEnvironment(environment, 'STAGING_STAFF_TOKEN');
  const login = await request(new URL(`${api.href}/auth/login`), {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email, password })
  });
  if (login.status !== 200) throw new Error('Configured STAGING_DEMO_PASSWORD no longer authenticates the demo user.');
  const cookie = login.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie) throw new Error('Staging demo login did not return a session cookie.');
  const auth = await responseJson(login);
  const [event, invitation, staffSession] = await Promise.all([
    checkedJson(request, new URL(`${api.href}/events/${eventId}`), { headers: { cookie, origin } }),
    checkedJson(request, new URL(`${api.href}/public/invitations/${encodeURIComponent(invitationToken)}`)),
    checkedJson(request, new URL(`${api.href}/scanner/${encodeURIComponent(staffToken)}/session`))
  ]);
  assertDemoSecretConsistency({ email, eventId, auth, event, invitation, staffSession });
  process.stdout.write(`${JSON.stringify({ event: 'staging_demo_secrets_verified', eventId })}\n`);
}

async function checkedJson(request: typeof fetch, url: URL, init?: RequestInit): Promise<unknown> {
  const response = await request(url, init);
  if (response.status !== 200) throw new Error(`Configured staging demo secret failed ${url.pathname}.`);
  return responseJson(response);
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error('Staging demo verification received invalid JSON.');
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`Invalid ${label} response.`);
  return value as Record<string, unknown>;
}

if (require.main === module) {
  void verifyStagingSecrets().catch((error: unknown) => {
    process.stderr.write(`${safeFailure('staging_demo_secrets_failed', error)}\n`);
    process.exitCode = 1;
  });
}
