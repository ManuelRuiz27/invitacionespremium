import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { hashPassword } from '../src/auth/password-hasher';
import { PrismaService } from '../src/common/database/prisma.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { EventsService } from '../src/events/events.service';
import { FileStorage } from '../src/file-assets/file-storage';
import {
  AssistantResponseStatus,
  ClientOperatingProfile,
  ClientStatus,
  ClientType,
  EventSocialType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  FloorplanGeometry,
  FloorplanSeatingMode,
  FloorplanShapeKind,
  HotspotAction,
  HotspotVisualOwnerType,
  InvitationDesignType,
  InvitationMode,
  InvitationResponseStatus,
  ServiceCode,
  StorageProvider,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { ScannerService } from '../src/scanner/scanner.service';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';

export const MANAGED_DEMO_IDS = {
  client: '15000000-0000-4000-8000-000000000001',
  admin: '15000000-0000-4000-8000-000000000002',
  planner: '15000000-0000-4000-8000-000000000003',
  service: '15000000-0000-4000-8000-000000000004',
  event: '15000000-0000-4000-8000-000000000005',
  flyerInitialAsset: '15000000-0000-4000-8000-000000000010',
  flyerQrAsset: '15000000-0000-4000-8000-000000000011',
  design: '15000000-0000-4000-8000-000000000012',
  floorplanAsset: '15000000-0000-4000-8000-000000000013',
  floorplan: '15000000-0000-4000-8000-000000000014',
  tableElena: '15000000-0000-4000-8000-000000000015',
  tableMateo: '15000000-0000-4000-8000-000000000016',
  decorativeZone: '15000000-0000-4000-8000-000000000017',
  familyGroup: '15000000-0000-4000-8000-000000000020',
  friendsGroup: '15000000-0000-4000-8000-000000000021',
  individualContact: '15000000-0000-4000-8000-000000000030',
  individualInvitation: '15000000-0000-4000-8000-000000000031',
  individualPrimary: '15000000-0000-4000-8000-000000000032',
  familyContact: '15000000-0000-4000-8000-000000000033',
  familyInvitation: '15000000-0000-4000-8000-000000000034',
  familyPrimary: '15000000-0000-4000-8000-000000000035',
  familyAssistantOne: '15000000-0000-4000-8000-000000000036',
  familyAssistantTwo: '15000000-0000-4000-8000-000000000037',
  pendingContact: '15000000-0000-4000-8000-000000000038',
  pendingInvitation: '15000000-0000-4000-8000-000000000039',
  pendingPrimary: '15000000-0000-4000-8000-00000000003a',
  rejectedContact: '15000000-0000-4000-8000-00000000003b',
  rejectedInvitation: '15000000-0000-4000-8000-00000000003c',
  rejectedPrimary: '15000000-0000-4000-8000-00000000003d',
  staff: '15000000-0000-4000-8000-000000000040',
  activationOperation: '15000000-0000-4000-8000-000000000041',
  checkInOperation: '15000000-0000-4000-8000-000000000042'
} as const;

const ACTIVATION_KEY = 'managed-demo-elena-mateo-activation-v1';
const CHECK_IN_KEY = 'managed-demo-elena-mateo-check-in-v1';
const EVENT_DATE = new Date('2035-10-18T23:00:00.000Z');

interface ManagedDemoArtifact {
  version: 1;
  users: {
    platformAdmin: { email: string; password: string };
    planner: { email: string; password: string };
  };
  staffToken: string;
  eventId: string;
  invitationLinks: Record<'individual' | 'family' | 'pending' | 'rejected', string>;
  qrTokens: Record<'individual' | 'family', string>;
}

export interface ManagedDemoSummary {
  eventId: string;
  status: EventStatus;
  contacts: number;
  invitations: number;
  assistants: number;
  tables: number;
  seats: number;
  activeCheckIns: number;
  scannerPending: number;
}

export function assertManagedDemoEnvironment(environment: NodeJS.ProcessEnv): void {
  if (environment.NODE_ENV === 'production') {
    throw new Error('Managed demo seed is disabled in production.');
  }
}

export async function seedManagedDemo(
  environment: NodeJS.ProcessEnv = process.env,
  createApplication: () => Promise<INestApplicationContext> = () =>
    NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] })
): Promise<ManagedDemoSummary> {
  loadEnvironmentFiles();
  assertManagedDemoEnvironment(environment);
  const artifactPath = resolve(environment.MANAGED_DEMO_ARTIFACT_PATH ?? 'var/managed-demo/credentials.json');
  const artifact = await loadOrCreateArtifact(artifactPath);
  const app = await createApplication();
  try {
    const prisma = app.get(PrismaService);
    const storage = app.get(FileStorage);
    const staffTokens = app.get(StaffTokenTechnicalService);
    const invitationTokens = app.get(InvitationTokenService);
    const events = app.get(EventsService);
    const scanner = app.get(ScannerService);
    const generatedStaff = {
      rawToken: artifact.staffToken,
      digestSha256: staffTokens.digest(artifact.staffToken),
      version: 1
    };
    const images = await createImages();
    await Promise.all(images.map(({ storageKey, bytes }) => storage.write({ storageKey, bytes })));

    const existing = await prisma.event.findUnique({ where: { id: MANAGED_DEMO_IDS.event } });
    await prisma.$transaction(async (tx) => {
      const flyerService = await tx.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { id: MANAGED_DEMO_IDS.service, code: ServiceCode.FLYER, isActive: true },
        update: { isActive: true }
      });
      await tx.client.upsert({
        where: { id: MANAGED_DEMO_IDS.client },
        create: {
          id: MANAGED_DEMO_IDS.client,
          type: ClientType.PLANNER,
          operatingProfile: ClientOperatingProfile.MANAGED,
          status: ClientStatus.ACTIVE,
          name: '[DEMO] Planner Elena & Mateo'
        },
        update: {
          type: ClientType.PLANNER,
          operatingProfile: ClientOperatingProfile.MANAGED,
          status: ClientStatus.ACTIVE,
          name: '[DEMO] Planner Elena & Mateo',
          deletedAt: null
        }
      });
      await upsertUser(tx, MANAGED_DEMO_IDS.admin, artifact.users.platformAdmin, UserRole.PLATFORM_ADMIN, null);
      await upsertUser(
        tx,
        MANAGED_DEMO_IDS.planner,
        artifact.users.planner,
        UserRole.INDEPENDENT_PLANNER,
        MANAGED_DEMO_IDS.client
      );
      if (existing?.status === EventStatus.ACTIVE) return;
      if (existing && existing.activationIdempotencyKey !== null) {
        throw new Error('Managed demo Event has an incompatible activation snapshot.');
      }
      await tx.event.upsert({
        where: { id: MANAGED_DEMO_IDS.event },
        create: {
          id: MANAGED_DEMO_IDS.event,
          clientId: MANAGED_DEMO_IDS.client,
          createdByUserId: MANAGED_DEMO_IDS.admin,
          assignedPlannerUserId: MANAGED_DEMO_IDS.planner,
          serviceId: flyerService.id,
          name: 'Boda de Elena & Mateo',
          socialType: EventSocialType.WEDDING,
          status: EventStatus.CONFIGURED,
          eventDateTime: EVENT_DATE,
          timeZone: 'America/Mexico_City',
          capacity: 60,
          confirmationEnabled: true,
          locationUrl: 'https://example.invalid/demo/ubicacion',
          giftRegistryUrl: 'https://example.invalid/demo/mesa-regalos',
          floorplanEnabled: true
        },
        update: {
          assignedPlannerUserId: MANAGED_DEMO_IDS.planner,
          serviceId: flyerService.id,
          name: 'Boda de Elena & Mateo',
          socialType: EventSocialType.WEDDING,
          eventDateTime: EVENT_DATE,
          timeZone: 'America/Mexico_City',
          capacity: 60,
          confirmationEnabled: true,
          locationUrl: 'https://example.invalid/demo/ubicacion',
          giftRegistryUrl: 'https://example.invalid/demo/mesa-regalos',
          floorplanEnabled: true,
          deletedAt: null
        }
      });
      await seedDesign(tx, images);
      await seedGuests(tx);
      await seedFloorplan(tx, images);
    });

    const principal: AuthPrincipal = {
      userId: MANAGED_DEMO_IDS.admin,
      sessionId: randomUUID(),
      email: artifact.users.platformAdmin.email,
      role: UserRole.PLATFORM_ADMIN,
      clientId: null,
      clientType: null,
      clientOperatingProfile: null,
      clientStatus: null
    };
    await events.activateManagedAdmin(
      MANAGED_DEMO_IDS.client,
      MANAGED_DEMO_IDS.event,
      ACTIVATION_KEY,
      principal,
      MANAGED_DEMO_IDS.activationOperation
    );
    await prisma.staffToken.upsert({
      where: { id: MANAGED_DEMO_IDS.staff },
      create: {
        id: MANAGED_DEMO_IDS.staff,
        eventId: MANAGED_DEMO_IDS.event,
        alias: 'Acceso principal',
        tokenDigestSha256: generatedStaff.digestSha256,
        tokenVersion: generatedStaff.version,
        createdByUserId: MANAGED_DEMO_IDS.planner
      },
      update: {
        alias: 'Acceso principal',
        tokenDigestSha256: generatedStaff.digestSha256,
        tokenVersion: generatedStaff.version,
        expiredAt: null
      }
    });
    await scanner.checkIn(
      artifact.staffToken,
      CHECK_IN_KEY,
      { invitationId: MANAGED_DEMO_IDS.individualInvitation, assistantIds: [MANAGED_DEMO_IDS.individualPrimary] },
      MANAGED_DEMO_IDS.checkInOperation
    );

    const invitations = await prisma.invitation.findMany({
      where: { eventId: MANAGED_DEMO_IDS.event, deletedAt: null },
      select: { id: true, invitationTokenNonce: true, qrTokenNonce: true }
    });
    const invitationById = new Map(invitations.map((invitation) => [invitation.id, invitation]));
    const tokenFor = (id: string, purpose: 'INVITATION' | 'QR') => {
      const invitation = invitationById.get(id);
      if (!invitation) throw new Error(`Managed demo Invitation ${id} is missing.`);
      const nonce = purpose === 'INVITATION' ? invitation.invitationTokenNonce : invitation.qrTokenNonce;
      return invitationTokens.issue(purpose, invitation.id, nonce);
    };
    artifact.invitationLinks = {
      individual: invitationTokens.invitationLink(
        MANAGED_DEMO_IDS.individualInvitation,
        invitationById.get(MANAGED_DEMO_IDS.individualInvitation)!.invitationTokenNonce
      ),
      family: invitationTokens.invitationLink(
        MANAGED_DEMO_IDS.familyInvitation,
        invitationById.get(MANAGED_DEMO_IDS.familyInvitation)!.invitationTokenNonce
      ),
      pending: invitationTokens.invitationLink(
        MANAGED_DEMO_IDS.pendingInvitation,
        invitationById.get(MANAGED_DEMO_IDS.pendingInvitation)!.invitationTokenNonce
      ),
      rejected: invitationTokens.invitationLink(
        MANAGED_DEMO_IDS.rejectedInvitation,
        invitationById.get(MANAGED_DEMO_IDS.rejectedInvitation)!.invitationTokenNonce
      )
    };
    artifact.qrTokens = {
      individual: tokenFor(MANAGED_DEMO_IDS.individualInvitation, 'QR'),
      family: tokenFor(MANAGED_DEMO_IDS.familyInvitation, 'QR')
    };
    const scannerProjection = await scanner.scan(artifact.staffToken, { qrToken: artifact.qrTokens.family });
    if (scannerProjection.status !== 'AVAILABLE' || scannerProjection.pendingCount !== 3) {
      throw new Error('Managed demo Scanner projection is not ready for the MG-05 walkthrough.');
    }
    await writeArtifact(artifactPath, artifact);
    return summarize(prisma, scannerProjection.pendingCount);
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
): Promise<void> {
  const passwordHash = await hashPassword(credentials.password);
  await tx.user.upsert({
    where: { id },
    create: { id, email: credentials.email, passwordHash, role, clientId },
    update: { email: credentials.email, passwordHash, role, clientId, deletedAt: null }
  });
}

