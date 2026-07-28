import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import {
  AssistantResponseStatus,
  AuditActorType,
  EventStatus,
  FileAssetStatus,
  HotspotAction,
  InvitationResponseStatus,
  Prisma,
  type Event
} from '../generated/prisma/client';
import { FileStorage } from '../file-assets/file-storage';
import { InvitationTokenService } from '../invitations/invitation-token.service';
import type {
  ConfirmationStateResponseDto,
  PublicInvitationViewResponseDto,
  RsvpAssistantsInput,
  RsvpMutationResponseDto,
  RsvpOverrideInput
} from './public-rsvp.dto';

const OPERATIONAL_STATUSES = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY]);
const CLOSED_MESSAGE = 'La confirmación de asistencia ya fue cerrada. Contacta al organizador.';
const INVITATION_CANCELLED_MESSAGE = 'Esta invitación fue cancelada por el organizador.';
const EVENT_CANCELLED_MESSAGE = 'Este evento ha sido cancelado por el organizador.';

const publicInclude = {
  contact: true,
  assistants: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]
  },
  event: {
    include: {
      invitationDesigns: {
        where: { deletedAt: null },
        orderBy: [{ createdAt: 'desc' as const }],
        take: 1,
        include: {
          flyerInitialAsset: true,
          flyerQrAsset: true,
          pages: {
            where: { deletedAt: null },
            orderBy: [{ position: 'asc' as const }, { id: 'asc' as const }],
            include: { fileAsset: true }
          },
          hotspots: {
            where: { deletedAt: null },
            orderBy: [{ priority: 'desc' as const }, { id: 'asc' as const }]
          }
        }
      }
    }
  }
} satisfies Prisma.InvitationInclude;

type PublicInvitation = Prisma.InvitationGetPayload<{ include: typeof publicInclude }>;

export interface PublicAssetContent {
  bytes: Buffer;
  mimeType: string;
  sizeBytes: number;
  etag: string;
}

