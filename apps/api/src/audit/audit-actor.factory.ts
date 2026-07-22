import { createHash } from 'node:crypto';
import { AuditActorType } from '../generated/prisma/client';
import type { AuditActor } from './audit.types';

function requireIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (normalized.length === 0) {
    throw new TypeError(`${label} is required.`);
  }

  return normalized;
}

export class AuditActorFactory {
  static user(userId: string): AuditActor {
    return {
      type: AuditActorType.USER,
      id: requireIdentifier(userId, 'userId')
    };
  }

  static staffToken(staffTokenId: string): AuditActor {
    return {
      type: AuditActorType.STAFF_TOKEN,
      id: requireIdentifier(staffTokenId, 'staffTokenId')
    };
  }

  static publicToken(rawToken: string): AuditActor {
    const token = requireIdentifier(rawToken, 'rawToken');

    return {
      type: AuditActorType.PUBLIC_TOKEN,
      fingerprint: createHash('sha256').update(token).digest('hex')
    };
  }

  static system(): AuditActor {
    return {
      type: AuditActorType.SYSTEM
    };
  }
}
