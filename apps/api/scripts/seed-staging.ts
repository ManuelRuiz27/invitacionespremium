import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppConfigService } from '../src/config/app-config.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { FileStorage } from '../src/file-assets/file-storage';
import {
  AssistantResponseStatus,
  ClientType,
  EventSocialType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  FloorplanGeometry,
  FloorplanShapeKind,
  InvitationMode,
  InvitationResponseStatus,
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';
import { assertStagingOperation, safeFailure } from './staging-safety';

const ids = {
  plannerClient: '14000000-0000-4000-8000-000000000001',
  organizationClient: '14000000-0000-4000-8000-000000000002',
  platformAdmin: '14000000-0000-4000-8000-000000000003',
  planner: '14000000-0000-4000-8000-000000000004',
  organizationAdmin: '14000000-0000-4000-8000-000000000005',
  organizationPlanner: '14000000-0000-4000-8000-000000000006',
  activeEvent: '14000000-0000-4000-8000-000000000010',
  eventDay: '14000000-0000-4000-8000-000000000011',
  activeReceipt: '14000000-0000-4000-8000-000000000012',
  eventDayReceipt: '14000000-0000-4000-8000-000000000013',
  floorplanAsset: '14000000-0000-4000-8000-000000000020',
  floorplan: '14000000-0000-4000-8000-000000000021',
  circleTable: '14000000-0000-4000-8000-000000000022',
  rectangleTable: '14000000-0000-4000-8000-000000000023',
  decorativeZone: '14000000-0000-4000-8000-000000000024',
  individualContact: '14000000-0000-4000-8000-000000000030',
  individualInvitation: '14000000-0000-4000-8000-000000000031',
  individualAssistant: '14000000-0000-4000-8000-000000000032',
  familyContact: '14000000-0000-4000-8000-000000000033',
  familyInvitation: '14000000-0000-4000-8000-000000000034',
  familyPrimary: '14000000-0000-4000-8000-000000000035',
  familyPendingOne: '14000000-0000-4000-8000-000000000036',
  familyPendingTwo: '14000000-0000-4000-8000-000000000037',
  foreignContact: '14000000-0000-4000-8000-000000000040',
  foreignInvitation: '14000000-0000-4000-8000-000000000041',
  foreignAssistant: '14000000-0000-4000-8000-000000000042',
  staff: '14000000-0000-4000-8000-000000000050',
  checkIn: '14000000-0000-4000-8000-000000000060'
} as const;

interface SeedArtifact {
  version: 1;
  users: Record<
    'platformAdmin' | 'planner' | 'organizationAdmin' | 'organizationPlanner',
    { email: string; password: string }
  >;
  staffToken: string;
  activeInvitationToken: string;
  familyInvitationToken: string;
  activeQrToken: string;
  foreignQrToken: string;
  eventIds: { active: string; eventDay: string };
}

const artifactTemplate = (): SeedArtifact => ({
  version: 1,
  users: {
    platformAdmin: { email: 'staging-platform@example.invalid', password: secret() },
    planner: { email: 'staging-planner@example.invalid', password: secret() },
    organizationAdmin: { email: 'staging-org-admin@example.invalid', password: secret() },
    organizationPlanner: { email: 'staging-org-planner@example.invalid', password: secret() }
  },
  staffToken: '',
  activeInvitationToken: '',
  familyInvitationToken: '',
  activeQrToken: '',
  foreignQrToken: '',
  eventIds: { active: ids.activeEvent, eventDay: ids.eventDay }
});

async function seedStaging(): Promise<void> {
  loadEnvironmentFiles();
  assertStagingOperation(process.argv.slice(2), process.env, {
    confirmationFlag: '--confirm-staging',
    requireDatabase: true
  });
  const artifactPath = resolve(process.env.STAGING_SEED_ARTIFACT_PATH ?? 'var/staging-seed/credentials.json');
  const artifact = await loadOrCreateArtifact(artifactPath);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    const storage = app.get(FileStorage);
    const staffTokens = app.get(StaffTokenTechnicalService);
    const generatedStaff = artifact.staffToken
      ? { rawToken: artifact.staffToken, digestSha256: staffTokens.digest(artifact.staffToken), version: 1 }
      : staffTokens.generate();
    artifact.staffToken = generatedStaff.rawToken;

    await prisma.$transaction(async (tx) => {
      await tx.client.upsert({
        where: { id: ids.plannerClient },
        create: { id: ids.plannerClient, type: ClientType.PLANNER, name: '[STAGING DEMO] Planner' },
        update: { type: ClientType.PLANNER, name: '[STAGING DEMO] Planner', deletedAt: null }
      });
      await tx.client.upsert({
        where: { id: ids.organizationClient },
        create: { id: ids.organizationClient, type: ClientType.ORGANIZATION, name: '[STAGING DEMO] Organización' },
        update: { type: ClientType.ORGANIZATION, name: '[STAGING DEMO] Organización', deletedAt: null }
      });
      await upsertUser(tx, ids.platformAdmin, artifact.users.platformAdmin, UserRole.PLATFORM_ADMIN, null);
      await upsertUser(tx, ids.planner, artifact.users.planner, UserRole.INDEPENDENT_PLANNER, ids.plannerClient);
      await upsertUser(
        tx,
        ids.organizationAdmin,
        artifact.users.organizationAdmin,
        UserRole.ORGANIZATION_ADMIN,
        ids.organizationClient
      );
      await upsertUser(
        tx,
        ids.organizationPlanner,
        artifact.users.organizationPlanner,
        UserRole.ORGANIZATION_PLANNER,
        ids.organizationClient
      );
      for (const clientId of [ids.plannerClient, ids.organizationClient]) {
        await tx.financeBalance.upsert({
          where: { clientId },
          create: { clientId, purchasedCredits: 100 },
          update: { purchasedCredits: 100, creditLineUsed: 0, debtCredits: 0, debtMxnCents: 0 }
        });
      }
      const service = await tx.service.upsert({
        where: { code: ServiceCode.DEMO },
        create: { code: ServiceCode.DEMO },
        update: { isActive: true }
      });
      const price = await tx.servicePrice.findFirst({
        where: { serviceId: service.id, clientType: ClientType.PLANNER }
      });
      if (!price) throw new Error('Run services-pricing:seed before staging:seed.');
      await upsertActivatedEvent(
        tx,
        ids.activeEvent,
        ids.activeReceipt,
        EventStatus.ACTIVE,
        'Evento activo',
        service.id,
        price.id
      );
      await upsertActivatedEvent(
        tx,
        ids.eventDay,
        ids.eventDayReceipt,
        EventStatus.EVENT_DAY,
        'Evento día',
        service.id,
        price.id
      );
      await upsertInvitation(
        tx,
        ids.activeEvent,
        ids.individualContact,
        ids.individualInvitation,
        [
          {
            id: ids.individualAssistant,
            name: 'Invitado individual',
            primary: true,
            status: AssistantResponseStatus.CONFIRMED,
            tableId: ids.circleTable
          }
        ],
        InvitationMode.INDIVIDUAL
      );
      await upsertInvitation(
        tx,
        ids.activeEvent,
        ids.familyContact,
        ids.familyInvitation,
        [
          {
            id: ids.familyPrimary,
            name: 'Familia demo',
            primary: true,
            status: AssistantResponseStatus.CONFIRMED,
            tableId: ids.rectangleTable
          },
          {
            id: ids.familyPendingOne,
            name: 'Asistente pendiente uno',
            primary: false,
            status: AssistantResponseStatus.PENDING,
            tableId: ids.rectangleTable
          },
          {
            id: ids.familyPendingTwo,
            name: 'Asistente pendiente dos',
            primary: false,
            status: AssistantResponseStatus.PENDING,
            tableId: ids.rectangleTable
          }
        ],
        InvitationMode.FAMILY_NOMINAL
      );
      await upsertInvitation(
        tx,
        ids.eventDay,
        ids.foreignContact,
        ids.foreignInvitation,
        [
          {
            id: ids.foreignAssistant,
            name: 'Invitado otro evento',
            primary: true,
            status: AssistantResponseStatus.CONFIRMED,
            tableId: null
          }
        ],
        InvitationMode.INDIVIDUAL
      );
      await tx.staffToken.upsert({
        where: { id: ids.staff },
        create: {
          id: ids.staff,
          eventId: ids.activeEvent,
          alias: 'Scanner staging',
          tokenDigestSha256: generatedStaff.digestSha256,
          tokenVersion: generatedStaff.version,
          createdByUserId: ids.planner
        },
        update: { alias: 'Scanner staging', tokenDigestSha256: generatedStaff.digestSha256, expiredAt: null }
      });
      await tx.checkIn.upsert({
        where: { id: ids.checkIn },
        create: {
          id: ids.checkIn,
          eventId: ids.activeEvent,
          invitationId: ids.individualInvitation,
          assistantId: ids.individualAssistant,
          staffTokenId: ids.staff,
          checkedInAt: new Date(),
          idempotencyKey: 'staging-demo-individual-checkin',
          requestSignature: createHash('sha256').update('staging-demo').digest('hex'),
          resultSnapshot: { fixture: 'staging-demo' }
        },
        update: { revertedAt: null }
      });
    });

    const image = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#f6f1e8' } })
      .png()
      .toBuffer();
    const storageKey = 'staging-demo/floorplan.png';
    await storage.write({ storageKey, bytes: image });
    await prisma.fileAsset.upsert({
      where: { id: ids.floorplanAsset },
      create: {
        id: ids.floorplanAsset,
        clientId: ids.plannerClient,
        eventId: ids.activeEvent,
        ownerType: FileAssetOwnerType.FLOORPLAN,
        fileType: FileAssetType.FLOORPLAN_IMAGE,
        storageProvider: StorageProvider.LOCAL,
        storageKey,
        originalName: 'staging-floorplan.png',
        mimeType: 'image/png',
        sizeBytes: image.length,
        checksumSha256: createHash('sha256').update(image).digest('hex'),
        width: 640,
        height: 480,
        createdByUserId: ids.planner,
        status: FileAssetStatus.READY
      },
      update: {
        status: FileAssetStatus.READY,
        sizeBytes: image.length,
        checksumSha256: createHash('sha256').update(image).digest('hex'),
        deletedAt: null
      }
    });
    await prisma.floorplan.upsert({
      where: { id: ids.floorplan },
      create: { id: ids.floorplan, eventId: ids.activeEvent, imageAssetId: ids.floorplanAsset },
      update: { imageAssetId: ids.floorplanAsset, deletedAt: null }
    });
    await upsertShape(
      prisma,
      ids.circleTable,
      FloorplanShapeKind.TABLE,
      FloorplanGeometry.CIRCLE,
      'Mesa circular',
      8,
      0.1
    );
    await upsertShape(
      prisma,
      ids.rectangleTable,
      FloorplanShapeKind.TABLE,
      FloorplanGeometry.RECTANGLE,
      'Mesa rectangular',
      8,
      0.45
    );
    await upsertShape(
      prisma,
      ids.decorativeZone,
      FloorplanShapeKind.DECORATIVE_ZONE,
      FloorplanGeometry.RECTANGLE,
      'Zona decorativa',
      0,
      0.75
    );

    const invitations = await prisma.invitation.findMany({
      where: { id: { in: [ids.individualInvitation, ids.familyInvitation, ids.foreignInvitation] } }
    });
    const byId = new Map(invitations.map((invitation) => [invitation.id, invitation]));
    artifact.activeInvitationToken = issue(
      config.invitationTokenSigningSecret,
      'INVITATION',
      requiredInvitation(byId, ids.individualInvitation)
    );
    artifact.familyInvitationToken = issue(
      config.invitationTokenSigningSecret,
      'INVITATION',
      requiredInvitation(byId, ids.familyInvitation)
    );
    artifact.activeQrToken = issue(
      config.invitationTokenSigningSecret,
      'QR',
      requiredInvitation(byId, ids.individualInvitation)
    );
    artifact.foreignQrToken = issue(
      config.invitationTokenSigningSecret,
      'QR',
      requiredInvitation(byId, ids.foreignInvitation)
    );
    await writeArtifact(artifactPath, artifact);
    process.stdout.write(
      `${JSON.stringify({ event: 'staging_seed_ready', artifactPath, eventIds: artifact.eventIds })}\n`
    );
  } finally {
    await app.close();
  }
}

