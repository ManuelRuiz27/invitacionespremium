import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import type { INestApplication } from '@nestjs/common';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { AuditService } from '../src/audit/audit.service';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  AssistantResponseStatus,
  ClientStatus,
  ClientType,
  EventStatus,
  HotspotAction,
  HotspotVisualOwnerType,
  InvitationMode,
  InvitationResponseStatus,
  LedgerMovementType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { RealtimePublisherService } from '../src/realtime/realtime-publisher.service';
import { RealtimeServerService } from '../src/realtime/realtime-server.service';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

interface TestRealtimeEnvelope {
  eventName: string;
  actorType: string;
  data: {
    checkIns: Array<{ assistantId: string; invitationId: string }>;
    delta: number;
    status: string;
    confirmedAssistants: number;
    previousConfirmedAssistants: number;
  };
}

describe('Realtime Socket.IO', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let staffTechnical: StaffTokenTechnicalService;
  let invitationTokens: InvitationTokenService;
  let publisher: RealtimePublisherService;
  let realtimeServer: RealtimeServerService;
  let audit: AuditService;
  let baseUrl: string;
  const sockets = new Set<Socket>();

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-realtime-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    staffTechnical = app.get(StaffTokenTechnicalService);
    invitationTokens = app.get(InvitationTokenService);
    publisher = app.get(RealtimePublisherService);
    realtimeServer = app.get(RealtimeServerService);
    audit = app.get(AuditService);
  });

  beforeEach(async () => {
    closeSockets();
    vi.restoreAllMocks();
    await resetDatabase();
  }, 60_000);

  afterAll(async () => {
    closeSockets();
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('authorizes user rooms by exact ownership and administrative context', async () => {
    const independent = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const foreign = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const organization = await createClientUser(ClientType.ORGANIZATION, UserRole.ORGANIZATION_ADMIN);
    const plannerOne = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const plannerTwo = await createUser(organization.clientId, UserRole.ORGANIZATION_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const ownEvent = await createEvent(independent, EventStatus.DRAFT, true);
    const foreignEvent = await createEvent(foreign, EventStatus.DRAFT);
    const plannerEvent = await createEvent(
      { clientId: organization.clientId, userId: plannerOne.id },
      EventStatus.DRAFT,
      true
    );
    const otherPlannerEvent = await createEvent(
      { clientId: organization.clientId, userId: plannerTwo.id },
      EventStatus.DRAFT
    );

    const ownDashboard = await connectUser(await login(independent.email), ownEvent.id, 'dashboard', false);
    await connectUser(await login(independent.email), ownEvent.id, 'floorplan', false);
    await expectUserError(
      await login(independent.email),
      foreignEvent.id,
      'dashboard',
      false,
      'SOCKET_EVENT_FORBIDDEN'
    );
    await connectUser(await login(organization.email), plannerEvent.id, 'dashboard', false);
    await connectUser(await login(plannerOne.email), plannerEvent.id, 'dashboard', false);
    await expectUserError(
      await login(plannerOne.email),
      otherPlannerEvent.id,
      'dashboard',
      false,
      'SOCKET_EVENT_FORBIDDEN'
    );
    await connectUser(await login(platform.email), foreignEvent.id, 'dashboard', true);
    await expectUserError(await login(platform.email), foreignEvent.id, 'dashboard', false, 'SOCKET_ROOM_FORBIDDEN');
    await expectUserError(await login(platform.email), ownEvent.id, 'floorplan', true, 'SOCKET_ROOM_FORBIDDEN');
    await expectUserError(
      await login(independent.email),
      foreignEvent.id,
      'floorplan',
      false,
      'SOCKET_EVENT_FORBIDDEN'
    );
    await expectConnectionError(
      {
        protocolVersion: 1,
        actorMode: 'PUBLIC_TOKEN',
        roomType: 'dashboard',
        eventId: ownEvent.id
      },
      undefined,
      'SOCKET_UNAUTHORIZED'
    );
    const rejectedInbound = onceDisconnected(ownDashboard);
    ownDashboard.emit('checkin.created', {});
    await rejectedInbound;
  });

  it('authorizes Staff exclusively from its token and returns prioritized stable errors', async () => {
    const owner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const active = await createEvent(owner, EventStatus.ACTIVE);
    const valid = await createStaff(active.id, owner.userId);
    await connectStaff(valid, 'scanner');
    await expectConnectionError(
      {
        protocolVersion: 1,
        actorMode: 'STAFF_TOKEN',
        roomType: 'scanner',
        staffToken: valid,
        eventId: randomUUID()
      },
      undefined,
      'SOCKET_EVENT_FORBIDDEN'
    );
    await expectConnectionError(
      {
        protocolVersion: 1,
        actorMode: 'STAFF_TOKEN',
        roomType: 'dashboard',
        staffToken: valid
      },
      undefined,
      'SOCKET_ROOM_FORBIDDEN'
    );
    await expectStaffError('not-a-token', 'scanner', 'SOCKET_UNAUTHORIZED');
    const expired = await createStaff(active.id, owner.userId, new Date());
    await expectStaffError(expired, 'scanner', 'SOCKET_STAFF_TOKEN_EXPIRED');
    await expectStaffError(valid, 'floorplan', 'SOCKET_ROOM_FORBIDDEN');

    for (const [status, code] of [
      [EventStatus.DRAFT, 'SOCKET_EVENT_NOT_OPERATIONAL'],
      [EventStatus.CONFIGURED, 'SOCKET_EVENT_NOT_OPERATIONAL'],
      [EventStatus.READY_TO_ACTIVATE, 'SOCKET_EVENT_NOT_OPERATIONAL'],
      [EventStatus.ARCHIVED, 'SOCKET_EVENT_NOT_OPERATIONAL'],
      [EventStatus.CLOSED, 'SOCKET_EVENT_CLOSED'],
      [EventStatus.CANCELLED, 'SOCKET_EVENT_CANCELLED']
    ] as const) {
      const event = await createEvent(owner, status);
      const token = await createStaff(event.id, owner.userId, new Date());
      await expectStaffError(token, 'scanner', code);
    }
    await expectConnectionError(
      {
        protocolVersion: 2,
        actorMode: 'STAFF_TOKEN',
        roomType: 'scanner',
        staffToken: valid
      },
      undefined,
      'SOCKET_PAYLOAD_VERSION_UNSUPPORTED'
    );
  });

  it('isolates Event rooms and closes/cancels Staff sockets while dashboards remain connected', async () => {
    const first = await createScannerFixture();
    const second = await createScannerFixture();
    const firstCookie = await login(first.email);
    const secondCookie = await login(second.email);
    const firstDashboard = await connectUser(firstCookie, first.eventId, 'dashboard', false);
    const secondDashboard = await connectUser(secondCookie, second.eventId, 'dashboard', false);
    const firstStaff = await connectStaff(first.staffToken, 'scanner');
    const firstReceived = onceEvent(firstDashboard, 'checkin.created');
    const secondReceived = vi.fn();
    secondDashboard.on('checkin.created', secondReceived);
    await publisher.publishCheckInCreated({
      eventId: first.eventId,
      invitationId: first.invitationId,
      operationId: randomUUID(),
      occurredAt: new Date().toISOString(),
      checkIns: [{ checkInId: randomUUID(), assistantId: first.primaryId }]
    });
    await firstReceived;
    await nextTurn();
    expect(secondReceived).not.toHaveBeenCalled();

    const closedEnvelope = onceEvent(firstDashboard, 'event.closed');
    const staffClosedEnvelope = onceEvent(firstStaff, 'event.closed');
    const disconnected = onceDisconnected(firstStaff);
    const closedPublisher = vi.spyOn(publisher, 'publishEventClosed');
    const closeKey = randomUUID();
    await lifecycleRequest('close', first.eventId, firstCookie, closeKey).expect(200);
    expect((await closedEnvelope).eventName).toBe('event.closed');
    expect((await staffClosedEnvelope).eventName).toBe('event.closed');
    await disconnected;
    await lifecycleRequest('close', first.eventId, firstCookie, closeKey).expect(200);
    expect(closedPublisher).toHaveBeenCalledTimes(1);
    expect(firstDashboard.connected).toBe(true);
    await expectStaffError(first.staffToken, 'scanner', 'SOCKET_EVENT_CLOSED');

    const cancelled = await createScannerFixture();
    const cancelledCookie = await login(cancelled.email);
    const cancelledDashboard = await connectUser(cancelledCookie, cancelled.eventId, 'dashboard', false);
    const cancelledStaff = await connectStaff(cancelled.staffToken, 'scanner');
    const cancelledEnvelope = onceEvent(cancelledDashboard, 'event.cancelled');
    const cancelledStaffEnvelope = onceEvent(cancelledStaff, 'event.cancelled');
    const cancelledDisconnected = onceDisconnected(cancelledStaff);
    const cancelledPublisher = vi.spyOn(publisher, 'publishEventCancelled');
    const cancelKey = randomUUID();
    await lifecycleRequest('cancel', cancelled.eventId, cancelledCookie, cancelKey).expect(200);
    expect((await cancelledEnvelope).eventName).toBe('event.cancelled');
    expect((await cancelledStaffEnvelope).eventName).toBe('event.cancelled');
    await cancelledDisconnected;
    await lifecycleRequest('cancel', cancelled.eventId, cancelledCookie, cancelKey).expect(200);
    expect(cancelledPublisher).toHaveBeenCalledTimes(1);
    expect(cancelledDashboard.connected).toBe(true);
    await expectStaffError(cancelled.staffToken, 'scanner', 'SOCKET_EVENT_CANCELLED');
  });

  it('emits committed domain changes once, suppresses replay/no-op and exposes no sensitive keys', async () => {
    const fixture = await createScannerFixture();
    const cookie = await login(fixture.email);
    const scannerSocket = await connectStaff(fixture.staffToken, 'scanner');
    const checkInSpy = vi.spyOn(publisher, 'publishCheckInCreated');
    const createdEvent = onceEvent(scannerSocket, 'checkin.created');
    const key = randomUUID();
    const checked = await scannerCheckIn(fixture, key, [fixture.primaryId, fixture.companionId]).expect(200);
    const created = await createdEvent;
    expect(created.data.checkIns).toHaveLength(2);
    expect(created.data.delta).toBe(2);
    expect(created.data.checkIns.map((item: { assistantId: string }) => item.assistantId)).toEqual(
      checked.body.checkedIn.map((item: { assistantId: string }) => item.assistantId)
    );
    expectNoSensitiveKeys(created);
    await scannerCheckIn(fixture, key, [fixture.primaryId, fixture.companionId]).expect(200);
    expect(checkInSpy).toHaveBeenCalledTimes(1);

    const revertedSpy = vi.spyOn(publisher, 'publishCheckInReverted');
    const revertedEvent = onceEvent(scannerSocket, 'checkin.reverted');
    const checkInId = checked.body.checkedIn[0].checkInId as string;
    const revertKey = randomUUID();
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/check-ins/${checkInId}/revert`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', revertKey)
      .send({})
      .expect(200);
    expect((await revertedEvent).data.delta).toBe(-1);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/check-ins/${checkInId}/revert`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', revertKey)
      .send({})
      .expect(200);
    expect(revertedSpy).toHaveBeenCalledTimes(1);

    const rsvpFixture = await createScannerFixture(InvitationResponseStatus.PENDING);
    const rsvpSocket = await connectUser(await login(rsvpFixture.email), rsvpFixture.eventId, 'dashboard', false);
    const rsvpSpy = vi.spyOn(publisher, 'publishRsvpUpdated');
    const confirmedEvent = onceEvent(rsvpSocket, 'rsvp.updated');
    await publicConfirm(rsvpFixture, [{ name: 'AcompaÃ±ante' }]).expect(200);
    const confirmed = await confirmedEvent;
    expect(confirmed.actorType).toBe('PUBLIC_TOKEN');
    expect(confirmed.data).toMatchObject({
      invitationId: rsvpFixture.invitationId,
      status: InvitationResponseStatus.CONFIRMED,
      previousConfirmedAssistants: 0,
      confirmedAssistants: 2
    });
    expectNoSensitiveKeys(confirmed);
    await publicConfirm(rsvpFixture, [{ name: 'AcompaÃ±ante' }]).expect(200);
    expect(rsvpSpy).toHaveBeenCalledTimes(1);
    const nominalEvent = onceEvent(rsvpSocket, 'rsvp.updated');
    const extra = await prisma.assistant.findFirstOrThrow({
      where: { invitationId: rsvpFixture.invitationId, isPrimary: false, deletedAt: null }
    });
    await request(app.getHttpServer())
      .patch(`/api/v1/public/invitations/${encodeURIComponent(rsvpFixture.invitationToken)}/assistants`)
      .send({ additionalAssistants: [{ id: extra.id, name: 'Nombre actualizado' }] })
      .expect(200);
    const nominal = await nominalEvent;
    expect(nominal.data.confirmedAssistants).toBe(nominal.data.previousConfirmedAssistants);

    const emitFailure = vi.spyOn(realtimeServer, 'emit').mockImplementation(() => {
      throw new Error('transport unavailable');
    });
    const failureFixture = await createScannerFixture();
    await scannerCheckIn(failureFixture, randomUUID(), [failureFixture.primaryId]).expect(200);
    expect(
      await prisma.checkIn.count({
        where: { eventId: failureFixture.eventId, revertedAt: null }
      })
    ).toBe(1);

    const failedRsvp = await createScannerFixture(InvitationResponseStatus.PENDING);
    await publicConfirm(failedRsvp, []).expect(200);
    expect((await prisma.invitation.findUniqueOrThrow({ where: { id: failedRsvp.invitationId } })).responseStatus).toBe(
      InvitationResponseStatus.CONFIRMED
    );
    const failedRevertCookie = await login(failureFixture.email);
    await request(app.getHttpServer())
      .post(
        `/api/v1/events/${failureFixture.eventId}/check-ins/${
          (await prisma.checkIn.findFirstOrThrow({ where: { eventId: failureFixture.eventId } })).id
        }/revert`
      )
      .set('Origin', origin)
      .set('Cookie', failedRevertCookie)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(200);
    expect(
      (await prisma.checkIn.findFirstOrThrow({ where: { eventId: failureFixture.eventId } })).revertedAt
    ).not.toBeNull();
    const failedClose = await createScannerFixture();
    await lifecycleRequest('close', failedClose.eventId, await login(failedClose.email)).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: failedClose.eventId } })).status).toBe(
      EventStatus.CLOSED
    );
    const failedCancel = await createScannerFixture();
    await lifecycleRequest('cancel', failedCancel.eventId, await login(failedCancel.email)).expect(200);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: failedCancel.eventId } })).status).toBe(
      EventStatus.CANCELLED
    );
    emitFailure.mockRestore();
  });

  it('emits only the concurrent check-in winner and emits nothing after an audit rollback', async () => {
    const fixture = await createScannerFixture();
    const competingToken = await createStaff(fixture.eventId, fixture.userId);
    const publish = vi.spyOn(publisher, 'publishCheckInCreated');
    const invoke = (staffToken: string) =>
      request(app.getHttpServer())
        .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/check-in`)
        .set('Idempotency-Key', randomUUID())
        .send({ invitationId: fixture.invitationId, assistantIds: [fixture.primaryId] });
    const results = await Promise.all([invoke(fixture.staffToken), invoke(competingToken)]);
    expect(results.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);

    const rollback = await createScannerFixture();
    publish.mockClear();
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('forced audit rollback'));
    await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(rollback.staffToken)}/check-in`)
      .set('Idempotency-Key', randomUUID())
      .send({ invitationId: rollback.invitationId, assistantIds: [rollback.primaryId] })
      .expect(500);
    expect(await prisma.checkIn.count({ where: { eventId: rollback.eventId } })).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });

  it('completes the HTTP and Socket.IO vertical slice from Event creation through close', async () => {
    const owner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const cookie = await login(owner.email);
    const service = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    await prisma.servicePrice.create({
      data: {
        serviceId: service.id,
        clientType: ClientType.PLANNER,
        credits: 0,
        validFrom: new Date(Date.now() - 60_000)
      }
    });

    const createdEvent = await request(app.getHttpServer())
      .post('/api/v1/events')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({
        name: 'Vertical Realtime',
        serviceId: service.id,
        socialType: 'OTHER',
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        capacity: 20,
        confirmationEnabled: true,
        locationUrl: 'https://example.com/ubicacion',
        giftRegistryUrl: 'https://example.com/regalos'
      })
      .expect(201);
    const eventId = createdEvent.body.id as string;
    const contact = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/contacts`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ name: 'Invitado Vertical', whatsappPhone: '+525511223344' })
      .expect(201);
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { contactId: contact.body.id as string },
      include: { assistants: true }
    });
    const primary = invitation.assistants.find(({ isPrimary }) => isPrimary);
    if (!primary) throw new Error('The vertical invitation requires a primary Assistant.');

    const image = await sharp({
      create: { width: 64, height: 64, channels: 3, background: '#5b21b6' }
    })
      .png()
      .toBuffer();
    const upload = (fileType: 'FLYER_INITIAL_IMAGE' | 'FLYER_QR_IMAGE') =>
      request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/file-assets`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .field('ownerType', 'FLYER')
        .field('fileType', fileType)
        .attach('file', image, { filename: `${fileType}.png`, contentType: 'image/png' });
    const initial = await upload('FLYER_INITIAL_IMAGE').expect(201);
    const qrImage = await upload('FLYER_QR_IMAGE').expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/design/flyer`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ initialAssetId: initial.body.id, qrAssetId: qrImage.body.id })
      .expect(201);
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      await request(app.getHttpServer())
        .post(`/api/v1/events/${eventId}/hotspots`)
        .set('Origin', origin)
        .set('Cookie', cookie)
        .send({
          visualOwnerType: HotspotVisualOwnerType.FLYER,
          action,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.2,
          priority: 1
        })
        .expect(201);
    }
    await request(app.getHttpServer())
      .get(`/api/v1/events/${eventId}/design/readiness`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({ complete: true, blockers: [] }));
    // CODEX-040 does not expose a preparation-state promotion endpoint; this is the
    // sole unavoidable technical state seed before exercising the real activation.
    await prisma.event.update({ where: { id: eventId }, data: { status: EventStatus.READY_TO_ACTIVATE } });
    const activation = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', randomUUID())
      .send({});
    expect(activation.status, JSON.stringify(activation.body)).toBe(200);

    const invitationToken = invitationTokens.issue('INVITATION', invitation.id, invitation.invitationTokenNonce);
    await request(app.getHttpServer())
      .post(`/api/v1/public/invitations/${encodeURIComponent(invitationToken)}/confirm`)
      .send({ additionalAssistants: [] })
      .expect(200);
    const qrSvg = await binaryGet(`/api/v1/public/invitations/${encodeURIComponent(invitationToken)}/qr.svg`).expect(
      200
    );
    const raster = await sharp(qrSvg.body as Buffer)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(raster.data), raster.info.width, raster.info.height);
    expect(decoded?.data).toMatch(/^qr1\./u);

    const staff = await request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias: 'Scanner vertical' })
      .expect(201);
    const staffToken = staff.body.token as string;
    const staffSocket = await connectStaff(staffToken, 'scanner');
    const scan = await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/scan`)
      .send({ qrToken: decoded?.data })
      .expect(200);
    expect(scan.body.pendingAssistants).toEqual(expect.arrayContaining([expect.objectContaining({ id: primary.id })]));

    const notification = onceEvent(staffSocket, 'checkin.created');
    await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/check-in`)
      .set('Idempotency-Key', randomUUID())
      .send({ invitationId: invitation.id, assistantIds: [primary.id] })
      .expect(200);
    expect((await notification).data.checkIns).toEqual([
      expect.objectContaining({ assistantId: primary.id, invitationId: invitation.id })
    ]);
    const after = await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/scan`)
      .send({ qrToken: decoded?.data })
      .expect(200);
    expect(after.body.pendingAssistants).toEqual([]);

    const closed = onceEvent(staffSocket, 'event.closed');
    const disconnected = onceDisconnected(staffSocket);
    await lifecycleRequest('close', eventId, cookie).expect(200);
    expect((await closed).eventName).toBe('event.closed');
    await disconnected;
    await request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(staffToken)}/scan`)
      .send({ qrToken: decoded?.data })
      .expect(401);
    await expectStaffError(staffToken, 'scanner', 'SOCKET_EVENT_CLOSED');
  }, 60_000);

  async function createScannerFixture(responseStatus: InvitationResponseStatus = InvitationResponseStatus.CONFIRMED) {
    const owner = await createClientUser(ClientType.PLANNER, UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner, EventStatus.ACTIVE);
    const contactId = randomUUID();
    const invitationId = randomUUID();
    const primaryId = randomUUID();
    const companionId = randomUUID();
    const invitationNonce = randomBytes(32).toString('hex');
    const qrNonce = randomBytes(32).toString('hex');
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.contact.create({
        data: {
          id: contactId,
          eventId: event.id,
          name: 'Contacto Privado',
          whatsappPhoneNormalized: '+525500000000'
        }
      });
      await tx.invitation.create({
        data: {
          id: invitationId,
          eventId: event.id,
          contactId,
          mode: InvitationMode.FAMILY_NOMINAL,
          responseStatus,
          additionalAssistantLimit: 2,
          invitationTokenNonce: invitationNonce,
          qrTokenNonce: qrNonce
        }
      });
      await tx.assistant.createMany({
        data: [
          {
            id: primaryId,
            eventId: event.id,
            invitationId,
            name: 'Nombre Principal',
            isPrimary: true,
            responseStatus:
              responseStatus === InvitationResponseStatus.CONFIRMED
                ? AssistantResponseStatus.CONFIRMED
                : AssistantResponseStatus.PENDING
          },
          {
            id: companionId,
            eventId: event.id,
            invitationId,
            name: 'Nombre AcompaÃ±ante',
            responseStatus:
              responseStatus === InvitationResponseStatus.CONFIRMED
                ? AssistantResponseStatus.CONFIRMED
                : AssistantResponseStatus.PENDING
          }
        ]
      });
    });
    const staffToken = await createStaff(event.id, owner.userId);
    return {
      ...owner,
      eventId: event.id,
      contactId,
      invitationId,
      primaryId,
      companionId,
      staffToken,
      invitationToken: invitationTokens.issue('INVITATION', invitationId, invitationNonce),
      qrToken: invitationTokens.issue('QR', invitationId, qrNonce)
    };
  }

  async function createClientUser(type: ClientType, role: UserRole) {
    const client = await prisma.client.create({
      data: { type, name: `Cliente ${randomUUID()}`, status: ClientStatus.ACTIVE }
    });
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.id, email: user.email, role };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    return prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
        clientId
      }
    });
  }

  async function createEvent(
    owner: { clientId: string; userId: string },
    status: EventStatus,
    floorplanEnabled = false
  ) {
    const eventId = randomUUID();
    await prisma.$transaction(async (tx) => {
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
            clientType: ClientType.PLANNER,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activated =
        status !== EventStatus.DRAFT && status !== EventStatus.CONFIGURED && status !== EventStatus.READY_TO_ACTIVATE;
      let activation:
        | {
            activatedAt: Date;
            activatedByUserId: string;
            activatedServiceId: string;
            activatedServicePriceId: string;
            baseCostCredits: number;
            promotionDiscountCredits: number;
            finalCostCredits: number;
            purchasedCreditsUsed: number;
            creditLineCreditsUsed: number;
            activationReceiptId: string;
            activationIdempotencyKey: string;
          }
        | undefined;
      if (activated) {
        const key = `realtime-activation-${randomUUID()}`;
        const receipt = await tx.receipt.create({
          data: {
            folio: 9_000_000_000_000n + BigInt(Math.floor(Math.random() * 900_000_000_000)),
            clientId: owner.clientId,
            operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
            operationReference: key,
            idempotencyKey: key
          }
        });
        activation = {
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
          activationIdempotencyKey: key
        };
      }
      await tx.event.create({
        data: {
          id: eventId,
          clientId: owner.clientId,
          createdByUserId: owner.userId,
          serviceId: service.id,
          name: `Evento ${status}`,
          status,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 100,
          confirmationEnabled: true,
          floorplanEnabled,
          ...(activation ?? {})
        }
      });
    });
    return prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  }

  async function createStaff(eventId: string, userId: string, expiredAt?: Date) {
    const generated = staffTechnical.generate();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.staffToken.create({
        data: {
          eventId,
          alias: 'Acceso realtime',
          tokenDigestSha256: generated.digestSha256,
          createdByUserId: userId,
          ...(expiredAt ? { createdAt: new Date(expiredAt.getTime() - 86_400_000), expiredAt } : {})
        }
      });
    });
    return generated.rawToken;
  }

  async function login(email: string) {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing authentication cookie.');
    return cookie;
  }

  async function connectUser(
    cookie: string,
    eventId: string,
    roomType: 'dashboard' | 'floorplan',
    administrative: boolean
  ) {
    return connect(
      {
        protocolVersion: 1,
        actorMode: 'USER',
        roomType,
        eventId,
        administrative
      },
      cookie
    );
  }

  async function connectStaff(token: string, roomType: 'scanner' | 'floorplan') {
    return connect({
      protocolVersion: 1,
      actorMode: 'STAFF_TOKEN',
      roomType,
      staffToken: token
    });
  }

  async function connect(auth: Record<string, unknown>, cookie?: string) {
    const socket = socketClient(auth, cookie);
    sockets.add(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('connect_error', reject);
    });
    return socket;
  }

  async function expectUserError(
    cookie: string,
    eventId: string,
    roomType: 'dashboard' | 'floorplan',
    administrative: boolean,
    code: string
  ) {
    await expectConnectionError(
      {
        protocolVersion: 1,
        actorMode: 'USER',
        roomType,
        eventId,
        administrative
      },
      cookie,
      code
    );
  }

  async function expectStaffError(staffToken: string, roomType: 'scanner' | 'floorplan', code: string) {
    await expectConnectionError(
      {
        protocolVersion: 1,
        actorMode: 'STAFF_TOKEN',
        roomType,
        staffToken
      },
      undefined,
      code
    );
  }

  async function expectConnectionError(auth: Record<string, unknown>, cookie: string | undefined, code: string) {
    const socket = socketClient(auth, cookie);
    sockets.add(socket);
    const error = await new Promise<Error & { data?: { code?: string } }>((resolve, reject) => {
      socket.once('connect', () => reject(new Error('Socket unexpectedly connected.')));
      socket.once('connect_error', resolve);
    });
    expect(error.data?.code).toBe(code);
    socket.close();
  }

  function socketClient(auth: Record<string, unknown>, cookie?: string) {
    return io(`${baseUrl}/realtime`, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth,
      ...(cookie ? { extraHeaders: { Cookie: cookie } } : {})
    });
  }

  function onceEvent(socket: Socket, eventName: string) {
    return new Promise<TestRealtimeEnvelope>((resolve) => {
      socket.once(eventName, resolve);
    });
  }

  function onceDisconnected(socket: Socket) {
    return new Promise<void>((resolve) => {
      socket.once('disconnect', () => resolve());
    });
  }

  function lifecycleRequest(action: 'close' | 'cancel', eventId: string, cookie: string, key = randomUUID()) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/${action}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({});
  }

  function scannerCheckIn(
    fixture: Awaited<ReturnType<typeof createScannerFixture>>,
    key: string,
    assistantIds: string[]
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(fixture.staffToken)}/check-in`)
      .set('Idempotency-Key', key)
      .send({ invitationId: fixture.invitationId, assistantIds });
  }

  function publicConfirm(
    fixture: Awaited<ReturnType<typeof createScannerFixture>>,
    additionalAssistants: Array<{ id?: string; name: string }>
  ) {
    return request(app.getHttpServer())
      .post(`/api/v1/public/invitations/${encodeURIComponent(fixture.invitationToken)}/confirm`)
      .send({ additionalAssistants });
  }

  function binaryGet(path: string) {
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

  function expectNoSensitiveKeys(value: unknown) {
    const forbidden = new Set([
      'phone',
      'name',
      'contact',
      'token',
      'digest',
      'nonce',
      'clientId',
      'balance',
      'debt',
      'ledger',
      'receipt',
      'signedUrl'
    ]);
    const visit = (item: unknown): void => {
      if (Array.isArray(item)) {
        item.forEach(visit);
        return;
      }
      if (typeof item !== 'object' || item === null) return;
      for (const [key, nested] of Object.entries(item)) {
        if (key !== 'eventName') {
          expect(forbidden.has(key)).toBe(false);
        }
        visit(nested);
      }
    };
    visit(value);
  }

  function nextTurn() {
    return new Promise<void>((resolve) => setImmediate(resolve));
  }

  function closeSockets() {
    for (const socket of sockets) socket.close();
    sockets.clear();
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "check_in", "staff_token", "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group",
        "event_state_operation", "event", "debt_payment_allocation", "ledger_entry", "payment",
        "receipt", "credit_line", "finance_balance", "promotion", "service_price", "service",
        "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
