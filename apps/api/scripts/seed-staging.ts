import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, posix, resolve } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { AuditedMutationService } from '../src/audit/audited-mutation.service';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import { AppConfigService } from '../src/config/app-config.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { FinanceService } from '../src/finance/finance.service';
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
import { ScannerService } from '../src/scanner/scanner.service';
import { seedServicesPricing } from './seed-services-pricing';
import { createStagingFloorplanBytes, stagingFloorplanChecksum } from './staging-floorplan';
import {
  assertStagingOperation,
  requiredEnvironment,
  runCapturedCommand,
  safeFailure,
  safeHttpsUrl
} from './staging-safety';

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
  availableIndividualContact: '14000000-0000-4000-8000-000000000038',
  availableIndividualInvitation: '14000000-0000-4000-8000-000000000039',
  availableIndividualAssistant: '14000000-0000-4000-8000-000000000043',
  familyContact: '14000000-0000-4000-8000-000000000033',
  familyInvitation: '14000000-0000-4000-8000-000000000034',
  familyPrimary: '14000000-0000-4000-8000-000000000035',
  familyPendingOne: '14000000-0000-4000-8000-000000000036',
  familyPendingTwo: '14000000-0000-4000-8000-000000000037',
  foreignContact: '14000000-0000-4000-8000-000000000040',
  foreignInvitation: '14000000-0000-4000-8000-000000000041',
  foreignAssistant: '14000000-0000-4000-8000-000000000042',
  staff: '14000000-0000-4000-8000-000000000050',
  legacyCheckIn: '14000000-0000-4000-8000-000000000060'
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
  familyQrToken: string;
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
  familyQrToken: '',
  foreignQrToken: '',
  eventIds: { active: ids.activeEvent, eventDay: ids.eventDay }
});

export interface SeedCommandExecutor {
  capture(
    command: string,
    args: readonly string[],
    options?: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number }
  ): Promise<string>;
}

const defaultSeedExecutor: SeedCommandExecutor = { capture: runCapturedCommand };

export async function seedStaging(
  args = process.argv.slice(2),
  environment: NodeJS.ProcessEnv = process.env,
  createApplication: () => Promise<INestApplicationContext> = () =>
    NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] }),
  executor: SeedCommandExecutor = defaultSeedExecutor
): Promise<void> {
  loadEnvironmentFiles();
  assertStagingOperation(args, environment, {
    confirmationFlag: '--confirm-staging',
    requireDatabase: true
  });
  const artifactPath = resolve(environment.STAGING_SEED_ARTIFACT_PATH ?? 'var/staging-seed/credentials.json');
  const artifact = await loadOrCreateArtifact(artifactPath);
  const app = await createApplication();
  try {
    const prisma = app.get(PrismaService);
    const config = app.get(AppConfigService);
    const staffTokens = app.get(StaffTokenTechnicalService);
    const scanner = app.get(ScannerService);
    const finance = app.get(FinanceService);
    await seedServicesPricing(app.get(AuditedMutationService));
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
      const service = await tx.service.findUnique({ where: { code: ServiceCode.DEMO } });
      if (!service) throw new Error('Services and pricing seed did not create the DEMO service.');
      const price = await tx.servicePrice.findFirst({
        where: { serviceId: service.id, clientType: ClientType.PLANNER }
      });
      if (!price) throw new Error('Services and pricing seed did not create the DEMO price.');
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
        ids.availableIndividualContact,
        ids.availableIndividualInvitation,
        [
          {
            id: ids.availableIndividualAssistant,
            name: 'Invitado individual pendiente',
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
            status: AssistantResponseStatus.CONFIRMED,
            tableId: ids.rectangleTable
          },
          {
            id: ids.familyPendingTwo,
            name: 'Asistente pendiente dos',
            primary: false,
            status: AssistantResponseStatus.CONFIRMED,
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
      await tx.checkIn.deleteMany({ where: { id: ids.legacyCheckIn } });
    });

    const financePrincipal = {
      userId: ids.platformAdmin,
      sessionId: 'staging-seed',
      email: artifact.users.platformAdmin.email,
      role: UserRole.PLATFORM_ADMIN,
      clientId: null,
      clientType: null,
      clientStatus: null
    } as const;
    for (const [clientId, label] of [
      [ids.plannerClient, 'planner'],
      [ids.organizationClient, 'organization']
    ] as const) {
      await finance.rebuildBalanceFromLedger(clientId, `staging-seed-${label}-balance-rebuild-v1`, financePrincipal);
      await finance.assignCredits(
        clientId,
        {
          credits: 100,
          reason: 'Créditos iniciales para probar el flujo de staging',
          operationReference: `staging-seed-${label}-credit-grant-v1`
        },
        `staging-seed-${label}-credit-grant-v1`,
        financePrincipal
      );
    }

    const image = await createStagingFloorplanBytes();
    const storageKey = 'staging-demo/floorplan.png';
    const checksum = stagingFloorplanChecksum(image);
    await uploadAndVerifyRemoteFloorplan(
      image,
      storageKey,
      config.fileStorageLocalRoot,
      config.nodeEnv,
      environment,
      executor
    );
    await seedFloorplanDatabase(prisma, storageKey, image.length, checksum);

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
    artifact.familyQrToken = issue(
      config.invitationTokenSigningSecret,
      'QR',
      requiredInvitation(byId, ids.familyInvitation)
    );
    artifact.foreignQrToken = issue(
      config.invitationTokenSigningSecret,
      'QR',
      requiredInvitation(byId, ids.foreignInvitation)
    );
    await verifyScannerFixtures(scanner, artifact);
    await verifyRemoteFloorplanApi(environment, artifact.staffToken, checksum);
    await writeArtifact(artifactPath, artifact);
    process.stdout.write(
      `${JSON.stringify({ event: 'staging_seed_ready', artifactPath, eventIds: artifact.eventIds })}\n`
    );
  } finally {
    await app.close();
  }
}

