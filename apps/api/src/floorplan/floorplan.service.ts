import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { recomputeDigitalEventPreparationStatus } from '../events/digital-event-readiness.service';
import { FileAssetsService } from '../file-assets/file-assets.service';
import { FileStorage } from '../file-assets/file-storage';
import {
  AssistantResponseStatus,
  AuditActorType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FloorplanShapeKind,
  Prisma,
  SeatingAction,
  type Event,
  type Floorplan,
  type FloorplanShape
} from '../generated/prisma/client';
import { RealtimePublisherService } from '../realtime/realtime-publisher.service';
import { StaffTokenResolverService } from '../staff-access/staff-access.service';
import type {
  AssignFamilyInput,
  AssignGroupInput,
  AssignSeatingInput,
  CreateFloorplanInput,
  FloorplanResponseDto,
  FloorplanShapeInput,
  FloorplanShapeResponseDto,
  SeatingMutationResponseDto,
  ScannerFloorplanResponseDto,
  UpdateFloorplanShapeInput,
  UpdateSeatingInput
} from './floorplan.dto';
import { floorplanShapeSchema, normalizeFloorplanName } from './floorplan.dto';
import { FloorplanAccessService } from './floorplan-access.service';

const LAYOUT_MUTABLE = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE,
  EventStatus.ACTIVE,
  EventStatus.EVENT_DAY
]);
const SEATING_MUTABLE = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE,
  EventStatus.ACTIVE,
  EventStatus.EVENT_DAY
]);
const MAX_ATTEMPTS = 20;

