import { randomUUID } from 'node:crypto';
import { ConflictException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { EventAccessPolicy, eventNotFound } from '../events/event-access.policy';
import { FileAssetsService } from '../file-assets/file-assets.service';
import {
  AuditActorType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  HotspotAction,
  HotspotVisualOwnerType,
  InvitationDesignType,
  Prisma,
  ServiceCode
} from '../generated/prisma/client';
import type {
  AddPageInput,
  CreateFlyerInput,
  CreateHotspotInput,
  DesignReadinessResponseDto,
  HotspotResponseDto,
  InvitationDesignResponseDto,
  ReorderPagesInput,
  ReplaceAssetInput,
  UpdateHotspotInput
} from './invitation-design.dto';
import { normalizeExternalHotspotUrl } from './invitation-design.dto';
import { resolveDesignReadiness, type DesignReadiness } from './invitation-design.readiness';

const MUTABLE_EVENT_STATUSES = new Set<EventStatus>([
  EventStatus.DRAFT,
  EventStatus.CONFIGURED,
  EventStatus.READY_TO_ACTIVATE
]);

const DESIGN_INCLUDE = {
  pages: {
    where: { deletedAt: null },
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: {
      hotspots: {
        where: { deletedAt: null },
        orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
      }
    }
  },
  hotspots: {
    where: { deletedAt: null },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
  }
} satisfies Prisma.InvitationDesignInclude;

type DesignWithChildren = Prisma.InvitationDesignGetPayload<{ include: typeof DESIGN_INCLUDE }>;
type HotspotRecord = DesignWithChildren['hotspots'][number];

@Injectable()
export class InvitationDesignService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventAccessPolicy) private readonly eventAccess: EventAccessPolicy,
    @Inject(FileAssetsService) private readonly fileAssets: FileAssetsService
  ) {}

  async get(eventId: string, principal: AuthPrincipal): Promise<InvitationDesignResponseDto> {
    await this.requireOwnedEvent(this.prisma, eventId, principal, false);
    const design = await this.prisma.invitationDesign.findFirst({
      where: { eventId, deletedAt: null },
      include: DESIGN_INCLUDE
    });
    if (!design) {
      throw designNotFound();
    }
    return toDesignResponse(design);
  }

  async readiness(eventId: string, principal: AuthPrincipal): Promise<DesignReadinessResponseDto> {
    const event = await this.requireOwnedEvent(this.prisma, eventId, principal, false);
    if (!event.service) {
      return { complete: false, designType: null, blockers: ['INVITATION_DESIGN_SERVICE_UNSUPPORTED'] };
    }
    return this.prisma.$transaction(
      (transaction) => resolveDesignReadiness(transaction, eventId, event.service!.code),
      CRITICAL_TRANSACTION_OPTIONS
    );
  }

  async createFlyer(
    eventId: string,
    input: CreateFlyerInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLYER);
      await this.requireNoActiveDesign(transaction, eventId);
      await this.requireStagedAsset(
        transaction,
        input.initialAssetId,
        event.clientId,
        eventId,
        FileAssetOwnerType.FLYER,
        FileAssetType.FLYER_INITIAL_IMAGE
      );
      await this.requireStagedAsset(
        transaction,
        input.qrAssetId,
        event.clientId,
        eventId,
        FileAssetOwnerType.FLYER,
        FileAssetType.FLYER_QR_IMAGE
      );

      const before = await resolveDesignReadiness(transaction, eventId, ServiceCode.FLYER);
      const design = await transaction.invitationDesign.create({
        data: {
          eventId,
          type: InvitationDesignType.FLYER,
          flyerInitialAssetId: input.initialAssetId,
          flyerQrAssetId: input.qrAssetId
        }
      });
      const owner = { ownerType: FileAssetOwnerType.FLYER, ownerId: design.id };
      await this.fileAssets.claimReadyAssetInTransaction(
        transaction,
        input.initialAssetId,
        owner,
        principal.userId,
        operationId
      );
      await this.fileAssets.claimReadyAssetInTransaction(
        transaction,
        input.qrAssetId,
        owner,
        principal.userId,
        operationId
      );
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        'INVITATION_DESIGN_FLYER_CREATE',
        undefined,
        designSnapshot(design),
        operationId
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, ServiceCode.FLYER),
        operationId
      );
      return toDesignResponse(
        await transaction.invitationDesign.findUniqueOrThrow({
          where: { id: design.id },
          include: DESIGN_INCLUDE
        })
      );
    });
  }

  async createFlipbook(
    eventId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLIPBOOK);
      await this.requireNoActiveDesign(transaction, eventId);
      const design = await transaction.invitationDesign.create({
        data: { eventId, type: InvitationDesignType.FLIPBOOK }
      });
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        'INVITATION_DESIGN_FLIPBOOK_CREATE',
        undefined,
        designSnapshot(design),
        operationId
      );
      return toDesignResponse(
        await transaction.invitationDesign.findUniqueOrThrow({
          where: { id: design.id },
          include: DESIGN_INCLUDE
        })
      );
    });
  }

  async replaceFlyerAsset(
    eventId: string,
    variant: 'initial' | 'qr',
    input: ReplaceAssetInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLYER);
      const design = await this.lockDesign(transaction, eventId, InvitationDesignType.FLYER);
      const field = variant === 'initial' ? 'flyerInitialAssetId' : 'flyerQrAssetId';
      const oldAssetId = design[field];
      const fileType = variant === 'initial' ? FileAssetType.FLYER_INITIAL_IMAGE : FileAssetType.FLYER_QR_IMAGE;
      if (oldAssetId === input.assetId) {
        return this.getDesignInTransaction(transaction, design.id);
      }
      await this.requireStagedAsset(
        transaction,
        input.assetId,
        event.clientId,
        eventId,
        FileAssetOwnerType.FLYER,
        fileType
      );
      const before = await resolveDesignReadiness(transaction, eventId, ServiceCode.FLYER);
      await transaction.invitationDesign.update({
        where: { id: design.id },
        data: { [field]: input.assetId }
      });
      const owner = { ownerType: FileAssetOwnerType.FLYER, ownerId: design.id };
      await this.fileAssets.claimReadyAssetInTransaction(
        transaction,
        input.assetId,
        owner,
        principal.userId,
        operationId
      );
      if (!oldAssetId) {
        throw designConflict('Flyer variant is not configured.');
      }
      await this.fileAssets.hideOwnedAssetInTransaction(transaction, oldAssetId, owner, principal.userId, operationId);
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        'INVITATION_DESIGN_FLYER_ASSET_REPLACE',
        { variant, assetId: oldAssetId },
        { variant, assetId: input.assetId },
        operationId
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, ServiceCode.FLYER),
        operationId
      );
      return this.getDesignInTransaction(transaction, design.id);
    });
  }

  async addPage(
    eventId: string,
    input: AddPageInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLIPBOOK);
      const design = await this.lockDesign(transaction, eventId, InvitationDesignType.FLIPBOOK);
      const pages = await transaction.flipbookPage.findMany({
        where: { designId: design.id, deletedAt: null },
        orderBy: { position: 'asc' }
      });
      if (pages.length >= 10) {
        throw pageLimitExceeded();
      }
      await this.requireStagedAsset(
        transaction,
        input.fileAssetId,
        event.clientId,
        eventId,
        FileAssetOwnerType.FLIPBOOK_PAGE,
        FileAssetType.FLIPBOOK_PAGE_IMAGE
      );
      const before = await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK);
      const pageId = randomUUID();
      const page = await transaction.flipbookPage.create({
        data: {
          id: pageId,
          designId: design.id,
          eventId,
          fileAssetId: input.fileAssetId,
          position: pages.length + 1
        }
      });
      await this.fileAssets.claimReadyAssetInTransaction(
        transaction,
        input.fileAssetId,
        { ownerType: FileAssetOwnerType.FLIPBOOK_PAGE, ownerId: page.id },
        principal.userId,
        operationId
      );
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        page.id,
        'FLIPBOOK_PAGE_CREATE',
        undefined,
        pageSnapshot(page),
        operationId,
        'FLIPBOOK_PAGE'
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK),
        operationId
      );
      return this.getDesignInTransaction(transaction, design.id);
    });
  }

  async replacePageAsset(
    eventId: string,
    pageId: string,
    input: ReplaceAssetInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLIPBOOK);
      const design = await this.lockDesign(transaction, eventId, InvitationDesignType.FLIPBOOK);
      const page = await this.lockPage(transaction, design.id, eventId, pageId);
      if (page.fileAssetId === input.assetId) {
        return this.getDesignInTransaction(transaction, design.id);
      }
      await this.requireStagedAsset(
        transaction,
        input.assetId,
        event.clientId,
        eventId,
        FileAssetOwnerType.FLIPBOOK_PAGE,
        FileAssetType.FLIPBOOK_PAGE_IMAGE
      );
      const before = await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK);
      await transaction.flipbookPage.update({
        where: { id: page.id },
        data: { fileAssetId: input.assetId }
      });
      const owner = { ownerType: FileAssetOwnerType.FLIPBOOK_PAGE, ownerId: page.id };
      await this.fileAssets.claimReadyAssetInTransaction(
        transaction,
        input.assetId,
        owner,
        principal.userId,
        operationId
      );
      await this.fileAssets.hideOwnedAssetInTransaction(
        transaction,
        page.fileAssetId,
        owner,
        principal.userId,
        operationId
      );
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        page.id,
        'FLIPBOOK_PAGE_ASSET_REPLACE',
        { assetId: page.fileAssetId },
        { assetId: input.assetId },
        operationId,
        'FLIPBOOK_PAGE'
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK),
        operationId
      );
      return this.getDesignInTransaction(transaction, design.id);
    });
  }

  async reorderPages(
    eventId: string,
    input: ReorderPagesInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLIPBOOK);
      const design = await this.lockDesign(transaction, eventId, InvitationDesignType.FLIPBOOK);
      const pages = await transaction.flipbookPage.findMany({
        where: { designId: design.id, deletedAt: null },
        orderBy: { position: 'asc' }
      });
      if (pages.length !== input.pageIds.length || pages.some((page) => !input.pageIds.includes(page.id))) {
        throw designConflict('Reorder must contain every active Flipbook page exactly once.');
      }
      const beforeOrder = pages.map((page) => page.id);
      for (const [index, id] of input.pageIds.entries()) {
        await transaction.flipbookPage.update({ where: { id }, data: { position: index + 1 } });
      }
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        'FLIPBOOK_PAGES_REORDER',
        { pageIds: beforeOrder },
        { pageIds: input.pageIds },
        operationId
      );
      return this.getDesignInTransaction(transaction, design.id);
    });
  }

  async deletePage(
    eventId: string,
    pageId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<InvitationDesignResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal, ServiceCode.FLIPBOOK);
      const design = await this.lockDesign(transaction, eventId, InvitationDesignType.FLIPBOOK);
      const page = await this.lockPage(transaction, design.id, eventId, pageId);
      const before = await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK);
      const at = new Date();
      await transaction.hotspot.updateMany({
        where: { flipbookPageId: page.id, deletedAt: null },
        data: { deletedAt: at }
      });
      await transaction.flipbookPage.update({ where: { id: page.id }, data: { deletedAt: at } });
      const laterPages = await transaction.flipbookPage.findMany({
        where: { designId: design.id, deletedAt: null, position: { gt: page.position } },
        orderBy: { position: 'asc' }
      });
      for (const later of laterPages) {
        await transaction.flipbookPage.update({
          where: { id: later.id },
          data: { position: later.position - 1 }
        });
      }
      await this.fileAssets.hideOwnedAssetInTransaction(
        transaction,
        page.fileAssetId,
        { ownerType: FileAssetOwnerType.FLIPBOOK_PAGE, ownerId: page.id },
        principal.userId,
        operationId
      );
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        page.id,
        'FLIPBOOK_PAGE_DELETE',
        pageSnapshot(page),
        { ...pageSnapshot(page), deletedAt: at },
        operationId,
        'FLIPBOOK_PAGE'
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, ServiceCode.FLIPBOOK),
        operationId
      );
      return this.getDesignInTransaction(transaction, design.id);
    });
  }

  async createHotspot(
    eventId: string,
    input: CreateHotspotInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<HotspotResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal);
      const design = await this.lockDesignForService(transaction, eventId, event.service!.code);
      this.assertHotspotOwner(design.type, input.visualOwnerType, input.flipbookPageId);
      if (input.flipbookPageId) {
        await this.lockPage(transaction, design.id, eventId, input.flipbookPageId);
      }
      const before = await resolveDesignReadiness(transaction, eventId, event.service!.code);
      if (input.action === HotspotAction.EXTERNAL_LINK) {
        const externalLinks = await transaction.hotspot.count({
          where: { designId: design.id, action: HotspotAction.EXTERNAL_LINK, deletedAt: null }
        });
        if (externalLinks >= 3) {
          throw externalLinkLimitExceeded();
        }
      }
      const hotspot = await transaction.hotspot.create({
        data: {
          designId: design.id,
          eventId,
          visualOwnerType: input.visualOwnerType,
          flipbookPageId: input.flipbookPageId ?? null,
          action: input.action,
          x: input.x,
          y: input.y,
          width: input.width,
          height: input.height,
          priority: input.priority,
          url: input.action === HotspotAction.EXTERNAL_LINK ? normalizeExternalHotspotUrl(input.url!) : null
        }
      });
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        hotspot.id,
        'HOTSPOT_CREATE',
        undefined,
        hotspotSnapshot(hotspot),
        operationId,
        'HOTSPOT'
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, event.service!.code),
        operationId
      );
      return toHotspotResponse(hotspot);
    });
  }

  async updateHotspot(
    eventId: string,
    hotspotId: string,
    input: UpdateHotspotInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<HotspotResponseDto> {
    return this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal);
      const design = await this.lockDesignForService(transaction, eventId, event.service!.code);
      const current = await this.lockHotspot(transaction, design.id, eventId, hotspotId);
      const merged = {
        action: input.action ?? current.action,
        x: input.x ?? Number(current.x),
        y: input.y ?? Number(current.y),
        width: input.width ?? Number(current.width),
        height: input.height ?? Number(current.height),
        priority: input.priority ?? current.priority,
        url:
          (input.action ?? current.action) === HotspotAction.EXTERNAL_LINK
            ? normalizeExternalHotspotUrl(input.url ?? current.url ?? '')
            : null
      };
      assertCoordinates(merged);
      if (merged.action === HotspotAction.EXTERNAL_LINK && current.action !== HotspotAction.EXTERNAL_LINK) {
        const count = await transaction.hotspot.count({
          where: { designId: design.id, action: HotspotAction.EXTERNAL_LINK, deletedAt: null }
        });
        if (count >= 3) {
          throw externalLinkLimitExceeded();
        }
      }
      const hotspot = await transaction.hotspot.update({
        where: { id: current.id },
        data: merged
      });
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        hotspot.id,
        'HOTSPOT_UPDATE',
        hotspotSnapshot(current),
        hotspotSnapshot(hotspot),
        operationId,
        'HOTSPOT'
      );
      return toHotspotResponse(hotspot);
    });
  }

  async deleteHotspot(
    eventId: string,
    hotspotId: string,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<void> {
    await this.serializable(async (transaction) => {
      const event = await this.lockMutableEvent(transaction, eventId, principal);
      const design = await this.lockDesignForService(transaction, eventId, event.service!.code);
      const current = await this.lockHotspot(transaction, design.id, eventId, hotspotId);
      const before = await resolveDesignReadiness(transaction, eventId, event.service!.code);
      const deleted = await transaction.hotspot.update({
        where: { id: current.id },
        data: { deletedAt: new Date() }
      });
      await this.record(
        transaction,
        principal,
        event.clientId,
        eventId,
        deleted.id,
        'HOTSPOT_DELETE',
        hotspotSnapshot(current),
        hotspotSnapshot(deleted),
        operationId,
        'HOTSPOT'
      );
      await this.recordReadinessChange(
        transaction,
        principal,
        event.clientId,
        eventId,
        design.id,
        before,
        await resolveDesignReadiness(transaction, eventId, event.service!.code),
        operationId
      );
    });
  }

  private async lockMutableEvent(
    transaction: Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal,
    expectedService?: ServiceCode
  ) {
    await transaction.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    const event = await this.requireOwnedEvent(transaction, eventId, principal, true);
    if (!MUTABLE_EVENT_STATUSES.has(event.status)) {
      throw new DomainError(
        'INVITATION_DESIGN_EVENT_STATE_LOCKED',
        'Invitation design is frozen for the current Event state.',
        HttpStatus.CONFLICT
      );
    }
    if (!event.service || (expectedService && event.service.code !== expectedService)) {
      throw new DomainError(
        'INVITATION_DESIGN_SERVICE_MISMATCH',
        'Configured Event service does not support this invitation design.',
        HttpStatus.CONFLICT
      );
    }
    if (event.service.code !== ServiceCode.FLYER && event.service.code !== ServiceCode.FLIPBOOK) {
      throw new DomainError(
        'INVITATION_DESIGN_SERVICE_MISMATCH',
        'Configured Event service does not support a digital invitation design.',
        HttpStatus.CONFLICT
      );
    }
    return event;
  }

  private async requireOwnedEvent(
    database: PrismaService | Prisma.TransactionClient,
    eventId: string,
    principal: AuthPrincipal,
    requireService: boolean
  ) {
    const event = await database.event.findFirst({
      where: {
        id: eventId,
        deletedAt: null,
        ...this.eventAccess.ownedWhere(principal)
      },
      include: { service: true }
    });
    if (!event || (requireService && !event.service)) {
      throw eventNotFound();
    }
    return event;
  }

  private async requireNoActiveDesign(transaction: Prisma.TransactionClient, eventId: string): Promise<void> {
    if (await transaction.invitationDesign.findFirst({ where: { eventId, deletedAt: null } })) {
      throw designConflict('Event already has an active invitation design.');
    }
  }

  private async lockDesign(transaction: Prisma.TransactionClient, eventId: string, type: InvitationDesignType) {
    const rows = await transaction.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "invitation_design"
      WHERE "event_id" = ${eventId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const id = rows[0]?.id;
    const design = id ? await transaction.invitationDesign.findUnique({ where: { id } }) : null;
    if (!design || design.type !== type) {
      throw designNotFound();
    }
    return design;
  }

  private async lockDesignForService(transaction: Prisma.TransactionClient, eventId: string, serviceCode: ServiceCode) {
    return this.lockDesign(
      transaction,
      eventId,
      serviceCode === ServiceCode.FLYER ? InvitationDesignType.FLYER : InvitationDesignType.FLIPBOOK
    );
  }

  private async lockPage(transaction: Prisma.TransactionClient, designId: string, eventId: string, pageId: string) {
    await transaction.$queryRaw`
      SELECT "id" FROM "flipbook_page"
      WHERE "id" = ${pageId}::uuid AND "design_id" = ${designId}::uuid
        AND "event_id" = ${eventId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const page = await transaction.flipbookPage.findFirst({
      where: { id: pageId, designId, eventId, deletedAt: null }
    });
    if (!page) {
      throw childNotFound('FLIPBOOK_PAGE_NOT_FOUND', 'Flipbook page not found.');
    }
    return page;
  }

  private async lockHotspot(
    transaction: Prisma.TransactionClient,
    designId: string,
    eventId: string,
    hotspotId: string
  ) {
    await transaction.$queryRaw`
      SELECT "id" FROM "hotspot"
      WHERE "id" = ${hotspotId}::uuid AND "design_id" = ${designId}::uuid
        AND "event_id" = ${eventId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const hotspot = await transaction.hotspot.findFirst({
      where: { id: hotspotId, designId, eventId, deletedAt: null }
    });
    if (!hotspot) {
      throw childNotFound('HOTSPOT_NOT_FOUND', 'Hotspot not found.');
    }
    return hotspot;
  }

  private async requireStagedAsset(
    transaction: Prisma.TransactionClient,
    fileAssetId: string,
    clientId: string,
    eventId: string,
    ownerType: FileAssetOwnerType,
    fileType: FileAssetType
  ): Promise<void> {
    const asset = await transaction.fileAsset.findFirst({
      where: {
        id: fileAssetId,
        clientId,
        eventId,
        ownerType,
        fileType,
        ownerId: null,
        status: FileAssetStatus.READY,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!asset) {
      throw new DomainError('FILE_OWNER_MISMATCH', 'File asset does not match this design owner.', HttpStatus.CONFLICT);
    }
  }

  private assertHotspotOwner(
    designType: InvitationDesignType,
    ownerType: HotspotVisualOwnerType,
    pageId: string | undefined
  ): void {
    const valid =
      (designType === InvitationDesignType.FLYER &&
        ownerType === HotspotVisualOwnerType.FLYER &&
        pageId === undefined) ||
      (designType === InvitationDesignType.FLIPBOOK &&
        ownerType === HotspotVisualOwnerType.FLIPBOOK_PAGE &&
        pageId !== undefined);
    if (!valid) {
      throw designConflict('Hotspot visual owner is incompatible with the active design.');
    }
  }

  private async getDesignInTransaction(
    transaction: Prisma.TransactionClient,
    designId: string
  ): Promise<InvitationDesignResponseDto> {
    return toDesignResponse(
      await transaction.invitationDesign.findUniqueOrThrow({
        where: { id: designId },
        include: DESIGN_INCLUDE
      })
    );
  }

  private async recordReadinessChange(
    transaction: Prisma.TransactionClient,
    principal: AuthPrincipal,
    clientId: string,
    eventId: string,
    designId: string,
    before: DesignReadiness,
    after: DesignReadiness,
    operationId?: string
  ): Promise<void> {
    if (before.complete === after.complete && sameStrings(before.blockers, after.blockers)) {
      return;
    }
    if (!after.complete) {
      await transaction.event.updateMany({
        where: { id: eventId, status: EventStatus.READY_TO_ACTIVATE },
        data: { status: EventStatus.CONFIGURED }
      });
    }
    await this.record(
      transaction,
      principal,
      clientId,
      eventId,
      designId,
      'INVITATION_DESIGN_READINESS_CHANGED',
      { ...before },
      { ...after },
      operationId
    );
  }

  private async record(
    transaction: Prisma.TransactionClient,
    principal: AuthPrincipal,
    clientId: string,
    eventId: string,
    resourceId: string,
    action: string,
    beforeData: Record<string, unknown> | undefined,
    afterData: Record<string, unknown> | undefined,
    operationId?: string,
    resourceType = 'INVITATION_DESIGN'
  ): Promise<void> {
    await this.audit.record(
      {
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId,
        eventId,
        resourceType,
        resourceId,
        action,
        ...(beforeData === undefined ? {} : { beforeData }),
        ...(afterData === undefined ? {} : { afterData }),
        ...(operationId === undefined ? {} : { operationId })
      },
      transaction
    );
  }

  private async serializable<T>(work: (transaction: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryableTransactionError(error) && attempt < 19) {
          continue;
        }
        throw mapPersistenceError(error);
      }
    }
    throw designConflict('Invitation design operation could not be serialized.');
  }
}

function toDesignResponse(design: DesignWithChildren): InvitationDesignResponseDto {
  return {
    id: design.id,
    eventId: design.eventId,
    type: design.type,
    flyerInitialAssetId: design.flyerInitialAssetId,
    flyerQrAssetId: design.flyerQrAssetId,
    pages: design.pages.map((page) => ({
      id: page.id,
      eventId: page.eventId,
      fileAssetId: page.fileAssetId,
      position: page.position,
      hotspots: page.hotspots.map(toHotspotResponse),
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString()
    })),
    hotspots: design.hotspots.map(toHotspotResponse),
    createdAt: design.createdAt.toISOString(),
    updatedAt: design.updatedAt.toISOString()
  };
}

function toHotspotResponse(hotspot: HotspotRecord): HotspotResponseDto {
  return {
    id: hotspot.id,
    eventId: hotspot.eventId,
    visualOwnerType: hotspot.visualOwnerType,
    flipbookPageId: hotspot.flipbookPageId,
    action: hotspot.action,
    x: Number(hotspot.x),
    y: Number(hotspot.y),
    width: Number(hotspot.width),
    height: Number(hotspot.height),
    priority: hotspot.priority,
    url: hotspot.url,
    createdAt: hotspot.createdAt.toISOString(),
    updatedAt: hotspot.updatedAt.toISOString()
  };
}

function assertCoordinates(input: { x: number; y: number; width: number; height: number }): void {
  if (
    ![input.x, input.y, input.width, input.height].every(Number.isFinite) ||
    input.x < 0 ||
    input.y < 0 ||
    input.width <= 0 ||
    input.height <= 0 ||
    input.x + input.width > 1 ||
    input.y + input.height > 1
  ) {
    throw new DomainError('HOTSPOT_COORDINATES_INVALID', 'Hotspot coordinates are outside the canvas.');
  }
}

function designSnapshot(design: {
  id: string;
  eventId: string;
  type: InvitationDesignType;
  flyerInitialAssetId: string | null;
  flyerQrAssetId: string | null;
}) {
  return {
    id: design.id,
    eventId: design.eventId,
    type: design.type,
    flyerInitialAssetId: design.flyerInitialAssetId,
    flyerQrAssetId: design.flyerQrAssetId
  };
}

function pageSnapshot(page: {
  id: string;
  eventId: string;
  designId: string;
  fileAssetId: string;
  position: number;
  deletedAt: Date | null;
}) {
  return {
    id: page.id,
    eventId: page.eventId,
    designId: page.designId,
    fileAssetId: page.fileAssetId,
    position: page.position,
    deletedAt: page.deletedAt
  };
}

function hotspotSnapshot(hotspot: {
  id: string;
  eventId: string;
  designId: string;
  visualOwnerType: HotspotVisualOwnerType;
  flipbookPageId: string | null;
  action: HotspotAction;
  x: Prisma.Decimal;
  y: Prisma.Decimal;
  width: Prisma.Decimal;
  height: Prisma.Decimal;
  priority: number;
  url: string | null;
  deletedAt: Date | null;
}) {
  return {
    id: hotspot.id,
    eventId: hotspot.eventId,
    designId: hotspot.designId,
    visualOwnerType: hotspot.visualOwnerType,
    flipbookPageId: hotspot.flipbookPageId,
    action: hotspot.action,
    x: Number(hotspot.x),
    y: Number(hotspot.y),
    width: Number(hotspot.width),
    height: Number(hotspot.height),
    priority: hotspot.priority,
    deletedAt: hotspot.deletedAt
  };
}

function sameStrings(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function designNotFound(): NotFoundException {
  return childNotFound('INVITATION_DESIGN_NOT_FOUND', 'Invitation design not found.');
}

function childNotFound(code: string, message: string): NotFoundException {
  return new NotFoundException({ code, message });
}

function designConflict(message: string): ConflictException {
  return new ConflictException({ code: 'INVITATION_DESIGN_CONFLICT', message });
}

function pageLimitExceeded(): DomainError {
  return new DomainError(
    'FLIPBOOK_PAGE_LIMIT_EXCEEDED',
    'Flipbook supports at most ten active pages.',
    HttpStatus.CONFLICT
  );
}

function externalLinkLimitExceeded(): DomainError {
  return new DomainError(
    'HOTSPOT_EXTERNAL_LINK_LIMIT_EXCEEDED',
    'Invitation design supports at most three external links.',
    HttpStatus.CONFLICT
  );
}

function isRetryableTransactionError(error: unknown): boolean {
  const text = String(error);
  return (
    hasPrismaCode(error, 'P2034') ||
    text.includes('40001') ||
    text.includes('40P01') ||
    text.includes('TransactionWriteConflict')
  );
}

function mapPersistenceError(error: unknown): unknown {
  const text = String(error);
  if (text.includes('flipbook page limit exceeded')) {
    return pageLimitExceeded();
  }
  if (text.includes('external hotspot link limit exceeded')) {
    return externalLinkLimitExceeded();
  }
  if (
    hasPrismaCode(error, 'P2002') ||
    text.includes('invitation_design_one_active_per_event') ||
    text.includes('flipbook_page_active_position_excl')
  ) {
    return designConflict('Concurrent invitation design operation conflicts with current state.');
  }
  return error;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === code;
}
