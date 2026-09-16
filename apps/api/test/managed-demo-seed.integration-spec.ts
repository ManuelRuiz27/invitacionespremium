import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AssistantResponseStatus,
  ClientOperatingProfile,
  ClientType,
  EventStatus,
  FloorplanShapeKind,
  InvitationMode,
  InvitationResponseStatus,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { PublicRsvpService } from '../src/public-rsvp/public-rsvp.service';
import { ScannerService } from '../src/scanner/scanner.service';
import { MANAGED_DEMO_IDS, seedManagedDemo } from '../scripts/seed-managed-demo';

describe.sequential('managed demo seed integration', () => {
  let app: INestApplicationContext;
  let prisma: PrismaService;
  let artifactDirectory: string;
  let artifactPath: string;

  beforeAll(async () => {
    process.env.DATABASE_IDLE_TIMEOUT_MS = '1000';
    artifactDirectory = await mkdtemp(join(tmpdir(), 'managed-demo-'));
    artifactPath = join(artifactDirectory, 'credentials.json');
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await app.close();
  });

  afterAll(async () => {
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    prisma = app.get(PrismaService);
    await resetDatabase(prisma);
    await app.close();
    await rm(artifactDirectory, { recursive: true, force: true });
  });

  it('reconciles the complete Managed fixture and preserves Scanner and financial invariants', async () => {
    const environment = { ...process.env, NODE_ENV: 'test', MANAGED_DEMO_ARTIFACT_PATH: artifactPath };
    const createApplication = () => NestFactory.createApplicationContext(AppModule, { logger: false });

    const first = await seedManagedDemo(environment, createApplication);
    const second = await seedManagedDemo(environment, createApplication);
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    prisma = app.get(PrismaService);

    expect(second).toEqual(first);
    expect(second).toEqual({
      eventId: MANAGED_DEMO_IDS.event,
      status: EventStatus.ACTIVE,
      contacts: 4,
      invitations: 4,
      assistants: 6,
      tables: 2,
      seats: 8,
      activeCheckIns: 1,
      scannerPending: 3
    });

    const client = await prisma.client.findUniqueOrThrow({
      where: { id: MANAGED_DEMO_IDS.client },
      include: { users: true }
    });
    expect(client).toMatchObject({
      type: ClientType.PLANNER,
      operatingProfile: ClientOperatingProfile.MANAGED
    });
    expect(client.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: MANAGED_DEMO_IDS.planner, role: UserRole.INDEPENDENT_PLANNER })
      ])
    );

    const event = await prisma.event.findUniqueOrThrow({
      where: { id: MANAGED_DEMO_IDS.event },
      include: { service: true, invitations: { include: { assistants: true } } }
    });
    expect(event).toMatchObject({
      name: 'Boda de Elena & Mateo',
      assignedPlannerUserId: MANAGED_DEMO_IDS.planner,
      status: EventStatus.ACTIVE,
      activatedByUserId: MANAGED_DEMO_IDS.admin,
      activatedServiceId: event.serviceId,
      activatedServicePriceId: null,
      activationReceiptId: null,
      baseCostCredits: null,
      promotionDiscountCredits: null,
      finalCostCredits: null,
      purchasedCreditsUsed: null,
      creditLineCreditsUsed: null,
      creditUnitValueMxnCentsSnapshot: null,
      commercialAuthorizedAt: null,
      commercialServicePriceId: null
    });
    expect(event.service?.code).toBe(ServiceCode.FLYER);
    expect(event.invitations.map(({ responseStatus }) => responseStatus).sort()).toEqual([
      InvitationResponseStatus.CONFIRMED,
      InvitationResponseStatus.CONFIRMED,
      InvitationResponseStatus.PENDING,
      InvitationResponseStatus.REJECTED
    ]);
    const family = event.invitations.find(({ id }) => id === MANAGED_DEMO_IDS.familyInvitation);
    expect(family).toMatchObject({ mode: InvitationMode.FAMILY_NOMINAL, additionalAssistantLimit: 2 });
    expect(family?.assistants).toHaveLength(3);
    expect(family?.assistants.every(({ responseStatus }) => responseStatus === AssistantResponseStatus.CONFIRMED)).toBe(
      true
    );

    const assigned = await prisma.assistant.findMany({
      where: { eventId: event.id, floorplanSeatId: { not: null } },
      include: { floorplanShape: true, floorplanSeat: true }
    });
    expect(assigned).toHaveLength(6);
    expect(
      assigned.every(
        ({ floorplanShape, floorplanSeat }) =>
          floorplanShape?.kind === FloorplanShapeKind.TABLE && floorplanSeat?.floorplanShapeId === floorplanShape.id
      )
    ).toBe(true);

    const artifact = JSON.parse(await readFile(artifactPath, 'utf8')) as {
      staffToken: string;
      invitationLinks: { family: string };
      qrTokens: { family: string };
    };
    const invitationToken = new URL(artifact.invitationLinks.family).pathname.split('/').at(-1)!;
    const publicInvitation = await app.get(PublicRsvpService).resolve(invitationToken);
    expect(publicInvitation).toMatchObject({
      status: 'AVAILABLE',
      invitation: { id: MANAGED_DEMO_IDS.familyInvitation },
      qr: { available: true }
    });
    const scan = await app.get(ScannerService).scan(artifact.staffToken, { qrToken: artifact.qrTokens.family });
    expect(scan).toMatchObject({ status: 'AVAILABLE', pendingCount: 3, confirmedCount: 3 });
    expect(scan.pendingAssistants.every(({ table, seat }) => table !== null && seat !== null)).toBe(true);
    expect(await prisma.staffToken.count({ where: { eventId: event.id, expiredAt: null } })).toBe(1);
    expect(await prisma.checkIn.count({ where: { eventId: event.id, revertedAt: null } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: event.id, action: 'EVENT_ACTIVATE' } })).toBe(1);

    expect(await prisma.ledgerEntry.count({ where: { eventId: event.id } })).toBe(0);
    expect(
      await prisma.receipt.count({ where: { OR: [{ operationReference: event.id }, { clientId: client.id }] } })
    ).toBe(0);
    expect(await prisma.financeBalance.count({ where: { clientId: client.id } })).toBe(0);
  });
});

async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    BEGIN;
    SET LOCAL session_replication_role = replica;
    TRUNCATE TABLE "client", "service", "audit_log" RESTART IDENTITY CASCADE;
    COMMIT;
  `);
}
