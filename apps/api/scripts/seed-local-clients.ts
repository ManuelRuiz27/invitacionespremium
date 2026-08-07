import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { auditedResult, AuditedMutationService } from '../src/audit/audited-mutation.service';
import { normalizeEmail } from '../src/auth/auth-token';
import type { AuthPrincipal } from '../src/auth/auth.types';
import { hashPassword } from '../src/auth/password-hasher';
import { AppConfigService } from '../src/config/app-config.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';
import { FinanceService } from '../src/finance/finance.service';
import { AuditActorType, ClientStatus, ClientType, UserRole } from '../src/generated/prisma/client';

const LOCAL_CREDITS = 100;

export const LOCAL_CLIENT_FIXTURES = [
  {
    clientId: '13000000-0000-4000-8000-000000000001',
    clientName: '[LOCAL] Planner independiente',
    clientType: ClientType.PLANNER,
    creditIdempotencyKey: 'local-seed-planner-credit-grant-v1',
    users: [{ email: 'planner@example.com', role: UserRole.INDEPENDENT_PLANNER }]
  },
  {
    clientId: '13000000-0000-4000-8000-000000000002',
    clientName: '[LOCAL] Organización',
    clientType: ClientType.ORGANIZATION,
    creditIdempotencyKey: 'local-seed-organization-credit-grant-v1',
    users: [
      { email: 'organizacion.admin@example.com', role: UserRole.ORGANIZATION_ADMIN },
      { email: 'organizacion.planner@example.com', role: UserRole.ORGANIZATION_PLANNER }
    ]
  }
] as const;

export function assertLocalSeedEnvironment(nodeEnvironment: string | undefined): void {
  if (nodeEnvironment === 'production') throw new Error('The local Client seed is disabled in production.');
}

export async function seedLocalClients(): Promise<void> {
  loadEnvironmentFiles();
  assertLocalSeedEnvironment(process.env.NODE_ENV);
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });

  try {
    const config = app.get(AppConfigService);
    const auditedMutation = app.get(AuditedMutationService);
    const finance = app.get(FinanceService);
    if (!config.localAdminEmail || !config.localAdminPassword) {
      throw new Error('LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD are required for clients:seed-local.');
    }

    const adminEmail = normalizeEmail(config.localAdminEmail);
    const passwordHash = await hashPassword(config.localAdminPassword);
    const operationId = randomUUID();
    const seeded = await auditedMutation.execute({
      actor: { type: AuditActorType.SYSTEM },
      resourceType: 'CLIENT',
      action: 'CLIENT_LOCAL_FIXTURES_SEEDED',
      operationId,
      metadata: { source: 'local_seed', creditsPerClient: LOCAL_CREDITS },
      mutate: async (transaction) => {
        const admin = await transaction.user.findUnique({ where: { email: adminEmail } });
        if (!admin || admin.role !== UserRole.PLATFORM_ADMIN || admin.clientId !== null || admin.deletedAt !== null) {
          throw new Error('Run auth:seed-local-admin before clients:seed-local.');
        }

        const users: Array<{ id: string; email: string; role: UserRole; clientId: string }> = [];
        for (const fixture of LOCAL_CLIENT_FIXTURES) {
          await transaction.client.upsert({
            where: { id: fixture.clientId },
            create: { id: fixture.clientId, type: fixture.clientType, name: fixture.clientName },
            update: {
              type: fixture.clientType,
              name: fixture.clientName,
              status: ClientStatus.ACTIVE,
              suspendedAt: null,
              suspensionReason: null,
              deletedAt: null
            }
          });
          for (const fixtureUser of fixture.users) {
            const email = normalizeEmail(fixtureUser.email);
            const user = await transaction.user.upsert({
              where: { email },
              create: { email, passwordHash, role: fixtureUser.role, clientId: fixture.clientId },
              update: { passwordHash, role: fixtureUser.role, clientId: fixture.clientId, deletedAt: null }
            });
            await transaction.authSession.updateMany({
              where: { userId: user.id, revokedAt: null },
              data: { revokedAt: new Date() }
            });
            users.push({ id: user.id, email: user.email, role: user.role, clientId: fixture.clientId });
          }
        }
        return auditedResult(
          { admin, users },
          {
            clientIds: LOCAL_CLIENT_FIXTURES.map((fixture) => fixture.clientId),
            userIds: users.map((user) => user.id)
          }
        );
      }
    });

    const principal: AuthPrincipal = {
      userId: seeded.admin.id,
      sessionId: 'local-seed',
      email: seeded.admin.email,
      role: UserRole.PLATFORM_ADMIN,
      clientId: null,
      clientType: null,
      clientStatus: null
    };
    const balances = [];
    for (const fixture of LOCAL_CLIENT_FIXTURES) {
      const result = await finance.assignCredits(
        fixture.clientId,
        {
          credits: LOCAL_CREDITS,
          reason: 'Créditos iniciales para probar el flujo local',
          operationReference: fixture.creditIdempotencyKey
        },
        fixture.creditIdempotencyKey,
        principal,
        randomUUID()
      );
      balances.push({ clientId: fixture.clientId, purchasedCredits: result.balance.purchasedCredits });
    }

    process.stdout.write(
      `${JSON.stringify({
        event: 'local_clients_seeded',
        operationId,
        creditsGrantedPerClient: LOCAL_CREDITS,
        users: seeded.users.map(({ email, role, clientId }) => ({ email, role, clientId })),
        balances
      })}\n`
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void seedLocalClients().catch((error: unknown) => {
    process.stderr.write(
      `${JSON.stringify({
        event: 'local_clients_seed_failed',
        errorName: error instanceof Error ? error.name : 'UnknownError'
      })}\n`
    );
    process.exitCode = 1;
  });
}
