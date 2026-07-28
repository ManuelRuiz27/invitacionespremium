import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { AuditActorType, EventStatus, Prisma, type Assistant, type Event } from '../generated/prisma/client';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import type {
  AssistantInput,
  AssistantResponseDto,
  InvitationResponseDto,
  PublicInvitationResponseDto,
  UpdateInvitationInput
} from './invitations.dto';
import { InvitationTokenService } from './invitation-token.service';

const PREPARATION_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);
const CANCELLABLE_STATUSES = new Set<EventStatus>([...PREPARATION_STATUSES, EventStatus.ACTIVE, EventStatus.EVENT_DAY]);
const details = {
  contact: true,
  assistants: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]
  }
} satisfies Prisma.InvitationInclude;
type InvitationDetails = Prisma.InvitationGetPayload<{ include: typeof details }>;

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(InvitationTokenService) private readonly tokens: InvitationTokenService
  ) {}

  async list(eventId: string, principal: AuthPrincipal): Promise<InvitationResponseDto[]> {
    await this.requireOwnedEvent(eventId, principal);
    const invitations = await this.prisma.invitation.findMany({
      where: { eventId, deletedAt: null, contact: { deletedAt: null } },
      include: details,
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
    });
    return invitations.map((invitation) => this.toResponse(invitation));
  }

  async get(eventId: string, invitationId: string, principal: AuthPrincipal): Promise<InvitationResponseDto> {
    await this.requireOwnedEvent(eventId, principal);
    return this.toResponse(await this.requireInvitation(this.prisma, eventId, invitationId));
  }

  async update(
    eventId: string,
    invitationId: string,
    input: UpdateInvitationInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<InvitationResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertPreparation(event);
      await this.lockInvitation(tx, invitationId);
      const current = await this.requireInvitation(tx, eventId, invitationId);
      this.assertNotCancelled(current.cancelledAt);
      if (input.additionalAssistantLimit !== undefined) {
        const extras = current.assistants.filter(({ isPrimary }) => !isPrimary).length;
        if (input.additionalAssistantLimit < extras) {
          throw assistantLimitConflict();
        }
      }
      const updated = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          ...(input.mode === undefined ? {} : { mode: input.mode }),
          ...(input.additionalAssistantLimit === undefined
            ? {}
            : { additionalAssistantLimit: input.additionalAssistantLimit })
        },
        include: details
      });
      await this.recordAudit(tx, principal, event, operationId, 'INVITATION_UPDATE', invitationId, {
        id: invitationId,
        eventId,
        mode: updated.mode,
        additionalAssistantLimit: updated.additionalAssistantLimit
      });
      return this.toResponse(updated);
    });
  }

  async createAssistant(
    eventId: string,
    invitationId: string,
    input: AssistantInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<AssistantResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertPreparation(event);
      await this.lockInvitation(tx, invitationId);
      const invitation = await this.requireInvitation(tx, eventId, invitationId);
      this.assertNotCancelled(invitation.cancelledAt);
      const extras = invitation.assistants.filter(({ isPrimary }) => !isPrimary).length;
      if (extras >= invitation.additionalAssistantLimit) throw assistantLimitConflict();
      const assistant = await tx.assistant.create({
        data: { eventId, invitationId, name: input.name }
      });
      await this.recordAudit(tx, principal, event, operationId, 'ASSISTANT_CREATE', assistant.id, {
        id: assistant.id,
        eventId,
        invitationId,
        isPrimary: false
      });
      return toAssistantResponse(assistant);
    });
  }

  async updateAssistant(
    eventId: string,
    invitationId: string,
    assistantId: string,
    input: AssistantInput,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<AssistantResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertPreparation(event);
      await this.lockInvitation(tx, invitationId);
      const invitation = await this.requireInvitation(tx, eventId, invitationId);
      this.assertNotCancelled(invitation.cancelledAt);
      const current = await tx.assistant.findFirst({
        where: { id: assistantId, eventId, invitationId, deletedAt: null }
      });
      if (!current) throw assistantNotFound();
      if (current.isPrimary) throw primaryAssistantProtected();
      const assistant = await tx.assistant.update({ where: { id: assistantId }, data: { name: input.name } });
      await this.recordAudit(tx, principal, event, operationId, 'ASSISTANT_UPDATE', assistant.id, {
        id: assistant.id,
        eventId,
        invitationId,
        isPrimary: false
      });
      return toAssistantResponse(assistant);
    });
  }

  async deleteAssistant(
    eventId: string,
    invitationId: string,
    assistantId: string,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertPreparation(event);
      await this.lockInvitation(tx, invitationId);
      const invitation = await this.requireInvitation(tx, eventId, invitationId);
      this.assertNotCancelled(invitation.cancelledAt);
      const current = await tx.assistant.findFirst({
        where: { id: assistantId, eventId, invitationId, deletedAt: null }
      });
      if (!current) throw assistantNotFound();
      if (current.isPrimary) throw primaryAssistantProtected();
      const deletedAt = new Date();
      await tx.assistant.update({ where: { id: assistantId }, data: { deletedAt } });
      await this.recordAudit(tx, principal, event, operationId, 'ASSISTANT_DELETE', assistantId, {
        id: assistantId,
        eventId,
        invitationId,
        deletedAt
      });
    });
  }

  async cancel(
    eventId: string,
    invitationId: string,
    idempotencyKey: string,
    principal: AuthPrincipal,
    operationId: string | undefined
  ): Promise<InvitationResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      const prior = await tx.invitation.findUnique({
        where: { cancelIdempotencyKey: idempotencyKey },
        include: details
      });
      if (prior) {
        if (prior.id !== invitationId || prior.eventId !== eventId) throw cancellationIdempotencyConflict();
        return this.toResponse(prior);
      }
      if (!CANCELLABLE_STATUSES.has(event.status)) {
        throw new ConflictException({
          code: 'INVITATION_CANCELLATION_NOT_ALLOWED',
          message: 'The invitation cannot be cancelled in the current event state.'
        });
      }
      await this.lockInvitation(tx, invitationId);
      const current = await this.requireInvitation(tx, eventId, invitationId);
      if (current.cancelledAt) {
        throw new ConflictException({
          code: 'INVITATION_ALREADY_CANCELLED',
          message: 'The invitation is already cancelled.'
        });
      }
      const cancelledAt = new Date();
      const cancelled = await tx.invitation.update({
        where: { id: invitationId },
        data: {
          cancelledAt,
          cancelledByUserId: principal.userId,
          cancelIdempotencyKey: idempotencyKey
        },
        include: details
      });
      await this.recordAudit(tx, principal, event, operationId, 'INVITATION_CANCEL', invitationId, {
        id: invitationId,
        eventId,
        cancelledAt
      });
      return this.toResponse(cancelled);
    });
  }

  async resolvePublic(invitationToken: string): Promise<PublicInvitationResponseDto> {
    const verified = this.tokens.verify('INVITATION', invitationToken);
    if (!verified) throw invitationNotFound();
    const invitation = await this.prisma.invitation.findFirst({
      where: {
        id: verified.invitationId,
        invitationTokenNonce: verified.nonce,
        invitationTokenVersion: verified.version,
        deletedAt: null,
        contact: { deletedAt: null },
        event: { deletedAt: null }
      },
      include: { ...details, event: true }
    });
    if (!invitation || invitation.event.status === EventStatus.ARCHIVED) throw invitationNotFound();
    if (invitation.cancelledAt) {
      return { status: 'CANCELLED', message: 'Invitación cancelada por el organizador' };
    }
    if (invitation.event.status === EventStatus.CANCELLED) {
      return { status: 'CANCELLED', message: 'Evento cancelado por el organizador' };
    }
    if (invitation.event.status === EventStatus.CLOSED || invitation.event.status === EventStatus.ALBUM_PUBLISHED) {
      return { status: 'CLOSED' };
    }
    if (invitation.event.status !== EventStatus.ACTIVE && invitation.event.status !== EventStatus.EVENT_DAY) {
      throw invitationNotFound();
    }
    return {
      status: 'AVAILABLE',
      event: {
        id: invitation.event.id,
        name: invitation.event.name,
        eventDateTime: invitation.event.eventDateTime,
        timeZone: invitation.event.timeZone
      },
      invitation: {
        id: invitation.id,
        mode: invitation.mode,
        responseStatus: invitation.responseStatus,
        additionalAssistantLimit: invitation.additionalAssistantLimit
      },
      assistants: invitation.assistants.map(toAssistantResponse)
    };
  }

  private toResponse(invitation: InvitationDetails): InvitationResponseDto {
    return {
      id: invitation.id,
      eventId: invitation.eventId,
      contactId: invitation.contactId,
      mode: invitation.mode,
      responseStatus: invitation.responseStatus,
      additionalAssistantLimit: invitation.additionalAssistantLimit,
      contactName: invitation.contact.name,
      invitationLink: this.tokens.invitationLink(
        invitation.id,
        invitation.invitationTokenNonce,
        invitation.invitationTokenVersion
      ),
      cancelledAt: invitation.cancelledAt,
      assistants: invitation.assistants.map(toAssistantResponse),
      createdAt: invitation.createdAt,
      updatedAt: invitation.updatedAt
    };
  }

  private async requireOwnedEvent(eventId: string, principal: AuthPrincipal): Promise<Event> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
    });
    if (!event) throw eventNotFound();
    return event;
  }

  private async lockOwnedEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    await tx.$queryRaw`SELECT id FROM event WHERE id = ${eventId}::uuid FOR UPDATE`;
    const event = await tx.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
    });
    if (!event) throw eventNotFound();
    return event;
  }

  private async lockInvitation(tx: Prisma.TransactionClient, invitationId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM invitation WHERE id = ${invitationId}::uuid FOR UPDATE`;
  }

  private async requireInvitation(
    client: Prisma.TransactionClient | PrismaService,
    eventId: string,
    invitationId: string
  ): Promise<InvitationDetails> {
    const invitation = await client.invitation.findFirst({
      where: { id: invitationId, eventId, deletedAt: null, contact: { deletedAt: null } },
      include: details
    });
    if (!invitation) throw invitationNotFound();
    return invitation;
  }

  private assertPreparation(event: Event): void {
    if (!PREPARATION_STATUSES.has(event.status)) {
      throw new ConflictException({
        code: 'INVITATION_EVENT_NOT_MUTABLE',
        message: 'Invitations can only be changed while the event is being prepared.'
      });
    }
  }

  private assertNotCancelled(cancelledAt: Date | null): void {
    if (cancelledAt) {
      throw new ConflictException({
        code: 'INVITATION_CANCELLED',
        message: 'A cancelled invitation cannot be changed.'
      });
    }
  }

  private async recordAudit(
    tx: Prisma.TransactionClient,
    principal: AuthPrincipal,
    event: Event,
    operationId: string | undefined,
    action: string,
    resourceId: string,
    afterData: Record<string, unknown>
  ): Promise<void> {
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        action,
        resourceType: action.startsWith('ASSISTANT_') ? 'Assistant' : 'Invitation',
        resourceId,
        clientId: event.clientId,
        eventId: event.id,
        afterData,
        ...(operationId === undefined ? {} : { operationId })
      },
      tx
    );
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (!isRetryableTransactionError(error) || attempt === 19) throw error;
        await new Promise((resolve) => setTimeout(resolve, Math.min(5 * (attempt + 1), 50)));
      }
    }
    throw new Error('Serializable transaction retry limit exceeded.');
  }
}

function toAssistantResponse(assistant: Assistant): AssistantResponseDto {
  return {
    id: assistant.id,
    eventId: assistant.eventId,
    invitationId: assistant.invitationId,
    name: assistant.name,
    isPrimary: assistant.isPrimary,
    responseStatus: assistant.responseStatus,
    anonymizedAt: assistant.anonymizedAt,
    createdAt: assistant.createdAt,
    updatedAt: assistant.updatedAt
  };
}

function invitationNotFound(): NotFoundException {
  return new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
}

function assistantNotFound(): NotFoundException {
  return new NotFoundException({ code: 'ASSISTANT_NOT_FOUND', message: 'Assistant not found.' });
}

function assistantLimitConflict(): ConflictException {
  return new ConflictException({
    code: 'INVITATION_ASSISTANT_LIMIT_EXCEEDED',
    message: 'The invitation assistant limit would be exceeded.'
  });
}

function primaryAssistantProtected(): ConflictException {
  return new ConflictException({
    code: 'PRIMARY_ASSISTANT_PROTECTED',
    message: 'The primary assistant cannot be changed through additional-assistant operations.'
  });
}

function cancellationIdempotencyConflict(): ConflictException {
  return new ConflictException({
    code: 'INVITATION_CANCEL_IDEMPOTENCY_CONFLICT',
    message: 'The idempotency key is already associated with another invitation cancellation.'
  });
}

function isRetryableTransactionError(error: unknown): boolean {
  if (hasPrismaCode(error, 'P2034') || hasPrismaCode(error, 'P2002')) {
    return true;
  }
  if (!hasPrismaCode(error, 'P2010') || typeof error !== 'object' || error === null || !('meta' in error)) {
    return false;
  }
  const meta = (error as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null) return false;
  const code = 'code' in meta ? (meta as { code?: unknown }).code : undefined;
  const driverError =
    'driverAdapterError' in meta ? String((meta as { driverAdapterError?: unknown }).driverAdapterError) : '';
  return code === '40001' || code === '40P01' || driverError.includes('TransactionWriteConflict');
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