interface DemoImage {
  id: string;
  storageKey: string;
  bytes: Buffer;
  fileType: FileAssetType;
  ownerType: FileAssetOwnerType;
  originalName: string;
  width: number;
  height: number;
}

async function createImages(): Promise<DemoImage[]> {
  const specs = [
    {
      id: MANAGED_DEMO_IDS.flyerInitialAsset,
      fileType: FileAssetType.FLYER_INITIAL_IMAGE,
      ownerType: FileAssetOwnerType.FLYER,
      originalName: 'elena-mateo-portada.png',
      width: 1200,
      height: 1600,
      title: 'Elena &amp; Mateo',
      subtitle: '18 de octubre de 2035'
    },
    {
      id: MANAGED_DEMO_IDS.flyerQrAsset,
      fileType: FileAssetType.FLYER_QR_IMAGE,
      ownerType: FileAssetOwnerType.FLYER,
      originalName: 'elena-mateo-invitacion.png',
      width: 1200,
      height: 1600,
      title: 'Nuestra boda',
      subtitle: 'Confirma tu asistencia'
    },
    {
      id: MANAGED_DEMO_IDS.floorplanAsset,
      fileType: FileAssetType.FLOORPLAN_IMAGE,
      ownerType: FileAssetOwnerType.FLOORPLAN,
      originalName: 'elena-mateo-croquis.png',
      width: 1200,
      height: 800,
      title: 'Croquis del salón',
      subtitle: 'Mesas Elena y Mateo'
    }
  ] as const;
  return Promise.all(
    specs.map(async (spec) => {
      const svg = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}"><rect width="100%" height="100%" fill="#f4eee8"/><rect x="6%" y="6%" width="88%" height="88%" rx="40" fill="none" stroke="#896b57" stroke-width="8"/><text x="50%" y="45%" text-anchor="middle" font-family="serif" font-size="72" fill="#4b382f">${spec.title}</text><text x="50%" y="55%" text-anchor="middle" font-family="sans-serif" font-size="34" fill="#896b57">${spec.subtitle}</text></svg>`,
        'utf8'
      );
      const bytes = await sharp(svg).png().toBuffer();
      return { ...spec, storageKey: createHash('sha256').update(bytes).digest('hex'), bytes };
    })
  );
}

