import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from '@nestjs/common';
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
  FloorplanSeatingMode,
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
  AssignSeatsInput,
  BatchFloorplanSeatsInput,
  CreateFloorplanInput,
  FloorplanResponseDto,
  FloorplanShapeInput,
  FloorplanShapeResponseDto,
  FloorplanSeatInput,
  FloorplanSeatResponseDto,
  SeatingMutationResponseDto,
  SeatingWorkspacePageDto,
  SeatingWorkspaceQueryInput,
  ScannerFloorplanResponseDto,
  UpdateFloorplanShapeInput,
  UpdateFloorplanSeatInput,
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
  },
  seats: { where: { deletedAt: null }, include: { _count: { select: { assistants: { where: { deletedAt: null } } } } }, orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }] }
} satisfies Prisma.FloorplanInclude;

type FloorplanView = Prisma.FloorplanGetPayload<{ include: typeof floorplanInclude }>;
type FloorplanTarget = { kind: 'PLANNER' } | { kind: 'ADMIN'; clientId: string };

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
    return this.createForTarget(eventId, input, principal, { kind: 'PLANNER' }, operationId);
  }

  createAdministrative(
    clientId: string,
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.createForTarget(eventId, input, principal, { kind: 'ADMIN', clientId }, operationId);
  }

  private async createForTarget(
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
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
      return this.toTargetResponse(await this.requireView(tx, eventId), target);
    });
  }

  async get(eventId: string, principal: AuthPrincipal): Promise<FloorplanResponseDto> {
    return this.getForTarget(eventId, principal, { kind: 'PLANNER' });
  }

  getAdministrative(clientId: string, eventId: string, principal: AuthPrincipal): Promise<FloorplanResponseDto> {
    return this.getForTarget(eventId, principal, { kind: 'ADMIN', clientId });
  }

  private async getForTarget(
    eventId: string,
    principal: AuthPrincipal,
    target: FloorplanTarget
  ): Promise<FloorplanResponseDto> {
    await this.prisma.$transaction((tx) => this.requireTargetEvent(tx, eventId, principal, target));
    return this.toTargetResponse(await this.requireView(this.prisma, eventId), target);
  }

  async seatingWorkspace(
    eventId: string,
    input: SeatingWorkspaceQueryInput,
    principal: AuthPrincipal
  ): Promise<SeatingWorkspacePageDto> {
    const cursor = input.cursor ? decodeSeatingCursor(input.cursor) : null;
    return this.prisma.$transaction(async (tx) => {
      await this.access.requireOwnedEvent(tx, eventId, principal);
      const floorplan = await tx.floorplan.findFirst({
        where: { eventId, deletedAt: null },
        select: { id: true }
      });
      if (!floorplan) throw floorplanNotFound();

      const selectedTable = input.tableShapeId
        ? await tx.floorplanShape.findFirst({
            where: {
              id: input.tableShapeId,
              eventId,
              floorplanId: floorplan.id,
              kind: FloorplanShapeKind.TABLE,
              deletedAt: null
            },
            select: { id: true, name: true, capacity: true }
          })
        : null;
      if (input.scope === 'TABLE' && !selectedTable) {
        throw floorplanError('SEATING_TABLE_INVALID', 'Seating query requires an active table.');
      }

      const normalizedName = Prisma.sql`
        regexp_replace(
          translate(lower(coalesce(a."name", '')),
            'áàäâãåéèëêíìïîóòöôõúùüûñç',
            'aaaaaaeeeeiiiiooooouuuunc'),
          '\\s+', ' ', 'g'
        )
      `;
      const scopeCondition =
        input.scope === 'UNASSIGNED'
          ? Prisma.sql`e.floorplan_shape_id IS NULL`
          : Prisma.sql`e.floorplan_shape_id = ${input.tableShapeId!}::uuid`;
      const groupCondition = input.groupId ? Prisma.sql`AND e.group_id = ${input.groupId}::uuid` : Prisma.empty;
      const searchCondition = input.search
        ? Prisma.sql`AND e.normalized_name LIKE ${`%${input.search}%`}`
        : Prisma.empty;
      const cursorCondition = cursor
        ? Prisma.sql`AND (e.normalized_name > ${cursor.name} OR
            (e.normalized_name = ${cursor.name} AND e.assistant_id > ${cursor.assistantId}::uuid))`
        : Prisma.empty;

      const rows = await tx.$queryRaw<SeatingWorkspaceRow[]>(Prisma.sql`
        WITH eligible AS (
          SELECT
            a."id" AS assistant_id,
            a."name" AS assistant_name,
            a."invitation_id" AS invitation_id,
            a."floorplan_shape_id" AS floorplan_shape_id,
            a."floorplan_seat_id" AS floorplan_seat_id,
            c."group_id" AS group_id,
            g."name" AS group_name,
            t."name" AS table_name,
            s."label" AS seat_label,
            ${normalizedName} AS normalized_name
          FROM "assistant" a
          JOIN "invitation" i
            ON i."id" = a."invitation_id" AND i."event_id" = a."event_id"
          JOIN "contact" c
            ON c."id" = i."contact_id" AND c."event_id" = i."event_id"
          LEFT JOIN "contact_group" g
            ON g."id" = c."group_id" AND g."event_id" = c."event_id"
          LEFT JOIN "floorplan_shape" t
            ON t."id" = a."floorplan_shape_id" AND t."event_id" = a."event_id" AND t."deleted_at" IS NULL
          LEFT JOIN "floorplan_seat" s
            ON s."id" = a."floorplan_seat_id" AND s."event_id" = a."event_id" AND s."deleted_at" IS NULL
          WHERE a."event_id" = ${eventId}::uuid
            AND a."deleted_at" IS NULL
            AND a."anonymized_at" IS NULL
            AND a."name" IS NOT NULL
            AND a."response_status" = 'CONFIRMED'::"assistant_response_status"
            AND i."deleted_at" IS NULL
            AND i."cancelled_at" IS NULL
            AND c."deleted_at" IS NULL
        ),
        invitation_counts AS (
          SELECT invitation_id, count(*)::int AS eligible_count,
            count(*) FILTER (WHERE floorplan_shape_id IS NOT NULL)::int AS assigned_count
          FROM eligible GROUP BY invitation_id
        ),
        group_counts AS (
          SELECT group_id, count(*)::int AS eligible_count,
            count(*) FILTER (WHERE floorplan_shape_id IS NOT NULL)::int AS assigned_count
          FROM eligible WHERE group_id IS NOT NULL GROUP BY group_id
        ),
        active_check_ins AS (
          SELECT DISTINCT "assistant_id" FROM "check_in"
          WHERE "event_id" = ${eventId}::uuid AND "reverted_at" IS NULL
        )
        SELECT e.*, ic.eligible_count AS invitation_eligible_count,
          ic.assigned_count AS invitation_assigned_count,
          gc.eligible_count AS group_eligible_count,
          gc.assigned_count AS group_assigned_count,
          (ci."assistant_id" IS NOT NULL) AS checked_in
        FROM eligible e
        JOIN invitation_counts ic ON ic.invitation_id = e.invitation_id
        LEFT JOIN group_counts gc ON gc.group_id = e.group_id
        LEFT JOIN active_check_ins ci ON ci."assistant_id" = e.assistant_id
        WHERE ${scopeCondition} ${groupCondition} ${searchCondition} ${cursorCondition}
        ORDER BY e.normalized_name ASC, e.assistant_id ASC
        LIMIT ${input.limit + 1}
      `);

      const totals = await tx.$queryRaw<SeatingWorkspaceTotalsRow[]>(Prisma.sql`
        SELECT
          count(*) FILTER (WHERE a."floorplan_shape_id" IS NULL)::int AS unassigned_count,
          (SELECT count(*)::int FROM "assistant" seated
            WHERE seated."floorplan_shape_id" = ${input.tableShapeId ?? null}::uuid
              AND seated."deleted_at" IS NULL) AS table_assistants,
          (SELECT count(*)::int FROM "physical_pass" p
            WHERE p."floorplan_shape_id" = ${input.tableShapeId ?? null}::uuid AND p."deleted_at" IS NULL) AS table_passes
        FROM "assistant" a
        JOIN "invitation" i ON i."id" = a."invitation_id" AND i."event_id" = a."event_id"
        JOIN "contact" c ON c."id" = i."contact_id" AND c."event_id" = i."event_id"
        WHERE a."event_id" = ${eventId}::uuid
          AND a."deleted_at" IS NULL
          AND a."anonymized_at" IS NULL
          AND a."name" IS NOT NULL
          AND a."response_status" = 'CONFIRMED'::"assistant_response_status"
          AND i."deleted_at" IS NULL
          AND i."cancelled_at" IS NULL
          AND c."deleted_at" IS NULL
      `);
      const total = totals[0] ?? { unassigned_count: 0, table_assistants: 0, table_passes: 0 };
      const hasNext = rows.length > input.limit;
      const pageRows = hasNext ? rows.slice(0, input.limit) : rows;
      const last = pageRows.at(-1);
      return {
        items: pageRows.map(toSeatingWorkspaceItem),
        summary: {
          unassignedCount: Number(total.unassigned_count),
          selectedTable: selectedTable
            ? {
                id: selectedTable.id,
                name: selectedTable.name,
                occupancy: Number(total.table_assistants) + Number(total.table_passes),
                capacity: selectedTable.capacity
              }
            : null
        },
        nextCursor: hasNext && last ? encodeSeatingCursor(last.normalized_name, last.assistant_id) : null
      };
    });
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
    return this.replaceImageForTarget(eventId, input, principal, { kind: 'PLANNER' }, operationId);
  }

  replaceImageAdministrative(
    clientId: string,
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.replaceImageForTarget(eventId, input, principal, { kind: 'ADMIN', clientId }, operationId);
  }

  private async replaceImageForTarget(
    eventId: string,
    input: CreateFloorplanInput,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
      this.assertLayoutMutable(event);
      const current = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(current);
      if (current.imageAssetId === input.imageAssetId) {
        return this.toTargetResponse(await this.requireView(tx, eventId), target);
      }
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
      return this.toTargetResponse(await this.requireView(tx, eventId), target);
    });
  }

  lock(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, { kind: 'PLANNER' }, true, operationId);
  }

  unlock(eventId: string, principal: AuthPrincipal, operationId?: string): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, { kind: 'PLANNER' }, false, operationId);
  }

  lockAdministrative(
    clientId: string,
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, { kind: 'ADMIN', clientId }, true, operationId);
  }

  unlockAdministrative(
    clientId: string,
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.changeLock(eventId, principal, { kind: 'ADMIN', clientId }, false, operationId);
  }

  async createShape(
    eventId: string,
    input: FloorplanShapeInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.createShapeForTarget(eventId, input, principal, { kind: 'PLANNER' }, operationId);
  }

  createShapeAdministrative(
    clientId: string,
    eventId: string,
    input: FloorplanShapeInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.createShapeForTarget(eventId, input, principal, { kind: 'ADMIN', clientId }, operationId);
  }

  private async createShapeForTarget(
    eventId: string,
    input: FloorplanShapeInput,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
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
    return this.updateShapeForTarget(eventId, shapeId, input, principal, { kind: 'PLANNER' }, operationId);
  }

  updateShapeAdministrative(
    clientId: string,
    eventId: string,
    shapeId: string,
    input: UpdateFloorplanShapeInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.updateShapeForTarget(eventId, shapeId, input, principal, { kind: 'ADMIN', clientId }, operationId);
  }

  private async updateShapeForTarget(
    eventId: string,
    shapeId: string,
    input: UpdateFloorplanShapeInput,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    operationId?: string
  ): Promise<FloorplanShapeResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
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
    return this.deleteShapeForTarget(eventId, shapeId, principal, { kind: 'PLANNER' }, operationId);
  }

  deleteShapeAdministrative(
    clientId: string,
    eventId: string,
    shapeId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<void> {
    return this.deleteShapeForTarget(eventId, shapeId, principal, { kind: 'ADMIN', clientId }, operationId);
  }

  private async deleteShapeForTarget(
    eventId: string,
    shapeId: string,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    operationId?: string
  ): Promise<void> {
    await this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
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

  async assignSeats(eventId: string, key: string, input: AssignSeatsInput, principal: AuthPrincipal, operationId?: string): Promise<SeatingMutationResponseDto> {
    const effectiveOperationId = operationId ?? randomUUID();
    const signature = requestSignature(eventId, SeatingAction.ASSIGN_SEATS, input);
    const outcome = await this.serializable(async (tx): Promise<SeatingOutcome> => {
      const event = await this.access.requireOwnedEvent(tx, eventId, principal, true);
      const prior = await tx.seatingOperation.findUnique({ where: { idempotencyKey: key } });
      if (prior) {
        if (prior.eventId !== eventId || prior.action !== SeatingAction.ASSIGN_SEATS || prior.requestSignature !== signature) throw idempotencyConflict();
        return { response: prior.resultSnapshot as unknown as SeatingMutationResponseDto, replay: true, eventId, operationId: effectiveOperationId };
      }
      this.assertSeatingMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      if (floorplan.seatingMode !== FloorplanSeatingMode.SEAT) throw floorplanError('SEATING_MODE_TABLE', 'Exact seating requires detailed seating mode.');
      const assistantIds = input.assignments.map(({ assistantId }) => assistantId).sort();
      const seatIds = input.assignments.map(({ seatId }) => seatId).sort();
      await tx.$queryRaw`SELECT "id" FROM "assistant" WHERE "id" = ANY(ARRAY[${Prisma.join(assistantIds)}]::uuid[]) ORDER BY "id" FOR UPDATE`;
      await tx.$queryRaw`SELECT "id" FROM "floorplan_seat" WHERE "id" = ANY(ARRAY[${Prisma.join(seatIds)}]::uuid[]) ORDER BY "id" FOR UPDATE`;
      const [assistants, seats] = await Promise.all([
        tx.assistant.findMany({ where: { id: { in: assistantIds }, eventId, deletedAt: null, anonymizedAt: null, name: { not: null }, responseStatus: AssistantResponseStatus.CONFIRMED, invitation: { deletedAt: null, cancelledAt: null } }, select: { id: true, floorplanShapeId: true, floorplanSeatId: true } }),
        tx.floorplanSeat.findMany({ where: { id: { in: seatIds }, eventId, floorplanId: floorplan.id, deletedAt: null, isBlocked: false }, select: { id: true, floorplanShapeId: true } })
      ]);
      if (assistants.length !== input.assignments.length || seats.length !== input.assignments.length) throw seatingNotFound();
      const seatById = new Map(seats.map((seat) => [seat.id, seat]));
      const changes = input.assignments.map(({ assistantId, seatId }) => {
        const assistant = assistants.find((item) => item.id === assistantId)!;
        const seat = seatById.get(seatId)!;
        return { assistantId, fromTableId: assistant.floorplanShapeId, toTableId: seat.floorplanShapeId };
      });
      for (const { assistantId, seatId } of input.assignments) {
        const seat = seatById.get(seatId)!;
        await tx.assistant.update({ where: { id: assistantId }, data: { floorplanSeatId: seatId, floorplanShapeId: seat.floorplanShapeId } });
      }
      const affectedTables = await this.tableOccupancy(tx, [...new Set(changes.flatMap(({ fromTableId, toTableId }) => [fromTableId, toTableId]).filter((id): id is string => !!id))].sort());
      const response = { changes, affectedTables };
      await tx.seatingOperation.create({ data: { eventId, action: SeatingAction.ASSIGN_SEATS, idempotencyKey: key, requestSignature: signature, resultSnapshot: response as unknown as Prisma.InputJsonObject } });
      await this.recordAudit(tx, event, principal, effectiveOperationId, 'SEATING_ASSIGN_SEATS', floorplan.id, { assistantIds, seatIds, changes, affectedTables });
      return { response, replay: false, eventId, operationId: effectiveOperationId };
    });
    if (!outcome.replay && outcome.response.changes.length) await this.realtime.publishSeatingUpdated({ eventName: 'seating.updated', version: 1, eventId, occurredAt: new Date().toISOString(), operationId: outcome.operationId, actorType: 'USER', data: outcome.response });
    return outcome.response;
  }

  async setSeatingModeAdministrative(clientId: string, eventId: string, seatingMode: FloorplanSeatingMode, principal: AuthPrincipal, operationId?: string): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, { kind: 'ADMIN', clientId }, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      this.assertUnlocked(floorplan);
      if (floorplan.seatingMode === seatingMode) return this.toTargetResponse(await this.requireView(tx, eventId), { kind: 'ADMIN', clientId });
      if (seatingMode === FloorplanSeatingMode.SEAT) {
        const tables = await tx.floorplanShape.findMany({ where: { floorplanId: floorplan.id, kind: FloorplanShapeKind.TABLE, deletedAt: null }, select: { id: true } });
        if (tables.length === 0) throw floorplanError('FLOORPLAN_SEAT_TABLE_REQUIRED', 'Detailed seating requires a table.');
      }
      await tx.floorplan.update({ where: { id: floorplan.id }, data: { seatingMode } });
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SEATING_MODE_UPDATE', floorplan.id, { seatingMode });
      await recomputeDigitalEventPreparationStatus(tx, eventId);
      return this.toTargetResponse(await this.requireView(tx, eventId), { kind: 'ADMIN', clientId });
    });
  }

  createSeatAdministrative(clientId: string, eventId: string, shapeId: string, input: FloorplanSeatInput, principal: AuthPrincipal, operationId?: string): Promise<FloorplanSeatResponseDto> {
    return this.mutateSeat(clientId, eventId, shapeId, input, principal, operationId, 'CREATE');
  }
  updateSeatAdministrative(clientId: string, eventId: string, seatId: string, input: UpdateFloorplanSeatInput, principal: AuthPrincipal, operationId?: string): Promise<FloorplanSeatResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, { kind: 'ADMIN', clientId }, true);
      this.assertLayoutMutable(event); const floorplan = await this.lockFloorplan(tx, eventId); this.assertUnlocked(floorplan);
      const seat = await tx.floorplanSeat.findFirst({ where: { id: seatId, eventId, floorplanId: floorplan.id, deletedAt: null } });
      if (!seat) throw floorplanError('FLOORPLAN_SEAT_NOT_FOUND', 'Seat was not found.');
      const updated = await tx.floorplanSeat.update({ where: { id: seatId }, data: { ...(input.label === undefined ? {} : { label: input.label, normalizedLabel: normalizeFloorplanName(input.label).toLocaleLowerCase('es-MX') }), ...(input.x === undefined ? {} : { x: input.x }), ...(input.y === undefined ? {} : { y: input.y }), ...(input.isBlocked === undefined ? {} : { isBlocked: input.isBlocked }) } });
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SEAT_UPDATE', seatId, { before: seatAudit(seat), after: seatAudit(updated) });
      return toSeatResponse(updated, await tx.assistant.count({ where: { floorplanSeatId: seatId, deletedAt: null } }));
    });
  }
  async deleteSeatAdministrative(clientId: string, eventId: string, seatId: string, principal: AuthPrincipal, operationId?: string): Promise<void> {
    await this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, { kind: 'ADMIN', clientId }, true); this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId); this.assertUnlocked(floorplan);
      const seat = await tx.floorplanSeat.findFirst({ where: { id: seatId, eventId, floorplanId: floorplan.id, deletedAt: null } });
      if (!seat) throw floorplanError('FLOORPLAN_SEAT_NOT_FOUND', 'Seat was not found.');
      if (await tx.assistant.count({ where: { floorplanSeatId: seatId, deletedAt: null } })) throw floorplanError('FLOORPLAN_SEAT_OCCUPIED', 'Occupied seat cannot be deleted.');
      await tx.floorplanSeat.update({ where: { id: seatId }, data: { deletedAt: new Date() } });
      await this.recordAudit(tx, event, principal, operationId, 'FLOORPLAN_SEAT_DELETE', seatId, seatAudit(seat));
    });
  }
  async batchSeatsAdministrative(clientId: string, eventId: string, input: BatchFloorplanSeatsInput, principal: AuthPrincipal, operationId?: string): Promise<FloorplanSeatResponseDto[]> {
    const results: FloorplanSeatResponseDto[] = [];
    for (const item of input.seats) results.push(await this.updateSeatAdministrative(clientId, eventId, item.seatId, item, principal, operationId));
    return results;
  }
  private async mutateSeat(clientId: string, eventId: string, shapeId: string, input: FloorplanSeatInput, principal: AuthPrincipal, operationId: string | undefined, action: 'CREATE'): Promise<FloorplanSeatResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, { kind: 'ADMIN', clientId }, true); this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId); this.assertUnlocked(floorplan);
      if (floorplan.seatingMode !== FloorplanSeatingMode.SEAT) throw floorplanError('FLOORPLAN_SEAT_MODE_REQUIRED', 'Seats require detailed seating mode.');
      const shape = await this.lockShape(tx, eventId, floorplan.id, shapeId);
      if (shape.kind !== FloorplanShapeKind.TABLE) throw floorplanError('FLOORPLAN_SEAT_PARENT_INVALID', 'Seat requires a table parent.');
      const seat = await tx.floorplanSeat.create({ data: { eventId, floorplanId: floorplan.id, floorplanShapeId: shapeId, label: input.label, normalizedLabel: normalizeFloorplanName(input.label).toLocaleLowerCase('es-MX'), x: input.x, y: input.y, isBlocked: input.isBlocked ?? false } });
      await this.recordAudit(tx, event, principal, operationId, `FLOORPLAN_SEAT_${action}`, seat.id, seatAudit(seat));
      return toSeatResponse(seat, 0);
    });
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
    target: FloorplanTarget,
    lock: boolean,
    operationId?: string
  ): Promise<FloorplanResponseDto> {
    return this.serializable(async (tx) => {
      const event = await this.requireTargetEvent(tx, eventId, principal, target, true);
      this.assertLayoutMutable(event);
      const floorplan = await this.lockFloorplan(tx, eventId);
      if ((lock && floorplan.lockedAt) || (!lock && !floorplan.lockedAt)) {
        return this.toTargetResponse(await this.requireView(tx, eventId), target);
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
      return this.toTargetResponse(await this.requireView(tx, eventId), target);
    });
  }

  private requireTargetEvent(
    tx: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal,
    target: FloorplanTarget,
    lock = false
  ): Promise<Event> {
    return target.kind === 'ADMIN'
      ? this.access.requireAdministrativeEvent(tx, target.clientId, eventId, lock)
      : this.access.requireOwnedEvent(tx, eventId, principal, lock);
  }

  private toTargetResponse(floorplan: FloorplanView, target: FloorplanTarget): FloorplanResponseDto {
    return target.kind === 'ADMIN'
      ? toFloorplanResponse(
          floorplan,
          `/api/v1/admin/clients/${target.clientId}/events/${floorplan.eventId}/floorplan/file-assets/${floorplan.imageAssetId}/content`
        )
      : toFloorplanResponse(floorplan);
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

export function toFloorplanResponse(floorplan: FloorplanView, contentPath?: string): FloorplanResponseDto {
  return {
    id: floorplan.id,
    eventId: floorplan.eventId,
    image: {
      fileAssetId: floorplan.imageAssetId,
      contentPath: contentPath ?? `/api/v1/events/${floorplan.eventId}/file-assets/${floorplan.imageAssetId}/content`
    },
    locked: floorplan.lockedAt !== null,
    lockedAt: floorplan.lockedAt?.toISOString() ?? null,
    seatingMode: floorplan.seatingMode,
    shapes: floorplan.shapes.map((shape) =>
      toShapeResponse(shape, shape._count.assistants + shape._count.physicalPasses)
    ),
    seats: floorplan.seats.map((seat) => ({ id: seat.id, floorplanShapeId: seat.floorplanShapeId, label: seat.label, x: Number(seat.x), y: Number(seat.y), isBlocked: seat.isBlocked, occupied: seat._count.assistants > 0 })),
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

function toSeatResponse(seat: { id: string; floorplanShapeId: string; label: string; x: Prisma.Decimal; y: Prisma.Decimal; isBlocked: boolean }, occupied: number): FloorplanSeatResponseDto {
  return { id: seat.id, floorplanShapeId: seat.floorplanShapeId, label: seat.label, x: Number(seat.x), y: Number(seat.y), isBlocked: seat.isBlocked, occupied: occupied > 0 };
}
function seatAudit(seat: { id: string; floorplanShapeId: string; label: string; x: Prisma.Decimal; y: Prisma.Decimal; isBlocked: boolean }): Record<string, unknown> {
  return { seatId: seat.id, floorplanShapeId: seat.floorplanShapeId, label: seat.label, x: Number(seat.x), y: Number(seat.y), isBlocked: seat.isBlocked };
}

type PolygonPoint = { x: number; y: number };

interface SeatingWorkspaceRow {
  assistant_id: string;
  assistant_name: string | null;
  invitation_id: string;
  floorplan_shape_id: string | null;
  floorplan_seat_id: string | null;
  group_id: string | null;
  group_name: string | null;
  table_name: string | null;
  seat_label: string | null;
  normalized_name: string;
  invitation_eligible_count: number;
  invitation_assigned_count: number;
  group_eligible_count: number | null;
  group_assigned_count: number | null;
  checked_in: boolean;
}

interface SeatingWorkspaceTotalsRow {
  unassigned_count: number;
  table_assistants: number;
  table_passes: number;
}

function toSeatingWorkspaceItem(row: SeatingWorkspaceRow): SeatingWorkspacePageDto['items'][number] {
  return {
    assistantId: row.assistant_id,
    name: row.assistant_name,
    invitation: {
      id: row.invitation_id,
      eligibleAssistantCount: Number(row.invitation_eligible_count),
      assignedAssistantCount: Number(row.invitation_assigned_count)
    },
    group:
      row.group_id && row.group_name
        ? {
            id: row.group_id,
            name: row.group_name,
            eligibleAssistantCount: Number(row.group_eligible_count ?? 0),
            assignedAssistantCount: Number(row.group_assigned_count ?? 0)
          }
        : null,
    table: row.floorplan_shape_id && row.table_name ? { id: row.floorplan_shape_id, name: row.table_name } : null,
    seat: row.floorplan_seat_id && row.seat_label ? { id: row.floorplan_seat_id, label: row.seat_label } : null,
    checkedIn: row.checked_in
  };
}

function encodeSeatingCursor(name: string, assistantId: string): string {
  return Buffer.from(JSON.stringify({ name, assistantId }), 'utf8').toString('base64url');
}

function decodeSeatingCursor(cursor: string): { name: string; assistantId: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    const record = value as Record<string, unknown>;
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof record.name !== 'string' ||
      typeof record.assistantId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(record.assistantId)
    ) {
      throw new Error('invalid cursor');
    }
    return value as { name: string; assistantId: string };
  } catch {
    throw new BadRequestException({ code: 'SEATING_CURSOR_INVALID', message: 'Seating cursor is invalid.' });
  }
}

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