type Transaction = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];
async function upsertUser(
  tx: Transaction,
  id: string,
  credentials: { email: string; password: string },
  role: UserRole,
  clientId: string | null
) {
  const passwordHash = await hashPassword(credentials.password);
  await tx.user.upsert({
    where: { id },
    create: { id, email: credentials.email, passwordHash, role, clientId },
    update: { email: credentials.email, passwordHash, role, clientId, deletedAt: null }
  });
}

async function upsertActivatedEvent(
  tx: Transaction,
  eventId: string,
  receiptId: string,
  status: EventStatus,
  suffix: string,
  serviceId: string,
  priceId: string
) {
  const operation = `staging-demo-activation-${eventId}`;
  await tx.receipt.upsert({
    where: { id: receiptId },
    create: {
      id: receiptId,
      clientId: ids.plannerClient,
      operationType: 'EVENT_ACTIVATION_CHARGE',
      operationReference: operation,
      idempotencyKey: operation
    },
    update: {}
  });
  const data = {
    clientId: ids.plannerClient,
    createdByUserId: ids.planner,
    serviceId,
    name: `[STAGING DEMO] ${suffix}`,
    socialType: EventSocialType.OTHER,
    status,
    eventDateTime: status === EventStatus.EVENT_DAY ? new Date() : new Date(Date.now() + 7 * 86_400_000),
    timeZone: 'America/Mexico_City',
    capacity: 30,
    confirmationEnabled: true,
    floorplanEnabled: eventId === ids.activeEvent,
    activatedAt: new Date(),
    activatedByUserId: ids.planner,
    activatedServiceId: serviceId,
    activatedServicePriceId: priceId,
    baseCostCredits: 0,
    promotionDiscountCredits: 0,
    finalCostCredits: 0,
    purchasedCreditsUsed: 0,
    creditLineCreditsUsed: 0,
    activationReceiptId: receiptId,
    activationIdempotencyKey: operation
  };
  await tx.event.upsert({
    where: { id: eventId },
    create: { id: eventId, ...data },
    update: { ...data, deletedAt: null }
  });
}

