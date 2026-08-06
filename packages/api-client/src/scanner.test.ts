import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('ScannerClient', () => {
  it('expone scanner tipado y valida la sesión generada', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        status: 'AVAILABLE',
        staff: { alias: 'Puerta' },
        event: {
          id: 'event',
          name: 'Evento',
          status: 'ACTIVE',
          eventDateTime: '2026-08-05T20:00:00.000Z',
          timeZone: 'America/Mexico_City',
          floorplanEnabled: false
        }
      })
    );
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    await expect(client.scanner.getSession('staff/token')).resolves.toMatchObject({ status: 'AVAILABLE' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/api/v1/scanner/staff%2Ftoken/session',
      expect.objectContaining({ credentials: 'omit' })
    );
  });

  it('envía el Idempotency-Key contractual en check-in', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      json({
        status: 'CHECKED_IN',
        invitationId: 'invitation',
        checkedIn: [],
        remainingPendingAssistants: [],
        remainingPendingCount: 0
      })
    );
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    await client.scanner.checkIn('staff', 'attempt-123', { invitationId: 'invitation', assistantIds: ['assistant'] });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/check-in'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'attempt-123' }),
        body: JSON.stringify({ invitationId: 'invitation', assistantIds: ['assistant'] })
      })
    );
  });

  it('envía token e idempotencia separados para pase físico', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        json({ status: 'USED', physicalPassId: 'pass', passNumber: 7, usedAt: '2026-08-05T20:00:00.000Z', table: null })
      );
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    await client.scanner.scanPhysicalPass('staff', 'physical-attempt', 'pp1.payload.signature');
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('/physical-passes/scan'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': 'physical-attempt' }),
        body: JSON.stringify({ qrToken: 'pp1.payload.signature' })
      })
    );
  });

  it('propaga el estado operativo de un pase ya utilizado', async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({ code: 'PHYSICAL_PASS_ALREADY_USED', message: 'Already used.' }, 409));
    const client = createApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    await expect(
      client.scanner.scanPhysicalPass('staff', 'new-attempt', 'pp1.payload.signature')
    ).rejects.toMatchObject({ status: 409, code: 'PHYSICAL_PASS_ALREADY_USED' });
  });

  it.each([
    [
      'session',
      { status: 'AVAILABLE', staff: {}, event: {} },
      (client: ReturnType<typeof createApiClient>) => client.scanner.getSession('staff')
    ],
    [
      'invitation result',
      {
        status: 'AVAILABLE',
        invitation: { id: 'invitation', mode: 'INDIVIDUAL' },
        confirmedCount: 1,
        checkedInCount: 0,
        pendingCount: 1,
        pendingAssistants: [{ id: 'assistant', name: 'Ana', isPrimary: true }]
      },
      (client: ReturnType<typeof createApiClient>) => client.scanner.scan('staff', 'qr')
    ],
    [
      'check-in',
      {
        status: 'CHECKED_IN',
        invitationId: 'invitation',
        checkedIn: [{ name: 'Ana', checkedInAt: '2026-08-05T20:00:00.000Z', table: null }],
        remainingPendingAssistants: [],
        remainingPendingCount: 0
      },
      (client: ReturnType<typeof createApiClient>) =>
        client.scanner.checkIn('staff', 'attempt', { invitationId: 'invitation', assistantIds: ['assistant'] })
    ],
    [
      'floorplan shape',
      {
        floorplanId: 'floorplan',
        contentPath: '/floorplan',
        shapes: [{ id: 'table', name: '1', kind: 'TABLE', x: 0, y: 0, width: 0.2, height: 0.2 }]
      },
      (client: ReturnType<typeof createApiClient>) => client.scanner.getFloorplan('staff')
    ],
    [
      'physical pass',
      { status: 'USED', physicalPassId: 'pass', passNumber: 1, usedAt: '2026-08-05T20:00:00.000Z' },
      (client: ReturnType<typeof createApiClient>) => client.scanner.scanPhysicalPass('staff', 'attempt', 'qr')
    ]
  ])('rechaza una respuesta incompleta de %s', async (_, body, invoke) => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(body))
    });
    await expect(invoke(client)).rejects.toMatchObject({ status: 502, code: 'UNEXPECTED_API_RESPONSE' });
  });

  it.each([
    {
      status: 'AVAILABLE',
      invitation: { id: 'invitation', mode: 'INDIVIDUAL' },
      confirmedCount: 1,
      checkedInCount: -1,
      pendingCount: 2,
      pendingAssistants: []
    },
    {
      status: 'NO_PENDING',
      invitation: { id: 'invitation', mode: 'INDIVIDUAL' },
      confirmedCount: 2,
      checkedInCount: 1,
      pendingCount: 1,
      pendingAssistants: [{ id: 'assistant', name: 'Ana', isPrimary: true, table: null }]
    }
  ])('rechaza conteos negativos o incoherentes del Scanner', async (body) => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(json(body))
    });
    await expect(client.scanner.scan('staff', 'qr')).rejects.toMatchObject({
      status: 502,
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });

  it('rechaza geometría, ocupación y coordenadas fuera del contrato', async () => {
    const client = createApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetchImpl: vi.fn<typeof fetch>().mockResolvedValue(
        json({
          floorplanId: 'floorplan',
          contentPath: '/floorplan',
          shapes: [
            {
              id: 'table',
              name: '1',
              kind: 'TABLE',
              geometry: 'POLYGON',
              capacity: 4,
              occupancy: 5,
              availableCapacity: -1,
              x: Number.POSITIVE_INFINITY,
              y: 0,
              width: 0,
              height: 0.2,
              rotation: 360,
              polygonPoints: [{ x: 0, y: 0 }]
            }
          ]
        })
      )
    });
    await expect(client.scanner.getFloorplan('staff')).rejects.toMatchObject({
      status: 502,
      code: 'UNEXPECTED_API_RESPONSE'
    });
  });
});