async function seedDesign(tx: Transaction, images: DemoImage[]): Promise<void> {
  const associatedAt = new Date('2026-09-16T12:00:00.000Z');
  for (const image of images) {
    const ownerId =
      image.ownerType === FileAssetOwnerType.FLOORPLAN ? MANAGED_DEMO_IDS.floorplan : MANAGED_DEMO_IDS.design;
    await tx.fileAsset.upsert({
      where: { id: image.id },
      create: {
        id: image.id,
        clientId: MANAGED_DEMO_IDS.client,
        eventId: MANAGED_DEMO_IDS.event,
        ownerType: image.ownerType,
        ownerId,
        fileType: image.fileType,
        storageProvider: StorageProvider.LOCAL,
        storageKey: image.storageKey,
        originalName: image.originalName,
        mimeType: 'image/png',
        sizeBytes: image.bytes.length,
        checksumSha256: image.storageKey,
        width: image.width,
        height: image.height,
        createdByUserId: MANAGED_DEMO_IDS.admin,
        status: FileAssetStatus.READY,
        associatedAt
      },
      update: {
        ownerId,
        storageKey: image.storageKey,
        sizeBytes: image.bytes.length,
        checksumSha256: image.storageKey,
        status: FileAssetStatus.READY,
        associatedAt,
        deletedAt: null
      }
    });
  }
  await tx.invitationDesign.upsert({
    where: { id: MANAGED_DEMO_IDS.design },
    create: {
      id: MANAGED_DEMO_IDS.design,
      eventId: MANAGED_DEMO_IDS.event,
      type: InvitationDesignType.FLYER,
      flyerInitialAssetId: MANAGED_DEMO_IDS.flyerInitialAsset,
      flyerQrAssetId: MANAGED_DEMO_IDS.flyerQrAsset
    },
    update: {
      type: InvitationDesignType.FLYER,
      flyerInitialAssetId: MANAGED_DEMO_IDS.flyerInitialAsset,
      flyerQrAssetId: MANAGED_DEMO_IDS.flyerQrAsset,
      deletedAt: null
    }
  });
  const actions = [HotspotAction.RSVP, HotspotAction.LOCATION, HotspotAction.GIFT_REGISTRY, HotspotAction.QR_AREA];
  const hotspotIds = [
    '15000000-0000-4000-8000-000000000018',
    '15000000-0000-4000-8000-000000000019',
    '15000000-0000-4000-8000-00000000001a',
    '15000000-0000-4000-8000-00000000001b'
  ];
  for (const [index, action] of actions.entries()) {
    const id = hotspotIds[index]!;
    await tx.hotspot.upsert({
      where: { id },
      create: {
        id,
        eventId: MANAGED_DEMO_IDS.event,
        designId: MANAGED_DEMO_IDS.design,
        visualOwnerType: HotspotVisualOwnerType.FLYER,
        action,
        x: 0.1 + index * 0.2,
        y: 0.75,
        width: 0.16,
        height: 0.1,
        priority: index
      },
      update: { action, priority: index, deletedAt: null }
    });
  }
}

