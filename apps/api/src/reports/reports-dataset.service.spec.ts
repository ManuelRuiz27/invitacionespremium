import { describe, expect, it } from 'vitest';
import type { Prisma } from '../generated/prisma/client';
import { GeneratedReportPrivacyMode, GeneratedReportType } from '../generated/prisma/client';
import { ReportsDatasetService } from './reports-dataset.service';

const event = {
  id: 'a9827bf1-62b0-43ed-843e-48bc49342fa4',
  name: 'Evento',
  socialType: 'WEDDING',
  eventDateTime: new Date('2026-01-01T18:00:00.000Z'),
  timeZone: 'America/Mexico_City'
};

describe('ReportsDatasetService', () => {
  const service = new ReportsDatasetService();

  it('builds detailed and aggregate attendance from the same authoritative counts', async () => {
    const invitations = [
      {
        cancelledAt: null,
        responseStatus: 'CONFIRMED',
        contact: { name: 'Familia', group: { name: 'Amistades' } },
        assistants: [
          {
            id: 'assistant-1',
            name: 'Persona',
            responseStatus: 'CONFIRMED',
            floorplanShape: { name: 'Mesa 1' },
            checkIns: [
              {
                assistantId: 'assistant-1',
                checkedInAt: new Date('2026-01-01T19:00:00.000Z'),
                revertedAt: null
              }
            ]
          }
        ]
      }
    ];
    const transaction = {
      invitation: { findMany: async () => invitations }
    } as unknown as Prisma.TransactionClient;

    const detailed = await service.build(
      transaction,
      event,
      GeneratedReportType.ATTENDANCE,
      GeneratedReportPrivacyMode.DETAILED
    );
    const aggregate = await service.build(
      transaction,
      event,
      GeneratedReportType.ATTENDANCE,
      GeneratedReportPrivacyMode.AGGREGATE
    );

    expect(detailed.summary).toEqual(aggregate.summary);
    expect(detailed.rows).toEqual([
      {
        assistantName: 'Persona',
        invitationName: 'Familia',
        groupName: 'Amistades',
        attendanceStatus: 'CHECKED_IN',
        tableName: 'Mesa 1',
        checkedInAt: '2026-01-01T19:00:00.000Z',
        revertedAt: null
      }
    ]);
    expect(aggregate.rows).toEqual([]);
  });

  it('builds physical pass used and unused rows without internal identifiers', async () => {
    const transaction = {
      physicalPass: {
        findMany: async () => [
          { passNumber: 1, usedAt: new Date('2026-01-01T19:00:00.000Z'), floorplanShape: { name: 'Mesa 1' } },
          { passNumber: 2, usedAt: null, floorplanShape: null }
        ]
      }
    } as unknown as Prisma.TransactionClient;

    const dataset = await service.build(
      transaction,
      event,
      GeneratedReportType.PHYSICAL_PASSES,
      GeneratedReportPrivacyMode.AGGREGATE
    );
    expect(dataset.summary).toEqual({ total: 2, used: 1, unused: 1 });
    expect(dataset.passes).toEqual([
      { passNumber: 1, status: 'USED', tableName: 'Mesa 1', usedAt: '2026-01-01T19:00:00.000Z' },
      { passNumber: 2, status: 'UNUSED', tableName: null, usedAt: null }
    ]);
    expect(JSON.stringify(dataset)).not.toMatch(/nonce|token|staff|id"/iu);
  });
});
