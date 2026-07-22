import type { AuditActorType } from '../generated/prisma/client';

export type AuditObject = Record<string, unknown>;

export interface AuditActor {
  type: AuditActorType;
  id?: string;
  fingerprint?: string;
}

export interface AuditRecordInput {
  actor: AuditActor;
  resourceType: string;
  resourceId?: string;
  clientId?: string;
  eventId?: string;
  action: string;
  beforeData?: AuditObject;
  afterData?: AuditObject;
  metadata?: AuditObject;
  operationId?: string;
}

export interface AuditedMutationResult<TResult> {
  result: TResult;
  afterData?: AuditObject;
}