async function seedGuests(tx: Transaction): Promise<void> {
  await tx.group.upsert({
    where: { id: MANAGED_DEMO_IDS.familyGroup },
    create: {
      id: MANAGED_DEMO_IDS.familyGroup,
      eventId: MANAGED_DEMO_IDS.event,
      name: 'Familia',
      normalizedName: 'familia'
    },
    update: { name: 'Familia', normalizedName: 'familia' }
  });
  await tx.group.upsert({
    where: { id: MANAGED_DEMO_IDS.friendsGroup },
    create: {
      id: MANAGED_DEMO_IDS.friendsGroup,
      eventId: MANAGED_DEMO_IDS.event,
      name: 'Amistades',
      normalizedName: 'amistades'
    },
    update: { name: 'Amistades', normalizedName: 'amistades' }
  });
  await upsertInvitation(tx, {
    contactId: MANAGED_DEMO_IDS.individualContact,
    invitationId: MANAGED_DEMO_IDS.individualInvitation,
    groupId: MANAGED_DEMO_IDS.friendsGroup,
    contactName: 'Sofía Rivera',
    phone: '+525500000001',
    mode: InvitationMode.INDIVIDUAL,
    status: InvitationResponseStatus.CONFIRMED,
    assistants: [
      {
        id: MANAGED_DEMO_IDS.individualPrimary,
        name: 'Sofía Rivera',
        primary: true,
        status: AssistantResponseStatus.CONFIRMED
      }
    ]
  });
  await upsertInvitation(tx, {
    contactId: MANAGED_DEMO_IDS.familyContact,
    invitationId: MANAGED_DEMO_IDS.familyInvitation,
    groupId: MANAGED_DEMO_IDS.familyGroup,
    contactName: 'Familia Luna',
    phone: '+525500000002',
    mode: InvitationMode.FAMILY_NOMINAL,
    status: InvitationResponseStatus.CONFIRMED,
    assistants: [
      {
        id: MANAGED_DEMO_IDS.familyPrimary,
        name: 'Andrea Luna',
        primary: true,
        status: AssistantResponseStatus.CONFIRMED
      },
      {
        id: MANAGED_DEMO_IDS.familyAssistantOne,
        name: 'Bruno Luna',
        primary: false,
        status: AssistantResponseStatus.CONFIRMED
      },
      {
        id: MANAGED_DEMO_IDS.familyAssistantTwo,
        name: 'Clara Luna',
        primary: false,
        status: AssistantResponseStatus.CONFIRMED
      }
    ]
  });
  await upsertInvitation(tx, {
    contactId: MANAGED_DEMO_IDS.pendingContact,
    invitationId: MANAGED_DEMO_IDS.pendingInvitation,
    groupId: MANAGED_DEMO_IDS.friendsGroup,
    contactName: 'Diego Torres',
    phone: '+525500000003',
    mode: InvitationMode.INDIVIDUAL,
    status: InvitationResponseStatus.PENDING,
    assistants: [
      {
        id: MANAGED_DEMO_IDS.pendingPrimary,
        name: 'Diego Torres',
        primary: true,
        status: AssistantResponseStatus.PENDING
      }
    ]
  });
  await upsertInvitation(tx, {
    contactId: MANAGED_DEMO_IDS.rejectedContact,
    invitationId: MANAGED_DEMO_IDS.rejectedInvitation,
    groupId: MANAGED_DEMO_IDS.friendsGroup,
    contactName: 'Valeria Sol',
    phone: '+525500000004',
    mode: InvitationMode.INDIVIDUAL,
    status: InvitationResponseStatus.REJECTED,
    assistants: [
      {
        id: MANAGED_DEMO_IDS.rejectedPrimary,
        name: 'Valeria Sol',
        primary: true,
        status: AssistantResponseStatus.REJECTED
      }
    ]
  });
}

