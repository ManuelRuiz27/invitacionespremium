import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashPassword } from '../src/auth/password-hasher';
import { StaffTokenTechnicalService } from '../src/staff-access/staff-token-technical.service';
import { NominalAccessTokenService } from '../src/nominal-access/nominal-access-token.service';
import { PrismaService } from '../src/common/database/prisma.service';

export async function createNominalAccessFixture(app: INestApplication, origin: string, password: string) {
  const prisma = app.get(PrismaService);
  const client = await prisma.client.create({
    data: { type: 'ORGANIZATION', operatingProfile: 'MANAGED', name: randomUUID() }
  });
  const passwordHash = await hashPassword(password);
  const planner = await prisma.user.create({
    data: { clientId: client.id, role: 'ORGANIZATION_PLANNER', email: `${randomUUID()}@example.com`, passwordHash }
  });
  const provider = await prisma.user.create({
    data: { role: 'PLATFORM_ADMIN', email: `${randomUUID()}@example.com`, passwordHash }
  });
  const service = await prisma.service.upsert({
    where: { code: 'ACCESS_CONTROL' },
    create: { code: 'ACCESS_CONTROL' },
    update: {}
  });
  const event = await prisma.event.create({
    data: {
      clientId: client.id,
      createdByUserId: provider.id,
      assignedPlannerUserId: planner.id,
      serviceId: service.id,
      accessMode: 'NOMINAL',
      capacity: 150
    }
  });
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ email: planner.email, password })
    .expect(200);
  const raw = login.headers['set-cookie'];
  const cookie = (Array.isArray(raw) ? raw[0] : raw)?.split(';')[0];
  if (!cookie) throw new Error('Missing session cookie.');
  const contact = await request(app.getHttpServer())
    .post(`/api/v1/events/${event.id}/contacts`)
    .set('Origin', origin)
    .set('Cookie', cookie)
    .send({ name: 'Nominal interno' })
    .expect(201);
  const invitation = await prisma.invitation.findUniqueOrThrow({
    where: { contactId: contact.body.id as string },
    include: { assistants: true }
  });
  return { event, invitation, cookie };
}

// Operational fixtures activate through the real Provider flow (DT06).
export async function createOperationalNominalAccessFixture(
  app: INestApplication,
  origin: string,
  password: string,
  withSecondContact = false
) {
  const prisma = app.get(PrismaService);
  const staffTechnical = app.get(StaffTokenTechnicalService);
  const f = await createNominalAccessFixture(app, origin, password);
  let otherAssistantId: string | null = null;
  if (withSecondContact) {
    const contact = await request(app.getHttpServer())
      .post(`/api/v1/events/${f.event.id}/contacts`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .send({ name: 'Nominal interno' })
      .expect(201);
    otherAssistantId = (
      await prisma.assistant.findFirstOrThrow({ where: { invitation: { contactId: contact.body.id as string } } })
    ).id;
  }
  const issued = await request(app.getHttpServer())
    .post(`/api/v1/events/${f.event.id}/nominal-access-credentials/assistants/${f.invitation.assistants[0]!.id}/issue`)
    .set('Origin', origin)
    .set('Cookie', f.cookie)
    .set('Idempotency-Key', randomUUID())
    .send({})
    .expect(201);
  const credential = await prisma.assistantAccessCredential.findUniqueOrThrow({
    where: { id: issued.body.id as string }
  });
  if (otherAssistantId) {
    await request(app.getHttpServer())
      .post(`/api/v1/events/${f.event.id}/nominal-access-credentials/assistants/${otherAssistantId}/issue`)
      .set('Origin', origin)
      .set('Cookie', f.cookie)
      .set('Idempotency-Key', randomUUID())
      .send({})
      .expect(201);
  }
  const provider = await prisma.user.findUniqueOrThrow({ where: { id: f.event.createdByUserId } });
  const login = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .set('Origin', origin)
    .send({ email: provider.email, password })
    .expect(200);
  const raw = login.headers['set-cookie'];
  const providerCookie = (Array.isArray(raw) ? raw[0] : raw)!.split(';')[0]!;
  await request(app.getHttpServer())
    .patch(`/api/v1/admin/clients/${f.event.clientId}/events/${f.event.id}`)
    .set('Origin', origin)
    .set('Cookie', providerCookie)
    .send({
      name: 'Nominal operativo test',
      socialType: 'OTHER',
      eventDateTime: '2030-01-01T18:00:00Z',
      timeZone: 'America/Mexico_City'
    })
    .expect(200);
  await request(app.getHttpServer())
    .post(`/api/v1/admin/clients/${f.event.clientId}/events/${f.event.id}/activate`)
    .set('Origin', origin)
    .set('Cookie', providerCookie)
    .set('Idempotency-Key', randomUUID())
    .send({})
    .expect(200);
  const admin = await prisma.user.create({
    data: {
      role: 'ORGANIZATION_ADMIN',
      clientId: f.event.clientId,
      email: `${randomUUID()}@example.com`,
      passwordHash: await hashPassword(password)
    }
  });
  const generated = staffTechnical.generate();
  const staff = await prisma.staffToken.create({
    data: {
      eventId: f.event.id,
      alias: 'Nominal Staff',
      tokenDigestSha256: generated.digestSha256,
      createdByUserId: admin.id
    }
  });
  return {
    ...f,
    otherAssistantId,
    assistantId: credential.assistantId,
    credentialId: credential.id,
    staffToken: generated.rawToken,
    staffTokenId: staff.id,
    staffCreatorId: admin.id,
    qrToken: app.get(NominalAccessTokenService).issue(credential.id, credential.qrTokenNonce)
  };
}
