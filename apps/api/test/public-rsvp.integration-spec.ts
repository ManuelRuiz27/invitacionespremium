import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { EVENT_DESTINATION_URL_CORPUS } from '../src/events/event-destination-url.corpus';
import { FileStorage } from '../src/file-assets/file-storage';
import {
  AssistantResponseStatus,
  AuditActorType,
  ClientType,
  EventStatus,
  FileAssetStatus,
  FileAssetType,
  InvitationResponseStatus,
  LedgerMovementType,
  ServiceCode,
  UserRole,
  type FileAsset
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { InvitationsService } from '../src/invitations/invitations.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { PublicRsvpService } from '../src/public-rsvp/public-rsvp.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';
const destinationFields = ['locationUrl', 'giftRegistryUrl'] as const;

describe('Public RSVP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: InvitationTokenService;
  let storage: FileStorage;
  let audit: AuditService;
  let rsvp: PublicRsvpService;
  let invitations: InvitationsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-public-rsvp-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(InvitationTokenService);
    storage = app.get(FileStorage);
    audit = app.get(AuditService);
    rsvp = app.get(PublicRsvpService);
    invitations = app.get(InvitationsService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('resolves the private view, reconciles nominal assistants idempotently, rejects and supports close/reopen override', async () => {
    const fixture = await createFixture({ capacity: 4, withDesign: true });
    const cookie = await login(fixture.email);
    const view = await publicGet(fixture.token).expect(200);
    expect(view.body).toMatchObject({
      status: 'AVAILABLE',
      event: { name: 'Evento RSVP', timeZone: 'America/Mexico_City' },
      invitation: { id: fixture.invitationId, responseStatus: 'PENDING' },
      confirmation: { open: true },
      designType: 'FLYER'
    });
    const serialized = JSON.stringify(view.body);
    for (const forbidden of ['clientId', 'contactId', 'storageKey', 'checksum', 'qrTokenNonce', '+5255']) {
      expect(serialized).not.toContain(forbidden);
    }

    const payload = { additionalAssistants: [{ name: 'Acompañante Uno' }, { name: 'Acompañante Uno' }] };
    const first = await publicPost(fixture.token, 'confirm', payload).expect(200);
    const repeated = await publicPost(fixture.token, 'confirm', payload).expect(200);
    expect(repeated.body).toEqual(first.body);
    expect(first.body).toMatchObject({ responseStatus: 'CONFIRMED' });
    expect(await prisma.assistant.count({ where: { invitationId: fixture.invitationId, deletedAt: null } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { resourceId: fixture.invitationId, action: 'RSVP_CONFIRM' } })).toBe(
      1
    );

    const [primary, extra] = first.body.assistants as Array<{ id: string; isPrimary: boolean }>;
    expect(primary?.isPrimary).toBe(true);
    await publicPatch(fixture.token, { additionalAssistants: [{ id: extra!.id, name: 'Nombre actualizado' }] })
      .expect(200)
      .expect(({ body }) => expect(body.assistants).toHaveLength(2));
    await publicPost(fixture.token, 'reject').expect(200);
    expect(
      await prisma.assistant.count({
        where: { invitationId: fixture.invitationId, deletedAt: null, responseStatus: AssistantResponseStatus.REJECTED }
      })
    ).toBe(2);

    const closed = await authPost(`/events/${fixture.eventId}/confirmation/close`, cookie).expect(200);
    const repeatedClose = await authPost(`/events/${fixture.eventId}/confirmation/close`, cookie).expect(200);
    expect(repeatedClose.body).toEqual(closed.body);
    await publicPost(fixture.token, 'confirm', { additionalAssistants: [] })
      .expect(409)
      .expect(({ body }) => {
        expect(body.code).toBe('RSVP_CLOSED');
        expect(body.message).toBe('La confirmación de asistencia ya fue cerrada. Contacta al organizador.');
      });
    await authPut(`/events/${fixture.eventId}/invitations/${fixture.invitationId}/confirmation`, cookie, {
      responseStatus: 'CONFIRMED',
      additionalAssistants: []
    }).expect(200);
    await authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie).expect(200);
    await publicPost(fixture.token, 'reject').expect(200);
    expect(await prisma.auditLog.count({ where: { actorType: AuditActorType.PUBLIC_TOKEN } })).toBeGreaterThan(0);
    const publicAudits = await prisma.auditLog.findMany({ where: { actorType: AuditActorType.PUBLIC_TOKEN } });
    expect(JSON.stringify(publicAudits)).not.toContain(fixture.token);
    expect(JSON.stringify(publicAudits)).not.toContain('Nombre actualizado');
  });

  it('serializes invitations competing for the final capacity place and never commits an over-capacity state', async () => {
    const fixture = await createFixture({ capacity: 1 });
    const second = await addInvitation(fixture.eventId, 'Segunda');
    const results = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockInvitationContext',
      2,
      () => publicPost(fixture.token, 'confirm', { additionalAssistants: [] }),
      () => publicPost(second.token, 'confirm', { additionalAssistants: [] })
    );
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(results.find(({ status }) => status === 409)?.body.code).toBe('RSVP_EVENT_CAPACITY_EXCEEDED');
    expect(
      await prisma.assistant.count({
        where: { eventId: fixture.eventId, deletedAt: null, responseStatus: AssistantResponseStatus.CONFIRMED }
      })
    ).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' } })).toBe(1);

    const sameInvitation = await runAuditContended(
      'RSVP_REJECT',
      rsvp,
      'lockInvitationContext',
      2,
      () => publicPost(fixture.token, 'reject'),
      () => publicPost(fixture.token, 'confirm', { additionalAssistants: [] })
    );
    expect(sameInvitation.map(({ status }) => status)).toEqual([200, 200]);
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(invitation.responseStatus).toBe(InvitationResponseStatus.CONFIRMED);
    expect(
      invitation.assistants.every(
        ({ responseStatus }) => responseStatus === (invitation.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_REJECT' } })).toBe(1);
  });

  it('serializes same-invitation, close, override, cancellation and asset races without mixed aggregates', async () => {
    const fixture = await createFixture({ capacity: 4, withDesign: true });
    const cookie = await login(fixture.email);
    const samePayload = { additionalAssistants: [{ name: 'Mismo acompañante' }] };
    const sameInvitation = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockInvitationContext',
      2,
      () => publicPost(fixture.token, 'confirm', samePayload),
      () => publicPost(fixture.token, 'confirm', samePayload)
    );
    expect(sameInvitation.map(({ status }) => status)).toEqual([200, 200]);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' } })).toBe(1);
    let stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(stored.responseStatus).toBe(InvitationResponseStatus.CONFIRMED);
    expect(stored.assistants).toHaveLength(2);
    expect(stored.assistants.every(({ responseStatus }) => responseStatus === AssistantResponseStatus.CONFIRMED)).toBe(
      true
    );
    const extraId = stored.assistants.find(({ isPrimary }) => !isPrimary)!.id;

    const sameIdUpdates = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockInvitationContext',
      2,
      () => publicPatch(fixture.token, { additionalAssistants: [{ id: extraId, name: 'Nombre primero' }] }),
      () => publicPatch(fixture.token, { additionalAssistants: [{ id: extraId, name: 'Nombre definitivo' }] })
    );
    expect(sameIdUpdates.map(({ status }) => status)).toEqual([200, 200]);
    expect(await prisma.assistant.count({ where: { invitationId: fixture.invitationId, deletedAt: null } })).toBe(2);
    expect((await prisma.assistant.findUniqueOrThrow({ where: { id: extraId } })).name).toBe('Nombre definitivo');
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' } })).toBe(3);

    await publicPost(fixture.token, 'reject').expect(200);
    const closeAgainstConfirm = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockOwnedEvent',
      1,
      () =>
        publicPost(fixture.token, 'confirm', {
          additionalAssistants: [{ id: extraId, name: 'Nombre definitivo' }]
        }),
      () => authPost(`/events/${fixture.eventId}/confirmation/close`, cookie)
    );
    expect(closeAgainstConfirm.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_CONFIRMATION_CLOSE' } })
    ).toBe(1);
    const closedEvent = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    expect(closedEvent.confirmationClosedAt).not.toBeNull();
    expect(closedEvent.confirmationClosedByUserId).toBe(fixture.userId);
    stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(stored.responseStatus).toBe(InvitationResponseStatus.CONFIRMED);
    expect(stored.assistants.every(({ responseStatus }) => responseStatus === AssistantResponseStatus.CONFIRMED)).toBe(
      true
    );

    await authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie).expect(200);
    const closeAgainstReopen = await runAuditContended(
      'EVENT_CONFIRMATION_CLOSE',
      rsvp,
      'lockOwnedEvent',
      2,
      () => authPost(`/events/${fixture.eventId}/confirmation/close`, cookie),
      () => authPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie)
    );
    expect(closeAgainstReopen.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_CONFIRMATION_CLOSE' } })
    ).toBe(2);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'EVENT_CONFIRMATION_REOPEN' } })
    ).toBe(2);
    const closureResult = await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } });
    expect(closureResult.confirmationClosedAt).toBeNull();
    expect(closureResult.confirmationClosedByUserId).toBeNull();

    const overrideAgainstPublic = await runAuditContended(
      'RSVP_OPERATIONAL_OVERRIDE',
      rsvp,
      'lockInvitationContext',
      1,
      () =>
        authPut(`/events/${fixture.eventId}/invitations/${fixture.invitationId}/confirmation`, cookie, {
          responseStatus: 'REJECTED',
          additionalAssistants: []
        }),
      () =>
        publicPost(fixture.token, 'confirm', {
          additionalAssistants: [{ id: extraId, name: 'Nombre definitivo' }]
        })
    );
    expect(overrideAgainstPublic.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_OPERATIONAL_OVERRIDE' } })
    ).toBe(1);
    stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(stored.responseStatus).toBe(InvitationResponseStatus.CONFIRMED);
    expect(stored.assistants).toHaveLength(2);
    expect(
      stored.assistants.every(
        ({ responseStatus }) => responseStatus === (stored.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);

    const asset = await prisma.fileAsset.findFirstOrThrow({
      where: { eventId: fixture.eventId, fileType: FileAssetType.FLYER_INITIAL_IMAGE }
    });
    const assetAgainstCancel = await runStorageContended(
      invitations,
      'lockOwnedEvent',
      1,
      () => request(app.getHttpServer()).get(`/api/v1/public/invitations/${fixture.token}/assets/${asset.id}/content`),
      () => authCancel(fixture.eventId, fixture.invitationId, cookie)
    );
    expect(assetAgainstCancel[0].status).toBe(200);
    expect(assetAgainstCancel[1].status).toBe(200);
    expect(
      await prisma.auditLog.count({
        where: { eventId: fixture.eventId, action: 'INVITATION_CANCEL', resourceId: fixture.invitationId }
      })
    ).toBe(1);
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${asset.id}/content`)
      .expect(404);
    await publicPost(fixture.token, 'confirm', {
      additionalAssistants: [{ id: extraId, name: 'Nombre definitivo' }]
    })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('RSVP_INVITATION_CANCELLED'));
  });

  it('serializes modification/close, reduction/increase and confirmation/cancellation races', async () => {
    const modification = await createFixture({ capacity: 4 });
    const modificationCookie = await login(modification.email);
    const confirmed = await publicPost(modification.token, 'confirm', {
      additionalAssistants: [{ name: 'Extra inicial' }]
    }).expect(200);
    const extraId = (confirmed.body.assistants as Array<{ id: string; isPrimary: boolean }>).find(
      ({ isPrimary }) => !isPrimary
    )!.id;

    const modificationAgainstClose = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockOwnedEvent',
      1,
      () => publicPatch(modification.token, { additionalAssistants: [] }),
      () => authPost(`/events/${modification.eventId}/confirmation/close`, modificationCookie)
    );
    expect(modificationAgainstClose.map(({ status }) => status)).toEqual([200, 200]);
    expect(
      await prisma.auditLog.count({ where: { eventId: modification.eventId, action: 'EVENT_CONFIRMATION_CLOSE' } })
    ).toBe(1);
    const closedEvent = await prisma.event.findUniqueOrThrow({ where: { id: modification.eventId } });
    expect(closedEvent.confirmationClosedAt).not.toBeNull();
    expect(closedEvent.confirmationClosedByUserId).toBe(modification.userId);
    const afterCloseRace = await prisma.invitation.findUniqueOrThrow({
      where: { id: modification.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(
      afterCloseRace.assistants.every(
        ({ responseStatus }) => responseStatus === (afterCloseRace.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);

    await authPost(`/events/${modification.eventId}/confirmation/reopen`, modificationCookie).expect(200);
    if (!(await prisma.assistant.findFirst({ where: { id: extraId, deletedAt: null } }))) {
      const restored = await publicPost(modification.token, 'confirm', {
        additionalAssistants: [{ name: 'Extra para carrera' }]
      }).expect(200);
      const activeExtra = (restored.body.assistants as Array<{ id: string; isPrimary: boolean }>).find(
        ({ isPrimary }) => !isPrimary
      )!.id;
      await runReductionAgainstIncrease(modification, activeExtra);
    } else {
      await runReductionAgainstIncrease(modification, extraId);
    }

    const cancellation = await createFixture({ capacity: 2 });
    const cancellationCookie = await login(cancellation.email);
    const confirmationAgainstCancellation = await runAuditContended(
      'RSVP_CONFIRM',
      invitations,
      'lockOwnedEvent',
      1,
      () => publicPost(cancellation.token, 'confirm', { additionalAssistants: [] }),
      () => authCancel(cancellation.eventId, cancellation.invitationId, cancellationCookie)
    );
    expect(confirmationAgainstCancellation[0].status).toBe(200);
    expect(confirmationAgainstCancellation[1].status).toBe(200);
    const cancelled = await prisma.invitation.findUniqueOrThrow({
      where: { id: cancellation.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(cancelled.cancelledAt).not.toBeNull();
    expect(
      await prisma.auditLog.count({
        where: {
          eventId: cancellation.eventId,
          action: 'RSVP_CONFIRM',
          resourceId: cancellation.invitationId
        }
      })
    ).toBe(1);
    expect(
      await prisma.auditLog.count({
        where: {
          eventId: cancellation.eventId,
          action: 'INVITATION_CANCEL',
          resourceId: cancellation.invitationId
        }
      })
    ).toBe(1);
    expect(
      cancelled.assistants.every(
        ({ responseStatus }) => responseStatus === (cancelled.responseStatus as unknown as AssistantResponseStatus)
      )
    ).toBe(true);
  });

  it('serves only a currently referenced READY asset with private headers and hides cross-event assets', async () => {
    const fixture = await createFixture({ capacity: 2, withDesign: true });
    const view = await publicGet(fixture.token).expect(200);
    const flyerPaths = [
      view.body.design.flyerInitialAsset.contentPath,
      view.body.design.flyerQrAsset.contentPath
    ] as string[];
    expect(flyerPaths).toHaveLength(2);
    expect(flyerPaths.every((path) => path.includes(encodeURIComponent(fixture.token)) && !path.includes('{'))).toBe(
      true
    );
    const content = await request(app.getHttpServer()).get(flyerPaths[0]!).expect(200);
    await request(app.getHttpServer()).get(flyerPaths[1]!).expect(200).expect(Buffer.from('public-rsvp-image'));
    expect(content.headers).toMatchObject({
      'content-type': 'image/png',
      'content-disposition': 'inline',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer'
    });
    expect(content.headers.etag).toMatch(/^"sha256-/u);
    expect(content.body).toEqual(Buffer.from('public-rsvp-image'));

    const flipbook = await createFixture({ capacity: 2, serviceCode: ServiceCode.FLIPBOOK });
    await addFlipbookDesign(flipbook, flipbook.eventId);
    const flipbookView = await publicGet(flipbook.token).expect(200);
    expect(flipbookView.body.designType).toBe('FLIPBOOK');
    const pagePaths = (flipbookView.body.design.pages as Array<{ asset: { contentPath: string } }>).map(
      ({ asset }) => asset.contentPath
    );
    expect(pagePaths).toHaveLength(2);
    for (const path of pagePaths) {
      expect(path).toContain(encodeURIComponent(flipbook.token));
      expect(path).not.toContain('{');
      await request(app.getHttpServer()).get(path).expect(200).expect(Buffer.from('public-rsvp-flipbook'));
    }

    const other = await createFixture({ capacity: 2, withDesign: true });
    const otherAsset = await prisma.fileAsset.findFirstOrThrow({ where: { eventId: other.eventId } });
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${otherAsset.id}/content`)
      .expect(404);
    await request(app.getHttpServer())
      .get(pagePaths[0]!.replace(encodeURIComponent(flipbook.token), fixture.token))
      .expect(404);
    const hidden = await prisma.fileAsset.create({
      data: {
        clientId: fixture.clientId,
        eventId: fixture.eventId,
        ownerType: 'FLYER',
        fileType: FileAssetType.FLYER_INITIAL_IMAGE,
        storageKey: storage.generateKey(),
        originalName: 'hidden.png',
        mimeType: 'image/png',
        sizeBytes: 1,
        checksumSha256: randomBytes(32).toString('hex'),
        width: 1,
        height: 1,
        createdByUserId: fixture.userId,
        status: FileAssetStatus.HIDDEN
      }
    });
    await request(app.getHttpServer())
      .get(`/api/v1/public/invitations/${fixture.token}/assets/${hidden.id}/content`)
      .expect(404);
  });

  it('applies the shared destination URL corpus to DTO/API and direct PostgreSQL INSERT/UPDATE', async () => {
    const owner = await createClientUser();
    const cookie = await login(owner.email);
    const baseline = await prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        locationUrl: 'https://example.com/maps',
        giftRegistryUrl: 'https://example.com/mesa'
      }
    });

    for (const testCase of EVENT_DESTINATION_URL_CORPUS) {
      for (const field of destinationFields) {
        const context = `${testCase.name}: ${field}`;
        const apiResponse = await request(app.getHttpServer())
          .post('/api/v1/events')
          .set('Origin', origin)
          .set('Cookie', cookie)
          .send({ [field]: testCase.url });
        expect(apiResponse.status, `${context}: API`).toBe(testCase.accepted ? 201 : 400);
        if (testCase.accepted) {
          expect(apiResponse.body[field], `${context}: API normalization`).toBe(new URL(testCase.url).href);
          await expect(insertDestinationDirect(owner.clientId, owner.userId, field, testCase.url)).resolves.toBe(1);
        } else {
          expect(apiResponse.body.code, `${context}: API error`).toBe('VALIDATION_ERROR');
          await expect(insertDestinationDirect(owner.clientId, owner.userId, field, testCase.url)).rejects.toThrow();
        }

        const before = await prisma.event.findUniqueOrThrow({ where: { id: baseline.id } });
        if (testCase.accepted) {
          await expect(updateDestinationDirect(baseline.id, field, testCase.url)).resolves.toBe(1);
          expect((await prisma.event.findUniqueOrThrow({ where: { id: baseline.id } }))[field]).toBe(testCase.url);
        } else {
          await expect(updateDestinationDirect(baseline.id, field, testCase.url)).rejects.toThrow();
          expect(await prisma.event.findUniqueOrThrow({ where: { id: baseline.id } })).toEqual(before);
        }
      }
    }
  });

  it('rolls back confirm, reject, close and override when transactional audit persistence fails', async () => {
    const confirmFixture = await createFixture({ capacity: 2 });
    await withAuditFailure('RSVP_CONFIRM', () =>
      publicPost(confirmFixture.token, 'confirm', { additionalAssistants: [] }).expect(500)
    );
    await expectPendingInvitation(confirmFixture.invitationId);

    const rejectFixture = await createFixture({ capacity: 2 });
    await withAuditFailure('RSVP_REJECT', () => publicPost(rejectFixture.token, 'reject').expect(500));
    await expectPendingInvitation(rejectFixture.invitationId);

    const closeFixture = await createFixture({ capacity: 2 });
    const closeCookie = await login(closeFixture.email);
    await withAuditFailure('EVENT_CONFIRMATION_CLOSE', () =>
      authPost(`/events/${closeFixture.eventId}/confirmation/close`, closeCookie).expect(500)
    );
    expect((await prisma.event.findUniqueOrThrow({ where: { id: closeFixture.eventId } })).confirmationClosedAt).toBe(
      null
    );

    const overrideFixture = await createFixture({ capacity: 2 });
    const overrideCookie = await login(overrideFixture.email);
    await withAuditFailure('RSVP_OPERATIONAL_OVERRIDE', () =>
      authPut(
        `/events/${overrideFixture.eventId}/invitations/${overrideFixture.invitationId}/confirmation`,
        overrideCookie,
        { responseStatus: 'CONFIRMED', additionalAssistants: [] }
      ).expect(500)
    );
    await expectPendingInvitation(overrideFixture.invitationId);
    expect(
      await prisma.auditLog.count({
        where: {
          eventId: {
            in: [confirmFixture.eventId, rejectFixture.eventId, closeFixture.eventId, overrideFixture.eventId]
          }
        }
      })
    ).toBe(0);
  });

  it('returns a controlled FileAsset error and no internal path when storage read fails', async () => {
    const fixture = await createFixture({ capacity: 2, withDesign: true });
    const view = await publicGet(fixture.token).expect(200);
    const contentPath = view.body.design.flyerInitialAsset.contentPath as string;
    const before = await prisma.fileAsset.findFirstOrThrow({ where: { eventId: fixture.eventId } });
    const spy = vi.spyOn(storage, 'read').mockRejectedValueOnce(new Error(`forced ${before.storageKey} failure`));
    try {
      const response = await request(app.getHttpServer()).get(contentPath).expect(500);
      expect(response.body).toMatchObject({
        code: 'FILE_STORAGE_FAILURE',
        message: 'The requested file asset is temporarily unavailable.'
      });
      expect(JSON.stringify(response.body)).not.toContain(before.storageKey);
    } finally {
      spy.mockRestore();
    }
    expect(await prisma.fileAsset.findUniqueOrThrow({ where: { id: before.id } })).toEqual(before);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId } })).toBe(0);
  });

  it('enforces closure actor, frozen destinations, deferred response coherence and truncate protection in PostgreSQL', async () => {
    const fixture = await createFixture({ capacity: 2 });
    const outsider = await createUser(null, UserRole.PLATFORM_ADMIN);
    await expect(
      prisma.event.update({
        where: { id: fixture.eventId },
        data: { confirmationClosedAt: new Date(), confirmationClosedByUserId: outsider.userId }
      })
    ).rejects.toThrow(/confirmation closure actor is not authorized/u);
    await expect(
      prisma.event.update({ where: { id: fixture.eventId }, data: { locationUrl: 'https://example.com/otro' } })
    ).rejects.toThrow(/frozen after activation/u);
    await expect(
      prisma.invitation.update({
        where: { id: fixture.invitationId },
        data: { responseStatus: InvitationResponseStatus.CONFIRMED }
      })
    ).rejects.toThrow(/response states must agree/u);
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "assistant"')).rejects.toThrow(
      /cannot (?:be truncated|truncate a table referenced)/u
    );
  });

  it('publishes every CODEX-070 operation in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const path of [
      '/api/v1/public/invitations/{invitationToken}',
      '/api/v1/public/invitations/{invitationToken}/assets/{fileAssetId}/content',
      '/api/v1/public/invitations/{invitationToken}/confirm',
      '/api/v1/public/invitations/{invitationToken}/reject',
      '/api/v1/public/invitations/{invitationToken}/assistants',
      '/api/v1/events/{eventId}/confirmation',
      '/api/v1/events/{eventId}/confirmation/close',
      '/api/v1/events/{eventId}/confirmation/reopen',
      '/api/v1/events/{eventId}/invitations/{invitationId}/confirmation'
    ])
      expect(paths).toHaveProperty(path);
  });

  async function createFixture(input: { capacity: number; withDesign?: boolean; serviceCode?: ServiceCode }) {
    const owner = await createClientUser();
    const event = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const service = await tx.service.upsert({
        where: { code: input.serviceCode ?? ServiceCode.FLYER },
        create: { code: input.serviceCode ?? ServiceCode.FLYER },
        update: {}
      });
      const price =
        (await tx.servicePrice.findFirst({ where: { serviceId: service.id, clientType: ClientType.PLANNER } })) ??
        (await tx.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType: ClientType.PLANNER,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activationKey = `rsvp-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 8_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId: owner.clientId,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      return tx.event.create({
        data: {
          clientId: owner.clientId,
          createdByUserId: owner.userId,
          serviceId: service.id,
          name: 'Evento RSVP',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: input.capacity,
          confirmationEnabled: true,
          locationUrl: 'https://maps.google.com/?q=19.4326,-99.1332',
          giftRegistryUrl: 'https://example.com/mesa?evento=1',
          activatedAt: new Date(),
          activatedByUserId: owner.userId,
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
    const invitation = await addInvitation(event.id, 'Principal');
    if (input.withDesign) await addFlyerDesign(owner, event.id);
    return { ...owner, eventId: event.id, invitationId: invitation.invitationId, token: invitation.token };
  }

  async function addInvitation(eventId: string, name: string) {
    const nonce = randomBytes(32).toString('hex');
    const invitation = await prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          eventId,
          name,
          whatsappPhoneNormalized: `+5255${String(Math.random()).slice(2, 10).padEnd(8, '0')}`
        }
      });
      const created = await tx.invitation.create({
        data: {
          eventId,
          contactId: contact.id,
          additionalAssistantLimit: 2,
          invitationTokenNonce: nonce,
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      await tx.assistant.create({ data: { eventId, invitationId: created.id, name, isPrimary: true } });
      return created;
    });
    return { invitationId: invitation.id, token: tokens.issue('INVITATION', invitation.id, nonce) };
  }

  async function addFlyerDesign(owner: { clientId: string; userId: string }, eventId: string) {
    const bytes = Buffer.from('public-rsvp-image');
    const createAsset = async (fileType: FileAssetType) => {
      const key = storage.generateKey();
      await storage.write({ storageKey: key, bytes });
      return prisma.fileAsset.create({
        data: {
          clientId: owner.clientId,
          eventId,
          ownerType: 'FLYER',
          fileType,
          storageKey: key,
          originalName: 'public.png',
          mimeType: 'image/png',
          sizeBytes: bytes.length,
          checksumSha256: randomBytes(32).toString('hex'),
          width: 10,
          height: 10,
          createdByUserId: owner.userId,
          status: FileAssetStatus.READY
        }
      });
    };
    const initial = await createAsset(FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await createAsset(FileAssetType.FLYER_QR_IMAGE);
    await prisma.$transaction(async (tx) => {
      const design = await tx.invitationDesign.create({
        data: { eventId, type: 'FLYER', flyerInitialAssetId: initial.id, flyerQrAssetId: qr.id }
      });
      await tx.fileAsset.updateMany({
        where: { id: { in: [initial.id, qr.id] } },
        data: { ownerId: design.id, associatedAt: new Date() }
      });
      for (const action of ['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA'] as const) {
        await tx.hotspot.create({
          data: {
            eventId,
            designId: design.id,
            visualOwnerType: 'FLYER',
            action,
            x: 0,
            y: 0,
            width: 0.2,
            height: 0.2
          }
        });
      }
    });
  }

  async function addFlipbookDesign(owner: { clientId: string; userId: string }, eventId: string) {
    const bytes = Buffer.from('public-rsvp-flipbook');
    const assets: FileAsset[] = [];
    for (let index = 0; index < 2; index += 1) {
      const storageKey = storage.generateKey();
      await storage.write({ storageKey, bytes });
      assets.push(
        await prisma.fileAsset.create({
          data: {
            clientId: owner.clientId,
            eventId,
            ownerType: 'FLIPBOOK_PAGE',
            fileType: FileAssetType.FLIPBOOK_PAGE_IMAGE,
            storageKey,
            originalName: `page-${index + 1}.png`,
            mimeType: 'image/png',
            sizeBytes: bytes.length,
            checksumSha256: randomBytes(32).toString('hex'),
            width: 10,
            height: 10,
            createdByUserId: owner.userId,
            status: FileAssetStatus.READY
          }
        })
      );
    }
    await prisma.$transaction(async (tx) => {
      const design = await tx.invitationDesign.create({ data: { eventId, type: 'FLIPBOOK' } });
      for (const [index, asset] of assets.entries()) {
        const page = await tx.flipbookPage.create({
          data: { designId: design.id, eventId, fileAssetId: asset.id, position: index + 1 }
        });
        await tx.fileAsset.update({
          where: { id: asset.id },
          data: { ownerId: page.id, associatedAt: new Date() }
        });
      }
    });
  }

  async function createClientUser() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: randomUUID() } });
    const user = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    return { clientId: client.id, ...user };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { userId: user.id, email };
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing cookie.');
    return cookie;
  }

  function publicGet(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/public/invitations/${token}`);
  }

  function publicPost(token: string, action: 'confirm' | 'reject', body?: object) {
    const call = request(app.getHttpServer()).post(`/api/v1/public/invitations/${token}/${action}`);
    return body ? call.send(body) : call.send({});
  }

  function publicPatch(token: string, body: object) {
    return request(app.getHttpServer()).patch(`/api/v1/public/invitations/${token}/assistants`).send(body);
  }

  function authPost(path: string, cookie: string) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', origin).set('Cookie', cookie).send({});
  }

  function authPut(path: string, cookie: string, body: object) {
    return request(app.getHttpServer()).put(`/api/v1${path}`).set('Origin', origin).set('Cookie', cookie).send(body);
  }

  function authCancel(eventId: string, invitationId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/invitations/${invitationId}/cancel`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', `rsvp-cancel-${randomUUID()}`)
      .send({});
  }

  async function runReductionAgainstIncrease(
    fixture: { token: string; eventId: string; invitationId: string },
    extraId: string
  ) {
    const auditsBefore = await prisma.auditLog.count({
      where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' }
    });
    const results = await runAuditContended(
      'RSVP_CONFIRM',
      rsvp,
      'lockInvitationContext',
      2,
      () => publicPatch(fixture.token, { additionalAssistants: [] }),
      () =>
        publicPatch(fixture.token, {
          additionalAssistants: [{ id: extraId, name: 'Extra conservado' }, { name: 'Extra aumentado' }]
        })
    );
    expect(results.map(({ status }) => status)).toEqual([200, 409]);
    expect(results[1].body.code).toBe('RSVP_ASSISTANT_MISMATCH');
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(invitation.assistants.length).toBeLessThanOrEqual(3);
    expect(
      invitation.assistants.every(({ responseStatus }) => responseStatus === AssistantResponseStatus.CONFIRMED)
    ).toBe(true);
    expect(
      await prisma.assistant.count({
        where: {
          eventId: fixture.eventId,
          deletedAt: null,
          responseStatus: AssistantResponseStatus.CONFIRMED
        }
      })
    ).toBeLessThanOrEqual(4);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'RSVP_CONFIRM' } })).toBe(
      auditsBefore + 1
    );
  }

  async function runAuditContended<TFirst, TSecond>(
    action: string,
    lockService: object,
    lockMethod: string,
    signalOnCall: number,
    firstOperation: () => PromiseLike<TFirst>,
    secondOperation: () => PromiseLike<TSecond>
  ): Promise<[TFirst, TSecond]> {
    const firstBarrier = auditBarrier(action);
    const lockBarrier = lockAttemptBarrier(lockService, lockMethod, signalOnCall);
    try {
      const first = start(firstOperation());
      await firstBarrier.entered.promise;
      const second = track(secondOperation());
      await lockBarrier.attempted.promise;
      expect(second.isSettled()).toBe(false);
      firstBarrier.release.resolve();
      const [firstResult, secondResult] = await Promise.all([first, second.promise]);
      return [firstResult, secondResult];
    } finally {
      firstBarrier.release.resolve();
      lockBarrier.restore();
      firstBarrier.restore();
    }
  }

  async function runStorageContended<TFirst, TSecond>(
    lockService: object,
    lockMethod: string,
    signalOnCall: number,
    firstOperation: () => PromiseLike<TFirst>,
    secondOperation: () => PromiseLike<TSecond>
  ): Promise<[TFirst, TSecond]> {
    const firstBarrier = storageReadBarrier();
    const lockBarrier = lockAttemptBarrier(lockService, lockMethod, signalOnCall);
    try {
      const first = start(firstOperation());
      await firstBarrier.entered.promise;
      const second = track(secondOperation());
      await lockBarrier.attempted.promise;
      expect(second.isSettled()).toBe(false);
      firstBarrier.release.resolve();
      const [firstResult, secondResult] = await Promise.all([first, second.promise]);
      return [firstResult, secondResult];
    } finally {
      firstBarrier.release.resolve();
      lockBarrier.restore();
      firstBarrier.restore();
    }
  }

  function lockAttemptBarrier(service: object, methodName: string, signalOnCall: number) {
    type AsyncLockMethod = (...args: unknown[]) => Promise<unknown>;
    const target = service as Record<string, AsyncLockMethod>;
    const method = target[methodName];
    if (!method) throw new TypeError(`Missing lock method ${methodName}.`);
    const attempted = deferred<void>();
    const original = method.bind(service);
    let calls = 0;
    const spy = vi.spyOn(target, methodName).mockImplementation((...args) => {
      calls += 1;
      if (calls === signalOnCall) attempted.resolve();
      return original(...args);
    });
    return { attempted, restore: () => spy.mockRestore() };
  }

  function auditBarrier(action: string) {
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = audit.record.bind(audit);
    let intercepted = false;
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (input, transaction) => {
      if (!intercepted && input.action === action) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
      return original(input, transaction);
    });
    return { entered, release, restore: () => spy.mockRestore() };
  }

  function storageReadBarrier() {
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = storage.read.bind(storage);
    let intercepted = false;
    const spy = vi.spyOn(storage, 'read').mockImplementation(async (storageKey) => {
      if (!intercepted) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
      return original(storageKey);
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

  function start<T>(operation: PromiseLike<T>): Promise<T> {
    return Promise.resolve(operation);
  }

  function track<T>(operation: PromiseLike<T>) {
    let settled = false;
    const promise = Promise.resolve(operation);
    void promise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    return { promise, isSettled: () => settled };
  }

  async function withAuditFailure(action: string, operation: () => PromiseLike<unknown>): Promise<void> {
    const original = audit.record.bind(audit);
    let failed = false;
    const spy = vi.spyOn(audit, 'record').mockImplementation(async (input, transaction) => {
      if (!failed && input.action === action) {
        failed = true;
        throw new Error('forced audit failure');
      }
      return original(input, transaction);
    });
    try {
      await operation();
      expect(failed).toBe(true);
    } finally {
      spy.mockRestore();
    }
  }

  async function expectPendingInvitation(invitationId: string): Promise<void> {
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    expect(invitation.responseStatus).toBe(InvitationResponseStatus.PENDING);
    expect(
      invitation.assistants.every(({ responseStatus }) => responseStatus === AssistantResponseStatus.PENDING)
    ).toBe(true);
  }

  function insertDestinationDirect(
    clientId: string,
    userId: string,
    field: 'locationUrl' | 'giftRegistryUrl',
    value: string
  ): Promise<number> {
    return field === 'locationUrl'
      ? prisma.$executeRaw`
          INSERT INTO "event" ("client_id", "created_by_user_id", "location_url")
          VALUES (${clientId}::uuid, ${userId}::uuid, ${value})
        `
      : prisma.$executeRaw`
          INSERT INTO "event" ("client_id", "created_by_user_id", "gift_registry_url")
          VALUES (${clientId}::uuid, ${userId}::uuid, ${value})
        `;
  }

  function updateDestinationDirect(
    eventId: string,
    field: 'locationUrl' | 'giftRegistryUrl',
    value: string
  ): Promise<number> {
    return field === 'locationUrl'
      ? prisma.$executeRaw`
          UPDATE "event"
          SET "location_url" = ${value}, "updated_at" = NOW()
          WHERE "id" = ${eventId}::uuid
        `
      : prisma.$executeRaw`
          UPDATE "event"
          SET "gift_registry_url" = ${value}, "updated_at" = NOW()
          WHERE "id" = ${eventId}::uuid
        `;
  }

  async function resetDatabase() {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event",
        "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
