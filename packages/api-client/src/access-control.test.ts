import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const baseUrl = 'https://api.example.test/api/v1';
const date = '2026-10-22T20:00:00.000Z';
const credential = {
  id: 'credential',
  eventId: 'event',
  assistantId: 'assistant',
  status: 'ISSUED',
  issuedAt: date,
  revokedAt: null,
  revocationReasonCode: null,
  hasActiveCheckIn: false
};
const readiness = {
  complete: false,
  accessMode: 'NOMINAL',
  activeMaterialCount: 0,
  capacity: 3,
  blockers: ['EVENT_ACCESS_CREDENTIAL_MISSING']
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('ACCESS_CONTROL SDK routes and transport', () => {
  it('reads Provider and Client readiness through their own authenticated surfaces', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => json(readiness));
    const api = createApiClient({ baseUrl, fetchImpl });
    const signal = new AbortController().signal;
    await expect(api.events.getAccessReadiness('event/id', signal)).resolves.toEqual(readiness);
    await expect(api.adminEventPreparation.getAccessReadiness('client/id', 'event/id', signal)).resolves.toEqual(
      readiness
    );
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/events/event%2Fid/access-readiness`,
      `${baseUrl}/admin/clients/client%2Fid/events/event%2Fid/access-readiness`
    ]);
    for (const [, init] of fetchImpl.mock.calls) expect(init).toMatchObject({ credentials: 'include', signal });
  });

  it('issues by Assistant UUID, lists history, downloads ephemeral SVG and revokes with a technical reason', async () => {
    const revoked = { ...credential, status: 'REVOKED', revokedAt: date, revocationReasonCode: 'OPERATOR_REQUEST' };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(credential))
      .mockResolvedValueOnce(json([credential]))
      .mockResolvedValueOnce(new Response('<svg/>'))
      .mockResolvedValueOnce(json(revoked));
    const api = createApiClient({ baseUrl, fetchImpl }).nominalAccessCredentials;
    await expect(api.issue('event/id', 'assistant/id', 'issue-key')).resolves.toEqual(credential);
    await expect(api.list('event/id')).resolves.toEqual([credential]);
    await expect(api.svg('event/id', 'credential/id')).resolves.toBe('<svg/>');
    await expect(
      api.revoke('event/id', 'credential/id', { revocationReasonCode: 'OPERATOR_REQUEST' }, 'revoke-key')
    ).resolves.toEqual(revoked);
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `${baseUrl}/events/event%2Fid/nominal-access-credentials/assistants/assistant%2Fid/issue`,
      `${baseUrl}/events/event%2Fid/nominal-access-credentials`,
      `${baseUrl}/events/event%2Fid/nominal-access-credentials/credential%2Fid/svg`,
      `${baseUrl}/events/event%2Fid/nominal-access-credentials/credential%2Fid/revoke`
    ]);
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'include',
      body: '{}',
      headers: { 'Idempotency-Key': 'issue-key' }
    });
    expect(fetchImpl.mock.calls[3]?.[1]).toMatchObject({
      credentials: 'include',
      body: JSON.stringify({ revocationReasonCode: 'OPERATOR_REQUEST' }),
      headers: { 'Idempotency-Key': 'revoke-key' }
    });
  });

  it('generates only on the explicit Provider route and revokes on the Organization route', async () => {
    const revoked = {
      status: 'REVOKED',
      physicalPassId: 'pass',
      passNumber: 8,
      revokedAt: date,
      revocationReasonCode: 'OPERATOR_REQUEST'
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        json({
          generationOperationId: 'op',
          quantity: 2,
          eventId: 'event',
          firstPassNumber: 7,
          lastPassNumber: 8,
          table: null,
          passes: [7, 8].map((passNumber) => ({
            id: `pass-${passNumber}`,
            eventId: 'event',
            passNumber,
            status: 'UNUSED',
            usedAt: null,
            createdAt: date,
            table: null
          }))
        })
      )
      .mockResolvedValueOnce(json(revoked));
    const api = createApiClient({ baseUrl, fetchImpl });
    await api.adminEventPreparation.generatePhysicalPasses(
      'client',
      'event',
      { quantity: 2, tableShapeId: null },
      'same-generation-key'
    );
    await expect(
      api.physicalPasses.revoke('event', 'pass', { revocationReasonCode: 'OPERATOR_REQUEST' }, 'revoke-pass-key')
    ).resolves.toEqual(revoked);
    expect(fetchImpl.mock.calls[0]).toEqual([
      `${baseUrl}/admin/clients/client/events/event/physical-passes/generate`,
      expect.objectContaining({
        credentials: 'include',
        body: JSON.stringify({ quantity: 2, tableShapeId: null }),
        headers: expect.objectContaining({ 'Idempotency-Key': 'same-generation-key' })
      })
    ]);
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(`${baseUrl}/events/event/physical-passes/pass/revoke`);
    expect(fetchImpl.mock.calls.some(([url]) => /finance|quote|ledger/iu.test(String(url)))).toBe(false);
  });

  it('accepts ACCESS_CONTROL in Event validation without changing self-service create payloads', async () => {
    const event = {
      id: 'event',
      assignedPlannerUserId: 'planner',
      status: 'DRAFT',
      serviceCode: 'ACCESS_CONTROL',
      accessMode: 'NOMINAL',
      name: null,
      timeZone: null,
      updatedAt: date
    };
    const api = createApiClient({ baseUrl, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(event)) });
    await expect(api.events.get('event')).resolves.toEqual(event);
  });

  it('retains the Provider generation intention when a 2xx response lacks the authoritative batch', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ generationOperationId: 'op', quantity: 1, passes: [] }));
    const api = createApiClient({ baseUrl, fetchImpl });
    await expect(
      api.adminEventPreparation.generatePhysicalPasses('client', 'event', { quantity: 1 }, 'batch-key')
    ).rejects.toMatchObject({ status: 502, code: 'UNEXPECTED_API_RESPONSE' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    { ...readiness, activeMaterialCount: -1 },
    { ...readiness, accessMode: 'FAMILY' },
    { ...readiness, blockers: [null] }
  ])('rejects malformed readiness rather than inventing defaults', async (body) => {
    const api = createApiClient({ baseUrl, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(body)) });
    await expect(api.events.getAccessReadiness('event')).rejects.toMatchObject({ code: 'UNEXPECTED_API_RESPONSE' });
  });

  it('propagates used-credential rejection through ApiError without retrying a different operation', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ code: 'NOMINAL_ACCESS_ASSISTANT_ALREADY_USED', message: 'Used' }, 409));
    const api = createApiClient({ baseUrl, fetchImpl });
    await expect(
      api.nominalAccessCredentials.revoke('event', 'credential', { revocationReasonCode: 'OPERATOR_REQUEST' }, 'key')
    ).rejects.toMatchObject({ status: 409, code: 'NOMINAL_ACCESS_ASSISTANT_ALREADY_USED' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('scans nominal atomically, omits cookies and preserves an explicit retry key and token', async () => {
    const result = {
      status: 'CHECKED_IN',
      assistantId: 'assistant',
      checkInId: 'checkin',
      name: 'Ana',
      checkedInAt: date,
      table: null,
      seat: null
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('network'))
      .mockResolvedValueOnce(json(result));
    const api = createApiClient({ baseUrl, fetchImpl }).scanner;
    await expect(api.scanNominalAccess('staff/id', 'same-key', 'na1.opaque')).rejects.toThrow('network');
    await expect(api.scanNominalAccess('staff/id', 'same-key', 'na1.opaque')).resolves.toEqual(result);
    expect(fetchImpl.mock.calls[0]).toEqual(fetchImpl.mock.calls[1]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      `${baseUrl}/scanner/staff%2Fid/nominal-access/scan`,
      expect.objectContaining({
        credentials: 'omit',
        body: JSON.stringify({ qrToken: 'na1.opaque' }),
        headers: expect.objectContaining({ 'Idempotency-Key': 'same-key' })
      })
    ]);
  });

  it.each(['NOMINAL', 'ANONYMOUS'])('validates the minimal B01 public session (%s)', async (accessMode) => {
    const body = {
      status: 'AVAILABLE',
      staff: { alias: 'Puerta' },
      event: {
        id: 'event',
        name: 'Accesos',
        status: 'ACTIVE',
        eventDateTime: date,
        timeZone: 'America/Mexico_City',
        floorplanEnabled: false,
        serviceCode: 'ACCESS_CONTROL',
        accessMode
      }
    };
    const api = createApiClient({ baseUrl, fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(body)) });
    await expect(api.scanner.getSession('staff')).resolves.toEqual(body);
  });
});