async function upsertInvitation(
  tx: Transaction,
  eventId: string,
  contactId: string,
  invitationId: string,
  assistants: Array<{
    id: string;
    name: string;
    primary: boolean;
    status: AssistantResponseStatus;
    tableId: string | null;
  }>,
  mode: InvitationMode
) {
  await tx.contact.upsert({
    where: { id: contactId },
    create: { id: contactId, eventId, name: assistants[0]!.name },
    update: { name: assistants[0]!.name, deletedAt: null }
  });
  const nonce = createHash('sha256').update(`${invitationId}:invitation`).digest('hex');
  const qrNonce = createHash('sha256').update(`${invitationId}:qr`).digest('hex');
  await tx.invitation.upsert({
    where: { id: invitationId },
    create: {
      id: invitationId,
      eventId,
      contactId,
      mode,
      responseStatus: InvitationResponseStatus.CONFIRMED,
      additionalAssistantLimit: mode === InvitationMode.FAMILY_NOMINAL ? 2 : 0,
      invitationTokenNonce: nonce,
      qrTokenNonce: qrNonce
    },
    update: {
      mode,
      responseStatus: InvitationResponseStatus.CONFIRMED,
      additionalAssistantLimit: mode === InvitationMode.FAMILY_NOMINAL ? 2 : 0,
      deletedAt: null,
      cancelledAt: null
    }
  });
  for (const assistant of assistants)
    await tx.assistant.upsert({
      where: { id: assistant.id },
      create: {
        id: assistant.id,
        eventId,
        invitationId,
        name: assistant.name,
        isPrimary: assistant.primary,
        responseStatus: assistant.status,
        floorplanShapeId: null
      },
      update: { name: assistant.name, responseStatus: assistant.status, deletedAt: null }
    });
}

