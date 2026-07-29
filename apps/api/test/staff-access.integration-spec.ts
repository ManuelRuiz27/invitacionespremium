import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { EventLifecycleService } from '../src/events/event-lifecycle.service';
import {
  ClientStatus,
  ClientType,
  EventStatus,
  InvitationMode,
  LedgerMovementType,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationsService } from '../src/invitations/invitations.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { PublicRsvpService } from '../src/public-rsvp/public-rsvp.service';
import { StaffTokenManagementService, StaffTokenResolverService } from '../src/staff-access/staff-access.service';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('StaffAccess', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let lifecycle: EventLifecycleService;
  let management: StaffTokenManagementService;
  let resolver: StaffTokenResolverService;
  let technical: StaffTokenTechnicalService;
  let confirmations: PublicRsvpService;
  let invitations: InvitationsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-staff-access-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    lifecycle = app.get(EventLifecycleService);
    management = app.get(StaffTokenManagementService);
    resolver = app.get(StaffTokenResolverService);
    technical = app.get(StaffTokenTechnicalService);
    confirmations = app.get(PublicRsvpService);
    invitations = app.get(InvitationsService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('enforces operational roles, ownership, Event states, and normalized aliases', async () => {
    const independent = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const independentCookie = await login(independent.email);
    const created = await createToken(independent.eventId, independentCookie, '  Acceso   principal  ').expect(201);
    expect(created.body).toMatchObject({
      eventId: independent.eventId,
      alias: 'Acceso principal',
      state: 'ACTIVE',
      expiredAt: null
    });

    const eventDay = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER, EventStatus.EVENT_DAY);
    await createToken(eventDay.eventId, await login(eventDay.email), 'Día del evento').expect(201);

    const organization = await createOrganizationFixture();
    await createToken(organization.eventId, await login(organization.admin.email), 'Admin').expect(201);
    await createToken(organization.eventId, await login(organization.creator.email), 'Planner creador').expect(201);
    await createToken(organization.eventId, await login(organization.other.email), 'Planner ajeno').expect(404);

    const foreign = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    await createToken(independent.eventId, await login(foreign.email), 'Evento ajeno').expect(404);

    const platform = await createUser(UserRole.PLATFORM_ADMIN, null);
    await createToken(independent.eventId, await login(platform.email), 'Platform').expect(403);

    await createToken(independent.eventId, independentCookie, '').expect(400);
    await createToken(independent.eventId, independentCookie, '   ').expect(400);
    await createToken(independent.eventId, independentCookie, 'A'.repeat(81)).expect(400);

    const deniedStates = [
      EventStatus.DRAFT,
      EventStatus.CONFIGURED,
      EventStatus.READY_TO_ACTIVATE,
      EventStatus.CLOSED,
      EventStatus.ALBUM_PUBLISHED,
      EventStatus.ARCHIVED,
      EventStatus.CANCELLED
    ];
    for (const status of deniedStates) {
      const fixture = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER, status);
      const response = await createToken(fixture.eventId, await login(fixture.email), status);
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('STAFF_EVENT_NOT_OPERATIONAL');
    }
  }, 60_000);

  it('stores only the digest, returns the secret once, lists safely, and exposes a minimal public session', async () => {
    const fixture = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const cookie = await login(fixture.email);
    const response = await createToken(fixture.eventId, cookie, 'Puerta norte').expect(201);
    const token = response.body.token as string;
    expect(token).toMatch(/^st1\.[A-Za-z0-9_-]{43}$/u);
    expect(Buffer.from(token.slice(4), 'base64url')).toHaveLength(32);
    expect(response.body.sessionPath).toBe(`/api/v1/scanner/${encodeURIComponent(token)}/session`);
    expect(response.body).not.toHaveProperty('tokenDigestSha256');
    expect(response.body).not.toHaveProperty('createdByUserId');

    const stored = await prisma.staffToken.findUniqueOrThrow({ where: { id: response.body.id as string } });
    expect(stored.tokenDigestSha256).toBe(createHash('sha256').update(token).digest('hex'));
    expect(JSON.stringify(stored)).not.toContain(token);

    const listed = await request(app.getHttpServer())
      .get(`/api/v1/events/${fixture.eventId}/staff-tokens`)
      .set('Cookie', cookie)
      .expect(200);
    expect(listed.body).toEqual([
      {
        id: response.body.id,
        eventId: fixture.eventId,
        alias: 'Puerta norte',
        state: 'ACTIVE',
        createdAt: response.body.createdAt,
        expiredAt: null
      }
    ]);
    expect(JSON.stringify(listed.body)).not.toMatch(/token|digest|sessionPath|createdBy/iu);

    await addPrivateInvitationData(fixture.eventId);
    const session = await request(app.getHttpServer())
      .get(response.body.sessionPath as string)
      .expect(200);
    expect(session.body).toEqual({
      status: 'AVAILABLE',
      staff: { alias: 'Puerta norte' },
      event: {
        id: fixture.eventId,
        name: 'Evento Staff',
        status: 'ACTIVE',
        eventDateTime: '2030-01-01T18:00:00.000Z',
        timeZone: 'America/Mexico_City',
        floorplanEnabled: false
      }
    });
    expect(JSON.stringify(session.body)).not.toMatch(
      /staffTokenId|clientId|phone|contact|invitation|assistant|ledger|credit|receipt|audit|digest/iu
    );
    expect(await resolver.resolveStaffToken(token)).toEqual({
      staffTokenId: response.body.id,
      eventId: fixture.eventId,
      alias: 'Puerta norte'
    });

    const invalidTokens = [
      token.slice(0, -1),
      `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`,
      `st1.${randomBytes(32).toString('base64url')}`,
      'not-a-staff-token'
    ];
    for (const invalid of invalidTokens) {
      const invalidResponse = await request(app.getHttpServer())
        .get(`/api/v1/scanner/${encodeURIComponent(invalid)}/session`)
        .expect(401);
      expect(invalidResponse.body.code).toBe('STAFF_TOKEN_INVALID_OR_EXPIRED');
    }

    await prisma.staffToken.update({ where: { id: stored.id }, data: { expiredAt: new Date() } });
    const expired = await request(app.getHttpServer())
      .get(response.body.sessionPath as string)
      .expect(401);
    expect(expired.body.code).toBe('STAFF_TOKEN_INVALID_OR_EXPIRED');
    expect(await resolver.resolveStaffToken(token)).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: { contains: 'SESSION' } } })).toBe(0);
  });

  it('enforces the three-active limit including concurrent creation and ignores expired history', async () => {
    const fixture = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const principal = toPrincipal(fixture);
    const firstAudit = auditBarrier('STAFF_TOKEN_CREATE');
    const lockSignal = methodCallBarrier(management, 'lockEvent', 4);
    try {
      const operations = ['Uno', 'Dos', 'Tres', 'Cuatro'].map((alias) =>
        management.create(fixture.eventId, { alias }, principal)
      );
      const settledOperations = Promise.allSettled(operations);
      await firstAudit.entered.promise;
      await lockSignal.called.promise;
      firstAudit.release.resolve();
      const outcomes = await settledOperations;
      expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(3);
      const rejected = outcomes.find(({ status }) => status === 'rejected');
      expect(rejected).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({
          response: expect.objectContaining({ code: 'STAFF_TOKEN_LIMIT_REACHED' })
        })
      });
    } finally {
      firstAudit.release.resolve();
      firstAudit.restore();
      lockSignal.restore();
    }
    expect(await prisma.staffToken.count({ where: { eventId: fixture.eventId, expiredAt: null } })).toBe(3);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'STAFF_TOKEN_CREATE' } })).toBe(3);
    const auditText = JSON.stringify(
      await prisma.auditLog.findMany({ where: { eventId: fixture.eventId, action: 'STAFF_TOKEN_CREATE' } })
    );
    expect(auditText).not.toMatch(/st1\.|tokenDigest|sessionPath/iu);

    const oldest = await prisma.staffToken.findFirstOrThrow({
      where: { eventId: fixture.eventId },
      orderBy: { createdAt: 'asc' }
    });
    await prisma.staffToken.update({ where: { id: oldest.id }, data: { expiredAt: new Date() } });
    await expect(management.create(fixture.eventId, { alias: 'Reemplazo' }, principal)).resolves.toMatchObject({
      state: 'ACTIVE'
    });
    expect(await prisma.staffToken.count({ where: { eventId: fixture.eventId, expiredAt: null } })).toBe(3);
    expect(await prisma.staffToken.count({ where: { eventId: fixture.eventId } })).toBe(4);
  }, 60_000);

  it('expires transactionally on close/cancel, never reactivates, and ignores confirmation or Invitation changes', async () => {
    const closed = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const principal = toPrincipal(closed);
    const created = await Promise.all(
      ['Norte', 'Sur', 'Lobby'].map((alias) => management.create(closed.eventId, { alias }, principal))
    );
    await lifecycle.close(closed.eventId, `close-${randomUUID()}`, principal);
    const expired = await prisma.staffToken.findMany({ where: { eventId: closed.eventId } });
    expect(new Set(expired.map(({ expiredAt }) => expiredAt?.toISOString())).size).toBe(1);
    expect(expired.every(({ expiredAt }) => expiredAt !== null)).toBe(true);
    expect(await prisma.auditLog.count({ where: { eventId: closed.eventId, action: 'STAFF_TOKENS_EXPIRE' } })).toBe(1);
    await lifecycle.reopen(closed.eventId, `reopen-${randomUUID()}`, principal, undefined, new Date('2029-01-01'));
    expect(await resolver.resolveStaffToken(created[0]!.token)).toBeNull();
    await expect(management.create(closed.eventId, { alias: 'Nuevo acceso' }, principal)).resolves.toMatchObject({
      state: 'ACTIVE'
    });

    const cancelled = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const cancelledPrincipal = toPrincipal(cancelled);
    await Promise.all(['A', 'B'].map((alias) => management.create(cancelled.eventId, { alias }, cancelledPrincipal)));
    await lifecycle.cancel(cancelled.eventId, `cancel-${randomUUID()}`, cancelledPrincipal);
    const cancelledTokens = await prisma.staffToken.findMany({ where: { eventId: cancelled.eventId } });
    expect(cancelledTokens.every(({ expiredAt }) => expiredAt !== null)).toBe(true);
    expect(new Set(cancelledTokens.map(({ expiredAt }) => expiredAt?.toISOString())).size).toBe(1);

    const unrelated = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const unrelatedPrincipal = toPrincipal(unrelated);
    const unaffected = await management.create(unrelated.eventId, { alias: 'Sigue activo' }, unrelatedPrincipal);
    await confirmations.closeConfirmation(unrelated.eventId, unrelatedPrincipal);
    expect(await resolver.resolveStaffToken(unaffected.token)).not.toBeNull();
    const invitationId = await addPrivateInvitationData(unrelated.eventId);
    await invitations.cancel(
      unrelated.eventId,
      invitationId,
      `invitation-cancel-${randomUUID()}`,
      unrelatedPrincipal,
      undefined
    );
    expect(await resolver.resolveStaffToken(unaffected.token)).not.toBeNull();
  }, 60_000);

  it('rolls back creation and lifecycle transitions when StaffToken auditing fails', async () => {
    const creation = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const creationPrincipal = toPrincipal(creation);
    const original = audit.record.bind(audit);
    const createSpy = vi.spyOn(audit, 'record').mockImplementation((input, client) => {
      if (input.action === 'STAFF_TOKEN_CREATE') throw new Error('forced staff creation audit failure');
      return original(input, client);
    });
    await expect(management.create(creation.eventId, { alias: 'Rollback' }, creationPrincipal)).rejects.toThrow(
      'forced staff creation audit failure'
    );
    expect(await prisma.staffToken.count({ where: { eventId: creation.eventId } })).toBe(0);
    createSpy.mockRestore();

    for (const action of ['close', 'cancel'] as const) {
      const fixture = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
      const principal = toPrincipal(fixture);
      await management.create(fixture.eventId, { alias: action }, principal);
      const expirationSpy = vi.spyOn(audit, 'record').mockImplementation((input, client) => {
        if (input.action === 'STAFF_TOKENS_EXPIRE') throw new Error('forced expiration audit failure');
        return original(input, client);
      });
      await expect(
        action === 'close'
          ? lifecycle.close(fixture.eventId, `${action}-${randomUUID()}`, principal)
          : lifecycle.cancel(fixture.eventId, `${action}-${randomUUID()}`, principal)
      ).rejects.toThrow('forced expiration audit failure');
      expirationSpy.mockRestore();
      expect(await prisma.event.findUniqueOrThrow({ where: { id: fixture.eventId } })).toMatchObject({
        status: EventStatus.ACTIVE
      });
      expect(await prisma.staffToken.findFirstOrThrow({ where: { eventId: fixture.eventId } })).toMatchObject({
        expiredAt: null
      });
    }
  }, 60_000);

  it('serializes creation, lifecycle and public-session races using real lock contention', async () => {
    // Creation wins the Event lock, so close subsequently expires the newly committed token.
    const createFirst = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const createFirstPrincipal = toPrincipal(createFirst);
    const createAudit = auditBarrier('STAFF_TOKEN_CREATE');
    const closeWaiting = methodCallBarrier(lifecycle, 'lockEvent', 1);
    try {
      const creation = management.create(createFirst.eventId, { alias: 'Creado primero' }, createFirstPrincipal);
      const creationSettled = Promise.allSettled([creation]);
      await createAudit.entered.promise;
      const close = lifecycle.close(createFirst.eventId, `close-race-${randomUUID()}`, createFirstPrincipal);
      const closeSettled = Promise.allSettled([close]);
      await closeWaiting.called.promise;
      createAudit.release.resolve();
      expect(await creationSettled).toMatchObject([{ status: 'fulfilled' }]);
      expect(await closeSettled).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      createAudit.release.resolve();
      createAudit.restore();
      closeWaiting.restore();
    }
    expect(await prisma.staffToken.findFirstOrThrow({ where: { eventId: createFirst.eventId } })).toMatchObject({
      expiredAt: expect.any(Date)
    });

    // Cancel wins with two active tokens; a competing third creation observes the terminal state.
    const cancelFirst = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const cancelFirstPrincipal = toPrincipal(cancelFirst);
    await Promise.all(
      ['Uno', 'Dos'].map((alias) => management.create(cancelFirst.eventId, { alias }, cancelFirstPrincipal))
    );
    const cancelAudit = auditBarrier('EVENT_CANCEL');
    const createWaiting = methodCallBarrier(management, 'lockEvent', 1);
    try {
      const cancellation = lifecycle.cancel(cancelFirst.eventId, `cancel-race-${randomUUID()}`, cancelFirstPrincipal);
      const cancellationSettled = Promise.allSettled([cancellation]);
      await cancelAudit.entered.promise;
      const creation = management.create(cancelFirst.eventId, { alias: 'No creado' }, cancelFirstPrincipal);
      const creationSettled = Promise.allSettled([creation]);
      await createWaiting.called.promise;
      cancelAudit.release.resolve();
      expect(await cancellationSettled).toMatchObject([{ status: 'fulfilled' }]);
      const [creationResult] = await creationSettled;
      expect(creationResult).toMatchObject({
        status: 'rejected',
        reason: expect.objectContaining({
          response: expect.objectContaining({ code: 'STAFF_EVENT_NOT_OPERATIONAL' })
        })
      });
    } finally {
      cancelAudit.release.resolve();
      cancelAudit.restore();
      createWaiting.restore();
    }
    expect(await prisma.staffToken.count({ where: { eventId: cancelFirst.eventId, expiredAt: null } })).toBe(0);
    expect(await prisma.staffToken.count({ where: { eventId: cancelFirst.eventId } })).toBe(2);

    // A public session that owns the locks may finish; every validation after close is invalid.
    const sessionFirst = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const sessionFirstPrincipal = toPrincipal(sessionFirst);
    const token = await management.create(sessionFirst.eventId, { alias: 'Sesión primero' }, sessionFirstPrincipal);
    const heldLookup = methodHoldBarrier(technical, 'lookupByDigest', 2);
    const transitionWaiting = methodCallBarrier(lifecycle, 'lockEvent', 1);
    try {
      const session = resolver.getPublicSession(token.token);
      const sessionSettled = Promise.allSettled([session]);
      await heldLookup.entered.promise;
      const close = lifecycle.close(sessionFirst.eventId, `close-session-${randomUUID()}`, sessionFirstPrincipal);
      const closeSettled = Promise.allSettled([close]);
      await transitionWaiting.called.promise;
      heldLookup.release.resolve();
      expect(await sessionSettled).toMatchObject([{ status: 'fulfilled' }]);
      expect(await closeSettled).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      heldLookup.release.resolve();
      heldLookup.restore();
      transitionWaiting.restore();
    }
    await expect(resolver.getPublicSession(token.token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_TOKEN_INVALID_OR_EXPIRED' })
    });

    // The same lock ordering applies to cancellation: an in-flight session may finish, future ones cannot.
    const sessionBeforeCancel = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const sessionBeforeCancelPrincipal = toPrincipal(sessionBeforeCancel);
    const cancelToken = await management.create(
      sessionBeforeCancel.eventId,
      { alias: 'Sesión antes de cancelar' },
      sessionBeforeCancelPrincipal
    );
    const heldCancelLookup = methodHoldBarrier(technical, 'lookupByDigest', 2);
    const cancelWaiting = methodCallBarrier(lifecycle, 'lockEvent', 1);
    try {
      const session = resolver.getPublicSession(cancelToken.token);
      const sessionSettled = Promise.allSettled([session]);
      await heldCancelLookup.entered.promise;
      const cancellation = lifecycle.cancel(
        sessionBeforeCancel.eventId,
        `cancel-session-${randomUUID()}`,
        sessionBeforeCancelPrincipal
      );
      const cancellationSettled = Promise.allSettled([cancellation]);
      await cancelWaiting.called.promise;
      heldCancelLookup.release.resolve();
      expect(await sessionSettled).toMatchObject([{ status: 'fulfilled' }]);
      expect(await cancellationSettled).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      heldCancelLookup.release.resolve();
      heldCancelLookup.restore();
      cancelWaiting.restore();
    }
    await expect(resolver.getPublicSession(cancelToken.token)).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'STAFF_TOKEN_INVALID_OR_EXPIRED' })
    });

    // Two simultaneous validations are read-only and a close followed by reopen never reactivates.
    const validation = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const validationPrincipal = toPrincipal(validation);
    const validationToken = await management.create(validation.eventId, { alias: 'Doble' }, validationPrincipal);
    const firstValidation = methodHoldBarrier(technical, 'lookupByDigest', 2);
    const secondValidationWaiting = methodCallBarrier(resolver, 'lockRows', 2);
    try {
      const first = resolver.getPublicSession(validationToken.token);
      const firstSettled = Promise.allSettled([first]);
      await firstValidation.entered.promise;
      const second = resolver.getPublicSession(validationToken.token);
      const secondSettled = Promise.allSettled([second]);
      await secondValidationWaiting.called.promise;
      firstValidation.release.resolve();
      expect(await firstSettled).toMatchObject([{ status: 'fulfilled' }]);
      expect(await secondSettled).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      firstValidation.release.resolve();
      firstValidation.restore();
      secondValidationWaiting.restore();
    }
    expect(await prisma.auditLog.count({ where: { eventId: validation.eventId } })).toBe(1);

    const closeAudit = auditBarrier('EVENT_CLOSE');
    const reopenWaiting = methodCallBarrier(lifecycle, 'lockEvent', 2);
    try {
      const close = lifecycle.close(validation.eventId, `close-reopen-${randomUUID()}`, validationPrincipal);
      const closeSettled = Promise.allSettled([close]);
      await closeAudit.entered.promise;
      const reopen = lifecycle.reopen(
        validation.eventId,
        `reopen-race-${randomUUID()}`,
        validationPrincipal,
        undefined,
        new Date('2029-01-01')
      );
      const reopenSettled = Promise.allSettled([reopen]);
      await reopenWaiting.called.promise;
      closeAudit.release.resolve();
      expect(await closeSettled).toMatchObject([{ status: 'fulfilled' }]);
      expect(await reopenSettled).toMatchObject([{ status: 'fulfilled' }]);
    } finally {
      closeAudit.release.resolve();
      closeAudit.restore();
      reopenWaiting.restore();
    }
    expect(await prisma.event.findUniqueOrThrow({ where: { id: validation.eventId } })).toMatchObject({
      status: EventStatus.ACTIVE
    });
    expect(await prisma.staffToken.findFirstOrThrow({ where: { eventId: validation.eventId } })).toMatchObject({
      expiredAt: expect.any(Date)
    });
  }, 60_000);

  it('enforces PostgreSQL constraints, immutable history, direct limits, lifecycle expiry, DELETE and TRUNCATE', async () => {
    const fixture = await createFixture(UserRole.INDEPENDENT_PLANNER, ClientType.PLANNER);
    const principal = toPrincipal(fixture);
    const valid = await management.create(fixture.eventId, { alias: 'SQL' }, principal);
    const digest = technical.digest(`st1.${randomBytes(32).toString('base64url')}`);

    await expect(
      prisma.$executeRaw`INSERT INTO "staff_token"
        ("event_id", "alias", "token_digest_sha256", "token_version", "created_by_user_id")
        VALUES (${fixture.eventId}::uuid, ${' Alias '}, ${digest}, 1, ${fixture.userId}::uuid)`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`INSERT INTO "staff_token"
        ("event_id", "alias", "token_digest_sha256", "token_version", "created_by_user_id")
        VALUES (${fixture.eventId}::uuid, ${'Versión'}, ${'b'.repeat(64)}, 0, ${fixture.userId}::uuid)`
    ).rejects.toThrow();
    await expect(
      prisma.$executeRaw`UPDATE "staff_token" SET "alias" = ${'Mutado'} WHERE "id" = ${valid.id}::uuid`
    ).rejects.toThrow();
    await prisma.$executeRaw`UPDATE "staff_token" SET "expired_at" = transaction_timestamp()
      WHERE "id" = ${valid.id}::uuid`;
    await expect(
      prisma.$executeRaw`UPDATE "staff_token" SET "expired_at" = NULL WHERE "id" = ${valid.id}::uuid`
    ).rejects.toThrow();
    await expect(prisma.$executeRaw`DELETE FROM "staff_token" WHERE "id" = ${valid.id}::uuid`).rejects.toThrow(
      /append-only/iu
    );
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "staff_token"')).rejects.toThrow(/append-only/iu);

    await management.create(fixture.eventId, { alias: 'Dos' }, principal);
    await management.create(fixture.eventId, { alias: 'Tres' }, principal);
    await management.create(fixture.eventId, { alias: 'Cuatro' }, principal);
    await expect(
      prisma.$executeRaw`INSERT INTO "staff_token"
        ("event_id", "alias", "token_digest_sha256", "token_version", "created_by_user_id")
        VALUES (${fixture.eventId}::uuid, ${'Quinto'}, ${'c'.repeat(64)}, 1, ${fixture.userId}::uuid)`
    ).rejects.toThrow(/active limit/iu);

    await prisma.$executeRaw`UPDATE "event" SET "status" = 'closed' WHERE "id" = ${fixture.eventId}::uuid`;
    expect(await prisma.staffToken.count({ where: { eventId: fixture.eventId, expiredAt: null } })).toBe(0);
  }, 60_000);

  it('publishes the three CODEX-080 endpoints and response boundaries in OpenAPI', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/api/v1/events/{eventId}/staff-tokens']?.get).toBeDefined();
    expect(document.paths['/api/v1/events/{eventId}/staff-tokens']?.post).toBeDefined();
    expect(document.paths['/api/v1/scanner/{staffToken}/session']?.get).toBeDefined();
    const created = document.components?.schemas?.CreatedStaffTokenResponseDto;
    const listed = document.components?.schemas?.StaffTokenResponseDto;
    const session = document.components?.schemas?.ScannerSessionResponseDto;
    expect(created && !('$ref' in created) ? created.properties : undefined).toHaveProperty('token');
    expect(listed && !('$ref' in listed) ? listed.properties : undefined).not.toHaveProperty('token');
    expect(session && !('$ref' in session) ? session.properties : undefined).not.toHaveProperty('staffTokenId');
  });

  async function createFixture(role: UserRole, clientType: ClientType, status: EventStatus = EventStatus.ACTIVE) {
    const client = await prisma.client.create({
      data: { type: clientType, name: randomUUID(), status: ClientStatus.ACTIVE }
    });
    const user = await createUser(role, client.id);
    const eventId = await createOperationalEvent(client.id, user.userId);
    if (status !== EventStatus.ACTIVE) await setEventStatus(eventId, status);
    return { ...user, clientId: client.id, clientType, eventId };
  }

  async function createOrganizationFixture() {
    const client = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: randomUUID(), status: ClientStatus.ACTIVE }
    });
    const creator = await createUser(UserRole.ORGANIZATION_PLANNER, client.id);
    const admin = await createUser(UserRole.ORGANIZATION_ADMIN, client.id);
    const other = await createUser(UserRole.ORGANIZATION_PLANNER, client.id);
    const eventId = await createOperationalEvent(client.id, creator.userId);
    return { clientId: client.id, eventId, creator, admin, other };
  }

  async function createUser(role: UserRole, clientId: string | null) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
        clientId
      }
    });
    return { userId: user.id, email, role };
  }

  async function createOperationalEvent(clientId: string, createdByUserId: string) {
    return prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const client = await transaction.client.findUniqueOrThrow({ where: { id: clientId } });
      const service = await transaction.service.upsert({
        where: { code: ServiceCode.FLYER },
        create: { code: ServiceCode.FLYER },
        update: {}
      });
      const price =
        (await transaction.servicePrice.findFirst({
          where: { serviceId: service.id, clientType: client.type }
        })) ??
        (await transaction.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType: client.type,
            credits: 0,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        }));
      const activationKey = `staff-activation-${randomUUID()}`;
      const receipt = await transaction.receipt.create({
        data: {
          folio: 8_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      const event = await transaction.event.create({
        data: {
          clientId,
          createdByUserId,
          serviceId: service.id,
          name: 'Evento Staff',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 100,
          confirmationEnabled: true,
          floorplanEnabled: false,
          activatedAt: new Date(),
          activatedByUserId: createdByUserId,
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
      return event.id;
    });
  }

  async function setEventStatus(eventId: string, status: EventStatus) {
    const preparation = new Set<EventStatus>([
      EventStatus.DRAFT,
      EventStatus.CONFIGURED,
      EventStatus.READY_TO_ACTIVATE
    ]);
    await prisma.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await transaction.event.update({
        where: { id: eventId },
        data: preparation.has(status)
          ? {
              status,
              activatedAt: null,
              activatedByUserId: null,
              activatedServiceId: null,
              activatedServicePriceId: null,
              baseCostCredits: null,
              promotionDiscountCredits: null,
              finalCostCredits: null,
              purchasedCreditsUsed: null,
              creditLineCreditsUsed: null,
              creditUnitValueMxnCentsSnapshot: null,
              activationReceiptId: null,
              activationIdempotencyKey: null
            }
          : { status }
      });
    });
  }

  async function addPrivateInvitationData(eventId: string): Promise<string> {
    return prisma.$transaction(async (transaction) => {
      const contact = await transaction.contact.create({
        data: {
          eventId,
          name: 'Nombre privado',
          whatsappPhoneNormalized: '+525512345678'
        }
      });
      const invitation = await transaction.invitation.create({
        data: {
          eventId,
          contactId: contact.id,
          mode: InvitationMode.INDIVIDUAL,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: randomBytes(32).toString('hex')
        }
      });
      await transaction.assistant.create({
        data: { eventId, invitationId: invitation.id, name: 'Asistente privado', isPrimary: true }
      });
      return invitation.id;
    });
  }

  function toPrincipal(fixture: {
    userId: string;
    email: string;
    role: UserRole;
    clientId: string;
    clientType: ClientType;
  }): AuthPrincipal {
    return {
      userId: fixture.userId,
      sessionId: randomUUID(),
      email: fixture.email,
      role: fixture.role,
      clientId: fixture.clientId,
      clientType: fixture.clientType,
      clientStatus: ClientStatus.ACTIVE
    };
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

  function createToken(eventId: string, cookie: string, alias: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/staff-tokens`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .send({ alias });
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

  function methodCallBarrier(service: object, methodName: string, signalOnCall: number) {
    type AsyncMethod = (...args: unknown[]) => Promise<unknown>;
    const target = service as Record<string, AsyncMethod>;
    const method = target[methodName];
    if (!method) throw new TypeError(`Missing lock method ${methodName}.`);
    const called = deferred<void>();
    const original = method.bind(service);
    let calls = 0;
    const spy = vi.spyOn(target, methodName).mockImplementation((...args) => {
      calls += 1;
      if (calls === signalOnCall) called.resolve();
      return original(...args);
    });
    return { called, restore: () => spy.mockRestore() };
  }

  function methodHoldBarrier(service: object, methodName: string, holdOnCall: number) {
    type AsyncMethod = (...args: unknown[]) => Promise<unknown>;
    const target = service as Record<string, AsyncMethod>;
    const method = target[methodName];
    if (!method) throw new TypeError(`Missing method ${methodName}.`);
    const entered = deferred<void>();
    const release = deferred<void>();
    const original = method.bind(service);
    let calls = 0;
    const spy = vi.spyOn(target, methodName).mockImplementation(async (...args) => {
      calls += 1;
      if (calls === holdOnCall) {
        entered.resolve();
        await release.promise;
      }
      return original(...args);
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

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "staff_token", "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation",
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