export function remoteStoragePath(root: string, nodeEnvironment: string, storageKey: string): string {
  if (!root.startsWith('/') || root.includes('\0'))
    throw new Error('FILE_STORAGE_LOCAL_ROOT must be absolute on Railway.');
  const remotePath = posix.resolve(root, nodeEnvironment, storageKey);
  const expectedRoot = `${posix.resolve(root, nodeEnvironment)}/`;
  if (!remotePath.startsWith(expectedRoot))
    throw new Error('Remote staging asset path escapes FILE_STORAGE_LOCAL_ROOT.');
  return remotePath;
}

export function railwayFileTargetArgs(environment: NodeJS.ProcessEnv): string[] {
  return [
    '--project',
    requiredEnvironment(environment, 'RAILWAY_PROJECT_ID'),
    '--environment',
    'staging',
    '--service',
    requiredEnvironment(environment, 'RAILWAY_API_SERVICE_ID')
  ];
}

export async function uploadAndVerifyRemoteFloorplan(
  image: Buffer,
  storageKey: string,
  storageRoot: string,
  nodeEnvironment: string,
  environment: NodeJS.ProcessEnv,
  executor: SeedCommandExecutor
): Promise<void> {
  requiredEnvironment(environment, 'RAILWAY_TOKEN');
  const remotePath = remoteStoragePath(storageRoot, nodeEnvironment, storageKey);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'staging-floorplan-'));
  const source = join(temporaryDirectory, 'floorplan.png');
  const downloaded = join(temporaryDirectory, 'downloaded-floorplan.png');
  const target = railwayFileTargetArgs(environment);
  try {
    await writeFile(source, image, { mode: 0o600 });
    await executor.capture(
      'pnpm',
      [
        'dlx',
        '@railway/cli@5.30.4',
        'service',
        'files',
        ...target,
        'upload',
        source,
        remotePath,
        '--overwrite',
        '--json'
      ],
      { cwd: resolve(__dirname, '../../..'), env: environment, timeoutMs: 120_000 }
    );
    await executor.capture(
      'pnpm',
      [
        'dlx',
        '@railway/cli@5.30.4',
        'service',
        'files',
        ...target,
        'download',
        remotePath,
        downloaded,
        '--overwrite',
        '--json'
      ],
      { cwd: resolve(__dirname, '../../..'), env: environment, timeoutMs: 120_000 }
    );
    const remoteBytes = await readFile(downloaded);
    await assertFloorplanBytes(remoteBytes, image);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function assertFloorplanBytes(actual: Buffer, expected: Buffer): Promise<void> {
  const metadata = await sharp(actual).metadata();
  const actualChecksum = createHash('sha256').update(actual).digest('hex');
  const expectedChecksum = createHash('sha256').update(expected).digest('hex');
  if (
    !actual.length ||
    metadata.format !== 'png' ||
    actualChecksum !== expectedChecksum ||
    actual.length !== expected.length
  ) {
    throw new Error('Remote staging floorplan failed checksum, MIME or size verification.');
  }
}

async function seedFloorplanDatabase(
  prisma: PrismaService,
  storageKey: string,
  sizeBytes: number,
  checksumSha256: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const associatedAt = new Date();
    const existingAsset = await tx.fileAsset.findUnique({ where: { id: ids.floorplanAsset } });
    if (!existingAsset) {
      await tx.fileAsset.create({
        data: {
          id: ids.floorplanAsset,
          clientId: ids.plannerClient,
          eventId: ids.activeEvent,
          ownerType: FileAssetOwnerType.FLOORPLAN,
          ownerId: ids.floorplan,
          associatedAt,
          fileType: FileAssetType.FLOORPLAN_IMAGE,
          storageProvider: StorageProvider.LOCAL,
          storageKey,
          originalName: 'staging-floorplan.png',
          mimeType: 'image/png',
          sizeBytes,
          checksumSha256,
          width: 640,
          height: 480,
          createdByUserId: ids.planner,
          status: FileAssetStatus.READY
        }
      });
    } else {
      if (existingAsset.ownerId && existingAsset.ownerId !== ids.floorplan) {
        throw new Error('Staging floorplan FileAsset is associated with an unexpected owner.');
      }
      if (
        existingAsset.storageKey !== storageKey ||
        existingAsset.sizeBytes !== sizeBytes ||
        existingAsset.checksumSha256 !== checksumSha256
      ) {
        throw new Error('Staging floorplan FileAsset metadata differs from the verified remote bytes.');
      }
      await tx.fileAsset.update({
        where: { id: ids.floorplanAsset },
        data: {
          ...(existingAsset.ownerId ? {} : { ownerId: ids.floorplan, associatedAt }),
          status: FileAssetStatus.READY,
          deletedAt: null
        }
      });
    }
    await tx.floorplan.upsert({
      where: { id: ids.floorplan },
      create: { id: ids.floorplan, eventId: ids.activeEvent, imageAssetId: ids.floorplanAsset },
      update: { imageAssetId: ids.floorplanAsset, deletedAt: null }
    });
    await upsertShape(tx, ids.circleTable, FloorplanShapeKind.TABLE, FloorplanGeometry.CIRCLE, 'Mesa circular', 8, 0.1);
    await upsertShape(
      tx,
      ids.rectangleTable,
      FloorplanShapeKind.TABLE,
      FloorplanGeometry.RECTANGLE,
      'Mesa rectangular',
      8,
      0.45
    );
    await upsertShape(
      tx,
      ids.decorativeZone,
      FloorplanShapeKind.DECORATIVE_ZONE,
      FloorplanGeometry.RECTANGLE,
      'Zona decorativa',
      0,
      0.75
    );
  });
}

