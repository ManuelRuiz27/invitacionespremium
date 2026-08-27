import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../src/auth/password-hasher';
import { createApp } from '../src/bootstrap/create-app';
import { PrismaService } from '../src/common/database/prisma.service';
import { ContactsService } from '../src/contacts/contacts.service';
import { ClientType, EventStatus, UserRole } from '../src/generated/prisma/client';
import { createOpenApiDocument } from '../src/openapi/openapi';

const trustedOrigin = 'http://localhost:5173';
const password = 'correct horse battery staple';

describe('Contacts, groups, and CSV imports', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let contacts: ContactsService;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
    process.env.NODE_ENV = 'test';
    process.env.SWAGGER_ENABLED = 'true';
    process.env.CORS_ORIGINS = trustedOrigin;
    process.env.AUTH_COOKIE_SECURE = 'false';
    process.env.AUTH_COOKIE_SAME_SITE = 'lax';
    process.env.AUTH_COOKIE_PATH = '/';
    process.env.AUTH_SESSION_TTL_SECONDS = '3600';
    process.env.PHONE_DEFAULT_REGION = 'MX';
    process.env.CONTACT_IMPORT_PREVIEW_TTL_SECONDS = '1800';
    app = await createApp();
    await app.init();
    prisma = app.get(PrismaService);
    contacts = app.get(ContactsService);
  });

  beforeEach(resetDatabase, 60_000);
  afterAll(async () => {
    await resetDatabase();
    await app.close();
  }, 60_000);

  it('enforces ownership, preparation state, same-event groups, normalization, and PII-safe audit', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const outsider = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const platform = await createUser(null, UserRole.PLATFORM_ADMIN);
    const event = await createEvent(owner);
    const otherEvent = await createEvent(owner);
    const ownerCookie = await login(owner.email);
    const outsiderCookie = await login(outsider.email);
    const platformCookie = await login(platform.email);

    const family = await mutate('post', `/events/${event.id}/groups`, ownerCookie, {
      name: '  Familia   cercana '
    }).expect(201);
    const otherGroup = await mutate('post', `/events/${otherEvent.id}/groups`, ownerCookie, { name: 'Otro' }).expect(
      201
    );
    await mutate('post', `/events/${event.id}/groups`, ownerCookie, { name: 'familia cercana' })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_GROUP_NAME_CONFLICT'));

    const created = await mutate('post', `/events/${event.id}/contacts`, ownerCookie, {
      name: '  Persona   Ejemplo ',
      whatsappPhone: '55 1234 5678',
      groupId: family.body.id
    }).expect(201);
    expect(created.body).toMatchObject({
      eventId: event.id,
      name: 'Persona Ejemplo',
      whatsappPhone: '+525512345678',
      groupId: family.body.id
    });
    const updatedGroup = await mutate('patch', `/events/${event.id}/groups/${family.body.id}`, ownerCookie, {
      name: 'Familia principal'
    }).expect(200);
    expect(updatedGroup.body.name).toBe('Familia principal');
    const updatedContact = await mutate('patch', `/events/${event.id}/contacts/${created.body.id}`, ownerCookie, {
      name: 'Persona Actualizada',
      whatsappPhone: '+525598765432'
    }).expect(200);
    expect(updatedContact.body).toMatchObject({
      name: 'Persona Actualizada',
      whatsappPhone: '+525598765432'
    });
    await mutate('patch', `/events/${event.id}/contacts/${created.body.id}`, ownerCookie, {
      groupId: otherGroup.body.id
    }).expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/contacts`)
      .set('Cookie', outsiderCookie)
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/contacts`)
      .set('Cookie', platformCookie)
      .expect(403);
    await mutate('delete', `/events/${event.id}/contacts/${created.body.id}`, ownerCookie).expect(204);
    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/contacts`)
      .set('Cookie', ownerCookie)
      .expect(200);
    expect(afterDelete.body).toEqual([]);
    expect(
      await prisma.contact.findUnique({ where: { id: created.body.id }, select: { deletedAt: true } })
    ).toMatchObject({ deletedAt: expect.any(Date) });

    await mutate(
      'post',
      `/events/${event.id}/cancel`,
      ownerCookie,
      {},
      {
        'Idempotency-Key': 'contacts-cancel-event'
      }
    ).expect(200);
    await mutate('post', `/events/${event.id}/contacts`, ownerCookie, {
      name: 'Blocked',
      whatsappPhone: '+525511111111'
    })
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_EVENT_NOT_MUTABLE'));

    const auditText = JSON.stringify(
      await prisma.auditLog.findMany({ where: { eventId: event.id }, select: { beforeData: true, afterData: true } })
    );
    expect(auditText).not.toContain('Persona Actualizada');
    expect(auditText).not.toContain('+525598765432');
  });

  it('limits organization planners to events they own inside their shared client', async () => {
    const client = await prisma.client.create({
      data: { type: ClientType.ORGANIZATION, name: `Organization ${randomUUID()}` }
    });
    const planner = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const colleague = await createUser(client.id, UserRole.ORGANIZATION_PLANNER);
    const ownEvent = await createEvent({ clientId: client.id, userId: planner.userId });
    const colleagueEvent = await createEvent({ clientId: client.id, userId: colleague.userId });
    const cookie = await login(planner.email);

    await mutate('post', `/events/${ownEvent.id}/contacts`, cookie, {
      name: 'Contacto propio',
      whatsappPhone: '+525511111111'
    }).expect(201);
    await mutate('post', `/events/${colleagueEvent.id}/contacts`, cookie, {
      name: 'Contacto ajeno',
      whatsappPhone: '+525522222222'
    }).expect(404);
  });

  it('previews without definitive writes and commits atomically with groups and exact idempotent replay', async () => {
    const owner = await createClientUser(UserRole.ORGANIZATION_ADMIN, ClientType.ORGANIZATION);
    const outsider = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);
    const outsiderCookie = await login(outsider.email);

    const template = await request(app.getHttpServer())
      .get(`/api/v1/events/${event.id}/contacts/import-template`)
      .set('Cookie', cookie)
      .expect(200);
    expect(template.headers['content-type']).toContain('text/csv');
    expect(template.text).toBe('name,whatsapp_phone,group\r\nMaría Ejemplo,+525512345678,Familia\r\n');

    const csv = Buffer.from(
      '\uFEFFname,whatsapp_phone,group\r\nAna Ejemplo,55 1111 1111,Familia\r\nLuis Ejemplo,+525522222222,Amigos\r\n',
      'utf8'
    );
    const preview = await request(app.getHttpServer())
      .post(`/api/v1/events/${event.id}/contacts/import/preview`)
      .set('Origin', trustedOrigin)
      .set('Cookie', cookie)
      .attach('file', csv, { filename: 'contacts.csv', contentType: 'text/csv' })
      .expect(201);
    expect(preview.body).toMatchObject({ totalRows: 2, validRows: 2, invalidRows: 0 });
    expect(preview.body.rows.map((row: { normalizedPhone: string }) => row.normalizedPhone)).toEqual([
      '+525511111111',
      '+525522222222'
    ]);
    expect(await prisma.contact.count()).toBe(0);
    expect(await prisma.group.count()).toBe(0);

    const first = await commit(event.id, cookie, preview.body.previewId, 'contacts-import-001').expect(200);
    const replay = await commit(event.id, cookie, preview.body.previewId, 'contacts-import-001').expect(200);
    expect(replay.body).toEqual(first.body);
    expect(first.body).toMatchObject({ createdContacts: 2, createdGroups: 2 });
    expect(await prisma.contact.count()).toBe(2);
    expect(await prisma.group.count()).toBe(2);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })).toBe(1);
    expect(
      await prisma.contactImportPreview.findUnique({
        where: { id: preview.body.previewId },
        select: { normalizedRows: true, piiPurgedAt: true, resultSnapshot: true }
      })
    ).toEqual({
      normalizedRows: null,
      piiPurgedAt: null,
      resultSnapshot: first.body
    });

    const anotherPreview = await previewCsv(event.id, cookie, 'name,whatsapp_phone,group\nOtro,+525533333333,\n');
    await commit(event.id, outsiderCookie, anotherPreview.body.previewId, 'outsider-import-001').expect(404);
    await commit(event.id, cookie, anotherPreview.body.previewId, 'contacts-import-001')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_IMPORT_IDEMPOTENCY_CONFLICT'));
    expect(await prisma.contact.count()).toBe(2);

    const concurrent = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\nConcurrente,+525544444444,\n'
    ).expect(201);
    const sameKey = await Promise.all([
      commit(event.id, cookie, concurrent.body.previewId, 'concurrent-import-001'),
      commit(event.id, cookie, concurrent.body.previewId, 'concurrent-import-001')
    ]);
    expect(sameKey.map(({ status }) => status)).toEqual([200, 200]);
    expect(sameKey[0]?.body).toEqual(sameKey[1]?.body);
    expect(await prisma.contact.count()).toBe(3);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })).toBe(2);

    const competing = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\nUna sola vez,+525555555555,\n'
    ).expect(201);
    const distinctKeys = await Promise.all([
      commit(event.id, cookie, competing.body.previewId, 'competing-import-001'),
      commit(event.id, cookie, competing.body.previewId, 'competing-import-002')
    ]);
    expect(distinctKeys.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.contact.count()).toBe(4);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })).toBe(3);

    await mutate(
      'post',
      `/events/${event.id}/cancel`,
      cookie,
      {},
      { 'Idempotency-Key': 'contacts-import-cancel' }
    ).expect(200);
    const replayAfterStateChange = await commit(event.id, cookie, preview.body.previewId, 'contacts-import-001').expect(
      200
    );
    expect(replayAfterStateChange.body).toEqual(first.body);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })).toBe(3);
  });

  it('reports row errors, rejects oversized previews, and preserves the 150-contact limit under concurrency', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const event = await createEvent(owner);
    const cookie = await login(owner.email);

    const invalid = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\n,+525511111111,\nValid,not-a-phone,\n'
    ).expect(201);
    expect(invalid.body).toMatchObject({ totalRows: 2, validRows: 0, invalidRows: 2 });
    expect(invalid.body.rows[0].errors).toContain('CONTACT_NAME_REQUIRED');
    expect(invalid.body.rows[1].errors).toContain('CONTACT_PHONE_INVALID');
    await commit(event.id, cookie, invalid.body.previewId, 'invalid-import-001').expect(409);
    await previewCsv(event.id, cookie, ' name,whatsapp_phone,group\nA,+525511111111,\n')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_IMPORT_INVALID_HEADERS'));

    const expiring = await previewCsv(event.id, cookie, 'name,whatsapp_phone,group\nVigencia,+525577777777,\n').expect(
      201
    );
    await prisma.contactImportPreview.update({
      where: { id: expiring.body.previewId },
      data: { expiresAt: new Date(Date.now() - 1000) }
    });
    await commit(event.id, cookie, expiring.body.previewId, 'expired-import-001')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_IMPORT_PREVIEW_EXPIRED'));

    const oversizedRows = Array.from(
      { length: 151 },
      (_, index) => `Persona ${index},+5255${String(index).padStart(8, '0')},`
    ).join('\n');
    await previewCsv(event.id, cookie, `name,whatsapp_phone,group\n${oversizedRows}\n`)
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('CONTACT_IMPORT_ROW_LIMIT_EXCEEDED'));

    await prisma.contact.createMany({
      data: Array.from({ length: 149 }, (_, index) => ({
        eventId: event.id,
        name: `Fixture ${index}`,
        whatsappPhoneNormalized: `+5255${String(index).padStart(8, '0')}`
      }))
    });
    await prisma.contact.create({
      data: {
        eventId: event.id,
        name: 'Deleted fixture',
        whatsappPhoneNormalized: '+525588888888',
        deletedAt: new Date()
      }
    });
    const overCapacityImport = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\nImport A,+525599999981,Nuevo\nImport B,+525599999982,Nuevo\n'
    ).expect(201);
    await commit(event.id, cookie, overCapacityImport.body.previewId, 'over-capacity-import').expect(409);
    expect(await prisma.contact.count({ where: { eventId: event.id, deletedAt: null } })).toBe(149);
    expect(await prisma.group.count({ where: { eventId: event.id } })).toBe(0);

    const attempts = await Promise.all([
      mutate('post', `/events/${event.id}/contacts`, cookie, {
        name: 'Concurrent A',
        whatsappPhone: '+525599999991'
      }),
      mutate('post', `/events/${event.id}/contacts`, cookie, {
        name: 'Concurrent B',
        whatsappPhone: '+525599999992'
      })
    ]);
    expect(attempts.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(await prisma.contact.count({ where: { eventId: event.id, deletedAt: null } })).toBe(150);

    const importEvent = await createEvent(owner);
    await prisma.contact.createMany({
      data: Array.from({ length: 148 }, (_, index) => ({
        eventId: importEvent.id,
        name: `Import fixture ${index}`,
        whatsappPhoneNormalized: `+5266${String(index).padStart(8, '0')}`
      }))
    });
    const previewA = await previewCsv(
      importEvent.id,
      cookie,
      'name,whatsapp_phone,group\nConcurrent A1,+525577777771,\nConcurrent A2,+525577777772,\n'
    ).expect(201);
    const previewB = await previewCsv(
      importEvent.id,
      cookie,
      'name,whatsapp_phone,group\nConcurrent B1,+525577777773,\nConcurrent B2,+525577777774,\n'
    ).expect(201);
    const concurrentImports = await Promise.all([
      commit(importEvent.id, cookie, previewA.body.previewId, 'capacity-import-a'),
      commit(importEvent.id, cookie, previewB.body.previewId, 'capacity-import-b')
    ]);
    expect(concurrentImports.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await prisma.contact.count({ where: { eventId: importEvent.id, deletedAt: null } })).toBe(150);
  });

  it('redacts committed previews, preserves private replay, enforces database immutability, and purges pending rows', async () => {
    const owner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const otherOwner = await createClientUser(UserRole.INDEPENDENT_PLANNER);
    const oldDate = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const event = await createEvent(owner, oldDate);
    const otherEvent = await createEvent(otherOwner, oldDate);
    const cookie = await login(owner.email);
    const imported = await previewCsv(
      event.id,
      cookie,
      'name,whatsapp_phone,group\nActive PII,+525511111111,Familia\nDeleted PII,+525522222222,Familia\n'
    ).expect(201);
    const original = await commit(event.id, cookie, imported.body.previewId, 'privacy-import-001').expect(200);
    await prisma.contact.update({
      where: { id: original.body.contacts[1].id },
      data: { deletedAt: new Date() }
    });
    await prisma.contactImportPreview.create({
      data: {
        eventId: event.id,
        createdByUserId: owner.userId,
        expiresAt: new Date(Date.now() - 1000),
        totalRows: 0,
        validRows: 0,
        invalidRows: 0,
        normalizedRows: []
      }
    });

    expect(
      await commit(event.id, cookie, imported.body.previewId, 'privacy-import-001').then(({ body }) => body)
    ).toEqual(original.body);
    const mutationCounts = {
      contacts: await prisma.contact.count(),
      groups: await prisma.group.count(),
      commits: await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })
    };
    const anonymizedAt = new Date();
    expect(await contacts.anonymizeExpiredContacts(anonymizedAt)).toBe(5);
    expect(await contacts.anonymizeExpiredContacts(anonymizedAt)).toBe(0);
    const stored = await prisma.contact.findMany({ where: { eventId: event.id } });
    expect(
      stored.every(
        ({ name, whatsappPhoneNormalized, anonymizedAt }) => !name && !whatsappPhoneNormalized && anonymizedAt
      )
    ).toBe(true);
    expect(
      (await prisma.assistant.findMany({ where: { eventId: event.id } })).every(
        ({ name, anonymizedAt: assistantAnonymizedAt }) => !name && assistantAnonymizedAt
      )
    ).toBe(true);
    const committedPreview = await prisma.contactImportPreview.findUniqueOrThrow({
      where: { id: imported.body.previewId }
    });
    expect(committedPreview.normalizedRows).toBeNull();
    expect(committedPreview.piiPurgedAt).toEqual(anonymizedAt);
    const expectedRedacted = {
      ...original.body,
      contacts: original.body.contacts.map((contact: Record<string, unknown>) => ({
        ...contact,
        name: null,
        whatsappPhone: null,
        anonymizedAt: anonymizedAt.toISOString()
      }))
    };
    expect(committedPreview.resultSnapshot).toEqual(expectedRedacted);
    const replay = await commit(event.id, cookie, imported.body.previewId, 'privacy-import-001').expect(200);
    expect(replay.body).toEqual(expectedRedacted);
    expect(await prisma.contact.count()).toBe(mutationCounts.contacts);
    expect(await prisma.group.count()).toBe(mutationCounts.groups);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACT_IMPORT_COMMIT' } })).toBe(mutationCounts.commits);
    expect(await prisma.contactImportPreview.count({ where: { eventId: event.id, committedAt: null } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: 'CONTACTS_ANONYMIZED', eventId: event.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: 'ASSISTANTS_ANONYMIZED', eventId: event.id } })).toBe(1);
    const privacyAudit = await prisma.auditLog.findFirstOrThrow({
      where: { action: 'CONTACTS_ANONYMIZED', eventId: event.id },
      select: { afterData: true }
    });
    expect(privacyAudit.afterData).toEqual({
      eventId: event.id,
      contactsAnonymized: 2,
      previewsRedacted: 1,
      contactIds: expect.arrayContaining(stored.map(({ id }) => id)),
      previewIds: [imported.body.previewId]
    });
    expect(Object.keys(privacyAudit.afterData as object).sort()).toEqual(
      ['eventId', 'contactsAnonymized', 'previewsRedacted', 'contactIds', 'previewIds'].sort()
    );
    const audit = JSON.stringify(await prisma.auditLog.findMany({ where: { eventId: event.id } }));
    expect(audit).not.toContain('Active PII');
    expect(audit).not.toContain('+525511111111');

    await expect(
      prisma.contactImportPreview.update({
        where: { id: imported.body.previewId },
        data: { eventId: otherEvent.id }
      })
    ).rejects.toThrow();
    await expect(
      prisma.contactImportPreview.update({
        where: { id: imported.body.previewId },
        data: { createdByUserId: otherOwner.userId }
      })
    ).rejects.toThrow();
    await expect(
      prisma.contactImportPreview.update({
        where: { id: imported.body.previewId },
        data: { commitIdempotencyKey: 'privacy-import-changed' }
      })
    ).rejects.toThrow();
    await expect(
      prisma.contactImportPreview.update({
        where: { id: imported.body.previewId },
        data: { committedAt: new Date(anonymizedAt.getTime() + 1000) }
      })
    ).rejects.toThrow();
    await expect(
      prisma.contactImportPreview.update({
        where: { id: imported.body.previewId },
        data: { resultSnapshot: original.body }
      })
    ).rejects.toThrow();
    await expect(prisma.contactImportPreview.delete({ where: { id: imported.body.previewId } })).rejects.toThrow();
    await expect(prisma.$executeRawUnsafe('TRUNCATE TABLE "contact_import_preview"')).rejects.toThrow();
    expect(await prisma.contactImportPreview.findUnique({ where: { id: imported.body.previewId } })).toEqual(
      committedPreview
    );

    const previewOnlyEvent = await createEvent(owner, oldDate);
    const previewOnly = await previewCsv(
      previewOnlyEvent.id,
      cookie,
      'name,whatsapp_phone,group\nAlready anonymous,+525533333333,\n'
    ).expect(201);
    const previewOnlyCommit = await commit(
      previewOnlyEvent.id,
      cookie,
      previewOnly.body.previewId,
      'preview-only-privacy'
    ).expect(200);
    await prisma.contact.updateMany({
      where: { eventId: previewOnlyEvent.id },
      data: { name: null, whatsappPhoneNormalized: null, anonymizedAt: new Date(anonymizedAt.getTime() - 1000) }
    });
    await prisma.assistant.updateMany({
      where: { eventId: previewOnlyEvent.id },
      data: { name: null, anonymizedAt: new Date(anonymizedAt.getTime() - 1000) }
    });
    const later = new Date(anonymizedAt.getTime() + 1000);
    expect(await contacts.anonymizeExpiredContacts(later)).toBe(1);
    const previewOnlyStored = await prisma.contactImportPreview.findUniqueOrThrow({
      where: { id: previewOnly.body.previewId }
    });
    expect(previewOnlyStored.piiPurgedAt).toEqual(later);
    expect(previewOnlyStored.resultSnapshot).toEqual({
      ...previewOnlyCommit.body,
      contacts: previewOnlyCommit.body.contacts.map((contact: Record<string, unknown>) => ({
        ...contact,
        name: null,
        whatsappPhone: null,
        anonymizedAt: later.toISOString()
      }))
    });
    expect(
      await prisma.auditLog.count({ where: { action: 'CONTACTS_ANONYMIZED', eventId: previewOnlyEvent.id } })
    ).toBe(1);
  });

  it('publishes all CODEX-050 endpoints in OpenAPI', () => {
    const paths = createOpenApiDocument(app).paths;
    for (const path of [
      '/api/v1/events/{eventId}/contacts',
      '/api/v1/events/{eventId}/contacts/{contactId}',
      '/api/v1/events/{eventId}/groups',
      '/api/v1/events/{eventId}/groups/{groupId}',
      '/api/v1/events/{eventId}/contacts/import-template',
      '/api/v1/events/{eventId}/contacts/import/preview',
      '/api/v1/events/{eventId}/contacts/import/commit'
    ]) {
      expect(paths).toHaveProperty(path);
    }
  });

  function mutate(
    method: 'post' | 'patch' | 'delete',
    path: string,
    cookie: string,
    body?: Record<string, unknown>,
    headers: Record<string, string> = {}
  ) {
    const agent = request(app.getHttpServer());
    let call =
      method === 'post'
        ? agent.post(`/api/v1${path}`)
        : method === 'patch'
          ? agent.patch(`/api/v1${path}`)
          : agent.delete(`/api/v1${path}`);
    call = call.set('Origin', trustedOrigin).set('Cookie', cookie);
    for (const [name, value] of Object.entries(headers)) call = call.set(name, value);
    return body === undefined ? call : call.send(body);
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
    const ownerUser = await prisma.user.findUniqueOrThrow({ where: { id: owner.userId }, select: { role: true } });
    return prisma.event.create({
      data: {
        clientId: owner.clientId,
        createdByUserId: owner.userId,
        assignedPlannerUserId:
          ownerUser.role === UserRole.INDEPENDENT_PLANNER || ownerUser.role === UserRole.ORGANIZATION_PLANNER
            ? owner.userId
            : null,
        status: EventStatus.DRAFT,
        eventDateTime
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