async function upsertShape(
  prisma: PrismaService,
  id: string,
  kind: FloorplanShapeKind,
  geometry: FloorplanGeometry,
  name: string,
  capacity: number,
  x: number
) {
  const data = {
    floorplanId: ids.floorplan,
    eventId: ids.activeEvent,
    kind,
    geometry,
    name,
    normalizedName: name.toLowerCase(),
    capacity,
    x,
    y: 0.2,
    width: 0.2,
    height: 0.2,
    rotation: 0
  };
  await prisma.floorplanShape.upsert({ where: { id }, create: { id, ...data }, update: { ...data, deletedAt: null } });
  if (kind === FloorplanShapeKind.TABLE) {
    const assistantIds =
      id === ids.circleTable
        ? [ids.individualAssistant]
        : [ids.familyPrimary, ids.familyPendingOne, ids.familyPendingTwo];
    await prisma.assistant.updateMany({ where: { id: { in: assistantIds } }, data: { floorplanShapeId: id } });
  }
}

function issue(
  secretValue: string,
  purpose: 'INVITATION' | 'QR',
  invitation: { id: string; invitationTokenNonce: string; qrTokenNonce: string }
) {
  const prefix = purpose === 'INVITATION' ? 'ip1' : 'qr1';
  const nonce = purpose === 'INVITATION' ? invitation.invitationTokenNonce : invitation.qrTokenNonce;
  const payload = `${prefix}.${invitation.id}.${nonce}`;
  return `${payload}.${createHmac('sha256', secretValue).update(`InvitacionesPremium:${purpose}:${payload}`).digest('base64url')}`;
}

function requiredInvitation(
  map: Map<string, { id: string; invitationTokenNonce: string; qrTokenNonce: string }>,
  id: string
) {
  const invitation = map.get(id);
  if (!invitation) throw new Error('Staging invitation fixture is missing.');
  return invitation;
}

async function loadOrCreateArtifact(path: string): Promise<SeedArtifact> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as SeedArtifact;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const artifact = artifactTemplate();
    await writeArtifact(path, artifact);
    return artifact;
  }
}

async function writeArtifact(path: string, artifact: SeedArtifact): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function secret(): string {
  return randomBytes(24).toString('base64url');
}

void seedStaging().catch((error: unknown) => {
  process.stderr.write(`${safeFailure('staging_seed_failed', error)}\n`);
  process.exitCode = 1;
});
