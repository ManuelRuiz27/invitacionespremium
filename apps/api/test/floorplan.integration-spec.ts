import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
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
import { InvitationsService } from '../src/invitations/invitations.service';
import { PublicRsvpService } from '../src/public-rsvp/public-rsvp.service';
import { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';
import { RealtimeServerService } from '../src/realtime/realtime-server.service';
import { ScannerService } from '../src/scanner/scanner.service';

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
  let invitations: InvitationsService;
  let rsvp: PublicRsvpService;
  let realtime: RealtimePublisherService;
  let realtimeServer: RealtimeServerService;
  let scanner: ScannerService;
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
    invitations = app.get(InvitationsService);
    rsvp = app.get(PublicRsvpService);
    realtime = app.get(RealtimePublisherService);
    realtimeServer = app.get(RealtimeServerService);
    scanner = app.get(ScannerService);
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

  it('serializes individual/family/group assignment races without overcapacity or partial writes', async () => {
    for (const winnerIndex of [0, 1]) {
      const fixture = await createFixture({ secondFamily: true });
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `individual-${winnerIndex}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 1);
      const selected = [fixture.assistants[0]!, fixture.assistants[2]!];
      const first = selected[winnerIndex]!;
      const second = selected[1 - winnerIndex]!;
      const outcomes = await runWithAuditBarrier(
        'SEATING_ASSIGN',
        () =>
          floorplan.assign(
            fixture.event.id,
            randomUUID(),
            { assistantIds: [first.id], tableShapeId: table.id },
            fixture.principal,
            randomUUID()
          ),
        () =>
          floorplan.assign(
            fixture.event.id,
            randomUUID(),
            { assistantIds: [second.id], tableShapeId: table.id },
            fixture.principal,
            randomUUID()
          )
      );
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
      expect(await prisma.assistant.findUniqueOrThrow({ where: { id: first.id } })).toMatchObject({
        floorplanShapeId: table.id
      });
      expect(await prisma.assistant.findUniqueOrThrow({ where: { id: second.id } })).toMatchObject({
        floorplanShapeId: null
      });
    }

    for (const familyWins of [true, false]) {
      const fixture = await createFixture({ secondFamily: true });
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `family-${familyWins}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      const family = () =>
        floorplan.assignFamily(
          fixture.event.id,
          randomUUID(),
          { invitationId: fixture.invitation.id, tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const individual = () =>
        floorplan.assign(
          fixture.event.id,
          randomUUID(),
          { assistantIds: [fixture.assistants[2]!.id], tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const outcomes = await runWithAuditBarrier(
        familyWins ? 'SEATING_ASSIGN_FAMILY' : 'SEATING_ASSIGN',
        familyWins ? family : individual,
        familyWins ? individual : family
      );
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
      expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } })).toBe(
        familyWins ? 2 : 1
      );
    }

    for (const groupWinsFirst of [true, false]) {
      const fixture = await createFixture({ secondFamily: true });
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `group-${groupWinsFirst}`)).id },
        fixture.principal
      );
      const groupTable = await createTable(fixture, 4);
      const familyTable = await createTable(fixture, 2);
      const group = () =>
        floorplan.assignGroup(
          fixture.event.id,
          randomUUID(),
          { groupId: fixture.group.id, tableShapeId: groupTable.id },
          fixture.principal,
          randomUUID()
        );
      const family = () =>
        floorplan.assignFamily(
          fixture.event.id,
          randomUUID(),
          { invitationId: fixture.invitation.id, tableShapeId: familyTable.id },
          fixture.principal,
          randomUUID()
        );
      const outcomes = await runWithAuditBarrier(
        groupWinsFirst ? 'SEATING_ASSIGN_GROUP' : 'SEATING_ASSIGN_FAMILY',
        groupWinsFirst ? group : family,
        groupWinsFirst ? family : group
      );
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      const firstFamilyAssignments = await prisma.assistant.findMany({
        where: { id: { in: fixture.assistants.slice(0, 2).map(({ id }) => id) } },
        select: { floorplanShapeId: true }
      });
      expect(new Set(firstFamilyAssignments.map(({ floorplanShapeId }) => floorplanShapeId)).size).toBe(1);
      expect(await prisma.assistant.count({ where: { floorplanShapeId: groupTable.id } })).toBe(groupWinsFirst ? 2 : 4);
    }
  });

  it('serializes capacity reduction and table deletion against assignment in both orders', async () => {
    for (const assignmentWins of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `capacity-${assignmentWins}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      const assignFamily = () =>
        floorplan.assignFamily(
          fixture.event.id,
          randomUUID(),
          { invitationId: fixture.invitation.id, tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const reduce = () =>
        floorplan.updateShape(fixture.event.id, table.id, { capacity: 1 }, fixture.principal, randomUUID());
      const outcomes = await runWithAuditBarrier(
        assignmentWins ? 'SEATING_ASSIGN_FAMILY' : 'FLOORPLAN_SHAPE_UPDATE',
        assignmentWins ? assignFamily : reduce,
        assignmentWins ? reduce : assignFamily
      );
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
      const state = (await floorplan.get(fixture.event.id, fixture.principal)).shapes[0]!;
      expect(state.occupancy).toBe(assignmentWins ? 2 : 0);
      expect(state.capacity).toBe(assignmentWins ? 2 : 1);
      expect(state.occupancy).toBeLessThanOrEqual(state.capacity);
    }

    for (const assignmentWins of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `delete-${assignmentWins}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      const assignFamily = () =>
        floorplan.assignFamily(
          fixture.event.id,
          randomUUID(),
          { invitationId: fixture.invitation.id, tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const remove = () => floorplan.deleteShape(fixture.event.id, table.id, fixture.principal, randomUUID());
      const outcomes = await runWithAuditBarrier(
        assignmentWins ? 'SEATING_ASSIGN_FAMILY' : 'FLOORPLAN_SHAPE_DELETE',
        assignmentWins ? assignFamily : remove,
        assignmentWins ? remove : assignFamily
      );
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
      const stored = await prisma.floorplanShape.findUniqueOrThrow({ where: { id: table.id } });
      expect(stored.deletedAt === null).toBe(assignmentWins);
      expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } })).toBe(
        assignmentWins ? 2 : 0
      );
    }
  });

  it('serializes RSVP rejection, nominal omission, and cancellation against assignment in both orders', async () => {
    for (const source of ['reject', 'omit', 'cancel'] as const) {
      for (const mutationWinsFirst of [true, false]) {
        const fixture = await createFixture();
        await floorplan.create(
          fixture.event.id,
          { imageAssetId: (await createAsset(fixture, `${source}-${mutationWinsFirst}`)).id },
          fixture.principal
        );
        const table = await createTable(fixture, 2);
        const invitationToken = invitationTokens.issue(
          'INVITATION',
          fixture.invitation.id,
          fixture.invitation.invitationTokenNonce
        );
        const assign = () =>
          floorplan.assignFamily(
            fixture.event.id,
            randomUUID(),
            { invitationId: fixture.invitation.id, tableShapeId: table.id },
            fixture.principal,
            randomUUID()
          );
        const mutate = () => {
          if (source === 'reject') return rsvp.reject(invitationToken, randomUUID());
          if (source === 'omit') {
            return rsvp.modifyAssistants(invitationToken, { additionalAssistants: [] }, randomUUID());
          }
          return invitations.cancel(
            fixture.event.id,
            fixture.invitation.id,
            randomUUID(),
            fixture.principal,
            randomUUID()
          );
        };
        const action = source === 'reject' ? 'RSVP_REJECT' : source === 'omit' ? 'RSVP_CONFIRM' : 'INVITATION_CANCEL';
        const outcomes = await runWithAuditBarrier(
          mutationWinsFirst ? action : 'SEATING_ASSIGN_FAMILY',
          mutationWinsFirst ? mutate : assign,
          mutationWinsFirst ? assign : mutate
        );
        expect(outcomes[0].status).toBe('fulfilled');
        expect(outcomes[1].status).toBe(source === 'omit' || !mutationWinsFirst ? 'fulfilled' : 'rejected');
        const stored = await prisma.assistant.findMany({
          where: { invitationId: fixture.invitation.id },
          select: { isPrimary: true, deletedAt: true, floorplanShapeId: true },
          orderBy: { isPrimary: 'desc' }
        });
        if (source === 'omit') {
          expect(stored[0]).toMatchObject({ isPrimary: true, deletedAt: null, floorplanShapeId: table.id });
          expect(stored[1]).toMatchObject({
            isPrimary: false,
            deletedAt: expect.any(Date),
            floorplanShapeId: null
          });
        } else {
          expect(stored.every(({ floorplanShapeId }) => floorplanShapeId === null)).toBe(true);
        }
        const occupancy = await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } });
        expect(occupancy).toBe(source === 'omit' ? 1 : 0);
      }
    }
  });

  it('serializes confirmation close and Floorplan lock against their competing mutations in both orders', async () => {
    for (const closeWinsLock of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `confirmation-${closeWinsLock}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      const close = () => rsvp.closeConfirmation(fixture.event.id, fixture.principal, randomUUID());
      const assign = () =>
        floorplan.assignFamily(
          fixture.event.id,
          randomUUID(),
          { invitationId: fixture.invitation.id, tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const outcomes = closeWinsLock
        ? await runQueuedBehindEventLock(fixture.event.id, close, assign)
        : await runWithAuditBarrier('SEATING_ASSIGN_FAMILY', assign, close);
      expect(outcomes.map(({ status }) => status)).toEqual(
        closeWinsLock ? ['rejected', 'fulfilled'] : ['fulfilled', 'rejected']
      );
      expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } })).toBe(2);
      expect(await rsvp.confirmation(fixture.event.id, fixture.principal)).toMatchObject({ open: true });
      if (!closeWinsLock) {
        await expect(rsvp.closeConfirmation(fixture.event.id, fixture.principal, randomUUID())).resolves.toMatchObject({
          open: false
        });
      }
    }

    for (const lockWins of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `layout-lock-${lockWins}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      const lock = () => floorplan.lock(fixture.event.id, fixture.principal, randomUUID());
      const edit = () =>
        floorplan.updateShape(fixture.event.id, table.id, { capacity: 3 }, fixture.principal, randomUUID());
      const outcomes = lockWins
        ? await runWithAuditBarrier('FLOORPLAN_LOCK', lock, edit)
        : await runWithAuditBarrier('FLOORPLAN_SHAPE_UPDATE', edit, lock);
      expect(outcomes.map(({ status }) => status)).toEqual(
        lockWins ? ['fulfilled', 'rejected'] : ['fulfilled', 'fulfilled']
      );
      const stored = await prisma.floorplan.findFirstOrThrow({ where: { eventId: fixture.event.id } });
      const shape = await prisma.floorplanShape.findUniqueOrThrow({ where: { id: table.id } });
      expect(stored.lockedAt).toEqual(expect.any(Date));
      expect(shape.capacity).toBe(lockWins ? 2 : 3);
    }
  });

  it('serializes table assignment against check-in and post-check-in movement against reversal in both orders', async () => {
    for (const checkInWinsLock of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `check-in-race-${checkInWinsLock}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 1);
      const staff = await createStaffToken(fixture);
      const checkIn = () =>
        scanner.checkIn(
          staff.rawToken,
          randomUUID(),
          { invitationId: fixture.invitation.id, assistantIds: [fixture.assistants[0]!.id] },
          randomUUID()
        );
      const assign = () =>
        floorplan.assign(
          fixture.event.id,
          randomUUID(),
          { assistantIds: [fixture.assistants[0]!.id], tableShapeId: table.id },
          fixture.principal,
          randomUUID()
        );
      const outcomes = checkInWinsLock
        ? await runQueuedBehindEventLock(fixture.event.id, checkIn, assign)
        : await runQueuedBehindEventLock(fixture.event.id, assign, checkIn);
      expect(outcomes.map(({ status }) => status)).toEqual(
        checkInWinsLock ? ['rejected', 'fulfilled'] : ['fulfilled', 'fulfilled']
      );
      expect(await prisma.assistant.findUniqueOrThrow({ where: { id: fixture.assistants[0]!.id } })).toMatchObject({
        floorplanShapeId: table.id
      });
      const storedCheckIns = await prisma.checkIn.findMany({ where: { eventId: fixture.event.id } });
      expect(storedCheckIns).toHaveLength(checkInWinsLock ? 0 : 1);
      if (storedCheckIns[0]) expect(storedCheckIns[0].revertedAt).toBeNull();
    }

    for (const movementWinsLock of [true, false]) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `revert-race-${movementWinsLock}`)).id },
        fixture.principal
      );
      const originalTable = await createTable(fixture, 1);
      const destinationTable = await createTable(fixture, 1);
      await floorplan.assign(
        fixture.event.id,
        randomUUID(),
        { assistantIds: [fixture.assistants[0]!.id], tableShapeId: originalTable.id },
        fixture.principal,
        randomUUID()
      );
      const staff = await createStaffToken(fixture);
      const checkIn = await scanner.checkIn(
        staff.rawToken,
        randomUUID(),
        { invitationId: fixture.invitation.id, assistantIds: [fixture.assistants[0]!.id] },
        randomUUID()
      );
      const checkInId = checkIn.checkedIn[0]!.checkInId;
      const move = () =>
        floorplan.updateSeating(
          fixture.event.id,
          fixture.assistants[0]!.id,
          randomUUID(),
          { tableShapeId: destinationTable.id },
          fixture.principal,
          randomUUID()
        );
      const revert = () => scanner.revert(fixture.event.id, checkInId, randomUUID(), fixture.principal, randomUUID());
      const outcomes = movementWinsLock
        ? await runQueuedBehindEventLock(fixture.event.id, move, revert)
        : await runQueuedBehindEventLock(fixture.event.id, revert, move);
      expect(outcomes.map(({ status }) => status)).toEqual(['fulfilled', 'fulfilled']);
      expect(await prisma.assistant.findUniqueOrThrow({ where: { id: fixture.assistants[0]!.id } })).toMatchObject({
        floorplanShapeId: destinationTable.id
      });
      expect(await prisma.checkIn.findUniqueOrThrow({ where: { id: checkInId } })).toMatchObject({
        revertedAt: expect.any(Date)
      });
    }
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

  it('rolls back cancellation and RSVP releases when their seating audit fails', async () => {
    for (const source of ['cancel', 'rsvp'] as const) {
      const fixture = await createFixture();
      await floorplan.create(
        fixture.event.id,
        { imageAssetId: (await createAsset(fixture, `audit-${source}`)).id },
        fixture.principal
      );
      const table = await createTable(fixture, 2);
      await floorplan.assignFamily(
        fixture.event.id,
        randomUUID(),
        { invitationId: fixture.invitation.id, tableShapeId: table.id },
        fixture.principal
      );
      const auditCount = await prisma.auditLog.count({ where: { eventId: fixture.event.id } });
      const rsvpPublish = vi.spyOn(realtime, 'publishRsvpUpdated');
      const seatingPublish = vi.spyOn(realtime, 'publishSeatingUpdated');
      const originalRecord = audit.record.bind(audit);
      const auditSpy = vi.spyOn(audit, 'record').mockImplementation((input, tx) => {
        if (input.action === 'SEATING_IMPLICIT_RELEASE') {
          return Promise.reject(new Error('forced implicit seating audit rollback'));
        }
        return originalRecord(input, tx);
      });
      try {
        if (source === 'cancel') {
          await expect(
            invitations.cancel(fixture.event.id, fixture.invitation.id, randomUUID(), fixture.principal, randomUUID())
          ).rejects.toThrow('forced implicit seating audit rollback');
        } else {
          const invitationToken = invitationTokens.issue(
            'INVITATION',
            fixture.invitation.id,
            fixture.invitation.invitationTokenNonce
          );
          await expect(rsvp.reject(invitationToken, randomUUID())).rejects.toThrow(
            'forced implicit seating audit rollback'
          );
        }
        expect(await prisma.assistant.count({ where: { floorplanShapeId: table.id, deletedAt: null } })).toBe(2);
        expect(await prisma.invitation.findUniqueOrThrow({ where: { id: fixture.invitation.id } })).toMatchObject({
          cancelledAt: null,
          responseStatus: InvitationResponseStatus.CONFIRMED
        });
        expect(await prisma.auditLog.count({ where: { eventId: fixture.event.id } })).toBe(auditCount);
        expect(rsvpPublish).not.toHaveBeenCalled();
        expect(seatingPublish).not.toHaveBeenCalled();
      } finally {
        auditSpy.mockRestore();
        rsvpPublish.mockRestore();
        seatingPublish.mockRestore();
      }
    }
  });

  it('blocks confirmation close and publishes audited seating release after RSVP rejection', async () => {
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
    const operationId = randomUUID();
    const rsvpPublish = vi.spyOn(realtime, 'publishRsvpUpdated');
    const seatingPublish = vi.spyOn(realtime, 'publishSeatingUpdated');
    const emit = vi.spyOn(realtimeServer, 'emit');
    await rsvp.reject(invitationToken, operationId);
    expect(
      await prisma.assistant.count({
        where: { invitationId: fixture.invitation.id, floorplanShapeId: { not: null } }
      })
    ).toBe(0);
    expect((await floorplan.get(fixture.event.id, fixture.principal)).shapes[0]).toMatchObject({ occupancy: 0 });
    expect(rsvpPublish).toHaveBeenCalledOnce();
    expect(seatingPublish).toHaveBeenCalledOnce();
    expect(seatingPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        actorType: 'PUBLIC_TOKEN',
        data: {
          changes: fixture.assistants
            .map(({ id }) => ({
              assistantId: id,
              fromTableId: table.id,
              toTableId: null
            }))
            .sort((left, right) => left.assistantId.localeCompare(right.assistantId)),
          affectedTables: [{ tableId: table.id, occupancy: 0, capacity: 2 }]
        }
      })
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ eventName: 'seating.updated', actorType: 'PUBLIC_TOKEN' }),
      ['dashboard', 'scanner', 'floorplan']
    );
    const seatingAudit = await prisma.auditLog.findFirstOrThrow({
      where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
    });
    expect(seatingAudit.afterData).toMatchObject({
      source: 'RSVP_REJECT',
      assistantIds: fixture.assistants.map(({ id }) => id).sort()
    });
    rsvpPublish.mockRestore();
    seatingPublish.mockRestore();
    emit.mockRestore();
  });

  it('cancellation releases all seats once, audits them, and makes capacity reusable', async () => {
    const fixture = await createFixture({ secondFamily: true });
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'cancel')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    await floorplan.assignFamily(
      fixture.event.id,
      randomUUID(),
      { invitationId: fixture.invitation.id, tableShapeId: table.id },
      fixture.principal
    );
    const publish = vi.spyOn(realtime, 'publishSeatingUpdated');
    const key = randomUUID();
    const operationId = randomUUID();
    const first = await invitations.cancel(
      fixture.event.id,
      fixture.invitation.id,
      key,
      fixture.principal,
      operationId
    );
    expect(
      await prisma.assistant.count({
        where: { invitationId: fixture.invitation.id, floorplanShapeId: { not: null } }
      })
    ).toBe(0);
    expect((await floorplan.get(fixture.event.id, fixture.principal)).shapes[0]).toMatchObject({ occupancy: 0 });
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        operationId,
        actorType: 'USER',
        data: expect.objectContaining({
          affectedTables: [{ tableId: table.id, occupancy: 0, capacity: 2 }]
        })
      })
    );
    expect(
      await prisma.auditLog.count({
        where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
      })
    ).toMatchObject({ afterData: expect.objectContaining({ source: 'INVITATION_CANCEL' }) });

    await floorplan.assign(
      fixture.event.id,
      randomUUID(),
      { assistantIds: fixture.assistants.slice(2).map(({ id }) => id), tableShapeId: table.id },
      fixture.principal
    );
    expect((await floorplan.get(fixture.event.id, fixture.principal)).shapes[0]).toMatchObject({ occupancy: 2 });

    const publishCountBeforeReplay = publish.mock.calls.length;
    const replay = await invitations.cancel(
      fixture.event.id,
      fixture.invitation.id,
      key,
      fixture.principal,
      randomUUID()
    );
    expect(replay).toEqual(first);
    expect(publish).toHaveBeenCalledTimes(publishCountBeforeReplay);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.event.id, action: 'INVITATION_CANCEL' } })).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
      })
    ).toBe(1);
    publish.mockRestore();
  });

  it('nominal omission releases only the removed Assistant and no-op RSVP emits no seating side effects', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'nominal')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    await floorplan.assignFamily(
      fixture.event.id,
      randomUUID(),
      { invitationId: fixture.invitation.id, tableShapeId: table.id },
      fixture.principal
    );
    const invitationToken = invitationTokens.issue(
      'INVITATION',
      fixture.invitation.id,
      fixture.invitation.invitationTokenNonce
    );
    const seatingPublish = vi.spyOn(realtime, 'publishSeatingUpdated');
    const extra = fixture.assistants.find(({ isPrimary }) => !isPrimary)!;
    await rsvp.modifyAssistants(invitationToken, { additionalAssistants: [] }, randomUUID());
    expect(await prisma.assistant.findUniqueOrThrow({ where: { id: extra.id } })).toMatchObject({
      deletedAt: expect.any(Date),
      floorplanShapeId: null
    });
    expect((await floorplan.get(fixture.event.id, fixture.principal)).shapes[0]).toMatchObject({ occupancy: 1 });
    expect(seatingPublish).toHaveBeenCalledOnce();
    expect(seatingPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        actorType: 'PUBLIC_TOKEN',
        data: expect.objectContaining({
          changes: [{ assistantId: extra.id, fromTableId: table.id, toTableId: null }]
        })
      })
    );
    expect(
      await prisma.auditLog.findFirstOrThrow({
        where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
      })
    ).toMatchObject({ afterData: expect.objectContaining({ source: 'RSVP_ASSISTANT_REMOVAL' }) });

    seatingPublish.mockClear();
    const seatingAuditCount = await prisma.auditLog.count({
      where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
    });
    await rsvp.modifyAssistants(invitationToken, { additionalAssistants: [] }, randomUUID());
    expect(seatingPublish).not.toHaveBeenCalled();
    expect(
      await prisma.auditLog.count({
        where: { eventId: fixture.event.id, action: 'SEATING_IMPLICIT_RELEASE' }
      })
    ).toBe(seatingAuditCount);
    seatingPublish.mockRestore();
  });

  it('requires an active table for check-in only when Floorplan is enabled', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'check-in')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    const staff = await createStaffToken(fixture);
    const qrToken = invitationTokens.issue(
      'QR',
      fixture.invitation.id,
      fixture.invitation.qrTokenNonce,
      fixture.invitation.qrTokenVersion
    );
    const scan = await scanner.scan(staff.rawToken, { qrToken });
    expect(scan.pendingAssistants[0]).toMatchObject({ id: fixture.assistants[0]!.id, table: null });

    const publish = vi.spyOn(realtime, 'publishCheckInCreated');
    const key = randomUUID();
    await expect(
      scanner.checkIn(
        staff.rawToken,
        key,
        { invitationId: fixture.invitation.id, assistantIds: [fixture.assistants[0]!.id] },
        randomUUID()
      )
    ).rejects.toMatchObject({ response: { code: 'SCANNER_TABLE_ASSIGNMENT_REQUIRED' }, status: 409 });
    expect(await prisma.checkIn.count({ where: { eventId: fixture.event.id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.event.id, action: 'CHECK_IN_CREATE' } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();

    await floorplan.assign(
      fixture.event.id,
      randomUUID(),
      { assistantIds: [fixture.assistants[0]!.id], tableShapeId: table.id },
      fixture.principal
    );
    const result = await scanner.checkIn(
      staff.rawToken,
      key,
      { invitationId: fixture.invitation.id, assistantIds: [fixture.assistants[0]!.id] },
      randomUUID()
    );
    expect(result.checkedIn[0]).toMatchObject({ table: { id: table.id, name: table.name } });
    expect(publish).toHaveBeenCalledWith(
      expect.objectContaining({
        checkIns: [
          expect.objectContaining({
            assistantId: fixture.assistants[0]!.id,
            tableId: table.id
          })
        ]
      })
    );
    publish.mockRestore();

    const withoutFloorplan = await createFixture();
    await prisma.event.update({ where: { id: withoutFloorplan.event.id }, data: { floorplanEnabled: false } });
    const staffWithoutFloorplan = await createStaffToken(withoutFloorplan);
    const allowed = await scanner.checkIn(
      staffWithoutFloorplan.rawToken,
      randomUUID(),
      {
        invitationId: withoutFloorplan.invitation.id,
        assistantIds: [withoutFloorplan.assistants[0]!.id]
      },
      randomUUID()
    );
    expect(allowed.checkedIn[0]?.table).toBeNull();
  });

  it('rejects direct SQL check-in for missing, decorative, deleted, or cross-event tables', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'sql')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    const zone = await floorplan.createShape(
      fixture.event.id,
      {
        kind: FloorplanShapeKind.DECORATIVE_ZONE,
        geometry: FloorplanGeometry.RECTANGLE,
        name: 'Zona SQL',
        capacity: 0,
        x: 0.5,
        y: 0.1,
        width: 0.2,
        height: 0.2,
        rotation: 0,
        polygonPoints: null
      },
      fixture.principal
    );
    const staff = await createStaffToken(fixture);
    const assistantId = fixture.assistants[0]!.id;

    await expect(directCheckIn(fixture, staff.token.id, assistantId)).rejects.toThrow(
      /check_in_floorplan_table_required/u
    );

    await forceAssistantTable(assistantId, zone.id);
    await expect(directCheckIn(fixture, staff.token.id, assistantId)).rejects.toThrow(
      /check_in_floorplan_table_required/u
    );

    await forceAssistantTable(assistantId, table.id);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.floorplanShape.update({ where: { id: table.id }, data: { deletedAt: new Date() } });
    });
    await expect(directCheckIn(fixture, staff.token.id, assistantId)).rejects.toThrow(
      /check_in_floorplan_table_required/u
    );

    const foreign = await createFixture();
    await floorplan.create(
      foreign.event.id,
      { imageAssetId: (await createAsset(foreign, 'sql-foreign')).id },
      foreign.principal
    );
    const foreignTable = await createTable(foreign, 2);
    await forceAssistantTable(assistantId, foreignTable.id);
    await expect(directCheckIn(fixture, staff.token.id, assistantId)).rejects.toThrow(
      /check_in_floorplan_table_required/u
    );

    const withoutFloorplan = await createFixture();
    await prisma.event.update({ where: { id: withoutFloorplan.event.id }, data: { floorplanEnabled: false } });
    const plainStaff = await createStaffToken(withoutFloorplan);
    await expect(
      directCheckIn(withoutFloorplan, plainStaff.token.id, withoutFloorplan.assistants[0]!.id)
    ).resolves.toBe(1);
  });

  it('audits post-check-in changes and exposes only minimal Staff Floorplan/table data', async () => {
    const fixture = await createFixture();
    await floorplan.create(
      fixture.event.id,
      { imageAssetId: (await createAsset(fixture, 'base')).id },
      fixture.principal
    );
    const table = await createTable(fixture, 2);
    const movedTable = await createTable(fixture, 2);
    await floorplan.assign(
      fixture.event.id,
      randomUUID(),
      { assistantIds: [fixture.assistants[0]!.id], tableShapeId: table.id },
      fixture.principal
    );
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
      { tableShapeId: movedTable.id },
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
      shapes: expect.arrayContaining([expect.objectContaining({ id: movedTable.id, occupancy: 1 })])
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

  async function createStaffToken(fixture: Awaited<ReturnType<typeof createFixture>>) {
    const generated = staffTokens.generate();
    const token = await prisma.staffToken.create({
      data: {
        eventId: fixture.event.id,
        alias: 'Puerta',
        tokenDigestSha256: generated.digestSha256,
        tokenVersion: generated.version,
        createdByUserId: fixture.user.id
      }
    });
    return { ...generated, token };
  }

  async function forceAssistantTable(assistantId: string, floorplanShapeId: string | null): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.assistant.update({ where: { id: assistantId }, data: { floorplanShapeId } });
    });
  }

  async function directCheckIn(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    staffTokenId: string,
    assistantId: string
  ): Promise<number> {
    const timestamp = new Date();
    return prisma.$executeRaw`
      INSERT INTO "check_in" (
        "id",
        "event_id",
        "invitation_id",
        "assistant_id",
        "staff_token_id",
        "checked_in_at",
        "idempotency_key",
        "request_signature",
        "result_snapshot",
        "created_at"
      )
      VALUES (
        ${randomUUID()}::uuid,
        ${fixture.event.id}::uuid,
        ${fixture.invitation.id}::uuid,
        ${assistantId}::uuid,
        ${staffTokenId}::uuid,
        ${timestamp},
        ${randomUUID()},
        ${createHash('sha256').update(randomUUID()).digest('hex')},
        '{}'::jsonb,
        ${timestamp}
      )
    `;
  }

  async function runWithAuditBarrier(
    action: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>
  ): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]> {
    const barrier = auditBarrier(action);
    const firstResult = track(first());
    try {
      await barrier.entered.promise;
      const secondResult = track(second());
      await assertPending(secondResult);
      barrier.release.resolve();
      return await Promise.allSettled([firstResult.promise, secondResult.promise]);
    } finally {
      barrier.release.resolve();
      barrier.restore();
    }
  }

  async function runQueuedBehindEventLock(
    eventId: string,
    first: () => Promise<unknown>,
    second: () => Promise<unknown>
  ): Promise<[PromiseSettledResult<unknown>, PromiseSettledResult<unknown>]> {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const blocker = new Client({ connectionString: databaseUrl });
    const observer = new Client({ connectionString: databaseUrl });
    await Promise.all([blocker.connect(), observer.connect()]);
    let committed = false;
    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT "id" FROM "event" WHERE "id" = $1::uuid FOR UPDATE', [eventId]);
      const baseline = await lockWaiterCount(observer);
      const firstResult = track(first());
      await waitForLockWaiters(observer, baseline + 1);
      const secondResult = track(second());
      await waitForLockWaiters(observer, baseline + 2);
      await blocker.query('COMMIT');
      committed = true;
      return await Promise.allSettled([firstResult.promise, secondResult.promise]);
    } finally {
      if (!committed) await blocker.query('ROLLBACK').catch(() => undefined);
      await Promise.all([blocker.end(), observer.end()]);
    }
  }

  async function lockWaiterCount(observer: Client): Promise<number> {
    const result = await observer.query<{ count: number }>(
      `SELECT count(*)::int AS "count"
       FROM "pg_stat_activity"
       WHERE "datname" = current_database()
         AND "wait_event_type" = 'Lock'`
    );
    return result.rows[0]!.count;
  }

  async function waitForLockWaiters(observer: Client, expected: number): Promise<void> {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      if ((await lockWaiterCount(observer)) >= expected) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error(`Expected at least ${expected} PostgreSQL lock waiters.`);
  }

  function auditBarrier(action: string) {
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = audit.record.bind(audit);
    let intercepted = false;
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (input, tx) => {
      if (!intercepted && input.action === action) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
      return original(input, tx);
    });
    return { entered, release, restore: () => spy.mockRestore() };
  }

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function track<T>(promise: Promise<T>) {
    let settled = false;
    const tracked = promise.finally(() => {
      settled = true;
    });
    return { promise: tracked, isSettled: () => settled };
  }

  async function assertPending(tracked: { isSettled: () => boolean }): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    expect(tracked.isSettled()).toBe(false);
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