interface InvitationSeed {
  contactId: string;
  invitationId: string;
  groupId: string;
  contactName: string;
  phone: string;
  mode: InvitationMode;
  status: InvitationResponseStatus;
  assistants: Array<{ id: string; name: string; primary: boolean; status: AssistantResponseStatus }>;
}

async function upsertInvitation(tx: Transaction, input: InvitationSeed): Promise<void> {
  await tx.contact.upsert({
    where: { id: input.contactId },
    create: {
      id: input.contactId,
      eventId: MANAGED_DEMO_IDS.event,
      groupId: input.groupId,
      name: input.contactName,
      whatsappPhoneNormalized: input.phone
    },
    update: {
      groupId: input.groupId,
      name: input.contactName,
      whatsappPhoneNormalized: input.phone,
      deletedAt: null,
      anonymizedAt: null
    }
  });
  await tx.invitation.upsert({
    where: { id: input.invitationId },
    create: {
      id: input.invitationId,
      eventId: MANAGED_DEMO_IDS.event,
      contactId: input.contactId,
      mode: input.mode,
      responseStatus: input.status,
      additionalAssistantLimit: input.mode === InvitationMode.FAMILY_NOMINAL ? input.assistants.length - 1 : 0,
      invitationTokenNonce: nonce(`${input.invitationId}:invitation`),
      qrTokenNonce: nonce(`${input.invitationId}:qr`)
    },
    update: {
      mode: input.mode,
      responseStatus: input.status,
      additionalAssistantLimit: input.mode === InvitationMode.FAMILY_NOMINAL ? input.assistants.length - 1 : 0,
      cancelledAt: null,
      deletedAt: null
    }
  });
  for (const assistant of input.assistants) {
    await tx.assistant.upsert({
      where: { id: assistant.id },
      create: {
        id: assistant.id,
        eventId: MANAGED_DEMO_IDS.event,
        invitationId: input.invitationId,
        name: assistant.name,
        isPrimary: assistant.primary,
        responseStatus: assistant.status
      },
      update: {
        name: assistant.name,
        isPrimary: assistant.primary,
        responseStatus: assistant.status,
        deletedAt: null,
        anonymizedAt: null
      }
    });
  }
}

