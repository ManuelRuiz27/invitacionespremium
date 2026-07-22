import { randomUUID } from 'node:crypto';
import { NestFactory } from '@nestjs/core';
import { AuditActorType, UserRole } from '../src/generated/prisma/client';
import { AppModule } from '../src/app.module';
import { auditedResult, AuditedMutationService } from '../src/audit/audited-mutation.service';
import { normalizeEmail } from '../src/auth/auth-token';
import { hashPassword } from '../src/auth/password-hasher';
import { AppConfigService } from '../src/config/app-config.service';
import { loadEnvironmentFiles } from '../src/config/load-environment';

async function seedLocalAdmin(): Promise<void> {
  loadEnvironmentFiles();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log']
  });

  try {
    const config = app.get(AppConfigService);
    const auditedMutation = app.get(AuditedMutationService);

    if (!config.localAdminEmail || !config.localAdminPassword) {
      throw new Error('LOCAL_ADMIN_EMAIL and LOCAL_ADMIN_PASSWORD are required for auth:seed-local-admin.');
    }

    const email = normalizeEmail(config.localAdminEmail);
    const passwordHash = await hashPassword(config.localAdminPassword);
    const operationId = randomUUID();

    const userId = await auditedMutation.execute({
      actor: { type: AuditActorType.SYSTEM },
      resourceType: 'USER',
      action: 'AUTH_LOCAL_ADMIN_SEEDED',
      operationId,
      metadata: { source: 'local_seed' },
      mutate: async (transaction) => {
        const user = await transaction.user.upsert({
          where: { email },
          create: {
            email,
            passwordHash,
            role: UserRole.PLATFORM_ADMIN,
            clientId: null
          },
          update: {
            passwordHash,
            role: UserRole.PLATFORM_ADMIN,
            clientId: null,
            deletedAt: null
          },
          select: { id: true }
        });

        await transaction.authSession.updateMany({
          where: {
            userId: user.id,
            revokedAt: null
          },
          data: { revokedAt: new Date() }
        });

        return auditedResult(user.id, {
          userId: user.id,
          role: UserRole.PLATFORM_ADMIN,
          sessionsRevoked: true
        });
      }
    });

    process.stdout.write(`${JSON.stringify({ event: 'local_admin_seeded', userId, operationId })}\n`);
  } finally {
    await app.close();
  }
}

void seedLocalAdmin().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify({
      event: 'local_admin_seed_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError'
    })}\n`
  );
  process.exitCode = 1;
});
