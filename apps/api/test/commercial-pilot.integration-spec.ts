import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import {
  ClientStatus,
  ClientType,
  CommercialChannel,
  CommercialOpportunityType,
  EventSocialType,
  EventStatus,
  FileAssetOwnerType,
  FileAssetStatus,
  FileAssetType,
  HotspotAction,
  HotspotVisualOwnerType,
  LedgerMovementType,
  ServiceCode,
  StorageProvider,
  UserRole,
  VenuePriceTier
} from '../src/generated/prisma/client';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('PILOT-03 paid commercial journeys', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
  });

  beforeEach(resetDatabase, 60_000);

  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('certifies Partner Flyer 80 from LAND-02 through immutable activation, Staff and economics', async () => {
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const client = await prisma.client.create({
      data: { name: 'UAT Partner', type: ClientType.PLANNER, status: ClientStatus.ACTIVE }
    });
    const planner = await createUser(client.id, UserRole.INDEPENDENT_PLANNER);
    const foreignClient = await prisma.client.create({
      data: { name: 'UAT Foreign', type: ClientType.PLANNER, status: ClientStatus.ACTIVE }
    });
    const foreignPlanner = await createUser(foreignClient.id, UserRole.INDEPENDENT_PLANNER);
    const adminCookie = await login(admin.email);
    const plannerCookie = await login(planner.email);
    const foreignCookie = await login(foreignPlanner.email);
    const service = await prisma.service.create({ data: { code: ServiceCode.FLYER } });
    const lockedPrice = await createCapacityPrice(service.id, CommercialChannel.PARTNER, 1, 100, 215);

    await classifyClient(client.id, CommercialChannel.PARTNER, adminCookie).expect(200);
    await assignCredits(client.id, 215, adminCookie, 'partner-flyer-coverage').expect(201);

    const leadBaseline = await entityCounts();
    await postLead(CommercialOpportunityType.PLANNER_AGENCY).expect(201, { accepted: true });
    const leadAfter = await entityCounts();
    expect(leadAfter).toEqual({ ...leadBaseline, leads: leadBaseline.leads + 1 });
    await request(app.getHttpServer()).get('/api/v1/admin/commercial-leads').set('Cookie', plannerCookie).expect(403);

    const quote = await intakeQuote(client.id, ServiceCode.FLYER, 80, adminCookie).expect(200);
    expect(quote.body).toMatchObject({
      commercialChannel: CommercialChannel.PARTNER,
      serviceCode: ServiceCode.FLYER,
      capacity: 80,
      servicePriceId: lockedPrice.id,
      capacityMin: 1,
      capacityMax: 100,
      finalCostCredits: 215,
      amountMxnCents: 430_000
    });

    const financialBeforeIntake = await financialCounts();
    const intake = await createIntake(
      client.id,
      {
        name: 'UAT Partner Flyer',
        serviceCode: ServiceCode.FLYER,
        capacity: 80,
        acceptedServicePriceId: quote.body.servicePriceId,
        assignedPlannerUserId: planner.id,
        acceptanceConfirmed: true
      },
      adminCookie
    ).expect(201);
    expect(intake.body).toMatchObject({
      createdByUserId: admin.id,
      assignedPlannerUserId: planner.id,
      commercialServicePriceId: lockedPrice.id,
      commercialFinalCostCredits: 215,
      commercialChannelSnapshot: CommercialChannel.PARTNER
    });
    expect(await financialCounts()).toEqual(financialBeforeIntake);

    const replacementAt = new Date();
    await prisma.servicePrice.update({ where: { id: lockedPrice.id }, data: { validUntil: replacementAt } });
    await createCapacityPrice(service.id, CommercialChannel.PARTNER, 1, 100, 999, replacementAt);

    await updateAdminEvent(
      client.id,
      intake.body.id,
      {
        socialType: EventSocialType.OTHER,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        confirmationEnabled: true,
        locationUrl: 'https://example.com/ubicacion',
        giftRegistryUrl: 'https://example.com/regalos'
      },
      adminCookie
    ).expect(200);
    await adminEventPost(client.id, intake.body.id, 'design-kickoff', adminCookie).expect(200);
    await prepareFlyer(client.id, intake.body.id, admin.id, adminCookie);
    await createContact(intake.body.id, plannerCookie, 'Invitado UAT').expect(201);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: intake.body.id } })).status).toBe(
      EventStatus.READY_TO_ACTIVATE
    );

    await request(app.getHttpServer()).get(`/api/v1/events/${intake.body.id}`).set('Cookie', foreignCookie).expect(404);
    await request(app.getHttpServer()).get(`/api/v1/events/${intake.body.id}`).set('Cookie', plannerCookie).expect(200);

    const ledgerBeforeActivation = await prisma.ledgerEntry.count({ where: { eventId: intake.body.id } });
    const activationKey = 'uat-partner-flyer-activation';
    const activated = await activate(intake.body.id, plannerCookie, activationKey).expect(200);
    expect(activated.body).toMatchObject({
      baseCostCredits: 215,
      finalCostCredits: 215,
      purchasedCreditsUsed: 215,
      event: {
        commercialServicePriceId: lockedPrice.id,
        activatedServicePriceId: lockedPrice.id,
        finalCostCredits: 215
      }
    });
    const replay = await activate(intake.body.id, plannerCookie, activationKey).expect(200);
    expect(replay.body).toEqual(activated.body);
    expect(await prisma.ledgerEntry.count({ where: { eventId: intake.body.id } })).toBe(ledgerBeforeActivation + 1);
    expect(
      await prisma.ledgerEntry.aggregate({
        where: { eventId: intake.body.id, movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE },
        _sum: { purchasedCreditDelta: true }
      })
    ).toMatchObject({ _sum: { purchasedCreditDelta: -215 } });

    const delivered: boolean[] = [];
    for (const alias of ['Acceso UAT', 'Acceso UAT 2', 'Acceso UAT 3']) {
      const token = await createStaffToken(intake.body.id, plannerCookie, alias).expect(201);
      expect(token.body.token).toMatch(/^st1\.[A-Za-z0-9_-]{43}$/u);
      expect(token.body.sessionPath).toBe(`/api/v1/scanner/${encodeURIComponent(token.body.token)}/session`);
      delivered.push(true);
    }
    expect(delivered).toEqual([true, true, true]);
    await createStaffToken(intake.body.id, plannerCookie, 'Acceso UAT 4')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('STAFF_TOKEN_LIMIT_REACHED'));
    const listed = await request(app.getHttpServer())
      .get(`/api/v1/events/${intake.body.id}/staff-tokens`)
      .set('Cookie', plannerCookie)
      .expect(200);
    expect(listed.body).toHaveLength(3);
    expect(JSON.stringify(listed.body)).not.toMatch(/st1\.|sessionPath|digest/iu);
    await createStaffToken(intake.body.id, adminCookie, 'Platform forbidden').expect(403);

    const ledgerBeforeEconomics = await prisma.ledgerEntry.count();
    const balanceBeforeEconomics = await prisma.financeBalance.findUnique({ where: { clientId: client.id } });
    const designer = await observe(client.id, intake.body.id, adminCookie, {
      kind: 'DESIGNER_COST',
      area: 'INVITATION',
      amountMxnCents: 1500,
      count: 1
    }).expect(201);
    await observe(client.id, intake.body.id, adminCookie, {
      kind: 'EXTERNAL_COST',
      area: 'GENERAL',
      amountMxnCents: 500,
      count: 1
    }).expect(201);
    await observe(client.id, intake.body.id, adminCookie, {
      kind: 'DESIGN_ROUND',
      area: 'INVITATION',
      durationMinutes: 25,
      count: 2
    }).expect(201);
    await observe(client.id, intake.body.id, adminCookie, {
      kind: 'PREPARATION_TIME',
      area: 'INVITATION',
      durationMinutes: 30,
      count: 1
    }).expect(201);
    await observe(client.id, intake.body.id, adminCookie, {
      kind: 'PLANNER_SUPPORT',
      area: 'GENERAL',
      durationMinutes: 15,
      count: 1
    }).expect(201);
    await correctObservation(client.id, intake.body.id, designer.body.id, adminCookie).expect(201);

    const economics = await getEconomics(client.id, intake.body.id, adminCookie).expect(200);
    expect(economics.body).toMatchObject({
      commercialChannel: CommercialChannel.PARTNER,
      commercialChannelSource: 'SNAPSHOT',
      grossRevenueCredits: 215,
      grossRevenueMxnCents: 430_000,
      directCostMxnCents: 500,
      contributionMarginMxnCents: 429_500,
      designRounds: 2,
      operatorMinutesTotal: 70
    });
    expect(await prisma.ledgerEntry.count()).toBe(ledgerBeforeEconomics);
    expect(await prisma.financeBalance.findUnique({ where: { clientId: client.id } })).toEqual(balanceBeforeEconomics);
    await getEconomics(client.id, intake.body.id, plannerCookie).expect(403);
    await getEconomics(foreignClient.id, intake.body.id, adminCookie).expect(404);
  }, 60_000);

  it('certifies Venue QR with calendar M-1 volume, refund exclusion, assignment and no digital product leakage', async () => {
    const admin = await createUser(null, UserRole.PLATFORM_ADMIN);
    const client = await prisma.client.create({
      data: { name: 'UAT Venue', type: ClientType.ORGANIZATION, status: ClientStatus.ACTIVE }
    });
    await createUser(client.id, UserRole.ORGANIZATION_ADMIN);
    const plannerA = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const plannerB = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const adminCookie = await login(admin.email);
    const plannerACookie = await login(plannerA.email);
    const plannerBCookie = await login(plannerB.email);
    const service = await prisma.service.create({ data: { code: ServiceCode.PHYSICAL_QR } });
    const priceOneToTwo = await createVenuePrice(service.id, VenuePriceTier.ONE_TO_TWO, 120);
    await createVenuePrice(service.id, VenuePriceTier.THREE_TO_FIVE, 110);
    await createVenuePrice(service.id, VenuePriceTier.SIX_TO_TEN, 100);
    await createVenuePrice(service.id, VenuePriceTier.ELEVEN_PLUS, 90);
    await classifyClient(client.id, CommercialChannel.VENUE, adminCookie).expect(200);
    await assignCredits(client.id, 600, adminCookie, 'venue-qr-coverage').expect(201);

    const leadBaseline = await entityCounts();
    await postLead(CommercialOpportunityType.VENUE).expect(201, { accepted: true });
    expect(await entityCounts()).toEqual({ ...leadBaseline, leads: leadBaseline.leads + 1 });

    const now = new Date();
    const previousMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 18));
    const history = [];
    for (let index = 0; index < 3; index += 1) {
      history.push(
        await createChargedVenueEvent(client.id, plannerA.id, service.id, priceOneToTwo.id, previousMonth, index)
      );
    }
    const quoteThree = await intakeQuote(client.id, ServiceCode.PHYSICAL_QR, 100, adminCookie).expect(200);
    expect(quoteThree.body).toMatchObject({
      commercialChannel: CommercialChannel.VENUE,
      venueTier: VenuePriceTier.THREE_TO_FIVE,
      capacityMin: null,
      capacityMax: null,
      finalCostCredits: 110,
      amountMxnCents: 220_000
    });

    await createChargedVenueEvent(client.id, plannerA.id, service.id, priceOneToTwo.id, now, 99);
    expect((await intakeQuote(client.id, ServiceCode.PHYSICAL_QR, 100, adminCookie).expect(200)).body).toMatchObject({
      venueTier: VenuePriceTier.THREE_TO_FIVE,
      finalCostCredits: 110
    });

    await refundEventFully(client.id, plannerA.id, history[0]!.id, 120);
    const quoteAfterRefund = await intakeQuote(client.id, ServiceCode.PHYSICAL_QR, 100, adminCookie).expect(200);
    expect(quoteAfterRefund.body).toMatchObject({
      venueTier: VenuePriceTier.ONE_TO_TWO,
      finalCostCredits: 120,
      amountMxnCents: 240_000
    });

    const intake = await createIntake(
      client.id,
      {
        name: 'UAT Venue QR',
        serviceCode: ServiceCode.PHYSICAL_QR,
        capacity: 100,
        acceptedServicePriceId: quoteAfterRefund.body.servicePriceId,
        assignedPlannerUserId: plannerA.id,
        acceptanceConfirmed: true
      },
      adminCookie
    ).expect(201);
    expect(intake.body).toMatchObject({ createdByUserId: admin.id, assignedPlannerUserId: plannerA.id });
    expect(intake.body.designKickoffAt).toBeNull();

    await request(app.getHttpServer())
      .get(`/api/v1/events/${intake.body.id}`)
      .set('Cookie', plannerACookie)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${intake.body.id}`)
      .set('Cookie', plannerBCookie)
      .expect(404);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${client.id}/events/${intake.body.id}/assignment`)
      .set('Origin', origin)
      .set('Cookie', adminCookie)
      .send({ assignedPlannerUserId: plannerB.id })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${intake.body.id}`)
      .set('Cookie', plannerACookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${intake.body.id}`)
      .set('Cookie', plannerBCookie)
      .expect(200);

    await updateAdminEvent(
      client.id,
      intake.body.id,
      {
        socialType: EventSocialType.OTHER,
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City'
      },
      adminCookie
    ).expect(200);
    await adminEventPost(client.id, intake.body.id, 'design-kickoff', adminCookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('EVENT_DESIGN_KICKOFF_NOT_APPLICABLE'));
    const generated = await request(app.getHttpServer())
      .post(`/api/v1/events/${intake.body.id}/physical-passes/generate`)
      .set('Origin', origin)
      .set('Cookie', plannerBCookie)
      .set('Idempotency-Key', 'uat-venue-qr-generate')
      .send({ quantity: 1, tableShapeId: null })
      .expect(200);
    expect(generated.body.passes).toHaveLength(1);
    const storedBeforeActivation = await prisma.event.findUniqueOrThrow({ where: { id: intake.body.id } });
    expect(storedBeforeActivation).toMatchObject({
      status: EventStatus.READY_TO_ACTIVATE,
      designKickoffAt: null,
      createdByUserId: admin.id,
      assignedPlannerUserId: plannerB.id,
      commercialVenueTierSnapshot: VenuePriceTier.ONE_TO_TWO
    });

    const activated = await activate(intake.body.id, plannerBCookie, 'uat-venue-qr-activation').expect(200);
    expect(activated.body).toMatchObject({
      finalCostCredits: 120,
      event: { activatedServicePriceId: quoteAfterRefund.body.servicePriceId }
    });
    expect(await prisma.invitationDesign.count({ where: { eventId: intake.body.id } })).toBe(0);
    expect(await prisma.hotspot.count({ where: { eventId: intake.body.id } })).toBe(0);
    expect(await prisma.contact.count({ where: { eventId: intake.body.id } })).toBe(0);
    expect(await prisma.invitation.count({ where: { eventId: intake.body.id } })).toBe(0);
    expect(await prisma.album.count({ where: { eventId: intake.body.id } })).toBe(0);
  }, 60_000);

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@pilot.test`;
    const user = await prisma.user.create({
      data: { clientId, role, email, passwordHash: await hashPassword(password) }
    });
    return { id: user.id, email };
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', origin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie.');
    return cookie;
  }

  function classifyClient(clientId: string, commercialChannel: CommercialChannel, cookie: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ commercialChannel });
  }

  function assignCredits(clientId: string, credits: number, cookie: string, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/finance/clients/${clientId}/assign-credits`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ credits, reason: 'PILOT-03 test coverage' });
  }

  function postLead(opportunityType: CommercialOpportunityType) {
    return request(app.getHttpServer())
      .post('/api/v1/public/commercial-leads')
      .set('Origin', origin)
      .set('X-Operation-Id', randomUUID())
      .send({
        submissionId: randomUUID(),
        opportunityType,
        contactName: 'Contacto UAT',
        businessName: 'Negocio UAT',
        email: `${randomUUID()}@example.test`,
        phone: null,
        estimatedEventsPerMonth: 4,
        notes: 'PILOT-03',
        privacyAccepted: true,
        website: ''
      });
  }

  function intakeQuote(clientId: string, serviceCode: ServiceCode, capacity: number, cookie: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}/events/intake-quote`)
      .query({ serviceCode, capacity })
      .set('Cookie', cookie);
  }

  function createIntake(clientId: string, body: Record<string, unknown>, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function updateAdminEvent(clientId: string, eventId: string, body: Record<string, unknown>, cookie: string) {
    return request(app.getHttpServer())
      .patch(`/api/v1/admin/clients/${clientId}/events/${eventId}`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function adminEventPost(clientId: string, eventId: string, suffix: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/${suffix}`)
      .set('Origin', origin)
      .set('Cookie', cookie);
  }

  function createContact(eventId: string, cookie: string, name: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/contacts`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ name, whatsappPhone: '+525500000039' });
  }

  function activate(eventId: string, cookie: string, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/activate`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key);
  }

  function createStaffToken(eventId: string, cookie: string, alias: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias });
  }

  function observe(clientId: string, eventId: string, cookie: string, body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/pilot-observations`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send(body);
  }

  function correctObservation(clientId: string, eventId: string, observationId: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/admin/clients/${clientId}/events/${eventId}/pilot-observations/${observationId}/correction`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ reason: 'Captura UAT corregida' });
  }

  function getEconomics(clientId: string, eventId: string, cookie: string) {
    return request(app.getHttpServer())
      .get(`/api/v1/admin/clients/${clientId}/events/${eventId}/unit-economics`)
      .set('Cookie', cookie);
  }

  async function prepareFlyer(clientId: string, eventId: string, adminId: string, cookie: string) {
    const event = { id: eventId, clientId };
    const initial = await readyAsset(event, adminId, FileAssetType.FLYER_INITIAL_IMAGE);
    const qr = await readyAsset(event, adminId, FileAssetType.FLYER_QR_IMAGE);
    await adminEventPost(clientId, eventId, 'design/flyer', cookie)
      .send({ initialAssetId: initial.id, qrAssetId: qr.id })
      .expect(201);
    for (const action of [
      HotspotAction.RSVP,
      HotspotAction.LOCATION,
      HotspotAction.GIFT_REGISTRY,
      HotspotAction.QR_AREA
    ]) {
      await adminEventPost(clientId, eventId, 'hotspots', cookie)
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
  }

  function readyAsset(event: { id: string; clientId: string }, userId: string, fileType: FileAssetType) {
    return prisma.fileAsset.create({
      data: {
        clientId: event.clientId,
        eventId: event.id,
        ownerType: FileAssetOwnerType.FLYER,
        fileType,
        storageProvider: StorageProvider.LOCAL,
        storageKey: randomBytes(32).toString('hex'),
        originalName: 'pilot.png',
        mimeType: 'image/png',
        sizeBytes: 64,
        checksumSha256: randomBytes(32).toString('hex'),
        width: 100,
        height: 100,
        createdByUserId: userId,
        status: FileAssetStatus.READY
      }
    });
  }

  function createCapacityPrice(
    serviceId: string,
    channel: CommercialChannel,
    capacityMin: number,
    capacityMax: number,
    credits: number,
    validFrom = new Date('2020-01-01T00:00:00.000Z')
  ) {
    return prisma.servicePrice.create({
      data: { serviceId, pricingVersion: 2, commercialChannel: channel, capacityMin, capacityMax, credits, validFrom }
    });
  }

  function createVenuePrice(serviceId: string, venueTier: VenuePriceTier, credits: number) {
    return prisma.servicePrice.create({
      data: {
        serviceId,
        pricingVersion: 2,
        commercialChannel: CommercialChannel.VENUE,
        venueTier,
        credits,
        validFrom: new Date('2020-01-01T00:00:00.000Z')
      }
    });
  }

  async function createChargedVenueEvent(
    clientId: string,
    actorUserId: string,
    serviceId: string,
    servicePriceId: string,
    activatedAt: Date,
    index: number
  ) {
    const event = await prisma.event.create({
      data: {
        clientId,
        createdByUserId: actorUserId,
        assignedPlannerUserId: actorUserId,
        serviceId,
        name: `Venue effective ${index}`,
        socialType: EventSocialType.OTHER,
        status: EventStatus.READY_TO_ACTIVATE,
        eventDateTime: activatedAt,
        timeZone: 'America/Mexico_City',
        capacity: 100
      }
    });
    const key = `venue-effective-${index}-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: { clientId, operationType: 'EVENT_ACTIVATION', operationReference: event.id, idempotencyKey: key }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId,
        eventId: event.id,
        actorUserId,
        movementType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
        purchasedCreditDelta: -120,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: event.id,
        idempotencyKey: key,
        receiptId: receipt.id
      }
    });
    return prisma.event.update({
      where: { id: event.id },
      data: {
        status: EventStatus.ACTIVE,
        activatedAt,
        activatedByUserId: actorUserId,
        activatedServiceId: serviceId,
        activatedServicePriceId: servicePriceId,
        baseCostCredits: 120,
        promotionDiscountCredits: 0,
        finalCostCredits: 120,
        purchasedCreditsUsed: 120,
        creditLineCreditsUsed: 0,
        activationReceiptId: receipt.id,
        activationIdempotencyKey: key
      }
    });
  }

  async function refundEventFully(clientId: string, actorUserId: string, eventId: string, credits: number) {
    const key = `venue-refund-${randomUUID()}`;
    const receipt = await prisma.receipt.create({
      data: { clientId, operationType: 'EVENT_CREDIT_REFUND', operationReference: eventId, idempotencyKey: key }
    });
    await prisma.ledgerEntry.create({
      data: {
        clientId,
        eventId,
        actorUserId,
        movementType: LedgerMovementType.EVENT_CREDIT_REFUND,
        purchasedCreditDelta: credits,
        creditLineUsedDelta: 0,
        debtDelta: 0,
        cashMxnDelta: 0,
        operationReference: eventId,
        idempotencyKey: key,
        receiptId: receipt.id
      }
    });
  }

  async function entityCounts() {
    const [leads, clients, users, events] = await Promise.all([
      prisma.commercialLead.count(),
      prisma.client.count(),
      prisma.user.count(),
      prisma.event.count()
    ]);
    return { leads, clients, users, events };
  }

  async function financialCounts() {
    const [ledger, receipts] = await Promise.all([prisma.ledgerEntry.count(), prisma.receipt.count()]);
    return { ledger, receipts };
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "commercial_lead", "event", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