async function seedFloorplan(tx: Transaction, images: DemoImage[]): Promise<void> {
  const floorplanImage = images.find(({ id }) => id === MANAGED_DEMO_IDS.floorplanAsset)!;
  await tx.floorplan.upsert({
    where: { id: MANAGED_DEMO_IDS.floorplan },
    create: {
      id: MANAGED_DEMO_IDS.floorplan,
      eventId: MANAGED_DEMO_IDS.event,
      imageAssetId: floorplanImage.id,
      seatingMode: FloorplanSeatingMode.SEAT,
      lockedAt: new Date('2026-09-16T12:00:00.000Z'),
      lockedByUserId: MANAGED_DEMO_IDS.admin
    },
    update: {
      imageAssetId: floorplanImage.id,
      seatingMode: FloorplanSeatingMode.SEAT,
      lockedAt: new Date('2026-09-16T12:00:00.000Z'),
      lockedByUserId: MANAGED_DEMO_IDS.admin,
      deletedAt: null
    }
  });
  await upsertShape(
    tx,
    MANAGED_DEMO_IDS.tableElena,
    FloorplanShapeKind.TABLE,
    FloorplanGeometry.CIRCLE,
    'Mesa Elena',
    4,
    0.18,
    0.3
  );
  await upsertShape(
    tx,
    MANAGED_DEMO_IDS.tableMateo,
    FloorplanShapeKind.TABLE,
    FloorplanGeometry.RECTANGLE,
    'Mesa Mateo',
    4,
    0.62,
    0.3
  );
  await upsertShape(
    tx,
    MANAGED_DEMO_IDS.decorativeZone,
    FloorplanShapeKind.DECORATIVE_ZONE,
    FloorplanGeometry.RECTANGLE,
    'Pista',
    0,
    0.36,
    0.68
  );
  const seats = [
    ...seatDefinitions(MANAGED_DEMO_IDS.tableElena, 50, 0.18, 0.3),
    ...seatDefinitions(MANAGED_DEMO_IDS.tableMateo, 54, 0.62, 0.3)
  ];
  for (const seat of seats) {
    await tx.floorplanSeat.upsert({
      where: { id: seat.id },
      create: { ...seat, eventId: MANAGED_DEMO_IDS.event, floorplanId: MANAGED_DEMO_IDS.floorplan },
      update: {
        label: seat.label,
        normalizedLabel: seat.normalizedLabel,
        x: seat.x,
        y: seat.y,
        isBlocked: false,
        deletedAt: null
      }
    });
  }
  const assignments = [
    [MANAGED_DEMO_IDS.individualPrimary, MANAGED_DEMO_IDS.tableElena, seats[0]!.id],
    [MANAGED_DEMO_IDS.pendingPrimary, MANAGED_DEMO_IDS.tableElena, seats[1]!.id],
    [MANAGED_DEMO_IDS.rejectedPrimary, MANAGED_DEMO_IDS.tableElena, seats[2]!.id],
    [MANAGED_DEMO_IDS.familyPrimary, MANAGED_DEMO_IDS.tableMateo, seats[4]!.id],
    [MANAGED_DEMO_IDS.familyAssistantOne, MANAGED_DEMO_IDS.tableMateo, seats[5]!.id],
    [MANAGED_DEMO_IDS.familyAssistantTwo, MANAGED_DEMO_IDS.tableMateo, seats[6]!.id]
  ] as const;
  for (const [assistantId, floorplanShapeId, floorplanSeatId] of assignments) {
    await tx.assistant.update({ where: { id: assistantId }, data: { floorplanShapeId, floorplanSeatId } });
  }
}