export function assertAuthoritativeScannerProjection(projection: Awaited<ReturnType<ScannerService['scan']>>): void {
  if (projection.status !== 'AVAILABLE' || projection.pendingCount < 2) {
    throw new Error('Staging Scanner projection must expose at least two available assistants.');
  }
  if (projection.pendingAssistants.length !== projection.pendingCount) {
    throw new Error('Staging Scanner pending projection count is inconsistent.');
  }
  if (projection.confirmedCount !== 3 || projection.pendingAssistants.some(({ table }) => !table)) {
    throw new Error('Staging Scanner family fixture is not fully confirmed and seated.');
  }
  if (/phone|telefono|teléfono/iu.test(JSON.stringify(projection))) {
    throw new Error('Staging Scanner projection exposed a phone field.');
  }
}

async function verifyScannerFixtures(scanner: ScannerService, artifact: SeedArtifact): Promise<void> {
  const first = await scanner.checkIn(
    artifact.staffToken,
    'staging-demo-individual-checkin',
    { invitationId: ids.individualInvitation, assistantIds: [ids.individualAssistant] },
    'staging-demo-seed-checkin'
  );
  const replay = await scanner.checkIn(
    artifact.staffToken,
    'staging-demo-individual-checkin',
    { invitationId: ids.individualInvitation, assistantIds: [ids.individualAssistant] },
    'staging-demo-seed-checkin-replay'
  );
  if (JSON.stringify(first) !== JSON.stringify(replay)) {
    throw new Error('Staging CheckIn idempotent replay did not return the persisted contractual snapshot.');
  }
  const projection = await scanner.scan(artifact.staffToken, { qrToken: artifact.familyQrToken });
  assertAuthoritativeScannerProjection(projection);
}

async function verifyRemoteFloorplanApi(
  environment: NodeJS.ProcessEnv,
  staffToken: string,
  expectedChecksum: string
): Promise<void> {
  const api = safeHttpsUrl(environment, 'STAGING_API_BASE_URL', '/api/v1');
  const response = await fetch(new URL(`${api.href}/scanner/${encodeURIComponent(staffToken)}/floorplan/content`));
  const bytes = Buffer.from(await response.arrayBuffer());
  if (
    response.status !== 200 ||
    response.headers.get('content-type')?.split(';', 1)[0] !== 'image/png' ||
    bytes.length === 0 ||
    createHash('sha256').update(bytes).digest('hex') !== expectedChecksum
  ) {
    throw new Error('Staging API could not serve the verified remote floorplan asset.');
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
  prisma: PrismaService | Transaction,
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
        ? [ids.individualAssistant, ids.availableIndividualAssistant]
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

if (require.main === module) {
  void seedStaging().catch((error: unknown) => {
    process.stderr.write(`${safeFailure('staging_seed_failed', error)}\n`);
    process.exitCode = 1;
  });
}