const floorplanInclude = {
  event: true,
  imageAsset: true,
  shapes: {
    where: { deletedAt: null },
    include: {
      _count: {
        select: {
          assistants: { where: { deletedAt: null } },
          physicalPasses: { where: { deletedAt: null } }
        }
      }
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
  }
} satisfies Prisma.FloorplanInclude;

type FloorplanView = Prisma.FloorplanGetPayload<{ include: typeof floorplanInclude }>;

interface SeatingOutcome {
  response: SeatingMutationResponseDto;
  replay: boolean;
  eventId: string;
  operationId: string;
}

@Injectable()
export class FloorplanService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FloorplanAccessService) private readonly access: FloorplanAccessService,
    @Inject(FileAssetsService) private readonly fileAssets: FileAssetsService,
    @Inject(FileStorage) private readonly storage: FileStorage,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(RealtimePublisherService) private readonly realtime: RealtimePublisherService,
    @Inject(StaffTokenResolverService) private readonly staffTokens: StaffTokenResolverService
  ) {}

  async create(
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      if (await tx.floorplan.findFirst({ where: { eventId, deletedAt: null }, select: { id: true } })) {
        throw floorplanError('FLOORPLAN_ALREADY_EXISTS', 'Event already has an active Floorplan.');
      }
      const id = randomUUID();
      await tx.floorplan.create({ data: { id, eventId, imageAssetId: input.imageAssetId } });
      await this.fileAssets.claimReadyAssetInTransaction(
        tx,
        input.imageAssetId,
        { ownerType: FileAssetOwnerType.FLOORPLAN, ownerId: id },
        principal.userId,
        operationId
      );
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_CREATE', id, {
        floorplanId: id,
        imageAssetId: input.imageAssetId
      });
      await recomputeDigitalEventPreparationStatus(tx, eventId);
      return toFloorplanResponse(await this.requireView(tx, eventId));
    });
  }

  async get(eventId: string, principal: AuthPrincipal): Promise<FloorplanResponseDto> {
    await this.prisma.$transaction((tx) => this.access.requireOwnedEvent(tx, eventId, principal));
    return toFloorplanResponse(await this.requireView(this.prisma, eventId));
  }

  async scannerFloorplan(rawToken: string): Promise<ScannerFloorplanResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const eventId = await this.requireStaffEvent(tx, rawToken);
      const floorplan = await this.requireView(tx, eventId);
      if (!floorplan.event.floorplanEnabled || floorplan.imageAsset.status !== FileAssetStatus.READY) {
        throw floorplanError('SCANNER_FLOORPLAN_NOT_AVAILABLE', 'Scanner Floorplan is not available.');
      }
      const response = toFloorplanResponse(floorplan);
      return {
        floorplanId: response.id,
        contentPath: `/api/v1/scanner/${encodeURIComponent(rawToken)}/floorplan/content`,
        shapes: response.shapes
      };
    }, CRITICAL_TRANSACTION_OPTIONS);
  }

  async scannerContent(rawToken: string): Promise<{
    bytes: Buffer;
    mimeType: string;
    sizeBytes: number;
    etag: string;
  }> {
    const asset = await this.prisma.$transaction(async (tx) => {
      const eventId = await this.requireStaffEvent(tx, rawToken);
      const floorplan = await tx.floorplan.findFirst({
        where: { eventId, deletedAt: null, event: { floorplanEnabled: true } },
        select: { imageAsset: true }
      });
      if (
        !floorplan ||
        floorplan.imageAsset.status !== FileAssetStatus.READY ||
        floorplan.imageAsset.deletedAt !== null ||
        !floorplan.imageAsset.checksumSha256
      ) {
        throw floorplanError('SCANNER_FLOORPLAN_NOT_AVAILABLE', 'Scanner Floorplan is not available.');
      }
      return floorplan.imageAsset;
    }, CRITICAL_TRANSACTION_OPTIONS);
    return {
      bytes: await this.storage.read(asset.storageKey),
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      etag: `"sha256-${asset.checksumSha256?.slice(0, 32)}"`
    };
  }

  async replaceImage(
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      const current = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(current);
      if (current.imageAssetId === input.imageAssetId) return toFloorplanResponse(await this.requireView(tx, eventId));
      await this.fileAssets.claimReadyAssetInTransaction(
        tx,
        input.imageAssetId,
        { ownerType: FileAssetOwnerType.FLOORPLAN, ownerId: current.id },
        principal.userId,
        operationId
      );
      await tx.floorplan.update({ where: { id: current.id }, data: { imageAssetId: input.imageAssetId } });
      await this.fileAssets.hideOwnedAssetInTransaction(
        tx,
        current.imageAssetId,
        { ownerType: FileAssetOwnerType.FLOORPLAN, ownerId: current.id },
        principal.userId,
        operationId
      );
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_IMAGE_REPLACE', current.id, {
        floorplanId: current.id,
        fromImageAssetId: current.imageAssetId,
        toImageAssetId: input.imageAssetId
      });
      await recomputeDigitalEventPreparationStatus(tx, eventId);
      return toFloorplanResponse(await this.requireView(tx, eventId));
    });
  }

  lock(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, true, operationId);
  }

  unlock(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, false, operationId);
  }

  async createShape(
    eventId: string,
    input: FloorplanShapeInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(floorplan);
      const shape = await tx.floorplanShape.create({ data: shapeCreateData(floorplan.id, eventId, input) });
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SHAPE_CREATE', shape.id, shapeAudit(shape));
      await recomputeDigitalEventPreparationStatus(tx, eventId);
      return toShapeResponse(shape, 0);
    });
  }

  async updateShape(
    eventId: string,
    shapeId: string,
    input: UpdateFloorplanShapeInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(floorplan);
      const current = await this.lockShape(tx, eventId, floorplan.id, shapeId);
      const merged = floorplanShapeSchema.safeParse({
        kind: input.kind ?? current.kind,
        geometry: input.geometry ?? current.geometry,
        name: input.name ?? current.name,
        capacity: input.capacity ?? current.capacity,
        x: input.x ?? Number(current.x),
        y: input.y ?? Number(current.y),
        width: input.width ?? Number(current.width),
        height: input.height ?? Number(current.height),
        rotation: input.rotation ?? Number(current.rotation),
        polygonPoints:
          input.polygonPoints === undefined
            ? ((current.polygonPoints as Array<{ x: number; y: number }> | null) ?? null)
            : input.polygonPoints
      });
      if (!merged.success) throw floorplanError('FLOORPLAN_SHAPE_INVALID', 'Floorplan shape is invalid.');
      const updated = await tx.floorplanShape.update({
        where: { id: shapeId },
        data: shapeUpdateData(merged.data)
      });
      const occupancy = await combinedOccupancy(tx, shapeId);
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SHAPE_UPDATE', shapeId, {
        before: shapeAudit(current),
        after: shapeAudit(updated),
        occupancy
      });
      await recomputeDigitalEventPreparationStatus(tx, eventId);
      return toShapeResponse(updated, occupancy);
    });
  }

  async deleteShape(eventId: string, shapeId: string, principal: AuthPrincipal, operationId?: string): Promise<void> {
    await this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(floorplan);
      const current = await this.lockShape(tx, eventId, floorplan.id, shapeId);
      const occupancy = await combinedOccupancy(tx, shapeId);
      if (occupancy > 0) throw floorplanError('FLOORPLAN_TABLE_OCCUPIED', 'Occupied table cannot be deleted.');
      await tx.floorplanShape.update({ where: { id: shapeId }, data: { deletedAt: new Date() } });
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SHAPE_DELETE', shapeId, {
        ...shapeAudit(current),
        occupancy
      });
      await recomputeDigitalEventPreparationStatus(tx, eventId);
    });
  }

  assign(
    eventId: string,
    key: string,
    input: AssignSeatingInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<SeatingMutationResponseDto> {
    return this.runSeating(
      eventId,
      SeatingAction.ASSIGN,
      key,
      { assistantIds: [...input.assistantIds].sort(), tableShapeId: input.tableShapeId },
      input.tableShapeId,
      principal,
      operationId,
      async (_tx) => ({ assistantIds: [...input.assistantIds].sort(), tableShapeId: input.tableShapeId })
    );
  }

  assignFamily(
    eventId: string,
    key: string,
    input: AssignFamilyInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<SeatingMutationResponseDto> {
    return this.runSeating(
      eventId,
      SeatingAction.ASSIGN_FAMILY,
      key,
      input,
      input.tableShapeId,
      principal,
      operationId,
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "invitation" WHERE "id" = ${input.invitationId}::uuid FOR UPDATE`;
        const invitation = await tx.invitation.findFirst({
          where: { id: input.invitationId, eventId, deletedAt: null, cancelledAt: null },
          select: { id: true }
        });
        if (!invitation) throw seatingNotFound();
        const assistants = await tx.assistant.findMany({
          where: {
            eventId,
            invitationId: input.invitationId,
            deletedAt: null,
            anonymizedAt: null,
            name: { not: null },
            responseStatus: AssistantResponseStatus.CONFIRMED
          },
          select: { id: true },
          orderBy: { id: 'asc' }
        });
        if (assistants.length === 0) throw seatingNotFound();
        return { assistantIds: assistants.map(({ id }) => id), tableShapeId: input.tableShapeId };
      }
    );
  }

  assignGroup(
    eventId: string,
    key: string,
    input: AssignGroupInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<SeatingMutationResponseDto> {
    return this.runSeating(
      eventId,
      SeatingAction.ASSIGN_GROUP,
      key,
      input,
      input.tableShapeId,
      principal,
      operationId,
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "contact_group" WHERE "id" = ${input.groupId}::uuid FOR UPDATE`;
        const group = await tx.group.findFirst({ where: { id: input.groupId, eventId }, select: { id: true } });
        if (!group) throw seatingNotFound();
        const assistants = await tx.assistant.findMany({
          where: {
            eventId,
            deletedAt: null,
            anonymizedAt: null,
            name: { not: null },
            responseStatus: AssistantResponseStatus.CONFIRMED,
            invitation: {
              deletedAt: null,
              cancelledAt: null,
              contact: { groupId: input.groupId, deletedAt: null }
            }
          },
          select: { id: true },
          orderBy: { id: 'asc' }
        });
        if (assistants.length === 0) throw seatingNotFound();
        return { assistantIds: assistants.map(({ id }) => id), tableShapeId: input.tableShapeId };
      }
    );
  }

  updateSeating(
    eventId: string,
    assistantId: string,
    key: string,
    input: UpdateSeatingInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<SeatingMutationResponseDto> {
    return this.runSeating(
      eventId,
      SeatingAction.UPDATE,
      key,
      { assistantId, tableShapeId: input.tableShapeId },
      input.tableShapeId,
      principal,
      operationId,
      async () => ({ assistantIds: [assistantId], tableShapeId: input.tableShapeId })
    );
  }

  private async runSeating(
    eventId: string,
    action: SeatingAction,
    idempotencyKey: string,
    signatureInput: unknown,
    targetTableShapeId: string | null,
    principal: AuthPrincipal,
    operationId: string | undefined,
    resolve: (tx: Prisma.TransactionClient) => Promise<{ assistantIds: string[]; tableShapeId: string | null }>
  ): Promise<SeatingMutationResponseDto> {
    const effectiveOperationId = operationId ?? randomUUID();
    const signature = requestSignature(eventId, action, signatureInput);
    const outcome = await this.serializable(async (tx): Promise<SeatingOutcome> => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      const prior = await tx.seatingOperation.findUnique({ where: { idempotencyKey } });
      if (prior) {
        if (prior.eventId !== eventId || prior.action !== action || prior.requestSignature !== signature) {
          throw idempotencyConflict();
        }
        return {
          response: prior.resultSnapshot as unknown as SeatingMutationResponseDto,
          replay: true,
          eventId,
          operationId: effectiveOperationId
        };
      }
      this.assertSeatingMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      let table: FloorplanShape | null = null;
      if (targetTableShapeId) {
        table = await this.lockShape(tx, eventId, floorplan.id, targetTableShapeId);
        if (table.kind !== FloorplanShapeKind.TABLE) {
          throw floorplanError('SEATING_TABLE_INVALID', 'Seating assignment requires a table.');
        }
      }
      const resolved = await resolve(tx);
      if (resolved.tableShapeId !== targetTableShapeId) {
        throw floorplanError('SEATING_TABLE_INVALID', 'Seating assignment target is inconsistent.');
      }
      const assistantIds = [...new Set(resolved.assistantIds)].sort();
      if (assistantIds.length === 0) throw seatingNotFound();
      await tx.$queryRaw`
        SELECT "id" FROM "assistant"
        WHERE "id" = ANY(ARRAY[${Prisma.join(assistantIds)}]::uuid[])
        ORDER BY "id" FOR UPDATE
      `;
      const assistants = await tx.assistant.findMany({
        where: {
          id: { in: assistantIds },
          eventId,
          deletedAt: null,
          anonymizedAt: null,
          name: { not: null },
          responseStatus: AssistantResponseStatus.CONFIRMED,
          invitation: { deletedAt: null, cancelledAt: null }
        },
        select: { id: true, floorplanShapeId: true },
        orderBy: { id: 'asc' }
      });
      if (assistants.length !== assistantIds.length) throw seatingNotFound();
      const activeCheckIns = await tx.checkIn.findMany({
        where: { eventId, assistantId: { in: assistantIds }, revertedAt: null },
        select: { id: true, assistantId: true },
        orderBy: [{ assistantId: 'asc' }, { id: 'asc' }]
      });
      if (activeCheckIns.length > 0) {
        const ids = activeCheckIns.map(({ id }) => id);
        await tx.$queryRaw`
          SELECT "id" FROM "check_in"
          WHERE "id" = ANY(ARRAY[${Prisma.join(ids)}]::uuid[])
          ORDER BY "id" FOR SHARE
        `;
      }
      const changes = assistants
        .filter(({ floorplanShapeId }) => floorplanShapeId !== resolved.tableShapeId)
        .map(({ id, floorplanShapeId }) => ({
          assistantId: id,
          fromTableId: floorplanShapeId,
          toTableId: resolved.tableShapeId
        }));
      if (table) {
        const existingAssistants = await tx.assistant.count({
          where: {
            floorplanShapeId: table.id,
            deletedAt: null,
            id: { notIn: assistantIds }
          }
        });
        const existingPasses = await tx.physicalPass.count({
          where: { floorplanShapeId: table.id, deletedAt: null }
        });
        if (existingAssistants + existingPasses + assistants.length > table.capacity) {
          throw floorplanError('SEATING_TABLE_CAPACITY_EXCEEDED', 'Table capacity would be exceeded.');
        }
      }
      if (changes.length > 0) {
        await tx.assistant.updateMany({
          where: { id: { in: changes.map(({ assistantId }) => assistantId) } },
          data: { floorplanShapeId: resolved.tableShapeId }
        });
      }
      const tableIds = [
        ...new Set(
          changes.flatMap(({ fromTableId, toTableId }) => [fromTableId, toTableId]).filter((id): id is string => !!id)
        )
      ].sort();
      const affectedTables = await this.tableOccupancy(tx, tableIds);
      const response: SeatingMutationResponseDto = { changes, affectedTables };
      await tx.seatingOperation.create({
        data: {
          eventId,
          action,
          idempotencyKey,
          requestSignature: signature,
          resultSnapshot: response as unknown as Prisma.InputJsonObject
        }
      });
      await this.recordAudit(tx, event, principal, effectiveOperationId, seatingAuditAction(action), floorplan.id, {
        assistantIds,
        toTableId: resolved.tableShapeId,
        changes,
        affectedTables,
        postCheckIn: activeCheckIns.length > 0
      });
      return { response, replay: false, eventId, operationId: effectiveOperationId };
    });
    if (!outcome.replay && outcome.response.changes.length > 0) {
      await this.realtime.publishSeatingUpdated({
        eventName: 'seating.updated',
        version: 1,
        eventId: outcome.eventId,
        occurredAt: new Date().toISOString(),
        operationId: outcome.operationId,
        actorType: 'USER',
        data: outcome.response
      });
    }
    return outcome.response;
  }

  private async changeLock(
    eventId: string,
    principal: AuthPrincipal,
    lock: boolean,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      if ((lock && floorplan.lockedAt) || (!lock && !floorplan.lockedAt)) {
        return toFloorplanResponse(await this.requireView(tx, eventId));
      }
      await tx.floorplan.update({
        where: { id: floorplan.id },
        data: lock
          ? { lockedAt: new Date(), lockedByUserId: principal.userId }
          : { lockedAt: null, lockedByUserId: null }
      });
      await this.recordAudit(
        tx,
        event,
        principal,
        operationId,
        lock ? 'FLOORPLAN_LOCK' : 'FLOORPLAN_UNLOCK',
        floorplan.id,
        { floorplanId: floorplan.id, locked: lock }
      );
      return toFloorplanResponse(await this.requireView(tx, eventId));
    });
  }

  private async lockFloorplan(tx: Prisma.TransactionClient, eventId: string): Promise<Floorplan> {
    await tx.$queryRaw`
      SELECT "id" FROM "floorplan"
      WHERE "event_id" = ${eventId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const floorplan = await tx.floorplan.findFirst({ where: { eventId, deletedAt: null } });
    if (!floorplan) throw floorplanNotFound();
    return floorplan;
  }

  private async lockShape(
    tx: Prisma.TransactionClient,
    eventId: string,
    floorplanId: string,
    shapeId: string
  ): Promise<FloorplanShape> {
    await tx.$queryRaw`
      SELECT "id" FROM "floorplan_shape"
      WHERE "id" = ${shapeId}::uuid AND "event_id" = ${eventId}::uuid
      ORDER BY "id" FOR UPDATE
    `;
    const shape = await tx.floorplanShape.findFirst({
      where: { id: shapeId, eventId, floorplanId, deletedAt: null }
    });
    if (!shape) throw shapeNotFound();
    return shape;
  }

  private async tableOccupancy(
    tx: Prisma.TransactionClient,
    tableIds: string[]
  ): Promise<SeatingMutationResponseDto['affectedTables']> {
    if (tableIds.length === 0) return [];
    const tables = await tx.floorplanShape.findMany({
      where: { id: { in: tableIds }, deletedAt: null },
      select: {
        id: true,
        capacity: true,
        _count: {
          select: {
            assistants: { where: { deletedAt: null } },
            physicalPasses: { where: { deletedAt: null } }
          }
        }
      },
      orderBy: { id: 'asc' }
    });
    return tables.map(({ id, capacity, _count }) => ({
      tableId: id,
      occupancy: _count.assistants + _count.physicalPasses,
      capacity
    }));
  }

  private requireView(database: PrismaService | Prisma.TransactionClient, eventId: string): Promise<FloorplanView> {
    return database.floorplan
      .findFirst({ where: { eventId, deletedAt: null }, include: floorplanInclude })
      .then((floorplan) => {
        if (!floorplan) throw floorplanNotFound();
        return floorplan;
      });
  }

  private async requireStaffEvent(tx: Prisma.TransactionClient, rawToken: string): Promise<string> {
    const resolution = await this.staffTokens.resolveStaffTokenInTransaction(tx, rawToken);
    if (resolution.kind === 'INVALID') {
      throw new UnauthorizedException({
        code: 'STAFF_TOKEN_INVALID_OR_EXPIRED',
        message: 'StaffToken is invalid or expired.'
      });
    }
    if (resolution.kind === 'EVENT_NOT_OPERATIONAL') {
      throw floorplanError('STAFF_EVENT_NOT_OPERATIONAL', 'The StaffToken Event is not operational.');
    }
    return resolution.staff.eventId;
  }

  private assertLayoutMutable(event: Event): void {
    if (!LAYOUT_MUTABLE.has(event.status)) {
      throw floorplanError('FLOORPLAN_EVENT_STATE_LOCKED', 'Floorplan layout is read-only in the Event state.');
    }
  }

  private assertSeatingMutable(event: Event): void {
    if (!SEATING_MUTABLE.has(event.status)) {
      throw floorplanError('SEATING_EVENT_STATE_LOCKED', 'Seating is read-only in the Event state.');
    }
  }

  private assertUnlocked(floorplan: Floorplan): void {
    if (floorplan.lockedAt) throw floorplanError('FLOORPLAN_LAYOUT_LOCKED', 'Floorplan layout is locked.');
  }

  private recordAudit(
    tx: Prisma.TransactionClient,
    event: Event,
    principal: AuthPrincipal,
    operationId: string | undefined,
    action: string,
    resourceId: string,
    afterData: Record<string, unknown>
  ): Promise<string> {
    return this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId: event.clientId,
        eventId: event.id,
        resourceType: 'FLOORPLAN',
        resourceId,
        action,
        afterData,
        ...(operationId ? { operationId } : {})
      },
      tx
    );
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) && attempt < MAX_ATTEMPTS - 1) continue;
        throw mapDatabaseError(error);
      }
    }
    throw floorplanError('FLOORPLAN_CONCURRENCY_CONFLICT', 'Floorplan operation could not be serialized.');
  }
}

function shapeCreateData(
  floorplanId: string,
  eventId: string,
  input: FloorplanShapeInput
): Prisma.FloorplanShapeUncheckedCreateInput {
  return {
    floorplanId,
    eventId,
    kind: input.kind,
    geometry: input.geometry,
    name: input.name,
    normalizedName: normalizeFloorplanName(input.name).toLocaleLowerCase('es-MX'),
    capacity: input.capacity,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation,
    polygonPoints: input.polygonPoints ? (input.polygonPoints as unknown as Prisma.InputJsonArray) : Prisma.DbNull
  };
}

function shapeUpdateData(input: FloorplanShapeInput): Prisma.FloorplanShapeUncheckedUpdateInput {
  return {
    kind: input.kind,
    geometry: input.geometry,
    name: input.name,
    normalizedName: normalizeFloorplanName(input.name).toLocaleLowerCase('es-MX'),
    capacity: input.capacity,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    rotation: input.rotation,
    polygonPoints: input.polygonPoints ? (input.polygonPoints as unknown as Prisma.InputJsonArray) : Prisma.DbNull
  };
}

function shapeAudit(shape: FloorplanShape): Record<string, unknown> {
  return {
    shapeId: shape.id,
    kind: shape.kind,
    geometry: shape.geometry,
    capacity: shape.capacity,
    x: Number(shape.x),
    y: Number(shape.y),
    width: Number(shape.width),
    height: Number(shape.height),
    rotation: Number(shape.rotation),
    polygonPoints: shape.polygonPoints
  };
}

export function toFloorplanResponse(floorplan: FloorplanView): FloorplanResponseDto {
  return {
    id: floorplan.id,
    eventId: floorplan.eventId,
    image: {
      fileAssetId: floorplan.imageAssetId,
      contentPath: `/api/v1/events/${floorplan.eventId}/file-assets/${floorplan.imageAssetId}/content`
    },
    locked: floorplan.lockedAt !== null,
    lockedAt: floorplan.lockedAt?.toISOString() ?? null,
    shapes: floorplan.shapes.map((shape) =>
      toShapeResponse(shape, shape._count.assistants + shape._count.physicalPasses)
    ),
    createdAt: floorplan.createdAt.toISOString(),
    updatedAt: floorplan.updatedAt.toISOString()
  };
}

function toShapeResponse(shape: FloorplanShape, occupancy: number): FloorplanShapeResponseDto {
  return {
    id: shape.id,
    kind: shape.kind,
    geometry: shape.geometry,
    name: shape.name,
    capacity: shape.capacity,
    occupancy,
    availableCapacity: Math.max(0, shape.capacity - occupancy),
    x: Number(shape.x),
    y: Number(shape.y),
    width: Number(shape.width),
    height: Number(shape.height),
    rotation: Number(shape.rotation),
    polygonPoints: (shape.polygonPoints as PolygonPoint[] | null) ?? null
  };
}

type PolygonPoint = { x: number; y: number };

async function combinedOccupancy(tx: Prisma.TransactionClient, shapeId: string): Promise<number> {
  const [assistants, physicalPasses] = await Promise.all([
    tx.assistant.count({ where: { floorplanShapeId: shapeId, deletedAt: null } }),
    tx.physicalPass.count({ where: { floorplanShapeId: shapeId, deletedAt: null } })
  ]);
  return assistants + physicalPasses;
}

export function requestSignature(eventId: string, action: SeatingAction, input: unknown): string {
  return createHash('sha256').update(JSON.stringify({ eventId, action, input }), 'utf8').digest('hex');
}

function seatingAuditAction(action: SeatingAction): string {
  return `SEATING_${action}`;
}

function floorplanNotFound(): NotFoundException {
  return new NotFoundException({ code: 'FLOORPLAN_NOT_FOUND', message: 'Floorplan not found.' });
}
function shapeNotFound(): NotFoundException {
  return new NotFoundException({ code: 'FLOORPLAN_SHAPE_NOT_FOUND', message: 'Floorplan shape not found.' });
}
function seatingNotFound(): NotFoundException {
  return new NotFoundException({ code: 'SEATING_SELECTION_NOT_FOUND', message: 'Seating selection not found.' });
}
function idempotencyConflict(): DomainError {
  return floorplanError(
    'SEATING_IDEMPOTENCY_CONFLICT',
    'Idempotency-Key is already associated with another seating request.'
  );
}
function floorplanError(code: string, message: string): DomainError {
  return new DomainError(code, message, HttpStatus.CONFLICT);
}

function mapDatabaseError(error: unknown): unknown {
  const message = databaseMessage(error);
  if (message.includes('SEATING_TABLE_CAPACITY_EXCEEDED')) {
    return floorplanError('SEATING_TABLE_CAPACITY_EXCEEDED', 'Table capacity would be exceeded.');
  }
  if (message.includes('SEATING_TABLE_INVALID')) {
    return floorplanError('SEATING_TABLE_INVALID', 'Seating assignment requires an active table.');
  }
  if (message.includes('FLOORPLAN_TABLE_OCCUPIED_OR_CAPACITY')) {
    return floorplanError('FLOORPLAN_TABLE_OCCUPIED', 'Table occupancy conflicts with this change.');
  }
  if (message.includes('FLOORPLAN_FILE_ASSET')) {
    return floorplanError('FLOORPLAN_FILE_ASSET_INCOMPATIBLE', 'Floorplan image asset is incompatible.');
  }
  return error;
}

function databaseMessage(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  return JSON.stringify(error);
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}

function isRetryable(error: unknown): boolean {
  if (hasPrismaCode(error, 'P2034') || hasPrismaCode(error, 'P2002')) return true;
  const message = databaseMessage(error);
  return message.includes('40001') || message.includes('40P01');
}