async function upsertShape(
  tx: Transaction,
  id: string,
  kind: FloorplanShapeKind,
  geometry: FloorplanGeometry,
  name: string,
  capacity: number,
  x: number,
  y: number
): Promise<void> {
  const data = {
    floorplanId: MANAGED_DEMO_IDS.floorplan,
    eventId: MANAGED_DEMO_IDS.event,
    kind,
    geometry,
    name,
    normalizedName: name.toLocaleLowerCase('es-MX'),
    capacity,
    x,
    y,
    width: 0.2,
    height: 0.2,
    rotation: 0
  };
  await tx.floorplanShape.upsert({ where: { id }, create: { id, ...data }, update: { ...data, deletedAt: null } });
}

function seatDefinitions(tableId: string, start: number, centerX: number, centerY: number) {
  const offsets = [
    [-0.08, 0],
    [0.08, 0],
    [0, -0.08],
    [0, 0.08]
  ] as const;
  return offsets.map(([offsetX, offsetY], index) => ({
    id: `15000000-0000-4000-8000-0000000000${start + index}`,
    floorplanShapeId: tableId,
    label: `${tableId === MANAGED_DEMO_IDS.tableElena ? 'E' : 'M'}${index + 1}`,
    normalizedLabel: `${tableId === MANAGED_DEMO_IDS.tableElena ? 'e' : 'm'}${index + 1}`,
    x: centerX + offsetX,
    y: centerY + offsetY,
    isBlocked: false
  }));
}

