import { randomBytes, randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuditService } from '../src/audit/audit.service';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { EventLifecycleService } from '../src/events/event-lifecycle.service';
import {
  AssistantResponseStatus,
  ClientStatus,
  ClientType,
  EventStatus,
  InvitationMode,
  InvitationResponseStatus,
  LedgerMovementType,
  Prisma,
  ServiceCode,
  UserRole
} from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { InvitationsService } from '../src/invitations/invitations.service';
import { createOpenApiDocument } from '../src/openapi/openapi';
import { ScannerService } from '../src/scanner/scanner.service';
import { StaffTokenResolverService } from '../src/staff-access/staff-access.service';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';

const origin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Scanner and CheckIn', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let audit: AuditService;
  let scanner: ScannerService;
  let lifecycle: EventLifecycleService;
  let invitations: InvitationsService;
  let staffResolver: StaffTokenResolverService;
  let staffTechnical: StaffTokenTechnicalService;
  let invitationTokens: InvitationTokenService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = origin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-scanner-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    audit = app.get(AuditService);
    scanner = app.get(ScannerService);
    lifecycle = app.get(EventLifecycleService);
    invitations = app.get(InvitationsService);
    staffResolver = app.get(StaffTokenResolverService);
    staffTechnical = app.get(StaffTokenTechnicalService);
    invitationTokens = app.get(InvitationTokenService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('scans and searches exactly with a private projection, then checks in partially and replays exactly', async () => {
    const fixture = await createFixture();
    const qrToken = issueQr(fixture.invitationId, fixture.qrNonce);

    const scan = await scannerPost(fixture.staffToken, 'scan', { qrToken }).expect(200);
    expect(scan.body).toMatchObject({
      status: 'AVAILABLE',
      invitation: { id: fixture.invitationId, mode: InvitationMode.FAMILY_NOMINAL },
      confirmedCount: 2,
      pendingCount: 2,
      checkedInCount: 0
    });
    expect(scan.body.pendingAssistants.map(({ name }: { name: string }) => name)).toEqual([
      'María López',
      'José López'
    ]);
    expect(scan.body.pendingAssistants.every(({ table }: { table: null }) => table === null)).toBe(true);

    const normalized = await scannerPost(fixture.staffToken, 'search', { query: '  mARÍA   lÓPEZ ' }).expect(200);
    expect(normalized.body.status).toBe('MATCHES');
    expect(normalized.body.results).toHaveLength(1);
    await scannerPost(fixture.staffToken, 'search', { query: 'María' })
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: 'NO_MATCHES', results: [] }));
    await scannerPost(fixture.staffToken, 'search', { query: 'Maria López' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('NO_MATCHES'));

    const key = `scanner-${randomUUID()}`;
    const first = await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.primaryId]).expect(200);
    expect(first.body).toMatchObject({
      status: 'CHECKED_IN',
      invitationId: fixture.invitationId,
      remainingPendingCount: 1
    });
    expect(first.body.checkedIn).toHaveLength(1);
    expect(first.body.remainingPendingAssistants).toEqual([
      { id: fixture.companionId, name: 'José López', isPrimary: false, table: null }
    ]);
    const replay = await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.primaryId]).expect(200);
    expect(replay.body).toEqual(first.body);
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
    await scannerCheckIn(fixture.staffToken, key, fixture.invitationId, [fixture.companionId])
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CHECK_IN_IDEMPOTENCY_CONFLICT'));

    const after = await scannerPost(fixture.staffToken, 'scan', { qrToken }).expect(200);
    expect(after.body.pendingAssistants).toEqual([
      { id: fixture.companionId, name: 'José López', isPrimary: false, table: null }
    ]);
    expect(JSON.stringify([scan.body, normalized.body, first.body, after.body])).not.toMatch(
      /phone|clientId|staffToken|digest|qrToken|nonce|ledger|receipt|audit/iu
    );
    const auditText = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: fixture.eventId } }));
    expect(auditText).not.toMatch(/María|José|phone|st1\.|qr1\.|digest|nonce/iu);
  });

  it('rejects invalid and foreign QR uniformly and atomically rejects crossed or already checked selections', async () => {
    const fixture = await createFixture();
    const foreign = await createFixture();
    const invalid = ['qr1.invalid', issueQr(foreign.invitationId, foreign.qrNonce)];
    for (const qrToken of invalid) {
      await scannerPost(fixture.staffToken, 'scan', { qrToken })
        .expect(404)
        .expect(({ body }) => expect(body.code).toBe('SCANNER_QR_NOT_FOUND'));
    }
    await scannerCheckIn(fixture.staffToken, `cross-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId,
      foreign.primaryId
    ])
      .expect(404)
      .expect(({ body }) => expect(body.code).toBe('SCANNER_SELECTION_NOT_FOUND'));
    expect(await prisma.checkIn.count()).toBe(0);

    await scannerCheckIn(fixture.staffToken, `all-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId,
      fixture.companionId
    ]).expect(200);
    await scannerCheckIn(fixture.staffToken, `again-${randomUUID()}`, fixture.invitationId, [fixture.primaryId])
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('ASSISTANT_ALREADY_CHECKED_IN'));
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId, revertedAt: null } })).toBe(2);
  });

  it('replays the exact persisted response after nominal, pending, check-in and reversal changes', async () => {
    const scenarios: Array<(fixture: Awaited<ReturnType<typeof createFixture>>, checkInId: string) => Promise<void>> = [
      async (fixture) => {
        await prisma.assistant.update({ where: { id: fixture.primaryId }, data: { name: 'Nombre cambiado' } });
      },
      async (fixture) => {
        await prisma.assistant.update({ where: { id: fixture.companionId }, data: { name: 'Pendiente cambiado' } });
      },
      async (fixture) => {
        await prisma.assistant.update({ where: { id: fixture.companionId }, data: { deletedAt: new Date() } });
      },
      async (fixture) => {
        await scanner.checkIn(fixture.staffToken, `pending-${randomUUID()}`, {
          invitationId: fixture.invitationId,
          assistantIds: [fixture.companionId]
        });
      },
      async (fixture, checkInId) => {
        await scanner.revert(fixture.eventId, checkInId, `replay-revert-${randomUUID()}`, principalFor(fixture));
      }
    ];

    for (const mutate of scenarios) {
      const fixture = await createFixture();
      const key = `stable-${randomUUID()}`;
      const original = await scanner.checkIn(fixture.staffToken, key, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      });
      const serialized = JSON.stringify(original);
      await mutate(fixture, original.checkedIn[0]!.checkInId);
      const before = {
        rows: await prisma.checkIn.count({ where: { eventId: fixture.eventId } }),
        audits: await prisma.auditLog.count({ where: { eventId: fixture.eventId } })
      };
      const replay = await scanner.checkIn(fixture.staffToken, key, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      });
      expect(JSON.stringify(replay)).toBe(serialized);
      expect({
        rows: await prisma.checkIn.count({ where: { eventId: fixture.eventId } }),
        audits: await prisma.auditLog.count({ where: { eventId: fixture.eventId } })
      }).toEqual(before);
      expect(Object.keys(replay).sort()).toEqual([
        'checkedIn',
        'invitationId',
        'remainingPendingAssistants',
        'remainingPendingCount',
        'status'
      ]);
      expect(serialized).not.toMatch(/phone|clientId|staffToken|digest|qrToken|nonce|ledger|receipt|audit/iu);
    }
  });

  it('serializes concurrent StaffTokens and overlapping selections with all-or-none outcomes', async () => {
    const idempotent = await createFixture();
    const sharedKey = `same-key-${randomUUID()}`;
    const sameKey = await Promise.all([
      scanner.checkIn(idempotent.staffToken, sharedKey, {
        invitationId: idempotent.invitationId,
        assistantIds: [idempotent.primaryId]
      }),
      scanner.checkIn(idempotent.staffToken, sharedKey, {
        invitationId: idempotent.invitationId,
        assistantIds: [idempotent.primaryId]
      })
    ]);
    expect(sameKey[1]).toEqual(sameKey[0]);
    expect(await prisma.checkIn.count({ where: { eventId: idempotent.eventId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: idempotent.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
    const readOnly = await Promise.all([
      scanner.search(idempotent.staffToken, { query: 'María López' }),
      scanner.search(idempotent.staffToken, { query: 'María López' })
    ]);
    expect(readOnly[1]).toEqual(readOnly[0]);

    const fixture = await createFixture();
    const secondStaff = await addStaffToken(fixture.eventId, fixture.userId);
    const sameAssistant = await Promise.allSettled([
      scanner.checkIn(fixture.staffToken, `race-a-${randomUUID()}`, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      }),
      scanner.checkIn(secondStaff, `race-b-${randomUUID()}`, {
        invitationId: fixture.invitationId,
        assistantIds: [fixture.primaryId]
      })
    ]);
    expect(sameAssistant.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId, revertedAt: null } })).toBe(1);

    const overlap = await createFixture();
    const third = await prisma.assistant.create({
      data: {
        eventId: overlap.eventId,
        invitationId: overlap.invitationId,
        name: 'Ana López',
        responseStatus: AssistantResponseStatus.CONFIRMED
      }
    });
    const outcomes = await Promise.allSettled([
      scanner.checkIn(overlap.staffToken, `overlap-a-${randomUUID()}`, {
        invitationId: overlap.invitationId,
        assistantIds: [overlap.primaryId, overlap.companionId]
      }),
      scanner.checkIn(overlap.staffToken, `overlap-b-${randomUUID()}`, {
        invitationId: overlap.invitationId,
        assistantIds: [overlap.companionId, third.id]
      })
    ]);
    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.checkIn.count({ where: { eventId: overlap.eventId, revertedAt: null } })).toBe(2);
    expect(await prisma.auditLog.count({ where: { eventId: overlap.eventId, action: 'CHECK_IN_CREATE' } })).toBe(1);
  }, 60_000);

  it('serializes Scanner check-in against close and cancellation in both service lock orders', async () => {
    for (const transition of [
      {
        auditAction: 'EVENT_CLOSE',
        execute: (fixture: Awaited<ReturnType<typeof createFixture>>) =>
          lifecycle.close(fixture.eventId, `close-${randomUUID()}`, principalFor(fixture))
      },
      {
        auditAction: 'EVENT_CANCEL',
        execute: (fixture: Awaited<ReturnType<typeof createFixture>>) =>
          lifecycle.cancel(fixture.eventId, `cancel-${randomUUID()}`, principalFor(fixture))
      }
    ]) {
      const checkInWins = await createFixture();
      const checkInBarrier = auditBarrier('CHECK_IN_CREATE');
      const transitionLock = methodCallBarrier(lifecycle, 'lockEvent');
      try {
        const checkIn = scanner.checkIn(checkInWins.staffToken, `first-${randomUUID()}`, {
          invitationId: checkInWins.invitationId,
          assistantIds: [checkInWins.primaryId]
        });
        await checkInBarrier.entered.promise;
        const stateChange = track(transition.execute(checkInWins));
        await transitionLock.called.promise;
        expect(stateChange.isSettled()).toBe(false);
        checkInBarrier.release.resolve();
        await Promise.all([checkIn, stateChange.promise]);
      } finally {
        checkInBarrier.release.resolve();
        transitionLock.restore();
        checkInBarrier.restore();
      }
      expect(await prisma.checkIn.count({ where: { eventId: checkInWins.eventId } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { eventId: checkInWins.eventId, action: 'CHECK_IN_CREATE' } })).toBe(
        1
      );

      const transitionWins = await createFixture();
      const transitionBarrier = auditBarrier(transition.auditAction);
      const scannerLock = methodCallBarrier(staffResolver, 'lockRows');
      try {
        const stateChange = transition.execute(transitionWins);
        await transitionBarrier.entered.promise;
        const checkIn = track(
          scanner.checkIn(transitionWins.staffToken, `second-${randomUUID()}`, {
            invitationId: transitionWins.invitationId,
            assistantIds: [transitionWins.primaryId]
          })
        );
        await scannerLock.called.promise;
        expect(checkIn.isSettled()).toBe(false);
        transitionBarrier.release.resolve();
        await stateChange;
        await expect(checkIn.promise).rejects.toThrow();
      } finally {
        transitionBarrier.release.resolve();
        scannerLock.restore();
        transitionBarrier.restore();
      }
      expect(await prisma.checkIn.count({ where: { eventId: transitionWins.eventId } })).toBe(0);
      expect(
        await prisma.auditLog.count({ where: { eventId: transitionWins.eventId, action: 'CHECK_IN_CREATE' } })
      ).toBe(0);
    }
  }, 120_000);

  it('serializes expiry, scans, Invitation cancellation and reversals through service locks', async () => {
    const expiration = await createFixture();
    const expirationEntered = deferred<void>();
    const expirationRelease = deferred<void>();
    const expirationLock = methodCallBarrier(staffResolver, 'lockRows');
    try {
      const expire = prisma.$transaction(async (tx) => {
        await tx.staffToken.update({ where: { id: expiration.staffTokenId }, data: { expiredAt: new Date() } });
        expirationEntered.resolve();
        await expirationRelease.promise;
      });
      await expirationEntered.promise;
      const checkIn = track(
        scanner.checkIn(expiration.staffToken, `expired-${randomUUID()}`, {
          invitationId: expiration.invitationId,
          assistantIds: [expiration.primaryId]
        })
      );
      await expirationLock.called.promise;
      expect(checkIn.isSettled()).toBe(false);
      expirationRelease.resolve();
      await expire;
      await expect(checkIn.promise).rejects.toThrow();
    } finally {
      expirationRelease.resolve();
      expirationLock.restore();
    }
    expect(await prisma.checkIn.count({ where: { eventId: expiration.eventId } })).toBe(0);

    const scanAfterCheckIn = await createFixture();
    const qrToken = issueQr(scanAfterCheckIn.invitationId, scanAfterCheckIn.qrNonce);
    const checkInBarrier = auditBarrier('CHECK_IN_CREATE');
    const scanLock = methodCallBarrier(staffResolver, 'lockRows');
    try {
      const checkIn = scanner.checkIn(scanAfterCheckIn.staffToken, `scan-race-${randomUUID()}`, {
        invitationId: scanAfterCheckIn.invitationId,
        assistantIds: [scanAfterCheckIn.primaryId]
      });
      await checkInBarrier.entered.promise;
      const scan = track(scanner.scan(scanAfterCheckIn.staffToken, { qrToken }));
      await scanLock.called.promise;
      expect(scan.isSettled()).toBe(false);
      checkInBarrier.release.resolve();
      await checkIn;
      const result = await scan.promise;
      expect(result.pendingAssistants.map(({ id }) => id)).toEqual([scanAfterCheckIn.companionId]);
    } finally {
      checkInBarrier.release.resolve();
      scanLock.restore();
      checkInBarrier.restore();
    }

    for (const operation of ['scan', 'check-in'] as const) {
      const cancelled = await createFixture();
      const cancellationBarrier = auditBarrier('INVITATION_CANCEL');
      const scannerLock = methodCallBarrier(staffResolver, 'lockRows');
      try {
        const cancellation = invitations.cancel(
          cancelled.eventId,
          cancelled.invitationId,
          `invitation-cancel-${randomUUID()}`,
          principalFor(cancelled),
          undefined
        );
        await cancellationBarrier.entered.promise;
        const pendingOperation: Promise<unknown> =
          operation === 'scan'
            ? scanner.scan(cancelled.staffToken, {
                qrToken: issueQr(cancelled.invitationId, cancelled.qrNonce)
              })
            : scanner.checkIn(cancelled.staffToken, `cancelled-${randomUUID()}`, {
                invitationId: cancelled.invitationId,
                assistantIds: [cancelled.primaryId]
              });
        const scannerOperation = track(pendingOperation);
        await scannerLock.called.promise;
        expect(scannerOperation.isSettled()).toBe(false);
        cancellationBarrier.release.resolve();
        await cancellation;
        await expect(scannerOperation.promise).rejects.toThrow();
      } finally {
        cancellationBarrier.release.resolve();
        scannerLock.restore();
        cancellationBarrier.restore();
      }
      expect(await prisma.checkIn.count({ where: { eventId: cancelled.eventId } })).toBe(0);
    }

    const reversal = await createFixture();
    const created = await scanner.checkIn(reversal.staffToken, `reversal-${randomUUID()}`, {
      invitationId: reversal.invitationId,
      assistantIds: [reversal.primaryId]
    });
    const checkInId = created.checkedIn[0]!.checkInId;
    const simultaneous = await Promise.allSettled([
      scanner.revert(reversal.eventId, checkInId, `reverse-a-${randomUUID()}`, principalFor(reversal)),
      scanner.revert(reversal.eventId, checkInId, `reverse-b-${randomUUID()}`, principalFor(reversal))
    ]);
    expect(simultaneous.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(await prisma.auditLog.count({ where: { eventId: reversal.eventId, action: 'CHECK_IN_REVERT' } })).toBe(1);

    const afterReversal = await scanner.checkIn(reversal.staffToken, `after-reversal-${randomUUID()}`, {
      invitationId: reversal.invitationId,
      assistantIds: [reversal.primaryId]
    });
    expect(afterReversal.status).toBe('CHECKED_IN');
    expect(await prisma.checkIn.count({ where: { assistantId: reversal.primaryId, revertedAt: null } })).toBe(1);

    const readOnlyCounts = {
      checkIns: await prisma.checkIn.count({ where: { eventId: reversal.eventId } }),
      audits: await prisma.auditLog.count({ where: { eventId: reversal.eventId } })
    };
    await Promise.all([
      scanner.scan(reversal.staffToken, { qrToken: issueQr(reversal.invitationId, reversal.qrNonce) }),
      scanner.search(reversal.staffToken, { query: 'María López' })
    ]);
    expect({
      checkIns: await prisma.checkIn.count({ where: { eventId: reversal.eventId } }),
      audits: await prisma.auditLog.count({ where: { eventId: reversal.eventId } })
    }).toEqual(readOnlyCounts);
  }, 120_000);

  it('allows only owned operational users to reverse, preserves history, and supports a later check-in', async () => {
    const fixture = await createFixture();
    const cookie = await login(fixture.email);
    const created = await scannerCheckIn(fixture.staffToken, `create-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId
    ]).expect(200);
    const checkInId = created.body.checkedIn[0].checkInId as string;
    const key = `revert-${randomUUID()}`;
    const reversed = await revert(fixture.eventId, checkInId, key, cookie).expect(200);
    expect(reversed.body).toMatchObject({ status: 'REVERTED', checkInId, assistantId: fixture.primaryId });
    const replay = await revert(fixture.eventId, checkInId, key, cookie).expect(200);
    expect(replay.body).toEqual(reversed.body);
    await revert(fixture.eventId, checkInId, `other-${randomUUID()}`, cookie)
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CHECK_IN_ALREADY_REVERTED'));
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { eventId: fixture.eventId, action: 'CHECK_IN_REVERT' } })).toBe(1);
    await scannerCheckIn(fixture.staffToken, `second-${randomUUID()}`, fixture.invitationId, [
      fixture.primaryId
    ]).expect(200);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId } })).toBe(2);
    expect(await prisma.checkIn.count({ where: { assistantId: fixture.primaryId, revertedAt: null } })).toBe(1);

    const platform = await createUser(UserRole.PLATFORM_ADMIN, null);
    await revert(fixture.eventId, checkInId, `platform-${randomUUID()}`, await login(platform.email)).expect(403);
    await request(app.getHttpServer())
      .post(`/api/v1/events/${fixture.eventId}/check-ins/${checkInId}/revert`)
      .set('Idempotency-Key', `staff-${randomUUID()}`)
      .expect(401);
  });

  it('rolls back check-in and reversal when auditing fails', async () => {
    const fixture = await createFixture();
    const original = audit.record.bind(audit);
    const createSpy = vi.spyOn(audit, 'record').mockImplementation((input, tx) => {
      if (input.action === 'CHECK_IN_CREATE') throw new Error('forced check-in audit failure');
      return original(input, tx);
    });
    try {
      await expect(
        scanner.checkIn(fixture.staffToken, `rollback-${randomUUID()}`, {
          invitationId: fixture.invitationId,
          assistantIds: [fixture.primaryId]
        })
      ).rejects.toThrow('forced check-in audit failure');
    } finally {
      createSpy.mockRestore();
    }
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(0);

    const checked = await scanner.checkIn(fixture.staffToken, `valid-${randomUUID()}`, {
      invitationId: fixture.invitationId,
      assistantIds: [fixture.primaryId]
    });
    const reverseSpy = vi.spyOn(audit, 'record').mockImplementation((input, tx) => {
      if (input.action === 'CHECK_IN_REVERT') throw new Error('forced reversal audit failure');
      return original(input, tx);
    });
    try {
      await expect(
        scanner.revert(fixture.eventId, checked.checkedIn[0]!.checkInId, `rollback-revert-${randomUUID()}`, {
          userId: fixture.userId,
          sessionId: randomUUID(),
          email: fixture.email,
          role: UserRole.INDEPENDENT_PLANNER,
          clientId: fixture.clientId,
          clientType: ClientType.PLANNER,
          clientStatus: ClientStatus.ACTIVE
        })
      ).rejects.toThrow('forced reversal audit failure');
    } finally {
      reverseSpy.mockRestore();
    }
    expect(await prisma.checkIn.findUniqueOrThrow({ where: { id: checked.checkedIn[0]!.checkInId } })).toMatchObject({
      revertedAt: null,
      revertedByUserId: null,
      revertIdempotencyKey: null
    });
  });

  it('enforces active uniqueness, direct-insert rules and immutable history in PostgreSQL', async () => {
    const fixture = await createFixture();
    const first = await scanner.checkIn(fixture.staffToken, `sql-${randomUUID()}`, {
      invitationId: fixture.invitationId,
      assistantIds: [fixture.primaryId]
    });
    const id = first.checkedIn[0]!.checkInId;
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "check_in" SET "assistant_id" = $1::uuid WHERE "id" = $2::uuid`,
        fixture.companionId,
        id
      )
    ).rejects.toThrow(/check_in creation fields are immutable/u);
    await expect(prisma.$executeRawUnsafe(`DELETE FROM "check_in" WHERE "id" = $1::uuid`, id)).rejects.toThrow(
      /check_in is immutable/u
    );
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "check_in"')).rejects.toThrow(/check_in is immutable/u);
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);
  });

  it('installs five physical foreign keys and rejects reverted inserts and referenced-parent deletion', async () => {
    const expectedConstraints = [
      'check_in_assistant_event_invitation_fkey',
      'check_in_event_fkey',
      'check_in_invitation_event_fkey',
      'check_in_reverted_by_user_fkey',
      'check_in_staff_token_event_fkey'
    ];
    const constraints = await prisma.$queryRaw<Array<{ name: string; type: string; deleteAction: string }>>`
      SELECT conname AS "name", contype::text AS "type", confdeltype::text AS "deleteAction"
      FROM pg_constraint
      WHERE conrelid = 'check_in'::regclass
        AND conname = ANY(ARRAY[${Prisma.join(expectedConstraints)}]::text[])
      ORDER BY conname
    `;
    expect(constraints).toEqual(expectedConstraints.map((name) => ({ name, type: 'f', deleteAction: 'r' })));

    const fixture = await createFixture();
    const original = await scanner.checkIn(fixture.staffToken, `fk-${randomUUID()}`, {
      invitationId: fixture.invitationId,
      assistantIds: [fixture.primaryId]
    });
    await scanner.revert(
      fixture.eventId,
      original.checkedIn[0]!.checkInId,
      `fk-revert-${randomUUID()}`,
      principalFor(fixture)
    );

    const bornRevertedAt = new Date();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "check_in" (
          "id", "event_id", "invitation_id", "assistant_id", "staff_token_id",
          "checked_in_at", "created_at", "idempotency_key", "request_signature", "result_snapshot",
          "reverted_at", "reverted_by_user_id", "revert_idempotency_key"
        ) VALUES (
          $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
          $6::timestamptz, $6::timestamptz, $7, $8, $9::jsonb,
          $6::timestamptz, $10::uuid, $11
        )`,
        randomUUID(),
        fixture.eventId,
        fixture.invitationId,
        fixture.companionId,
        fixture.staffTokenId,
        bornRevertedAt,
        `born-reverted-${randomUUID()}`,
        'a'.repeat(64),
        JSON.stringify(minimalSnapshot(fixture.invitationId, fixture.companionId, bornRevertedAt)),
        fixture.userId,
        `born-reverted-key-${randomUUID()}`
      )
    ).rejects.toThrow(/check_in cannot be created as reverted/u);

    for (const [table, id] of [
      ['event', fixture.eventId],
      ['invitation', fixture.invitationId],
      ['assistant', fixture.primaryId],
      ['staff_token', fixture.staffTokenId],
      ['app_user', fixture.userId]
    ] as const) {
      await expect(prisma.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "id" = $1::uuid`, id)).rejects.toThrow();
    }
    expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(1);
  });

  it('serializes direct PostgreSQL inserts against Event, StaffToken and Invitation state changes in both orders', async () => {
    const races = [
      {
        name: 'close',
        mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) =>
          client.query(`UPDATE "event" SET "status" = 'closed' WHERE "id" = $1::uuid`, [fixture.eventId])
      },
      {
        name: 'cancel event',
        mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) =>
          client.query(`UPDATE "event" SET "status" = 'cancelled' WHERE "id" = $1::uuid`, [fixture.eventId])
      },
      {
        name: 'expire StaffToken',
        mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) =>
          client.query(`UPDATE "staff_token" SET "expired_at" = clock_timestamp() WHERE "id" = $1::uuid`, [
            fixture.staffTokenId
          ])
      },
      {
        name: 'cancel Invitation',
        mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) =>
          client.query(
            `UPDATE "invitation"
             SET "cancelled_at" = clock_timestamp(),
                 "cancelled_by_user_id" = $2::uuid,
                 "cancel_idempotency_key" = $3
             WHERE "id" = $1::uuid`,
            [fixture.invitationId, fixture.userId, `sql-cancel-${randomUUID()}`]
          )
      }
    ];

    for (const race of races) {
      const mutationWins = await createFixture();
      await runSqlMutationFirst(mutationWins, race.mutate);
      expect(await prisma.checkIn.count({ where: { eventId: mutationWins.eventId } }), race.name).toBe(0);
      expect(
        await prisma.auditLog.count({ where: { eventId: mutationWins.eventId, action: 'CHECK_IN_CREATE' } }),
        race.name
      ).toBe(0);

      const insertWins = await createFixture();
      await runSqlInsertFirst(insertWins, race.mutate);
      expect(await prisma.checkIn.count({ where: { eventId: insertWins.eventId } }), race.name).toBe(1);
      expect(await prisma.checkIn.count({ where: { assistantId: insertWins.primaryId, revertedAt: null } })).toBe(1);
    }
  }, 120_000);

  it('rejects crossed aggregates and every non-operational Assistant state through direct SQL', async () => {
    const cases: Array<(fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<void>> = [
      (fixture) =>
        uncheckedExecute(
          `UPDATE "assistant" SET "response_status" = 'PENDING' WHERE "id" = $1::uuid`,
          fixture.primaryId
        ),
      (fixture) =>
        uncheckedExecute(
          `UPDATE "assistant" SET "response_status" = 'REJECTED' WHERE "id" = $1::uuid`,
          fixture.primaryId
        ),
      (fixture) =>
        uncheckedExecute(
          `UPDATE "assistant" SET "deleted_at" = clock_timestamp() WHERE "id" = $1::uuid`,
          fixture.primaryId
        ),
      (fixture) =>
        uncheckedExecute(
          `UPDATE "assistant"
           SET "anonymized_at" = clock_timestamp(), "name" = NULL
           WHERE "id" = $1::uuid`,
          fixture.primaryId
        )
    ];
    for (const arrange of cases) {
      const fixture = await createFixture();
      await arrange(fixture);
      const client = await postgresClient();
      try {
        await expect(insertDirectCheckIn(client, fixture)).rejects.toThrow();
      } finally {
        await client.end();
      }
      expect(await prisma.checkIn.count({ where: { eventId: fixture.eventId } })).toBe(0);
    }

    const local = await createFixture();
    const foreign = await createFixture();
    for (const override of [
      { staffTokenId: foreign.staffTokenId },
      { invitationId: foreign.invitationId, assistantId: foreign.primaryId },
      { assistantId: foreign.primaryId }
    ]) {
      const client = await postgresClient();
      try {
        await expect(insertDirectCheckIn(client, local, override)).rejects.toThrow();
      } finally {
        await client.end();
      }
    }
    expect(await prisma.checkIn.count({ where: { eventId: local.eventId } })).toBe(0);

    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.event.update({ where: { id: local.eventId }, data: { status: EventStatus.CLOSED } });
    });
    const closedClient = await postgresClient();
    try {
      await expect(insertDirectCheckIn(closedClient, local)).rejects.toThrow();
    } finally {
      await closedClient.end();
    }
  });

  it('documents Scanner, CheckIn and read-only Floorplan endpoints', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/session');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/scan');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/search');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/check-in');
    expect(document.paths).toHaveProperty('/api/v1/events/{eventId}/check-ins/{checkInId}/revert');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/floorplan');
    expect(document.paths).toHaveProperty('/api/v1/scanner/{staffToken}/floorplan/content');
    expect(JSON.stringify(document)).not.toContain('CODEX-100');
  });

  async function createFixture() {
    const client = await prisma.client.create({ data: { type: ClientType.PLANNER, name: randomUUID() } });
    const user = await createUser(UserRole.INDEPENDENT_PLANNER, client.id);
    const eventId = randomUUID();
    const invitationId = randomUUID();
    const primaryId = randomUUID();
    const companionId = randomUUID();
    const qrNonce = randomBytes(32).toString('hex');
    const staff = staffTechnical.generate();
    const staffTokenId = randomUUID();
    const contactId = randomUUID();
    await prisma.$transaction(async (tx) => {
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
      const activationKey = `scanner-activation-${randomUUID()}`;
      const receipt = await tx.receipt.create({
        data: {
          folio: 8_000_000_000_000n + BigInt(Math.floor(Math.random() * 1_000_000_000)),
          clientId: client.id,
          operationType: LedgerMovementType.EVENT_ACTIVATION_CHARGE,
          operationReference: activationKey,
          idempotencyKey: activationKey
        }
      });
      await tx.event.create({
        data: {
          id: eventId,
          clientId: client.id,
          createdByUserId: user.id,
          serviceId: service.id,
          name: 'Evento Scanner',
          status: EventStatus.ACTIVE,
          eventDateTime: new Date('2030-01-01T18:00:00.000Z'),
          timeZone: 'America/Mexico_City',
          capacity: 100,
          confirmationEnabled: true,
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
      const contact = await tx.contact.create({
        data: { id: contactId, eventId, name: 'Familia López', whatsappPhoneNormalized: '+525500000000' }
      });
      await tx.invitation.create({
        data: {
          id: invitationId,
          eventId,
          contactId: contact.id,
          mode: InvitationMode.FAMILY_NOMINAL,
          responseStatus: InvitationResponseStatus.CONFIRMED,
          additionalAssistantLimit: 2,
          invitationTokenNonce: randomBytes(32).toString('hex'),
          qrTokenNonce: qrNonce
        }
      });
      await tx.assistant.createMany({
        data: [
          {
            id: primaryId,
            eventId,
            invitationId,
            name: 'María López',
            isPrimary: true,
            responseStatus: AssistantResponseStatus.CONFIRMED
          },
          {
            id: companionId,
            eventId,
            invitationId,
            name: 'José López',
            responseStatus: AssistantResponseStatus.CONFIRMED
          }
        ]
      });
      await tx.staffToken.create({
        data: {
          id: staffTokenId,
          eventId,
          alias: 'Acceso principal',
          tokenDigestSha256: staff.digestSha256,
          createdByUserId: user.id
        }
      });
    });
    return {
      clientId: client.id,
      userId: user.id,
      email: user.email,
      eventId,
      invitationId,
      primaryId,
      companionId,
      contactId,
      staffTokenId,
      qrNonce,
      staffToken: staff.rawToken
    };
  }

  async function addStaffToken(eventId: string, userId: string) {
    const generated = staffTechnical.generate();
    await prisma.staffToken.create({
      data: { eventId, alias: 'Segundo acceso', tokenDigestSha256: generated.digestSha256, createdByUserId: userId }
    });
    return generated.rawToken;
  }

  async function createUser(role: UserRole, clientId: string | null) {
    const email = `${randomUUID()}@example.com`;
    return prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
  }

  function principalFor(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    userId = fixture.userId,
    email = fixture.email
  ) {
    return {
      userId,
      sessionId: randomUUID(),
      email,
      role: UserRole.INDEPENDENT_PLANNER,
      clientId: fixture.clientId,
      clientType: ClientType.PLANNER,
      clientStatus: ClientStatus.ACTIVE
    } as const;
  }

  function minimalSnapshot(invitationId: string, assistantId: string, checkedInAt: Date) {
    return {
      status: 'CHECKED_IN',
      invitationId,
      checkedIn: [
        {
          checkInId: randomUUID(),
          assistantId,
          name: 'Snapshot',
          checkedInAt: checkedInAt.toISOString()
        }
      ],
      remainingPendingAssistants: [],
      remainingPendingCount: 0
    };
  }

  function issueQr(invitationId: string, nonce: string) {
    return invitationTokens.issue('QR', invitationId, nonce);
  }

  function scannerPost(token: string, action: 'scan' | 'search', body: object) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(token)}/${action}`)
      .send(body);
  }

  function scannerCheckIn(token: string, key: string, invitationId: string, assistantIds: string[]) {
    return request(app.getHttpServer())
      .post(`/api/v1/scanner/${encodeURIComponent(token)}/check-in`)
      .set('Idempotency-Key', key)
      .send({ invitationId, assistantIds });
  }

  function revert(eventId: string, checkInId: string, key: string, cookie: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/check-ins/${checkInId}/revert`)
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({});
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

  function methodCallBarrier(service: object, methodName: string) {
    type AsyncMethod = (...args: unknown[]) => Promise<unknown>;
    const target = service as Record<string, AsyncMethod>;
    const method = target[methodName];
    if (!method) throw new TypeError(`Missing lock method ${methodName}.`);
    const called = deferred<void>();
    const original = method.bind(service);
    const spy = vi.spyOn(target, methodName).mockImplementation((...args) => {
      called.resolve();
      return original(...args);
    });
    return { called, restore: () => spy.mockRestore() };
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

  async function runSqlMutationFirst(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<unknown>
  ) {
    const mutator = await postgresClient();
    const inserter = await postgresClient();
    const observer = await postgresClient();
    try {
      await mutator.query('BEGIN');
      await mutator.query('SET LOCAL session_replication_role = replica');
      await mutate(mutator, fixture);
      const pid = await backendPid(inserter);
      const insertion = track(insertDirectCheckIn(inserter, fixture));
      await waitForDatabaseLock(observer, pid);
      expect(insertion.isSettled()).toBe(false);
      await mutator.query('COMMIT');
      await expect(insertion.promise).rejects.toThrow();
    } finally {
      await safelyRollback(mutator);
      await Promise.all([mutator.end(), inserter.end(), observer.end()]);
    }
  }

  async function runSqlInsertFirst(
    fixture: Awaited<ReturnType<typeof createFixture>>,
    mutate: (client: Client, fixture: Awaited<ReturnType<typeof createFixture>>) => Promise<unknown>
  ) {
    const inserter = await postgresClient();
    const mutator = await postgresClient();
    const observer = await postgresClient();
    try {
      await inserter.query('BEGIN');
      await insertDirectCheckIn(inserter, fixture);
      await mutator.query('BEGIN');
      await mutator.query('SET LOCAL session_replication_role = replica');
      const pid = await backendPid(mutator);
      const mutation = track(mutate(mutator, fixture));
      await waitForDatabaseLock(observer, pid);
      expect(mutation.isSettled()).toBe(false);
      await inserter.query('COMMIT');
      await mutation.promise;
      await mutator.query('COMMIT');
    } finally {
      await safelyRollback(inserter);
      await safelyRollback(mutator);
      await Promise.all([inserter.end(), mutator.end(), observer.end()]);
    }
  }

  async function insertDirectCheckIn(
    client: Client,
    fixture: Awaited<ReturnType<typeof createFixture>>,
    override: { invitationId?: string; assistantId?: string; staffTokenId?: string } = {}
  ) {
    const id = randomUUID();
    const checkedInAt = new Date();
    const invitationId = override.invitationId ?? fixture.invitationId;
    const assistantId = override.assistantId ?? fixture.primaryId;
    const staffTokenId = override.staffTokenId ?? fixture.staffTokenId;
    return client.query(
      `INSERT INTO "check_in" (
        "id", "event_id", "invitation_id", "assistant_id", "staff_token_id",
        "checked_in_at", "created_at", "idempotency_key", "request_signature", "result_snapshot"
      ) VALUES (
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
        $6::timestamptz, $6::timestamptz, $7, $8, $9::jsonb
      )`,
      [
        id,
        fixture.eventId,
        invitationId,
        assistantId,
        staffTokenId,
        checkedInAt,
        `sql-race-${randomUUID()}`,
        'b'.repeat(64),
        JSON.stringify({
          status: 'CHECKED_IN',
          invitationId,
          checkedIn: [
            {
              checkInId: id,
              assistantId,
              name: 'María López',
              checkedInAt: checkedInAt.toISOString()
            }
          ],
          remainingPendingAssistants: [],
          remainingPendingCount: 0
        })
      ]
    );
  }

  async function postgresClient() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    return client;
  }

  async function backendPid(client: Client) {
    const result = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    return result.rows[0]!.pid;
  }

  async function waitForDatabaseLock(observer: Client, backendPidValue: number) {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const result = await observer.query<{ waitEventType: string | null }>(
        `SELECT "wait_event_type" AS "waitEventType"
         FROM "pg_stat_activity"
         WHERE "pid" = $1`,
        [backendPidValue]
      );
      if (result.rows[0]?.waitEventType === 'Lock') return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    throw new Error('PostgreSQL operation did not reach a real lock wait.');
  }

  function track<T>(promise: Promise<T>) {
    let settled = false;
    const tracked = promise.finally(() => {
      settled = true;
    });
    return { promise: tracked, isSettled: () => settled };
  }

  async function safelyRollback(client: Client) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The connection may already be outside a transaction.
    }
  }

  async function uncheckedExecute(statement: string, id: string) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.$executeRawUnsafe(statement, id);
    });
  }

  async function resetDatabase() {
    if (!prisma) return;
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "check_in", "staff_token", "hotspot", "flipbook_page", "invitation_design", "file_asset",
        "assistant", "invitation", "contact_import_preview", "contact", "contact_group", "event_state_operation",
        "event", "debt_payment_allocation", "ledger_entry", "payment", "receipt", "credit_line", "finance_balance",
        "promotion", "service_price", "service", "audit_log", "auth_session", "app_user", "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
