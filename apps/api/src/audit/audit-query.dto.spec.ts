import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AuditActorType } from '../generated/prisma/client';
import { AUDIT_LOG_DEFAULT_LIMIT, decodeAuditCursor, encodeAuditCursor, parseAuditLogQuery } from './audit-query.dto';

const id = '11111111-1111-4111-8111-111111111111';

describe('audit query contract', () => {
  it('parses all supported filters and applies the documented default limit', () => {
    expect(
      parseAuditLogQuery({
        clientId: id,
        actorType: AuditActorType.SYSTEM,
        resourceType: 'Client',
        createdFrom: '2026-08-04T00:00:00-06:00',
        createdTo: '2026-08-05T00:00:00-06:00'
      })
    ).toEqual({
      clientId: id,
      actorType: AuditActorType.SYSTEM,
      resourceType: 'Client',
      createdFrom: '2026-08-04T00:00:00-06:00',
      createdTo: '2026-08-05T00:00:00-06:00',
      limit: AUDIT_LOG_DEFAULT_LIMIT
    });
  });

  it.each([
    { unknown: 'field' },
    { clientId: 'invalid' },
    { actorType: 'INVALID' },
    { createdFrom: '2026-08-05T00:00:00Z', createdTo: '2026-08-04T00:00:00Z' },
    { createdFrom: 'not-an-instant' },
    { limit: '0' },
    { limit: '101' },
    { cursor: 'invalid!' }
  ])('rejects invalid query input %#', (input) => {
    expect(() => parseAuditLogQuery(input)).toThrow(BadRequestException);
  });

  it('round-trips a canonical opaque cursor and rejects tampering', () => {
    const at = new Date('2026-08-04T18:00:00.000Z');
    const cursor = encodeAuditCursor(at, id);
    expect(decodeAuditCursor(cursor)).toEqual({ occurredAt: at, id });
    expect(() => decodeAuditCursor(`${cursor}=`)).toThrow(TypeError);
  });
});