function nonce(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

async function summarize(prisma: PrismaService, scannerPending: number): Promise<ManagedDemoSummary> {
  const event = await prisma.event.findUniqueOrThrow({ where: { id: MANAGED_DEMO_IDS.event } });
  const contacts = await prisma.contact.count({ where: { eventId: MANAGED_DEMO_IDS.event, deletedAt: null } });
  const invitations = await prisma.invitation.count({ where: { eventId: MANAGED_DEMO_IDS.event, deletedAt: null } });
  const assistants = await prisma.assistant.count({ where: { eventId: MANAGED_DEMO_IDS.event, deletedAt: null } });
  const tables = await prisma.floorplanShape.count({
    where: { eventId: MANAGED_DEMO_IDS.event, kind: FloorplanShapeKind.TABLE, deletedAt: null }
  });
  const seats = await prisma.floorplanSeat.count({ where: { eventId: MANAGED_DEMO_IDS.event, deletedAt: null } });
  const activeCheckIns = await prisma.checkIn.count({
    where: { eventId: MANAGED_DEMO_IDS.event, revertedAt: null }
  });
  return {
    eventId: event.id,
    status: event.status,
    contacts,
    invitations,
    assistants,
    tables,
    seats,
    activeCheckIns,
    scannerPending
  };
}

async function loadOrCreateArtifact(path: string): Promise<ManagedDemoArtifact> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as ManagedDemoArtifact;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const artifact: ManagedDemoArtifact = {
      version: 1,
      users: {
        platformAdmin: { email: 'managed-demo-admin@example.invalid', password: secret() },
        planner: { email: 'managed-demo-planner@example.invalid', password: secret() }
      },
      staffToken: `st1.${randomBytes(32).toString('base64url')}`,
      eventId: MANAGED_DEMO_IDS.event,
      invitationLinks: { individual: '', family: '', pending: '', rejected: '' },
      qrTokens: { individual: '', family: '' }
    };
    await writeArtifact(path, artifact);
    return artifact;
  }
}

async function writeArtifact(path: string, artifact: ManagedDemoArtifact): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(artifact, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, path);
}

function secret(): string {
  return randomBytes(24).toString('base64url');
}

if (require.main === module) {
  void seedManagedDemo()
    .then((summary) => process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown error';
      process.stderr.write(`${JSON.stringify({ code: 'managed_demo_seed_failed', message })}\n`);
      process.exitCode = 1;
    });
}
