import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/bootstrap/create-app';
import { AuditService } from '../src/audit/audit.service';
import { PrismaService } from '../src/common/database/prisma.service';
import { FileStorage } from '../src/file-assets/file-storage';
import { FloorplanService } from '../src/floorplan/floorplan.service';
import {
  AssistantResponseStatus,
  ClientStatus,
  ClientType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  FloorplanGeometry,
  FloorplanShapeKind,
  InvitationMode,
  InvitationResponseStatus,
  LedgerMovementType,
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { hashPassword } from '../src/auth/password-hasher';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { PublicRsvpService } from '../src/public-rsvp/public-rsvp.service';
import { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';

const isolatedStorage = vi.hoisted(() => {
  const systemTemp =
    process.env.RUNNER_TEMP ??
    process.env.TMPDIR ??
    process.env.TEMP ??
    process.env.TMP ??
    (process.platform === 'win32' ? 'C:\\Windows\\Temp' : '/tmp');
  const separator = /[\\/]$/u.test(systemTemp) ? '' : process.platform === 'win32' ? '\\' : '/';
  const root = `${systemTemp}${separator}floorplan-vitest-${process.pid}-${Math.random().toString(16).slice(2)}`;
  process.env.FILE_STORAGE_LOCAL_ROOT = root;
  return { root, systemTemp };
});

describe('Floorplan and seating', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let floorplan: FloorplanService;
  let storage: FileStorage;
  let staffTokens: StaffTokenTechnicalService;
  let invitationTokens: InvitationTokenService;
  let rsvp: PublicRsvpService;
  let realtime: RealtimePublisherService;
  let audit: AuditService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = 'http://localhost:5173';
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'floorplan-integration-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    await rm(isolatedStorage.root, { recursive: true, force: true });
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    floorplan = app.get(FloorplanService);
    storage = app.get(FileStorage);
    staffTokens = app.get(StaffTokenTechnicalService);
    invitationTokens = app.get(InvitationTokenService);
    rsvp = app.get(PublicRsvpService);
    realtime = app.get(RealtimePublisherService);
    audit = app.get(AuditService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
    const resolved = path.resolve(isolatedStorage.root);
    const resolvedTemp = path.resolve(isolatedStorage.systemTemp);
    const relative = path.relative(resolvedTemp, resolved);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Refusing to remove a non-temporary Floorplan test directory.');
    }
    await rm(resolved, { recursive: true, force: true });
  }, 60_000);

  it('creates one active Floorplan, atomically replaces its image, and enforces layout lock', async () => {
    const fixture = await createFixture();
    const firstAsset = await createAsset(fixture, 'first');
    const secondAsset = await createAsset(fixture, 'second');
    const created = await floorplan.create(
      fixture.event.id,
      { imageAssetId: firstAsset.id },
      fixture.principal,
      randomUUID()
    );
    expect(created.image.fileAssetId).toBe(firstAsset.id);
    await expect(
      floorplan.create(fixture.event.id, { imageAssetId: secondAsset.id }, fixture.principal)
    ).rejects.toMatchObject({ response: { code: 'FLOORPLAN_ALREADY_EXISTS' } });

    const table = await createTable(fixture);
    expect(table).toMatchObject({ kind: FloorplanShapeKind.TABLE, capacity: 2, occupancy: 0 });
    const locked = await floorplan.lock(fixture.event.id, fixture.principal, randomUUID());
    expect(locked.locked).toBe(true);
    await expect(
      floorplan.updateShape(fixture.event.id, table.id, { capacity: 3 }, fixture.principal)
    ).rejects.toMatchObject({ response: { code: 'FLOORPLAN_LAYOUT_LOCKED' } });
    expect((await floorplan.lock(fixture.event.id, fixture.principal)).locked).toBe(true);
    await floorplan.unlock(fixture.event.id, fixture.principal, randomUUID());
    const replaced = await floorplan.replaceImage(
      fixture.event.id,
      { imageAssetId: secondAsset.id },
      fixture.principal,
      randomUUID()
    );
    expect(replaced.image.fileAssetId).toBe(secondAsset.id);
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: firstAsset.id } })).toMatchObject({
      status: FileAssetStatus.HIDDEN
    });
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: secondAsset.id } })).toMatchObject({
      status: FileAssetStatus.READY,
      ownerId: created.id
    });

    await expect(
      prisma.fileAsset.create({
        data: {
          clientId: fixture.client.id,
          eventId: fixture.event.id,
          ownerType: FileAssetOwnerType.FLOORPLAN,
          fileType: FileAssetType.GENERATED_REPORT_PDF,
          storageProvider: StorageProvider.LOCAL,
          storageKey: createHash('sha256').update(randomUUID()).digest('hex'),
          mimeType: 'application/pdf',
          originalName: 'croquis.pdf',
          sizeBytes: 4,
          status: FileAssetStatus.READY,
          checksumSha256: createHash('sha256').update('pdf').digest('hex'),
          createdByUserId: fixture.user.id
        }
      })
    ).rejects.toThrow(/file_asset_owner_file_type_check/u);
    expect((await floorplan.get(fixture.event.id, fixture.principal)).image.fileAssetId).toBe(secondAsset.id);
  });

  it('validates geometry and PostgreSQL rejects decorative/cross-event/capacity violations', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture);
    const zone = await floorplan.createShape(
      fixture.event.id,
      {
        kind: FloorplanShapeKind.DECORATIVE_ZONE,
        geometry: FloorplanGeometry.POLYGON,
        name: 'Pista',
        capacity: 0,
        x: 0.5,
        y: 0.1,
        width: 0.4,
        height: 0.4,
        rotation: 0,
        polygonPoints: [
          { x: 0.5, y: 0.1 },
          { x: 0.9, y: 0.1 },
          { x: 0.7, y: 0.5 }
        ]
      },
      fixture.principal
    );
    await expect(
      floorplan.assign(
        fixture.event.id,
        randomUUID(),
        { assistantIds: [fixture.assistants[0]!.id], tableShapeId: zone.id },
        fixture.principal
      )
    ).rejects.toMatchObject({ response: { code: 'SEATING_TABLE_INVALID' } });
    await floorplan.assign(
      fixture.event.id,
      randomUUID(),
      { assistantIds: fixture.assistants.map(({ id }) => id), tableShapeId: table.id },
      fixture.principal
    );
    await expect(
      floorplan.updateShape(fixture.event.id, table.id, { capacity: 1 }, fixture.principal)
    ).rejects.toBeTruthy();
    await expect(floorplan.deleteShape(fixture.event.id, table.id, fixture.principal)).rejects.toBeTruthy();
    const foreign = await createFixture();
    await floorplan.create(
      foreign.event.id,
      { imageAssetId: (await createAsset(foreign, 'foreign')).id },
      foreign.principal
    );
    const foreignTable = await createTable(foreign);
    await expect(
      floorplan.assign(
        fixture.event.id,
        randomUUID(),
        { assistantIds: [fixture.assistants[0]!.id], tableShapeId: foreignTable.id },
        fixture.principal
      )
    ).rejects.toMatchObject({ response: { code: 'FLOORPLAN_SHAPE_NOT_FOUND' } });
    await expect(
      floorplan.assign(
        fixture.event.id,
        randomUUID(),
        { assistantIds: [foreign.assistants[0]!.id], tableShapeId: table.id },
        fixture.principal
      )
    ).rejects.toMatchObject({ response: { code: 'SEATING_SELECTION_NOT_FOUND' } });
  });

  it('assigns individual/family/group all-or-none and replays the exact persisted snapshot', async () => {
    const fixture = await createFixture({ secondFamily: true });
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 4);
    const key = randomUUID();
    const publish = vi.spyOn(realtime, 'publishSeatingUpdated');
    const first = await floorplan.assignFamily(
      fixture.event.id,
      key,
      { invitationId: fixture.invitation.id, tableShapeId: table.id },
      fixture.principal,
      randomUUID()
    );
    const audits = await prisma.auditLog.count({
      where: { eventId: fixture.event.id, action: 'SEATING_ASSIGN_FAMILY' }
    });
    const replay = await floorplan.assignFamily(
      fixture.event.id,
      key,
      { invitationId: fixture.invitation.id, tableShapeId: table.id },
      fixture.principal,
      randomUUID()
    );
    expect(replay).toEqual(first);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.event.id, action: 'SEATING_ASSIGN_FAMILY' } })).toBe(
      audits
    );
    expect(await prisma.seatingOperation.count({ where: { idempotencyKey: key } })).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
    await expect(
      floorplan.assign(
        fixture.event.id,
        key,
        { assistantIds: [fixture.assistants[0]!.id], tableShapeId: table.id },
        fixture.principal
      )
    ).rejects.toMatchObject({ response: { code: 'SEATING_IDEMPOTENCY_CONFLICT' } });

    const groupResult = await floorplan.assignGroup(
      fixture.event.id,
      randomUUID(),
      { groupId: fixture.group.id, tableShapeId: table.id },
      fixture.principal
    );
    expect(groupResult.changes.length).toBeGreaterThan(0);
    expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id } })).toBe(4);
    const unassigned = await floorplan.updateSeating(
      fixture.event.id,
      fixture.assistants[0]!.id,
      randomUUID(),
      { tableShapeId: null },
      fixture.principal
    );
    expect(unassigned.changes).toEqual([
      { assistantId: fixture.assistants[0]!.id, fromTableId: table.id, toTableId: null }
    ]);
    publish.mockRestore();
  });

  it('serializes competing assignments to the final seat without partial writes', async () => {
    const fixture = await createFixture({ secondFamily: true });
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 1);
    const outcomes = await Promise.allSettled(
      fixture.assistants
        .slice(0, 2)
        .map(({ id }) =>
          floorplan.assign(
            fixture.event.id,
            randomUUID(),
            { assistantIds: [id], tableShapeId: table.id },
            fixture.principal,
            randomUUID()
          )
        )
    );
    expect(outcomes.map(({ status }) => status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } })).toBe(1);
    expect(await prisma.seatingOperation.count({ where: { eventId: fixture.event.id } })).toBe(1);
  });

  it('rolls back seating, audit, idempotency and realtime as one unit', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    const publish = vi.spyOn(realtime, 'publishSeatingUpdated');
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('forced audit rollback'));
    await expect(
      floorplan.assign(
        fixture.event.id,
        randomUUID(),
        { assistantIds: [fixture.assistants[0]!.id], tableShapeId: table.id },
        fixture.principal,
        randomUUID()
      )
    ).rejects.toThrow('forced audit rollback');
    expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id } })).toBe(0);
    expect(await prisma.seatingOperation.count({ where: { eventId: fixture.event.id } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
    publish.mockRestore();
  });

  it('blocks confirmation close while seats are pending and rejection releases assignments', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    await expect(rsvp.closeConfirmation(fixture.event.id, fixture.principal)).rejects.toMatchObject({
      response: {
        code: 'EVENT_FLOORPLAN_PENDING_SEATING',
        details: { pendingCount: 2 }
      }
    });
    await floorplan.assignFamily(
      fixture.event.id,
      randomUUID(),
      { invitationId: fixture.invitation.id, tableShapeId: table.id },
      fixture.principal
    );
    await expect(rsvp.closeConfirmation(fixture.event.id, fixture.principal)).resolves.toMatchObject({
      open: false
    });
    await rsvp.reopenConfirmation(fixture.event.id, fixture.principal);
    const invitationToken = invitationTokens.issue(
      'INVITATION',
      fixture.invitation.id,
      fixture.invitation.invitationTokenNonce
    );
    await rsvp.reject(invitationToken, randomUUID());
    expect(
      await prisma.assistant.count({
        where: { invitationId: fixture.invitation.id, floorplanShapeId: { not: null } }
      })
    ).toBe(0);
  });

  it('audits post-check-in changes and exposes only minimal Staff Floorplan/table data', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    const raw = staffTokens.generate();
    await prisma.staffToken.create({
      data: {
        eventId: fixture.event.id,
        alias: 'Puerta',
        tokenDigestSha256: raw.digestSha256,
        tokenVersion: raw.version,
        createdByUserId: fixture.user.id
      }
    });
    const checkedInAt = new Date();
    await prisma.checkIn.create({
      data: {
        eventId: fixture.event.id,
        invitationId: fixture.invitation.id,
        assistantId: fixture.assistants[0]!.id,
        staffTokenId: (await prisma.staffToken.findUniqueOrThrow({ where: { tokenDigestSha256: raw.digestSha256 } }))
          .id,
        checkedInAt,
        createdAt: checkedInAt,
        idempotencyKey: randomUUID(),
        requestSignature: createHash('sha256').update('check-in').digest('hex'),
        resultSnapshot: {}
      }
    });
    await floorplan.updateSeating(
      fixture.event.id,
      fixture.assistants[0]!.id,
      randomUUID(),
      { tableShapeId: table.id },
      fixture.principal,
      randomUUID()
    );
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: fixture.event.id, action: 'SEATING_UPDATE' },
      orderBy: { occurredAt: 'desc' }
    });
    expect(audit.afterData).toMatchObject({ postCheckIn: true });
    const response = await request(app.getHttpServer())
      .get(`/api/v1/scanner/${encodeURIComponent(raw.rawToken)}/floorplan`)
      .expect(200);
    expect(response.body).toMatchObject({
      floorplanId: expect.any(String),
      shapes: [expect.objectContaining({ id: table.id, occupancy: 1 })]
    });
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|checksum|phone|clientId|tokenDigest/iu);
    const content = await request(app.getHttpServer())
      .get(`/api/v1/scanner/${encodeURIComponent(raw.rawToken)}/floorplan/content`)
      .buffer(true)
      .expect(200);
    expect(content.headers['cache-control']).toBe('private, no-store');
    expect(content.headers['x-content-type-options']).toBe('nosniff');
  });

  it('enforces ownership and terminal-state read-only behavior', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const foreign = await createFixture();
    await expect(floorplan.get(fixture.event.id, foreign.principal)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_FOUND' }
    });
    const platform: AuthPrincipal = {
      ...fixture.principal,
      role: UserRole.PLATFORM_ADMIN,
      clientId: null,
      clientType: null,
      clientStatus: null
    };
    await expect(floorplan.get(fixture.event.id, platform)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_FOUND' }
    });
    await prisma.event.update({ where: { id: fixture.event.id }, data: { status: EventStatus.CLOSED } });
    await expect(createTable(fixture)).rejects.toMatchObject({
      response: { code: 'FLOORPLAN_EVENT_STATE_LOCKED' }
    });
    await expect(floorplan.get(fixture.event.id, fixture.principal)).resolves.toMatchObject({
      eventId: fixture.event.id
    });

    const organization = await createFixture({
      clientType: ClientType.ORGANIZATION,
      role: UserRole.ORGANIZATION_ADMIN
    });
    await floorplan.create(
      organization.event.id,
      { imageAssetId: (await createAsset(organization, 'organization')).id },
      organization.principal
    );
    await expect(floorplan.get(organization.event.id, organization.principal)).resolves.toMatchObject({
      eventId: organization.event.id
    });
    const planner = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: await hashPassword('correct horse battery staple'),
        role: UserRole.ORGANIZATION_PLANNER,
        clientId: organization.client.id
      }
    });
    const plannerPrincipal = principalFor(planner, organization.client);
    await expect(floorplan.get(organization.event.id, plannerPrincipal)).rejects.toMatchObject({
      response: { code: 'EVENT_NOT_FOUND' }
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({
        where: { id: organization.event.id },
        data: { createdByUserId: planner.id }
      });
    });
    await expect(floorplan.get(organization.event.id, plannerPrincipal)).resolves.toMatchObject({
      eventId: organization.event.id
    });
  });

  async function createFixture(
    options: {
      secondFamily?: boolean;
      clientType?: ClientType;
      role?: UserRole;
    } = {}
  ) {
    const clientType = options.clientType ?? ClientType.PLANNER;
    const role = options.role ?? UserRole.INDEPENDENT_PLANNER;
    const client = await prisma.client.create({
      data: { type: clientType, name: `Client ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const user = await prisma.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        passwordHash: await hashPassword('correct horse battery staple'),
        role,
        clientId: client.id
      }
    });
    const event = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const service = await tx.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { code: ServiceCode.FLYER },
        update: {}
      });
      const price =
        (await tx.servicePrice.findFirst({
          where: { serviceId: service.id, clientType: ClientType.PLANNER }
        })) ??
        (await tx.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activationKey = `floorplan-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 9_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId: client.id,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      return tx.event.create({
        data: {
          clientId: client.id,
          createdByUserId: user.id,
          serviceId: service.id,
          name: 'Evento',
          status: EventStatus.ACTIVE,
          floorplanEnabled: true,
          confirmationEnabled: true,
          capacity: 100,
          activatedAt: new Date(),
          activatedByUserId: user.id,
          activatedServiceId: service.id,
          activatedServicePriceId: price.id,
          baseCostCredits: 0,
          promotionDiscountCredits: 0,
          finalCostCredits: 0,
          purchasedCreditsUsed: 0,
          creditLineCreditsUsed: 0,
          activationReceiptId: receipt.id,
          activationIdempotencyKey: activationKey
        }
      });
    });
    const group = await prisma.group.create({
      data: { eventId: event.id, name: 'Familias', normalizedName: 'familias' }
    });
    const first = await createFamily(event.id, group.id, 2);
    const second = options.secondFamily ? await createFamily(event.id, group.id, 2) : null;
    const assistants = [...first.assistants, ...(second?.assistants ?? [])];
    const principal = principalFor(user, client);
    return { client, user, event, group, invitation: first.invitation, assistants, principal };
  }

  async function createFamily(eventId: string, groupId: string, size: number) {
    return prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          eventId,
          groupId,
          name: 'Contacto',
          whatsappPhoneNormalized: `+5255${Math.floor(Math.random() * 100_000_000)
            .toString()
            .padStart(8, '0')}`
        }
      });
      const invitation = await tx.invitation.create({
        data: {
          eventId,
          contactId: contact.id,
          mode: InvitationMode.FAMILY_NOMINAL,
          additionalAssistantLimit: size - 1,
          responseStatus: InvitationResponseStatus.CONFIRMED,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      const assistants = [];
      for (let index = 0; index < size; index += 1) {
        assistants.push(
          await tx.assistant.create({
            data: {
              eventId,
              invitationId: invitation.id,
              name: `Asistente ${index + 1}`,
              isPrimary: index === 0,
              responseStatus: AssistantResponseStatus.CONFIRMED
            }
          })
        );
      }
      return { invitation, assistants };
    });
  }

  function principalFor(
    user: { id: string; email: string; role: UserRole },
    client: { id: string; type: ClientType; status: ClientStatus }
  ): AuthPrincipal {
    return {
      userId: user.id,
      sessionId: randomUUID(),
      email: user.email,
      role: user.role,
      clientId: client.id,
      clientType: client.type,
      clientStatus: client.status
    };
  }

  async function createAsset(fixture: Awaited<ReturnType<typeof createFixture>>, label: string) {
    const bytes = Buffer.from(`floorplan-${label}`);
    const storageKey = createHash('sha256').update(`${label}-${randomUUID()}`).digest('hex');
    await storage.write({ storageKey, bytes });
    return prisma.fileAsset.create({
      data: {
        clientId: fixture.client.id,
        eventId: fixture.event.id,
        ownerType: FileAssetOwnerType.FLOORPLAN,
        fileType: FileAssetType.FLOORPLAN_IMAGE,
        storageProvider: StorageProvider.LOCAL,
        storageKey,
        originalName: `${label}.png`,
        mimeType: 'image/png',
        sizeBytes: bytes.length,
        checksumSha256: createHash('sha256').update(bytes).digest('hex'),
        width: 100,
        height: 100,
        createdByUserId: fixture.user.id,
        status: FileAssetStatus.READY
      }
    });
  }

  async function createTable(fixture: Awaited<ReturnType<typeof createFixture>>, capacity = 2) {
    return floorplan.createShape(
      fixture.event.id,
      {
        kind: FloorplanShapeKind.TABLE,
        geometry: FloorplanGeometry.CIRCLE,
        name: `Mesa ${randomUUID().slice(0, 8)}`,
        capacity,
        x: 0.1,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        rotation: 0,
        polygonPoints: null
      },
      fixture.principal,
      randomUUID()
    );
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "seating_operation", "floorplan_shape", "floorplan", "check_in", "staff_token",
        "hotspot", "flipbook_page", "invitation_design", "file_asset", "assistant", "invitation",
        "contact_import_preview", "contact", "contact_group", "event_state_operation", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
