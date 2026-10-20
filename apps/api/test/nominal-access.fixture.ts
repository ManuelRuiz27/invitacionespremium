import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { hashPassword } from '../src/auth/password-hasher';
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
