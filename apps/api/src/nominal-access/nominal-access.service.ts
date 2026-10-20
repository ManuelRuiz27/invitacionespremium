import { createHash } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import { AuditActorType, EventStatus, Prisma, type AssistantAccessCredential } from '../generated/prisma/client';
import { NominalAccessTokenService } from './nominal-access-token.service';
import { NominalAccessQrService, type NominalAccessSvgContent } from './nominal-access-qr.service';
import type { NominalAccessCredentialResponseDto, RevokeNominalAccessInput } from './nominal-access.dto';

const eventInclude = { service: true, client: true } satisfies Prisma.EventInclude;
type NominalEvent = Prisma.EventGetPayload<{ include: typeof eventInclude }>;
const assistantInclude = { invitation: { include: { contact: true } } } satisfies Prisma.AssistantInclude;
type NominalAssistant = Prisma.AssistantGetPayload<{ include: typeof assistantInclude }>;
const materialStates = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE,
  EventStatus.ACTIVE,
  EventStatus.EVENT_DAY
]);

export interface ResolvedNominalAccessCredential {
  credentialId: string;
  eventId: string;
  assistantId: string;
}

@Injectable()
export class NominalAccessService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventAccessPolicy) private readonly access: EventAccessPolicy,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(NominalAccessTokenService) private readonly tokens: NominalAccessTokenService,
    @Inject(NominalAccessQrService) private readonly qr: NominalAccessQrService
  ) {}

  async issue(
    eventId: string,
    assistantId: string,
    key: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<NominalAccessCredentialResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      const signature = requestSignature('ISSUE', eventId, assistantId, principal.userId);
      const replay = await this.replay(tx, eventId, key, signature, 'ISSUE');
      if (replay) return replay;
      this.assertMaterialState(event);
      const current = await tx.assistantAccessCredential.findFirst({
        where: { eventId, assistantId, revokedAt: null }
      });
      if (current) await this.lockCredential(tx, eventId, current.id);
      await this.lockAssistant(tx, eventId, assistantId, true);
      await this.assertUnused(tx, assistantId);
      if (current)
        throw conflict('NOMINAL_ACCESS_ALREADY_ISSUED', 'The assistant already has an unrevoked credential.');
      const credential = await tx.assistantAccessCredential.create({
        data: { eventId, assistantId, issuedByUserId: principal.userId, qrTokenNonce: this.tokens.createNonce() }
      });
      await this.recordOperation(tx, event, credential, principal, key, signature, 'ISSUE', operationId);
      return response(credential);
    });
  }

  async list(eventId: string, principal: AuthPrincipal): Promise<NominalAccessCredentialResponseDto[]> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      if (event.deletedAt) throw eventNotFound();
      const credentials = await tx.assistantAccessCredential.findMany({
        where: { eventId },
        orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }]
      });
      const used = await tx.checkIn.findMany({ where: { eventId, revertedAt: null }, select: { assistantId: true } });
      const usedIds = new Set(used.map((entry) => entry.assistantId));
      return credentials.map((credential) => response(credential, usedIds.has(credential.assistantId)));
    });
  }

  async getSvg(eventId: string, credentialId: string, principal: AuthPrincipal): Promise<NominalAccessSvgContent> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertMaterialState(event);
      const credential = await this.lockCredential(tx, eventId, credentialId);
      if (credential.revokedAt) throw conflict('NOMINAL_ACCESS_CREDENTIAL_REVOKED', 'The credential has been revoked.');
      await this.lockAssistant(tx, eventId, credential.assistantId, true);
      try {
        return await this.qr.render(
          this.tokens.issue(credential.id, credential.qrTokenNonce, credential.qrTokenVersion)
        );
      } catch {
        throw new DomainError(
          'NOMINAL_ACCESS_QR_GENERATION_FAILURE',
          'The nominal QR could not be generated.',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
    });
  }

  async revoke(
    eventId: string,
    credentialId: string,
    key: string,
    input: RevokeNominalAccessInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<NominalAccessCredentialResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      const signature = requestSignature('REVOKE', eventId, credentialId, principal.userId, input.revocationReasonCode);
      const replay = await this.replay(tx, eventId, key, signature, 'REVOKE');
      if (replay) return replay;
      this.assertMaterialState(event);
      const credential = await this.lockCredential(tx, eventId, credentialId);
      if (credential.revokedAt) throw conflict('NOMINAL_ACCESS_CREDENTIAL_REVOKED', 'The credential has been revoked.');
      await this.lockAssistant(tx, eventId, credential.assistantId, false);
      await this.assertUnused(tx, credential.assistantId);
      const revoked = await tx.assistantAccessCredential.update({
        where: { id: credentialId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: principal.userId,
          revocationReasonCode: input.revocationReasonCode
        }
      });
      await this.recordOperation(tx, event, revoked, principal, key, signature, 'REVOKE', operationId);
      return response(revoked);
    });
  }

  // Internal cryptographic/aggregate resolution only. DT04 must additionally validate
  // operational Event/Staff/seating and create CheckIn in its own transaction.
  // Caller acquires Event (then Staff, if applicable) before this method.
  async resolveTokenInTransaction(
    tx: Prisma.TransactionClient,
    token: string,
    expectedEventId: string
  ): Promise<ResolvedNominalAccessCredential | null> {
    const verified = this.tokens.verify(token);
    if (!verified) return null;
    const event = await tx.event.findUnique({ where: { id: expectedEventId }, include: eventInclude });
    if (!event || !eligibleEvent(event) || !materialStates.has(event.status)) return null;
    await tx.$queryRaw`SELECT id FROM assistant_access_credential WHERE id = ${verified.credentialId}::uuid AND event_id = ${expectedEventId}::uuid FOR UPDATE`;
    const credential = await tx.assistantAccessCredential.findFirst({
      where: { id: verified.credentialId, eventId: expectedEventId }
    });
    if (!credential || !this.tokens.matches(token, credential)) return null;
    try {
      await this.lockAssistant(tx, expectedEventId, credential.assistantId, true);
    } catch (error) {
      if (error instanceof NotFoundException) return null;
      throw error;
    }
    return { credentialId: credential.id, eventId: credential.eventId, assistantId: credential.assistantId };
  }

  private async lockOwnedEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<NominalEvent> {
    if (principal.role !== 'ORGANIZATION_ADMIN' && principal.role !== 'ORGANIZATION_PLANNER')
      throw new ForbiddenException({ code: 'ROLE_FORBIDDEN', message: 'This role cannot manage nominal credentials.' });
    await tx.$queryRaw`SELECT id FROM event WHERE id = ${eventId}::uuid FOR UPDATE`;
    // Replays authorize current tenant/assignment, including soft-deleted history.
    const event = await tx.event.findFirst({
      where: { id: eventId, ...this.access.ownedWhere(principal) },
      include: eventInclude
    });
    if (!event) throw eventNotFound();
    if (!eligibleEvent(event, true))
      throw conflict('NOMINAL_ACCESS_EVENT_NOT_ELIGIBLE', 'The event does not support nominal credentials.');
    return event;
  }

  private assertMaterialState(event: NominalEvent): void {
    if (event.deletedAt) throw eventNotFound();
    if (!materialStates.has(event.status))
      throw conflict('NOMINAL_ACCESS_EVENT_NOT_MUTABLE', 'Nominal material is unavailable in this event state.');
  }

  private async lockCredential(
    tx: Prisma.TransactionClient,
    eventId: string,
    credentialId: string
  ): Promise<AssistantAccessCredential> {
    await tx.$queryRaw`SELECT id FROM assistant_access_credential WHERE id = ${credentialId}::uuid AND event_id = ${eventId}::uuid FOR UPDATE`;
    const credential = await tx.assistantAccessCredential.findFirst({ where: { id: credentialId, eventId } });
    if (!credential) throw credentialNotFound();
    return credential;
  }

  private async lockAssistant(
    tx: Prisma.TransactionClient,
    eventId: string,
    assistantId: string,
    requireLive: boolean
  ): Promise<NominalAssistant> {
    const context = await tx.assistant.findFirst({
      where: { id: assistantId, eventId },
      select: { invitationId: true, invitation: { select: { contactId: true } } }
    });
    if (!context) throw credentialNotFound();
    await tx.$queryRaw`SELECT id FROM invitation WHERE id = ${context.invitationId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM contact WHERE id = ${context.invitation.contactId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM assistant WHERE id = ${assistantId}::uuid FOR UPDATE`;
    const assistant = await tx.assistant.findFirst({ where: { id: assistantId, eventId }, include: assistantInclude });
    if (!assistant || (requireLive && !liveAssistant(assistant))) throw credentialNotFound();
    return assistant;
  }

  private async assertUnused(tx: Prisma.TransactionClient, assistantId: string): Promise<void> {
    const used = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM check_in WHERE assistant_id = ${assistantId}::uuid AND reverted_at IS NULL ORDER BY id FOR UPDATE`;
    if (used.length) throw conflict('NOMINAL_ACCESS_ASSISTANT_ALREADY_USED', 'The assistant has an active entry.');
  }

  private async replay(
    tx: Prisma.TransactionClient,
    eventId: string,
    key: string,
    signature: string,
    action: 'ISSUE' | 'REVOKE'
  ): Promise<NominalAccessCredentialResponseDto | null> {
    const prior = await tx.nominalAccessCredentialOperation.findUnique({
      where: { idempotencyKey: key },
      include: { credential: true }
    });
    if (!prior) return null;
    if (prior.eventId !== eventId || prior.action !== action || prior.requestSignature !== signature)
      throw conflict('NOMINAL_ACCESS_IDEMPOTENCY_CONFLICT', 'The idempotency key identifies another request.');
    // Immutable issuance fields reconstruct its original response after revocation.
    return response(
      action === 'ISSUE' ? { ...prior.credential, revokedAt: null, revocationReasonCode: null } : prior.credential
    );
  }

  private async recordOperation(
    tx: Prisma.TransactionClient,
    event: NominalEvent,
    credential: AssistantAccessCredential,
    principal: AuthPrincipal,
    key: string,
    signature: string,
    action: 'ISSUE' | 'REVOKE',
    operationId?: string
  ): Promise<void> {
    await tx.nominalAccessCredentialOperation.create({
      data: {
        idempotencyKey: key,
        eventId: event.id,
        credentialId: credential.id,
        actorUserId: principal.userId,
        action,
        requestSignature: signature
      }
    });
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        action: `NOMINAL_ACCESS_${action}`,
        resourceType: 'AssistantAccessCredential',
        resourceId: credential.id,
        clientId: event.clientId,
        eventId: event.id,
        afterData: {
          id: credential.id,
          eventId: event.id,
          assistantId: credential.assistantId,
          issuedAt: credential.issuedAt,
          revokedAt: credential.revokedAt,
          revocationReasonCode: credential.revocationReasonCode
        },
        ...(operationId === undefined ? {} : { operationId })
      },
      tx
    );
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (attempt >= 19 || !retryable(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (attempt + 1), 50)));
      }
    }
  }
}

function eligibleEvent(event: NominalEvent, includeDeleted = false): boolean {
  return (
    (includeDeleted || event.deletedAt === null) &&
    event.service?.code === 'ACCESS_CONTROL' &&
    event.accessMode === 'NOMINAL' &&
    event.client.type === 'ORGANIZATION' &&
    event.client.operatingProfile === 'MANAGED' &&
    event.client.deletedAt === null &&
    event.client.status === 'ACTIVE'
  );
}
function liveAssistant(assistant: NominalAssistant): boolean {
  const invitation = assistant.invitation;
  return (
    assistant.isPrimary &&
    assistant.deletedAt === null &&
    assistant.anonymizedAt === null &&
    assistant.name !== null &&
    assistant.responseStatus === 'PENDING' &&
    invitation.deletedAt === null &&
    invitation.cancelledAt === null &&
    invitation.responseStatus === 'PENDING' &&
    invitation.mode === 'INDIVIDUAL' &&
    invitation.additionalAssistantLimit === 0 &&
    invitation.contact.deletedAt === null &&
    invitation.contact.anonymizedAt === null
  );
}
function response(credential: AssistantAccessCredential, used = false): NominalAccessCredentialResponseDto {
  return {
    id: credential.id,
    eventId: credential.eventId,
    assistantId: credential.assistantId,
    status: credential.revokedAt ? 'REVOKED' : 'ISSUED',
    issuedAt: credential.issuedAt,
    revokedAt: credential.revokedAt,
    revocationReasonCode: credential.revocationReasonCode,
    hasActiveCheckIn: used
  };
}
function requestSignature(
  action: string,
  eventId: string,
  targetId: string,
  actorId: string,
  reason: string | null = null
): string {
  return createHash('sha256').update(JSON.stringify({ action, eventId, targetId, actorId, reason })).digest('hex');
}
function conflict(code: string, message: string): ConflictException {
  return new ConflictException({ code, message });
}
function credentialNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'NOMINAL_ACCESS_CREDENTIAL_NOT_FOUND',
    message: 'Nominal credential or assistant not found.'
  });
}
function retryable(error: unknown): boolean {
  if (typeof error !== 'object' || !error || !('code' in error)) return false;
  if (error.code === 'P2034' || error.code === 'P2002') return true;
  if (error.code !== 'P2010' || !('meta' in error) || !error.meta || typeof error.meta !== 'object') return false;
  const meta = error.meta;
  return (
    ('code' in meta && (meta.code === '40001' || meta.code === '40P01')) ||
    ('driverAdapterError' in meta && String(meta.driverAdapterError).includes('TransactionWriteConflict'))
  );
}