@Injectable()
export class PublicRsvpService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(InvitationTokenService) private readonly tokens: InvitationTokenService,
    @Inject(FileStorage) private readonly storage: FileStorage
  ) {}

  async resolve(invitationToken: string): Promise<PublicInvitationViewResponseDto> {
    const invitation = await this.resolvePublicInvitation(this.prisma, invitationToken);
    return this.toPublicView(invitation, invitationToken);
  }

  async content(invitationToken: string, fileAssetId: string): Promise<PublicAssetContent> {
    return this.serializable(async (tx) => {
      const verified = this.verify(invitationToken);
      await this.lockInvitationContext(tx, verified.invitationId);
      const invitation = await this.resolveVerifiedInvitation(tx, verified);
      this.assertPublicAssetAvailable(invitation);
      const design = invitation.event.invitationDesigns[0];
      const referencedIds = new Set<string>();
      if (design?.flyerInitialAssetId) referencedIds.add(design.flyerInitialAssetId);
      if (design?.flyerQrAssetId) referencedIds.add(design.flyerQrAssetId);
      for (const page of design?.pages ?? []) referencedIds.add(page.fileAssetId);
      if (!design || !referencedIds.has(fileAssetId)) throw invitationNotFound();
      const asset = await tx.fileAsset.findFirst({
        where: {
          id: fileAssetId,
          clientId: invitation.event.clientId,
          eventId: invitation.eventId,
          status: FileAssetStatus.READY,
          deletedAt: null
        }
      });
      if (!asset || !asset.checksumSha256) throw invitationNotFound();
      let bytes: Buffer;
      try {
        bytes = await this.storage.read(asset.storageKey);
      } catch {
        throw new DomainError(
          'FILE_STORAGE_FAILURE',
          'The requested file asset is temporarily unavailable.',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      return {
        bytes,
        mimeType: asset.mimeType,
        sizeBytes: asset.sizeBytes,
        etag: `"sha256-${asset.checksumSha256.slice(0, 32)}"`
      };
    });
  }

  confirm(invitationToken: string, input: RsvpAssistantsInput, operationId?: string): Promise<RsvpMutationResponseDto> {
    return this.publicMutation(invitationToken, InvitationResponseStatus.CONFIRMED, input, operationId);
  }

  reject(invitationToken: string, operationId?: string): Promise<RsvpMutationResponseDto> {
    return this.publicMutation(
      invitationToken,
      InvitationResponseStatus.REJECTED,
      { additionalAssistants: [] },
      operationId
    );
  }

  modifyAssistants(
    invitationToken: string,
    input: RsvpAssistantsInput,
    operationId?: string
  ): Promise<RsvpMutationResponseDto> {
    return this.publicMutation(invitationToken, InvitationResponseStatus.CONFIRMED, input, operationId, true);
  }

  async confirmation(eventId: string, principal: AuthPrincipal): Promise<ConfirmationStateResponseDto> {
    const event = await this.requireOwnedEvent(this.prisma, eventId, principal);
    return confirmationState(event);
  }

  closeConfirmation(
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ConfirmationStateResponseDto> {
    return this.changeConfirmation(eventId, principal, true, operationId);
  }

  reopenConfirmation(
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ConfirmationStateResponseDto> {
    return this.changeConfirmation(eventId, principal, false, operationId);
  }

  async override(
    eventId: string,
    invitationId: string,
    input: RsvpOverrideInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<RsvpMutationResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertOperational(event);
      await this.lockInvitation(tx, invitationId);
      const invitation = await this.requireInvitation(tx, eventId, invitationId);
      const beforeCount = invitation.assistants.length;
      const result = await this.reconcile(
        tx,
        event,
        invitation,
        input.responseStatus,
        input,
        input.responseStatus === InvitationResponseStatus.CONFIRMED
      );
      if (result.changed) {
        await this.audit.record(
          {
            actor: { type: AuditActorType.USER, id: principal.userId },
            clientId: event.clientId,
            eventId,
            resourceType: 'Invitation',
            resourceId: invitationId,
            action: 'RSVP_OPERATIONAL_OVERRIDE',
            beforeData: { responseStatus: invitation.responseStatus, activeAssistantCount: beforeCount },
            afterData: {
              responseStatus: result.response.responseStatus,
              activeAssistantCount: result.response.assistants.length,
              affectedAssistantIds: result.affectedIds
            },
            ...(operationId ? { operationId } : {})
          },
          tx
        );
      }
      return result.response;
    });
  }

  private async publicMutation(
    invitationToken: string,
    status: InvitationResponseStatus,
    input: RsvpAssistantsInput,
    operationId?: string,
    requireConfirmed = false
  ): Promise<RsvpMutationResponseDto> {
    const verified = this.verify(invitationToken);
    const fingerprint = tokenFingerprint(invitationToken);
    return this.serializable(async (tx) => {
      await this.lockInvitationContext(tx, verified.invitationId);
      const invitation = await this.resolveVerifiedInvitation(tx, verified);
      const event = invitation.event;
      this.assertPublicMutationAllowed(invitation);
      if (requireConfirmed && invitation.responseStatus !== InvitationResponseStatus.CONFIRMED) {
        throw rsvpError('RSVP_NOT_AVAILABLE', 'Invitation must be confirmed before assistants can be modified.');
      }
      const beforeCount = invitation.assistants.length;
      const result = await this.reconcile(
        tx,
        event,
        invitation,
        status,
        input,
        status === InvitationResponseStatus.CONFIRMED
      );
      if (result.changed) {
        await this.audit.record(
          {
            actor: { type: AuditActorType.PUBLIC_TOKEN, fingerprint },
            clientId: event.clientId,
            eventId: event.id,
            resourceType: 'Invitation',
            resourceId: invitation.id,
            action: status === InvitationResponseStatus.REJECTED ? 'RSVP_REJECT' : 'RSVP_CONFIRM',
            beforeData: { responseStatus: invitation.responseStatus, activeAssistantCount: beforeCount },
            afterData: {
              responseStatus: result.response.responseStatus,
              activeAssistantCount: result.response.assistants.length,
              affectedAssistantIds: result.affectedIds
            },
            ...(operationId ? { operationId } : {})
          },
          tx
        );
      }
      return result.response;
    });
  }

  private async reconcile(
    tx: Prisma.TransactionClient,
    event: Event,
    invitation: PublicInvitation,
    status: InvitationResponseStatus,
    input: RsvpAssistantsInput,
    reconcileAdditional: boolean
  ): Promise<{ response: RsvpMutationResponseDto; changed: boolean; affectedIds: string[] }> {
    if (invitation.cancelledAt) {
      throw rsvpError('RSVP_INVITATION_CANCELLED', 'The invitation is cancelled.');
    }
    const primary = invitation.assistants.find(({ isPrimary }) => isPrimary);
    if (!primary || invitation.contact.deletedAt || primary.deletedAt) {
      throw rsvpError('RSVP_NOT_AVAILABLE', 'Invitation confirmation is not available.');
    }
    const currentExtras = invitation.assistants.filter(({ isPrimary }) => !isPrimary);
    if (reconcileAdditional && input.additionalAssistants.length > invitation.additionalAssistantLimit) {
      throw rsvpError('RSVP_ASSISTANT_LIMIT_EXCEEDED', 'The invitation assistant limit would be exceeded.');
    }

    const selected = new Map<string, { id: string; name: string }>();
    const creates: string[] = [];
    if (reconcileAdditional) {
      for (const requested of input.additionalAssistants) {
        if (requested.id) {
          const existing = currentExtras.find(({ id }) => id === requested.id);
          if (!existing) {
            const foreign = await tx.assistant.findUnique({ where: { id: requested.id }, select: { id: true } });
            throw rsvpError(
              foreign ? 'RSVP_ASSISTANT_MISMATCH' : 'RSVP_ASSISTANT_NOT_FOUND',
              foreign ? 'Assistant does not belong to this invitation.' : 'Assistant not found.'
            );
          }
          selected.set(existing.id, { id: existing.id, name: requested.name });
          continue;
        }
        const reusable = currentExtras.find(({ id, name }) => !selected.has(id) && name === requested.name);
        if (reusable) selected.set(reusable.id, { id: reusable.id, name: requested.name });
        else creates.push(requested.name);
      }
    }

    const proposedCount =
      status === InvitationResponseStatus.CONFIRMED
        ? 1 + (reconcileAdditional ? selected.size + creates.length : currentExtras.length)
        : 0;
    const currentConfirmed = invitation.assistants.filter(
      ({ responseStatus }) => responseStatus === AssistantResponseStatus.CONFIRMED
    ).length;
    const delta = proposedCount - currentConfirmed;
    if (delta > 0) {
      const occupied = await tx.assistant.count({
        where: { eventId: event.id, deletedAt: null, responseStatus: AssistantResponseStatus.CONFIRMED }
      });
      if (event.capacity === null || occupied + delta > event.capacity) {
        throw rsvpError('RSVP_EVENT_CAPACITY_EXCEEDED', 'Event capacity would be exceeded.');
      }
    }

    const affectedIds: string[] = [];
    let changed = invitation.responseStatus !== status;
    if (status === InvitationResponseStatus.REJECTED) {
      const update = await tx.assistant.updateMany({
        where: {
          invitationId: invitation.id,
          deletedAt: null,
          responseStatus: { not: AssistantResponseStatus.REJECTED }
        },
        data: { responseStatus: AssistantResponseStatus.REJECTED }
      });
      changed ||= update.count > 0;
      affectedIds.push(...invitation.assistants.map(({ id }) => id));
    } else {
      const omitted = reconcileAdditional ? currentExtras.filter(({ id }) => !selected.has(id)) : [];
      if (omitted.length > 0) {
        await tx.assistant.updateMany({
          where: { id: { in: omitted.map(({ id }) => id) } },
          data: { deletedAt: new Date() }
        });
        affectedIds.push(...omitted.map(({ id }) => id));
        changed = true;
      }
      if (primary.responseStatus !== AssistantResponseStatus.CONFIRMED) changed = true;
      await tx.assistant.update({
        where: { id: primary.id },
        data: { responseStatus: AssistantResponseStatus.CONFIRMED }
      });
      affectedIds.push(primary.id);
      for (const current of currentExtras) {
        const requested = selected.get(current.id);
        if (!requested) {
          if (!reconcileAdditional && current.responseStatus !== AssistantResponseStatus.CONFIRMED) {
            await tx.assistant.update({
              where: { id: current.id },
              data: { responseStatus: AssistantResponseStatus.CONFIRMED }
            });
            changed = true;
          }
          continue;
        }
        if (current.name !== requested.name || current.responseStatus !== AssistantResponseStatus.CONFIRMED) {
          await tx.assistant.update({
            where: { id: current.id },
            data: { name: requested.name, responseStatus: AssistantResponseStatus.CONFIRMED }
          });
          changed = true;
        }
        affectedIds.push(current.id);
      }
      for (const name of creates) {
        const created = await tx.assistant.create({
          data: {
            eventId: event.id,
            invitationId: invitation.id,
            name,
            responseStatus: AssistantResponseStatus.CONFIRMED
          }
        });
        affectedIds.push(created.id);
        changed = true;
      }
    }
    if (invitation.responseStatus !== status) {
      await tx.invitation.update({ where: { id: invitation.id }, data: { responseStatus: status } });
    }
    const refreshed = await this.requireInvitation(tx, event.id, invitation.id);
    return { response: mutationResponse(refreshed), changed, affectedIds: [...new Set(affectedIds)] };
  }

  private async changeConfirmation(
    eventId: string,
    principal: AuthPrincipal,
    close: boolean,
    operationId?: string
  ): Promise<ConfirmationStateResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.lockOwnedEvent(tx, eventId, principal);
      this.assertOperational(event);
      if (!event.confirmationEnabled) {
        throw rsvpError('RSVP_NOT_AVAILABLE', 'Event confirmation is not enabled.');
      }
      if ((close && event.confirmationClosedAt) || (!close && !event.confirmationClosedAt)) {
        return confirmationState(event);
      }
      const updated = await tx.event.update({
        where: { id: eventId },
        data: close
          ? { confirmationClosedAt: new Date(), confirmationClosedByUserId: principal.userId }
          : { confirmationClosedAt: null, confirmationClosedByUserId: null }
      });
      await this.audit.record(
        {
          actor: { type: AuditActorType.USER, id: principal.userId },
          clientId: event.clientId,
          eventId,
          resourceType: 'EventConfirmation',
          resourceId: eventId,
          action: close ? 'EVENT_CONFIRMATION_CLOSE' : 'EVENT_CONFIRMATION_REOPEN',
          beforeData: { ...confirmationState(event) },
          afterData: { ...confirmationState(updated) },
          ...(operationId ? { operationId } : {})
        },
        tx
      );
      return confirmationState(updated);
    });
  }

  private async resolvePublicInvitation(
    database: PrismaService | Prisma.TransactionClient,
    token: string
  ): Promise<PublicInvitation> {
    return this.resolveVerifiedInvitation(database, this.verify(token));
  }

  private verify(token: string) {
    const verified = this.tokens.verify('INVITATION', token);
    if (!verified) throw invitationNotFound();
    return verified;
  }

  private async resolveVerifiedInvitation(
    database: PrismaService | Prisma.TransactionClient,
    verified: { invitationId: string; nonce: string; version: number }
  ): Promise<PublicInvitation> {
    const invitation = await database.invitation.findFirst({
      where: {
        id: verified.invitationId,
        invitationTokenNonce: verified.nonce,
        invitationTokenVersion: verified.version,
        deletedAt: null,
        contact: { deletedAt: null },
        event: { deletedAt: null }
      },
      include: publicInclude
    });
    if (!invitation || invitation.event.status === EventStatus.ARCHIVED) throw invitationNotFound();
    return invitation;
  }

  private toPublicView(invitation: PublicInvitation, invitationToken: string): PublicInvitationViewResponseDto {
    const event = invitation.event;
    if (invitation.cancelledAt) return { status: 'CANCELLED', message: INVITATION_CANCELLED_MESSAGE };
    if (event.status === EventStatus.CANCELLED) return { status: 'CANCELLED', message: EVENT_CANCELLED_MESSAGE };
    if (event.status === EventStatus.CLOSED || event.status === EventStatus.ALBUM_PUBLISHED)
      return { status: 'CLOSED' };
    if (!OPERATIONAL_STATUSES.has(event.status)) throw invitationNotFound();
    if (!event.name || !event.eventDateTime || !event.timeZone) throw invitationNotFound();
    const design = event.invitationDesigns[0];
    const encodedToken = encodeURIComponent(invitationToken);
    const asset = (id: string) => ({
      id,
      contentPath: `/api/v1/public/invitations/${encodedToken}/assets/${id}/content`
    });
    return {
      status: 'AVAILABLE',
      event: { name: event.name, eventDateTime: event.eventDateTime, timeZone: event.timeZone },
      invitation: {
        id: invitation.id,
        mode: invitation.mode,
        responseStatus: invitation.responseStatus,
        additionalAssistantLimit: invitation.additionalAssistantLimit,
        cancelled: false
      },
      assistants: invitation.assistants.map(publicAssistant),
      confirmation: {
        open: event.confirmationEnabled && !event.confirmationClosedAt,
        ...(event.confirmationClosedAt ? { message: CLOSED_MESSAGE } : {})
      },
      ...(design
        ? {
            designType: design.type,
            design: {
              type: design.type,
              ...(design.flyerInitialAssetId ? { flyerInitialAsset: asset(design.flyerInitialAssetId) } : {}),
              ...(design.flyerQrAssetId ? { flyerQrAsset: asset(design.flyerQrAssetId) } : {}),
              pages: design.pages.map((page) => ({
                id: page.id,
                position: page.position,
                asset: asset(page.fileAssetId)
              })),
              hotspots: design.hotspots.map((hotspot) => ({
                id: hotspot.id,
                visualOwnerType: hotspot.visualOwnerType,
                flipbookPageId: hotspot.flipbookPageId,
                action: hotspot.action,
                x: Number(hotspot.x),
                y: Number(hotspot.y),
                width: Number(hotspot.width),
                height: Number(hotspot.height),
                priority: hotspot.priority,
                destination:
                  hotspot.action === HotspotAction.LOCATION
                    ? event.locationUrl
                    : hotspot.action === HotspotAction.GIFT_REGISTRY
                      ? event.giftRegistryUrl
                      : hotspot.action === HotspotAction.EXTERNAL_LINK
                        ? hotspot.url
                        : null
              }))
            }
          }
        : {})
    };
  }

  private assertPublicAssetAvailable(invitation: PublicInvitation): void {
    if (
      !OPERATIONAL_STATUSES.has(invitation.event.status) ||
      invitation.cancelledAt ||
      invitation.event.status === EventStatus.CANCELLED
    ) {
      throw invitationNotFound();
    }
  }

  private assertPublicMutationAllowed(invitation: PublicInvitation): void {
    const event = invitation.event;
    if (event.status === EventStatus.CANCELLED) {
      throw rsvpError('RSVP_EVENT_CANCELLED', 'The event is cancelled.');
    }
    this.assertOperational(event);
    if (invitation.cancelledAt) {
      throw rsvpError('RSVP_INVITATION_CANCELLED', 'The invitation is cancelled.');
    }
    if (!event.confirmationEnabled) {
      throw rsvpError('RSVP_NOT_AVAILABLE', 'Event confirmation is not enabled.');
    }
    if (event.confirmationClosedAt) {
      throw rsvpError('RSVP_CLOSED', CLOSED_MESSAGE);
    }
  }

  private assertOperational(event: Event): void {
    if (!OPERATIONAL_STATUSES.has(event.status)) {
      throw rsvpError('RSVP_EVENT_STATE_INVALID', 'The Event does not allow confirmation changes.');
    }
  }

  private async lockInvitationContext(tx: Prisma.TransactionClient, invitationId: string): Promise<void> {
    const context = await tx.invitation.findUnique({ where: { id: invitationId }, select: { eventId: true } });
    if (!context) throw invitationNotFound();
    await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${context.eventId}::uuid FOR UPDATE`;
    await this.lockInvitation(tx, invitationId);
  }

  private async lockOwnedEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    return this.requireOwnedEvent(tx, eventId, principal);
  }

  private async lockInvitation(tx: Prisma.TransactionClient, invitationId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "invitation" WHERE "id" = ${invitationId}::uuid FOR UPDATE`;
  }

  private async requireOwnedEvent(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal
  ): Promise<Event> {
    const event = await database.event.findFirst({
      where: { id: eventId, deletedAt: null, ...this.eventAccess.ownedWhere(principal) }
    });
    if (!event) throw eventNotFound();
    return event;
  }

  private async requireInvitation(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    invitationId: string
  ): Promise<PublicInvitation> {
    const invitation = await database.invitation.findFirst({
      where: { id: invitationId, eventId, deletedAt: null, contact: { deletedAt: null } },
      include: publicInclude
    });
    if (!invitation) throw invitationNotFound();
    return invitation;
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) && attempt < 19) continue;
        throw error;
      }
    }
    throw rsvpError('RSVP_CONCURRENCY_CONFLICT', 'RSVP operation could not be serialized.');
  }
}

