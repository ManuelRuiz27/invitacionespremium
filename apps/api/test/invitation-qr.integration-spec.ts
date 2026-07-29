import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import sharp from 'sharp';
import request, { type Response as SupertestResponse } from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ClientType, EventStatus, LedgerMovementType, ServiceCode, UserRole } from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { InvitationsService } from '../src/invitations/invitations.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import {
  InvitationQrRenderer,
  InvitationQrService,
  INVITATION_QR_SVG_OPTIONS
} from '../src/public-rsvp/invitation-qr.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Invitation QR SVG', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: InvitationTokenService;
  let qr: InvitationQrService;
  let renderer: InvitationQrRenderer;
  let audit: AuditService;
  let invitations: InvitationsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-invitation-qr-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    tokens = app.get(InvitationTokenService);
    qr = app.get(InvitationQrService);
    renderer = app.get(InvitationQrRenderer);
    audit = app.get(AuditService);
    invitations = app.get(InvitationsService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('exposes QR only for a coherent confirmed invitation and applies every lifecycle visibility rule', async () => {
    const fixture = await createFixture();
    const pending = await publicView(fixture.invitationToken).expect(200);
    expect(pending.body.qr).toEqual({ available: false });
    expect(pending.body.qr).not.toHaveProperty('contentPath');
    await qrGet(fixture.invitationToken)
      .expect(409)
      .expect((response) => expect(errorBody(response).code).toBe('QR_NOT_AVAILABLE'));

    await confirm(fixture.invitationToken).expect(200);
    const confirmed = await publicView(fixture.invitationToken).expect(200);
    expect(confirmed.body.qr).toEqual({
      available: true,
      contentPath: `/api/v1/public/invitations/${encodeURIComponent(fixture.invitationToken)}/qr.svg`
    });
    const firstSvg = await svgGet(confirmed.body.qr.contentPath).expect(200);
    assertPrivateSvgHeaders(firstSvg);

    const cookie = await login(fixture.email);
    await authenticatedPost(`/events/${fixture.eventId}/confirmation/close`, cookie).expect(200);
    expect((await publicView(fixture.invitationToken).expect(200)).body.qr.available).toBe(true);
    expect((await qrGet(fixture.invitationToken).expect(200)).body).toEqual(firstSvg.body);

    await authenticatedPost(`/events/${fixture.eventId}/confirmation/reopen`, cookie).expect(200);
    await reject(fixture.invitationToken).expect(200);
    const rejected = await publicView(fixture.invitationToken).expect(200);
    expect(rejected.body.qr).toEqual({ available: false });
    await qrGet(fixture.invitationToken).expect(409);
    await confirm(fixture.invitationToken).expect(200);
    expect((await qrGet(fixture.invitationToken).expect(200)).body).toEqual(firstSvg.body);

    await cancelInvitation(fixture, cookie).expect(200);
    const cancelledInvitation = await publicView(fixture.invitationToken).expect(200);
    expect(cancelledInvitation.body.status).toBe('CANCELLED');
    expect(cancelledInvitation.body).not.toHaveProperty('qr');
    await qrGet(fixture.invitationToken).expect(409);

    const eventCancelled = await createFixture();
    const eventCancelledCookie = await login(eventCancelled.email);
    await confirm(eventCancelled.invitationToken).expect(200);
    await transition(eventCancelled.eventId, 'cancel', eventCancelledCookie).expect(200);
    expect((await publicView(eventCancelled.invitationToken).expect(200)).body).not.toHaveProperty('qr');
    await qrGet(eventCancelled.invitationToken).expect(409);

    const closed = await createFixture();
    const closedCookie = await login(closed.email);
    await confirm(closed.invitationToken).expect(200);
    await transition(closed.eventId, 'close', closedCookie).expect(200);
    expect((await publicView(closed.invitationToken).expect(200)).body).not.toHaveProperty('qr');
    await qrGet(closed.invitationToken).expect(409);
    await transition(closed.eventId, 'archive', closedCookie).expect(200);
    await publicView(closed.invitationToken).expect(404);
    await qrGet(closed.invitationToken).expect(404);
  });

  it('separates token purposes, validates the aggregate and emits deterministic safe independently decodable SVG', async () => {
    const fixture = await createFixture();
    await confirm(fixture.invitationToken).expect(200);
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: fixture.invitationId },
      include: { assistants: { where: { deletedAt: null } } }
    });
    const expectedQrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);

    expect(await qr.resolveQrToken(expectedQrToken)).toEqual({
      eventId: fixture.eventId,
      invitationId: fixture.invitationId
    });
    expect(await qr.resolveQrToken(`${expectedQrToken.slice(0, -1)}x`)).toBeNull();
    expect(await qr.resolveQrToken(fixture.invitationToken)).toBeNull();
    expect(
      await qr.resolveQrToken(tokens.issue('QR', fixture.invitationId, randomBytes(32).toString('hex')))
    ).toBeNull();
    expect(
      await qr.resolveQrToken(tokens.issue('QR', fixture.invitationId, stored.qrTokenNonce, stored.qrTokenVersion + 1))
    ).toBeNull();
    expect(
      await qr.resolveQrToken(tokens.issue('QR', randomUUID(), stored.qrTokenNonce, stored.qrTokenVersion))
    ).toBeNull();
    await publicView(expectedQrToken).expect(404);
    await qrGet('not-a-valid-token').expect(404);

    const writesBefore = await persistentCounts(fixture.eventId);
    const first = await qrGet(fixture.invitationToken).expect(200);
    const repeated = await qrGet(fixture.invitationToken).expect(200);
    expect(repeated.body).toEqual(first.body);
    expect(repeated.headers.etag).toBe(first.headers.etag);
    expect(await persistentCounts(fixture.eventId)).toEqual(writesBefore);

    const svg = first.body.toString('utf8');
    for (const forbidden of [
      expectedQrToken,
      fixture.invitationToken,
      stored.qrTokenNonce,
      'Principal QR',
      '+5255',
      '<script',
      '<foreignObject',
      '<image',
      '<text',
      '<metadata',
      '<!DOCTYPE',
      'href=',
      'onload='
    ]) {
      expect(svg).not.toContain(forbidden);
    }
    const raster = await sharp(first.body).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
    expect(decoded?.data).toBe(expectedQrToken);

    await prisma.contact.update({ where: { id: stored.contactId }, data: { name: 'Nombre cambiado' } });
    await prisma.assistant.updateMany({
      where: { invitationId: stored.id },
      data: { name: 'Asistente cambiado' }
    });
    expect((await qrGet(fixture.invitationToken).expect(200)).body).toEqual(first.body);

    const second = await addInvitation(fixture.eventId, 'Otra InvitaciÃ³n');
    await confirm(second.invitationToken).expect(200);
    expect((await qrGet(second.invitationToken).expect(200)).body).not.toEqual(first.body);
    const secondStored = await prisma.invitation.findUniqueOrThrow({ where: { id: second.invitationId } });
    expect(
      await qr.resolveQrToken(
        tokens.issue('QR', secondStored.id, secondStored.qrTokenNonce, secondStored.qrTokenVersion)
      )
    ).toEqual({ eventId: fixture.eventId, invitationId: second.invitationId });

    const countsBeforeFailure = await persistentCounts(fixture.eventId);
    const failure = vi.spyOn(renderer, 'render').mockRejectedValueOnce(new Error('secret generator detail'));
    try {
      const response = await qrGet(fixture.invitationToken).expect(500);
      const body = errorBody(response);
      expect(body).toMatchObject({
        code: 'QR_GENERATION_FAILURE',
        message: 'The invitation QR could not be generated.'
      });
      const serialized = JSON.stringify(body);
      expect(serialized).not.toContain('secret generator detail');
      expect(serialized).not.toContain(expectedQrToken);
      expect(await persistentCounts(fixture.eventId)).toEqual(countsBeforeFailure);
    } finally {
      failure.mockRestore();
    }
  });

  it('returns not found after Event, Contact or Invitation soft delete', async () => {
    for (const resource of ['event', 'contact', 'invitation'] as const) {
      const fixture = await createFixture();
      await confirm(fixture.invitationToken).expect(200);
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: fixture.invitationId } });
      const qrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);
      const deletedAt = new Date();
      if (resource === 'event') {
        await prisma.event.update({ where: { id: fixture.eventId }, data: { deletedAt } });
      } else if (resource === 'contact') {
        await prisma.contact.update({ where: { id: stored.contactId }, data: { deletedAt } });
      } else {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
          await tx.invitation.update({ where: { id: stored.id }, data: { deletedAt } });
        });
      }
      await publicView(fixture.invitationToken).expect(404);
      await qrGet(fixture.invitationToken).expect(404);
      expect(await qr.resolveQrToken(qrToken)).toBeNull();
    }
  });

  it('accepts ACTIVE and EVENT_DAY and rejects every other Event state with the documented semantics', async () => {
    for (const status of [EventStatus.ACTIVE, EventStatus.EVENT_DAY]) {
      const fixture = await createFixture();
      await confirm(fixture.invitationToken).expect(200);
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: fixture.invitationId } });
      const qrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);
      await setEventStatus(fixture.eventId, status);
      await qrGet(fixture.invitationToken).expect(200);
      expect(await qr.resolveQrToken(qrToken)).toEqual({
        eventId: fixture.eventId,
        invitationId: fixture.invitationId
      });
    }
    for (const status of [
      EventStatus.DRAFT,
      EventStatus.CONFIGURED,
      EventStatus.READY_TO_ACTIVATE,
      EventStatus.CLOSED,
      EventStatus.ALBUM_PUBLISHED,
      EventStatus.CANCELLED
    ]) {
      const fixture = await createFixture();
      await confirm(fixture.invitationToken).expect(200);
      const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: fixture.invitationId } });
      const qrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);
      await setEventStatus(fixture.eventId, status);
      await qrGet(fixture.invitationToken).expect(409);
      expect(await qr.resolveQrToken(qrToken)).toBeNull();
    }
    const fixture = await createFixture();
    await confirm(fixture.invitationToken).expect(200);
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: fixture.invitationId } });
    const qrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);
    await setEventStatus(fixture.eventId, EventStatus.ARCHIVED);
    await qrGet(fixture.invitationToken).expect(404);
    expect(await qr.resolveQrToken(qrToken)).toBeNull();
  });

  it('serializes confirmation, rejection, cancellation, closure, duplicate reads and reconfirmation races', async () => {
    const confirmFixture = await createFixture();
    const confirmRace = await runAuditContended(
      'RSVP_CONFIRM',
      qr,
      'lockInvitationContext',
      1,
      () => confirm(confirmFixture.invitationToken),
      () => qrGet(confirmFixture.invitationToken)
    );
    expect(confirmRace.map(({ status }) => status)).toEqual([200, 200]);

    const rejectRace = await runAuditContended(
      'RSVP_REJECT',
      qr,
      'lockInvitationContext',
      1,
      () => reject(confirmFixture.invitationToken),
      () => qrGet(confirmFixture.invitationToken)
    );
    expect(rejectRace.map(({ status }) => status)).toEqual([200, 409]);

    await confirm(confirmFixture.invitationToken).expect(200);
    const confirmStored = await prisma.invitation.findUniqueOrThrow({ where: { id: confirmFixture.invitationId } });
    const confirmQrToken = tokens.issue(
      'QR',
      confirmStored.id,
      confirmStored.qrTokenNonce,
      confirmStored.qrTokenVersion
    );
    const confirmCookie = await login(confirmFixture.email);
    const cancelRace = await runRenderContended(
      invitations,
      'lockOwnedEvent',
      1,
      () => qrGet(confirmFixture.invitationToken),
      () => cancelInvitation(confirmFixture, confirmCookie)
    );
    expect(cancelRace.map(({ status }) => status)).toEqual([200, 200]);
    expect(await qr.resolveQrToken(confirmQrToken)).toBeNull();
    await qrGet(confirmFixture.invitationToken).expect(409);

    const closeFixture = await createFixture();
    await confirm(closeFixture.invitationToken).expect(200);
    const closeStored = await prisma.invitation.findUniqueOrThrow({ where: { id: closeFixture.invitationId } });
    const closeQrToken = tokens.issue('QR', closeStored.id, closeStored.qrTokenNonce, closeStored.qrTokenVersion);
    const closeCookie = await login(closeFixture.email);
    const closeRace = await runAuditContended(
      'EVENT_CLOSE',
      qr,
      'lockRows',
      1,
      () => transition(closeFixture.eventId, 'close', closeCookie),
      () => qr.resolveQrToken(closeQrToken)
    );
    expect(closeRace[0].status).toBe(200);
    expect(closeRace[1]).toBeNull();

    const duplicateFixture = await createFixture();
    await confirm(duplicateFixture.invitationToken).expect(200);
    const duplicateReads = await runRenderContended(
      qr,
      'lockInvitationContext',
      2,
      () => qrGet(duplicateFixture.invitationToken),
      () => qrGet(duplicateFixture.invitationToken)
    );
    expect(duplicateReads.map(({ status }) => status)).toEqual([200, 200]);
    expect(duplicateReads[1].body).toEqual(duplicateReads[0].body);

    await reject(duplicateFixture.invitationToken).expect(200);
    const duplicateStored = await prisma.invitation.findUniqueOrThrow({
      where: { id: duplicateFixture.invitationId }
    });
    const duplicateQrToken = tokens.issue(
      'QR',
      duplicateStored.id,
      duplicateStored.qrTokenNonce,
      duplicateStored.qrTokenVersion
    );
    const reconfirmRace = await runAuditContended(
      'RSVP_CONFIRM',
      qr,
      'lockRows',
      1,
      () => confirm(duplicateFixture.invitationToken),
      () => qr.resolveQrToken(duplicateQrToken)
    );
    expect(reconfirmRace[0].status).toBe(200);
    expect(reconfirmRace[1]).toEqual({
      eventId: duplicateFixture.eventId,
      invitationId: duplicateFixture.invitationId
    });

    expect(await prisma.auditLog.count({ where: { action: { contains: 'QR' } } })).toBe(0);
  }, 60_000);

  it('publishes the SVG response and public qr projection in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    const operation = document.paths['/api/v1/public/invitations/{invitationToken}/qr.svg']?.get;
    const response = operation?.responses?.['200'];
    const responseObject = response && !('$ref' in response) ? response : undefined;
    expect(responseObject?.content).toHaveProperty('image/svg+xml');
    expect(responseObject?.headers).toMatchObject({
      'Content-Type': expect.any(Object),
      ETag: expect.any(Object),
      'Content-Security-Policy': expect.any(Object)
    });
    const viewSchema = document.components?.schemas?.PublicInvitationViewResponseDto;
    expect(viewSchema && !('$ref' in viewSchema) ? viewSchema.properties : undefined).toHaveProperty('qr');
    expect(INVITATION_QR_SVG_OPTIONS).toEqual({
      errorCorrectionLevel: 'M',
      margin: 4,
      width: 512,
      darkColor: '#111827',
      lightColor: '#FFFFFF'
    });
  });

  async function createFixture() {
    const owner = await createClientUser();
    const event = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const service = await tx.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { code: ServiceCode.FLYER },
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
      const activationKey = `qr-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 9_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
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
          name: 'Evento QR',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 10,
          confirmationEnabled: true,
          locationUrl: 'https://maps.example.com/evento',
          giftRegistryUrl: 'https://regalos.example.com/evento',
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
    const invitation = await addInvitation(event.id, 'Principal QR');
    return { ...owner, eventId: event.id, ...invitation };
  }

  async function addInvitation(eventId: string, name: string) {
    const invitationNonce = randomBytes(32).toString('hex');
    const qrNonce = randomBytes(32).toString('hex');
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
          invitationTokenNonce: invitationNonce,
          qrTokenNonce: qrNonce
        }
      });
      await tx.assistant.create({ data: { eventId, invitationId: created.id, name, isPrimary: true } });
      return created;
    });
    return {
      invitationId: invitation.id,
      invitationToken: tokens.issue('INVITATION', invitation.id, invitationNonce)
    };
  }

  async function createClientUser() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: randomUUID() } });
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role: UserRole.INDEPENDENT_PLANNER,
        clientId: client.id
      }
    });
    return { clientId: client.id, userId: user.id, email };
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

  function publicView(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/public/invitations/${token}`);
  }

  function qrGet(token: string) {
    return svgGet(`/api/v1/public/invitations/${token}/qr.svg`);
  }

  function svgGet(path: string) {
    return request(app.getHttpServer())
      .get(path)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
        response.on('error', (error: Error) => callback(error, undefined));
      });
  }

  function confirm(token: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/public/invitations/${token}/confirm`)
      .send({ additionalAssistants: [] });
  }

  function reject(token: string) {
    return request(app.getHttpServer()).post(`/api/v1/public/invitations/${token}/reject`).send({});
  }

  function authenticatedPost(path: string, cookie: string) {
    return request(app.getHttpServer()).post(`/api/v1${path}`).set('Origin', origin).set('Cookie', cookie).send({});
  }

  function cancelInvitation(fixture: { eventId: string; invitationId: string }, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/invitations/${fixture.invitationId}/cancel`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', `qr-cancel-${randomUUID()}`)
      .send({});
  }

  function transition(eventId: string, action: 'close' | 'archive' | 'cancel', cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/${action}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', `qr-event-${action}-${randomUUID()}`)
      .send({});
  }

  async function setEventStatus(eventId: string, status: EventStatus) {
    const preparing = new Set<EventStatus>([
      EventStatus.DRAFT,
      EventStatus.CONFIGURED,
      EventStatus.READY_TO_ACTIVATE
    ]).has(status);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({
        where: { id: eventId },
        data: {
          status,
          ...(preparing
            ? {
                activatedAt: null,
                activatedByUserId: null,
                activatedServiceId: null,
                activatedServicePriceId: null,
                baseCostCredits: null,
                promotionDiscountCredits: null,
                finalCostCredits: null,
                purchasedCreditsUsed: null,
                creditLineCreditsUsed: null,
                activationReceiptId: null,
                activationIdempotencyKey: null
              }
            : {})
        }
      });
    });
  }

  async function persistentCounts(eventId: string) {
    const [audits, ledger, receipts, invitationsCount, assistants] = await Promise.all([
      prisma.auditLog.count({ where: { eventId } }),
      prisma.ledgerEntry.count({ where: { eventId } }),
      prisma.receipt.count({ where: { client: { events: { some: { id: eventId } } } } }),
      prisma.invitation.count({ where: { eventId } }),
      prisma.assistant.count({ where: { eventId } })
    ]);
    return { audits, ledger, receipts, invitations: invitationsCount, assistants };
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
      const first = Promise.resolve(firstOperation());
      await firstBarrier.entered.promise;
      const second = track(secondOperation());
      await lockBarrier.attempted.promise;
      expect(second.isSettled()).toBe(false);
      firstBarrier.release.resolve();
      return await Promise.all([first, second.promise]);
    } finally {
      firstBarrier.release.resolve();
      lockBarrier.restore();
      firstBarrier.restore();
    }
  }

  async function runRenderContended<TFirst, TSecond>(
    lockService: object,
    lockMethod: string,
    signalOnCall: number,
    firstOperation: () => PromiseLike<TFirst>,
    secondOperation: () => PromiseLike<TSecond>
  ): Promise<[TFirst, TSecond]> {
    const firstBarrier = rendererBarrier();
    const lockBarrier = lockAttemptBarrier(lockService, lockMethod, signalOnCall);
    try {
      const first = Promise.resolve(firstOperation());
      await firstBarrier.entered.promise;
      const second = track(secondOperation());
      await lockBarrier.attempted.promise;
      expect(second.isSettled()).toBe(false);
      firstBarrier.release.resolve();
      return await Promise.all([first, second.promise]);
    } finally {
      firstBarrier.release.resolve();
      lockBarrier.restore();
      firstBarrier.restore();
    }
  }

  function lockAttemptBarrier(service: object, methodName: string, signalOnCall: number) {
    type AsyncMethod = (...args: unknown[]) => Promise<unknown>;
    const target = service as Record<string, AsyncMethod>;
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

  function rendererBarrier() {
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = renderer.render.bind(renderer);
    let intercepted = false;
    const spy = vi.spyOn(renderer, 'render').mockImplementation(async (token) => {
      if (!intercepted) {
        intercepted = true;
        entered.resolve();
        await release.promise;
      }
      return original(token);
    });
    return { entered, release, restore: () => spy.mockRestore() };
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

  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    return { promise, resolve, reject };
  }

  function assertPrivateSvgHeaders(response: SupertestResponse) {
    expect(response.headers['content-type']).toBe('image/svg+xml; charset=utf-8');
    expect(response.headers['content-length']).toBe(String(response.body.length));
    expect(response.headers['content-disposition']).toBe('inline');
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toBe("default-src 'none'");
    expect(response.headers.etag).toMatch(/^"sha256-[0-9a-f]{64}"$/u);
  }

  function errorBody(response: SupertestResponse): Record<string, unknown> {
    return JSON.parse(response.body.toString('utf8')) as Record<string, unknown>;
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation",
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
