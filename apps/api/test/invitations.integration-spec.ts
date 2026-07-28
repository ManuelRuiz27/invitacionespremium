import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ContactsService } from '../src/contacts/contacts.service';
import { ClientType, EventStatus, InvitationMode, ServiceCode, UserRole } from '../src/generated/prisma/client';
import { InvitationTokenService } from '../src/invitations/invitation-token.service';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Invitations and nominal assistants', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let contacts: ContactsService;
  let tokens: InvitationTokenService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/api/v1';
    process.env.INVITATION_TOKEN_SIGNING_SECRET = 'integration-invitation-secret-at-least-32-bytes';
    process.env.PUBLIC_INVITATION_BASE_URL = 'https://public.example/invitacion';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    contacts = app.get(ContactsService);
    tokens = app.get(InvitationTokenService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('provisions manual and CSV contacts, synchronizes names, and soft-deletes the complete aggregate', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);

    const manual = await mutate('post', `/events/${event.id}/contacts`, cookie, {
      name: 'Principal Manual',
      whatsappPhone: '+525511111111'
    }).expect(201);
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { contactId: manual.body.id },
      include: { assistants: true }
    });
    expect(invitation.assistants).toHaveLength(1);
    expect(invitation.assistants[0]).toMatchObject({
      eventId: event.id,
      name: 'Principal Manual',
      isPrimary: true,
      deletedAt: null
    });

    await mutate('patch', `/events/${event.id}/contacts/${manual.body.id}`, cookie, {
      name: 'Principal Actualizado'
    }).expect(200);
    expect(
      await prisma.assistant.findFirstOrThrow({
        where: { invitationId: invitation.id, isPrimary: true },
        select: { name: true }
      })
    ).toEqual({ name: 'Principal Actualizado' });

    const preview = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\nImportada Uno,+525522222221,\nImportada Dos,+525522222222,\n'
    ).expect(201);
    await commit(event.id, cookie, preview.body.previewId, 'invitation-import-001').expect(200);
    expect(await prisma.contact.count({ where: { eventId: event.id } })).toBe(3);
    expect(await prisma.invitation.count({ where: { eventId: event.id } })).toBe(3);
    expect(await prisma.assistant.count({ where: { eventId: event.id, isPrimary: true } })).toBe(3);

    await mutate('delete', `/events/${event.id}/contacts/${manual.body.id}`, cookie).expect(204);
    const deletedInvitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
      include: { assistants: true }
    });
    expect(deletedInvitation.deletedAt).toEqual(expect.any(Date));
    expect(deletedInvitation.assistants.every(({ deletedAt }) => deletedAt instanceof Date)).toBe(true);
    const operational = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/invitations`)
      .set('Cookie', cookie)
      .expect(200);
    expect(operational.body).toHaveLength(2);
    expect(JSON.stringify(operational.body)).not.toContain('Principal Actualizado');
    expect(JSON.stringify(operational.body)).not.toContain('+5255');
  });

  it('supports modes and nominal extras while enforcing limits, concurrency, primary protection, and database FKs', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const otherEvent = await createEvent(owner);
    const cookie = await login(owner.email);
    const contact = await createContact(event.id, cookie, 'Familia');
    const invitation = await prisma.invitation.findUniqueOrThrow({
      where: { contactId: contact.id },
      include: { assistants: true }
    });
    const primary = invitation.assistants[0]!;

    const configured = await mutate('patch', `/events/${event.id}/invitations/${invitation.id}`, cookie, {
      mode: InvitationMode.FAMILY_NOMINAL,
      additionalAssistantLimit: 2
    }).expect(200);
    expect(configured.body).toMatchObject({
      mode: InvitationMode.FAMILY_NOMINAL,
      additionalAssistantLimit: 2
    });

    const attempts = await Promise.all([
      mutate('post', `/events/${event.id}/invitations/${invitation.id}/assistants`, cookie, { name: 'Extra A' }),
      mutate('post', `/events/${event.id}/invitations/${invitation.id}/assistants`, cookie, { name: 'Extra B' }),
      mutate('post', `/events/${event.id}/invitations/${invitation.id}/assistants`, cookie, { name: 'Extra C' })
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 201, 409]);
    expect(await prisma.assistant.count({ where: { invitationId: invitation.id, deletedAt: null } })).toBe(3);
    await mutate('patch', `/events/${event.id}/invitations/${invitation.id}`, cookie, {
      additionalAssistantLimit: 1
    }).expect(409);
    await mutate('patch', `/events/${event.id}/invitations/${invitation.id}/assistants/${primary.id}`, cookie, {
      name: 'No permitido'
    }).expect(409);
    await mutate('delete', `/events/${event.id}/invitations/${invitation.id}/assistants/${primary.id}`, cookie).expect(
      409
    );

    await expect(
      prisma.invitation.update({
        where: { id: invitation.id },
        data: { invitationTokenNonce: 'a'.repeat(64) }
      })
    ).rejects.toThrow();
    await expect(
      prisma.invitation.create({
        data: {
          eventId: otherEvent.id,
          contactId: contact.id,
          invitationTokenNonce: 'b'.repeat(64),
          qrTokenNonce: 'c'.repeat(64)
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.assistant.create({
        data: { eventId: otherEvent.id, invitationId: invitation.id, name: 'Evento incorrecto' }
      })
    ).rejects.toThrow();
    await expect(prisma.assistant.delete({ where: { id: primary.id } })).rejects.toThrow();
  });

  it('enforces ownership for all planner roles and blocks Platform Admin', async () => {
    const independent = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const outsider = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const organization = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: `Organization ${randomUUID()}` }
    });
    const admin = await createUser(organization.id, UserRole.ORGANIZATION_ADMIN);
    const planner = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const colleague = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const independentEvent = await createEvent(independent);
    const plannerEvent = await createEvent({ clientId: organization.id, userId: planner.userId });
    const colleagueEvent = await createEvent({ clientId: organization.id, userId: colleague.userId });
    await createProvisionedFixture(independentEvent.id, independent.userId, 'Independiente');
    await createProvisionedFixture(plannerEvent.id, planner.userId, 'Planner');
    await createProvisionedFixture(colleagueEvent.id, colleague.userId, 'Colega');

    await invitationList(independentEvent.id, await login(independent.email)).expect(200);
    await invitationList(independentEvent.id, await login(outsider.email)).expect(404);
    const adminCookie = await login(admin.email);
    await invitationList(plannerEvent.id, adminCookie).expect(200);
    await invitationList(colleagueEvent.id, adminCookie).expect(200);
    const plannerCookie = await login(planner.email);
    await invitationList(plannerEvent.id, plannerCookie).expect(200);
    await invitationList(colleagueEvent.id, plannerCookie).expect(404);
    await invitationList(independentEvent.id, await login(platform.email)).expect(403);
  });

  it('separates token purposes and resolves isolated public, cancelled, closed, and hidden states', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);
    const firstContact = await createContact(event.id, cookie, 'Primera');
    const secondContact = await createContact(event.id, cookie, 'Segunda');
    const first = await invitationList(event.id, cookie).expect(200);
    const firstInvitation = first.body.find((item: { contactId: string }) => item.contactId === firstContact.id);
    const secondInvitation = first.body.find((item: { contactId: string }) => item.contactId === secondContact.id);
    const invitationToken = String(firstInvitation.invitationLink).split('/').at(-1)!;
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: firstInvitation.id } });
    const qrToken = tokens.issue('QR', stored.id, stored.qrTokenNonce, stored.qrTokenVersion);

    expect(invitationToken).not.toBe(qrToken);
    expect(tokens.verify('QR', invitationToken)).toBeNull();
    expect(tokens.verify('INVITATION', qrToken)).toBeNull();
    expect(invitationToken).not.toContain('+5255');
    await publicInvitation('invalid-token').expect(404);
    await publicInvitation(qrToken).expect(404);
    await publicInvitation(invitationToken).expect(404);

    await setEventStatus(event.id, EventStatus.ACTIVE);
    const available = await publicInvitation(invitationToken).expect(200);
    expect(available.body).toMatchObject({
      status: 'AVAILABLE',
      invitation: { id: firstInvitation.id },
      assistants: [{ name: 'Primera', isPrimary: true }]
    });
    expect(JSON.stringify(available.body)).not.toContain('Segunda');
    expect(JSON.stringify(available.body)).not.toContain('+5255');
    expect(JSON.stringify(available.body)).not.toContain(stored.qrTokenNonce);

    const beforeFinance = {
      ledger: await prisma.ledgerEntry.count(),
      receipts: await prisma.receipt.count()
    };
    const concurrent = await Promise.all([
      cancel(event.id, firstInvitation.id, cookie, 'cancel-invitation-001'),
      cancel(event.id, firstInvitation.id, cookie, 'cancel-invitation-001')
    ]);
    expect(concurrent.map(({ status }) => status)).toEqual([200, 200]);
    expect(concurrent[0]?.body).toEqual(concurrent[1]?.body);
    expect(concurrent[0]?.body).toEqual({
      invitationId: firstInvitation.id,
      eventId: event.id,
      status: 'CANCELLED',
      cancelledAt: expect.any(String)
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'INVITATION_CANCEL', resourceId: firstInvitation.id } })
    ).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(beforeFinance.ledger);
    expect(await prisma.receipt.count()).toBe(beforeFinance.receipts);
    await cancel(event.id, secondInvitation.id, cookie, 'cancel-invitation-001').expect(409);
    await publicInvitation(invitationToken)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual({
          status: 'CANCELLED',
          message: 'Invitación cancelada por el organizador'
        })
      );

    const secondToken = String(secondInvitation.invitationLink).split('/').at(-1)!;
    await setEventStatus(event.id, EventStatus.CANCELLED);
    await publicInvitation(secondToken)
      .expect(200)
      .expect(({ body }) =>
        expect(body).toEqual({ status: 'CANCELLED', message: 'Evento cancelado por el organizador' })
      );
    await setEventStatus(event.id, EventStatus.CLOSED);
    await publicInvitation(secondToken)
      .expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: 'CLOSED' }));
    await setEventStatus(event.id, EventStatus.ARCHIVED);
    await publicInvitation(secondToken).expect(404);
  });

  it('replays the stable cancellation response after later changes and soft deletes without leaking ownership', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const outsider = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const ownerCookie = await login(owner.email);
    const outsiderCookie = await login(outsider.email);
    const firstContact = await createContact(event.id, ownerCookie, 'Nombre Original');
    const secondContact = await createContact(event.id, ownerCookie, 'Otra InvitaciÃ³n');
    const invitations = await invitationList(event.id, ownerCookie).expect(200);
    const firstInvitation = invitations.body.find((item: { contactId: string }) => item.contactId === firstContact.id);
    const secondInvitation = invitations.body.find(
      (item: { contactId: string }) => item.contactId === secondContact.id
    );
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: firstInvitation.id } });
    const beforeFinance = {
      ledger: await prisma.ledgerEntry.count(),
      receipts: await prisma.receipt.count(),
      payments: await prisma.payment.count()
    };

    const first = await cancel(event.id, firstInvitation.id, ownerCookie, 'stable-cancellation-001').expect(200);
    const stableResponse = {
      invitationId: firstInvitation.id,
      eventId: event.id,
      status: 'CANCELLED',
      cancelledAt: expect.any(String)
    };
    expect(first.body).toEqual(stableResponse);
    const responseText = JSON.stringify(first.body);
    expect(responseText).not.toContain('Nombre Original');
    expect(responseText).not.toContain(firstInvitation.invitationLink);
    expect(responseText).not.toContain(stored.invitationTokenNonce);
    expect(responseText).not.toContain(stored.qrTokenNonce);

    await mutate('patch', `/events/${event.id}/contacts/${firstContact.id}`, ownerCookie, {
      name: 'Nombre Posterior'
    }).expect(200);
    const afterRename = await cancel(event.id, firstInvitation.id, ownerCookie, 'stable-cancellation-001').expect(200);
    expect(afterRename.body).toEqual(first.body);
    await cancel(event.id, firstInvitation.id, ownerCookie, 'different-cancellation-001')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_ALREADY_CANCELLED'));
    await cancel(event.id, secondInvitation.id, ownerCookie, 'stable-cancellation-001')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('INVITATION_CANCEL_IDEMPOTENCY_CONFLICT'));

    await setEventStatus(event.id, EventStatus.CANCELLED);
    const afterStatusChange = await cancel(event.id, firstInvitation.id, ownerCookie, 'stable-cancellation-001').expect(
      200
    );
    expect(afterStatusChange.body).toEqual(first.body);

    const deletedAt = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.invitation.update({ where: { id: firstInvitation.id }, data: { deletedAt } });
      await tx.assistant.updateMany({
        where: { invitationId: firstInvitation.id, deletedAt: null },
        data: { deletedAt }
      });
      await tx.contact.update({ where: { id: firstContact.id }, data: { deletedAt } });
      await tx.event.update({ where: { id: event.id }, data: { deletedAt } });
    });

    const afterSoftDelete = await cancel(event.id, firstInvitation.id, ownerCookie, 'stable-cancellation-001').expect(
      200
    );
    expect(afterSoftDelete.body).toEqual(first.body);
    await cancel(event.id, firstInvitation.id, ownerCookie, 'new-after-soft-delete').expect(404);
    await cancel(event.id, firstInvitation.id, outsiderCookie, 'stable-cancellation-001').expect(404);

    expect(
      await prisma.auditLog.count({ where: { action: 'INVITATION_CANCEL', resourceId: firstInvitation.id } })
    ).toBe(1);
    expect(await prisma.ledgerEntry.count()).toBe(beforeFinance.ledger);
    expect(await prisma.receipt.count()).toBe(beforeFinance.receipts);
    expect(await prisma.payment.count()).toBe(beforeFinance.payments);
  });

  it('rejects unauthorized cancellation actors at the PostgreSQL boundary', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const otherClientActor = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const event = await createEvent(owner);
    await createProvisionedFixture(event.id, owner.userId, 'Actor externo');
    await createProvisionedFixture(event.id, owner.userId, 'Actor plataforma');
    await createProvisionedFixture(event.id, owner.userId, 'Actor eliminado');
    await prisma.user.update({ where: { id: owner.userId }, data: { deletedAt: new Date() } });
    const independentInvitations = await prisma.invitation.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: 'asc' }
    });

    await expectCancellationActorRejected(independentInvitations[0]!.id, otherClientActor.userId, 'actor-other-client');
    await expectCancellationActorRejected(independentInvitations[1]!.id, platform.userId, 'actor-platform-admin');
    await expectCancellationActorRejected(independentInvitations[2]!.id, owner.userId, 'actor-deleted-user');

    const organization = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: `Organization ${randomUUID()}` }
    });
    const creator = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const colleague = await createUser(organization.id, UserRole.ORGANIZATION_PLANNER);
    const organizationEvent = await createEvent({ clientId: organization.id, userId: creator.userId });
    await createProvisionedFixture(organizationEvent.id, creator.userId, 'Planner ajeno');
    const organizationInvitation = await prisma.invitation.findFirstOrThrow({
      where: { eventId: organizationEvent.id }
    });
    await expectCancellationActorRejected(
      organizationInvitation.id,
      colleague.userId,
      'actor-unrelated-organization-planner'
    );

    expect(
      await prisma.invitation.count({
        where: {
          id: { in: [...independentInvitations.map(({ id }) => id), organizationInvitation.id] },
          cancelledAt: { not: null }
        }
      })
    ).toBe(0);
  });

  it('anonymizes active and deleted assistants idempotently without PII or token audit data', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner, new Date(Date.now() - 31 * 24 * 60 * 60 * 1000));
    const cookie = await login(owner.email);
    const contact = await createContact(event.id, cookie, 'Nombre Privado');
    const invitation = await prisma.invitation.findUniqueOrThrow({ where: { contactId: contact.id } });
    await mutate('patch', `/events/${event.id}/invitations/${invitation.id}`, cookie, {
      additionalAssistantLimit: 1
    }).expect(200);
    const extra = await mutate('post', `/events/${event.id}/invitations/${invitation.id}/assistants`, cookie, {
      name: 'Extra Privado'
    }).expect(201);
    await mutate(
      'delete',
      `/events/${event.id}/invitations/${invitation.id}/assistants/${extra.body.id}`,
      cookie
    ).expect(204);

    const at = new Date();
    expect(await contacts.anonymizeExpiredContacts(at)).toBe(3);
    expect(await contacts.anonymizeExpiredContacts(at)).toBe(0);
    const assistants = await prisma.assistant.findMany({ where: { eventId: event.id } });
    expect(
      assistants.every(({ name, anonymizedAt }) => name === null && anonymizedAt?.getTime() === at.getTime())
    ).toBe(true);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'ASSISTANTS_ANONYMIZED', eventId: event.id }
    });
    expect(audit.afterData).toEqual({
      eventId: event.id,
      assistantsAnonymized: 2,
      assistantIds: expect.arrayContaining(assistants.map(({ id }) => id))
    });
    const auditText = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: event.id } }));
    expect(auditText).not.toContain('Nombre Privado');
    expect(auditText).not.toContain('Extra Privado');
    expect(auditText).not.toContain(invitation.invitationTokenNonce);
    expect(auditText).not.toContain(invitation.qrTokenNonce);
  });

  it('keeps the migration backfill idempotent for normal, anonymized, and deleted legacy contacts', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const normal = await prisma.contact.create({
      data: { eventId: event.id, name: 'Legacy', whatsappPhoneNormalized: '+525511111111' }
    });
    const anonymized = await prisma.contact.create({
      data: { eventId: event.id, name: null, whatsappPhoneNormalized: null, anonymizedAt: new Date() }
    });
    const deletedAt = new Date();
    const deleted = await prisma.contact.create({
      data: {
        eventId: event.id,
        name: 'Deleted legacy',
        whatsappPhoneNormalized: '+525522222222',
        deletedAt
      }
    });

    await runBackfill();
    await runBackfill();
    expect(await prisma.invitation.count({ where: { eventId: event.id } })).toBe(3);
    expect(await prisma.assistant.count({ where: { eventId: event.id, isPrimary: true } })).toBe(3);
    const normalAssistant = await primaryFor(normal.id);
    const anonymizedAssistant = await primaryFor(anonymized.id);
    const deletedAssistant = await primaryFor(deleted.id);
    expect(normalAssistant).toMatchObject({ name: 'Legacy', anonymizedAt: null, deletedAt: null });
    expect(anonymizedAssistant).toMatchObject({ name: null, anonymizedAt: expect.any(Date), deletedAt: null });
    expect(deletedAssistant).toMatchObject({ name: 'Deleted legacy', deletedAt });
  });

  it('publishes all CODEX-051 endpoints in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const path of [
      '/api/v1/events/{eventId}/invitations',
      '/api/v1/events/{eventId}/invitations/{invitationId}',
      '/api/v1/events/{eventId}/invitations/{invitationId}/cancel',
      '/api/v1/events/{eventId}/invitations/{invitationId}/assistants',
      '/api/v1/events/{eventId}/invitations/{invitationId}/assistants/{assistantId}',
      '/api/v1/public/invitations/{invitationToken}'
    ]) {
      expect(paths).toHaveProperty(path);
    }
  });

  function mutate(method: 'post' | 'patch' | 'delete', path: string, cookie: string, body?: object) {
    const agent = request(app.getHttpServer());
    let call =
      method === 'post'
        ? agent.post(`/api/v1${path}`)
        : method === 'patch'
          ? agent.patch(`/api/v1${path}`)
          : agent.delete(`/api/v1${path}`);
    call = call.set('Origin', trustedOrigin).set('Cookie', cookie);
    return body === undefined ? call : call.send(body);
  }

  function invitationList(eventId: string, cookie: string) {
    return request(app.getHttpServer()).get(`/api/v1/events/${eventId}/invitations`).set('Cookie', cookie);
  }

  function publicInvitation(token: string) {
    return request(app.getHttpServer()).get(`/api/v1/public/invitations/${token}`);
  }

  function cancel(eventId: string, invitationId: string, cookie: string, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/invitations/${invitationId}/cancel`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({});
  }

  function previewCsv(eventId: string, cookie: string, csv: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/contacts/import/preview`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .attach('file', Buffer.from(csv), { filename: 'contacts.csv', contentType: 'text/csv' });
  }

  function commit(eventId: string, cookie: string, previewId: string, key: string) {
    return request(app.getHttpServer())
      .post(`/api/v1/events/${eventId}/contacts/import/commit`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .set('Idempotency-Key', key)
      .send({ previewId });
  }

  async function createContact(eventId: string, cookie: string, name: string) {
    const response = await mutate('post', `/events/${eventId}/contacts`, cookie, {
      name,
      whatsappPhone: `+5255${String(Math.floor(Math.random() * 99_999_999)).padStart(8, '0')}`
    }).expect(201);
    return response.body as { id: string };
  }

  async function createProvisionedFixture(eventId: string, userId: string, name: string): Promise<void> {
    const contact = await prisma.contact.create({
      data: { eventId, name, whatsappPhoneNormalized: '+525511111111' }
    });
    await runBackfill();
    expect(
      await prisma.invitation.count({ where: { contactId: contact.id, event: { createdByUserId: userId } } })
    ).toBe(1);
  }

  async function setEventStatus(eventId: string, status: EventStatus): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      const event = await tx.event.findUniqueOrThrow({
        where: { id: eventId },
        include: { client: { select: { type: true } } }
      });
      if (!event.activatedAt && status !== EventStatus.CANCELLED) {
        const service = await tx.service.create({ data: { code: ServiceCode.FLYER } });
        const price = await tx.servicePrice.create({
          data: {
            serviceId: service.id,
            clientType: event.client.type,
            credits: 20,
            validFrom: new Date('2020-01-01T00:00:00.000Z')
          }
        });
        const activationKey = `test-activation-${event.id}`;
        const receipt = await tx.receipt.create({
          data: {
            folio: 9_000_000n,
            clientId: event.clientId,
            operationType: 'EVENT_ACTIVATION',
            operationReference: event.id,
            idempotencyKey: activationKey
          }
        });
        await tx.event.update({
          where: { id: eventId },
          data: {
            status,
            activatedAt: new Date(),
            activatedByUserId: event.createdByUserId,
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
      } else {
        await tx.event.update({ where: { id: eventId }, data: { status } });
      }
    });
  }

  async function runBackfill(): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`
        INSERT INTO "invitation" (
          "event_id", "contact_id", "invitation_token_nonce", "qr_token_nonce",
          "created_at", "updated_at", "deleted_at"
        )
        SELECT
          "contact"."event_id", "contact"."id",
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
          "contact"."created_at", "contact"."updated_at", "contact"."deleted_at"
        FROM "contact"
        ON CONFLICT ("contact_id") DO NOTHING
      `);
      await tx.$executeRawUnsafe(`
        INSERT INTO "assistant" (
          "event_id", "invitation_id", "name", "is_primary", "anonymized_at",
          "created_at", "updated_at", "deleted_at"
        )
        SELECT
          "contact"."event_id", "invitation"."id",
          CASE WHEN "contact"."anonymized_at" IS NULL THEN "contact"."name" ELSE NULL END,
          TRUE, "contact"."anonymized_at", "contact"."created_at",
          "contact"."updated_at", "contact"."deleted_at"
        FROM "invitation"
        JOIN "contact" ON "contact"."id" = "invitation"."contact_id"
        WHERE NOT EXISTS (
          SELECT 1 FROM "assistant"
          WHERE "assistant"."invitation_id" = "invitation"."id"
            AND "assistant"."is_primary"
        )
      `);
    });
  }

  async function primaryFor(contactId: string) {
    return prisma.assistant.findFirstOrThrow({
      where: { isPrimary: true, invitation: { contactId } }
    });
  }

  async function expectCancellationActorRejected(
    invitationId: string,
    actorUserId: string,
    idempotencyKey: string
  ): Promise<void> {
    await expect(
      prisma.invitation.update({
        where: { id: invitationId },
        data: {
          cancelledAt: new Date(),
          cancelledByUserId: actorUserId,
          cancelIdempotencyKey: idempotencyKey
        }
      })
    ).rejects.toThrow(/invitation cancellation actor is not authorized/);
  }

  async function createClientUser(role: UserRole, type: ClientType = ClientType.PLANNER) {
    const client = await prisma.client.create({ data: { type, name: `Client ${randomUUID()}` } });
    const user = await createUser(client.id, role);
    return { clientId: client.id, userId: user.userId, email: user.email };
  }

  async function createUser(clientId: string | null, role: UserRole) {
    const email = `${randomUUID()}@example.com`;
    const user = await prisma.user.create({
      data: { email, passwordHash: await hashPassword(password), role, clientId }
    });
    return { userId: user.id, email };
  }

  async function createEvent(
    owner: { clientId: string; userId: string },
    eventDateTime = new Date('2030-01-01T18:00:00.000Z')
  ) {
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        name: 'Evento de prueba',
        status: EventStatus.DRAFT,
        eventDateTime,
        timeZone: 'America/Mexico_City'
      }
    });
  }

  async function login(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('Origin', trustedOrigin)
      .send({ email, password })
      .expect(200);
    const raw = response.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie.');
    return cookie;
  }

  async function resetDatabase(): Promise<void> {
    await prisma.$executeRawUnsafe(`
      BEGIN;
      SET LOCAL session_replication_role = replica;
      TRUNCATE TABLE
        "assistant",
        "invitation",
        "contact_import_preview",
        "contact",
        "contact_group",
        "event",
        "debt_payment_allocation",
        "ledger_entry",
        "payment",
        "receipt",
        "credit_line",
        "finance_balance",
        "promotion",
        "service_price",
        "service",
        "audit_log",
        "auth_session",
        "app_user",
        "client"
      RESTART IDENTITY CASCADE;
      COMMIT;
    `);
  }
});