function publicAssistant(assistant: PublicInvitation['assistants'][number]) {
  if (!assistant.name) throw invitationNotFound();
  return {
    id: assistant.id,
    name: assistant.name,
    isPrimary: assistant.isPrimary,
    responseStatus: assistant.responseStatus
  };
}

function mutationResponse(invitation: PublicInvitation): RsvpMutationResponseDto {
  return {
    invitationId: invitation.id,
    responseStatus: invitation.responseStatus,
    assistants: invitation.assistants.map(publicAssistant)
  };
}

function confirmationState(event: Event): ConfirmationStateResponseDto {
  return {
    enabled: event.confirmationEnabled,
    open: event.confirmationEnabled && event.confirmationClosedAt === null,
    closedAt: event.confirmationClosedAt?.toISOString() ?? null,
    closedByUserId: event.confirmationClosedByUserId
  };
}

function tokenFingerprint(token: string): string {
  return createHash('sha256').update(`public-rsvp:${token}`).digest('hex');
}

function invitationNotFound(): NotFoundException {
  return new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
}

function rsvpError(code: string, message: string): DomainError {
  return new DomainError(code, message, HttpStatus.CONFLICT);
}

function isRetryable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2034') return true;
  if (code !== 'P2010' || !('meta' in error)) return false;
  const meta = (error as { meta?: { code?: unknown; driverAdapterError?: unknown } }).meta;
  return (
    meta?.code === '40001' ||
    meta?.code === '40P01' ||
    String(meta?.driverAdapterError).includes('TransactionWriteConflict')
  );
}
