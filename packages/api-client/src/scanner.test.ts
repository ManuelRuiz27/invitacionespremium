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
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
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
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
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
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
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
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
    await expect(
      client.scanner.scanPhysicalPass('staff', 'new-attempt', 'pp1.payload.signature')
    ).rejects.toMatchObject({ status: 409, code: 'PHYSICAL_PASS_ALREADY_USED' });
  });
});
