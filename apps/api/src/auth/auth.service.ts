import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuditActorType } from '../generated/prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import { PrismaService } from '../common/database/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { createSessionToken, fingerprintLoginIdentifier, hashSessionToken, normalizeEmail } from './auth-token';
import type { AuthPrincipal } from './auth.types';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password-hasher';

export interface LoginResult {
  token: string;
  principal: AuthPrincipal;
  expiresAt: Date;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService
  ) {}

  async login(emailInput: string, password: string, operationId?: string): Promise<LoginResult> {
    const email = normalizeEmail(emailInput);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        role: true,
        clientId: true,
        deletedAt: true
      }
    });
    const passwordMatches = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);

    if (!user || user.deletedAt !== null || !passwordMatches) {
      await this.audit.record({
        actor: { type: AuditActorType.SYSTEM },
        resourceType: 'AUTH',
        action: 'AUTH_LOGIN_FAILED',
        metadata: {
          identifierFingerprint: fingerprintLoginIdentifier(email),
          outcome: 'failure'
        },
        ...(operationId === undefined ? {} : { operationId })
      });

      throw invalidCredentials();
    }

    const token = createSessionToken();
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + this.config.authSessionTtlSeconds * 1000);
    const principalBase = {
      userId: user.id,
      email: user.email,
      role: user.role,
      clientId: user.clientId
    };

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: user.id },
      resourceType: 'AUTH_SESSION',
      action: 'AUTH_LOGIN',
      ...(user.clientId === null ? {} : { clientId: user.clientId }),
      ...(operationId === undefined ? {} : { operationId }),
      metadata: { outcome: 'success' },
      mutate: async (transaction) => {
        const session = await transaction.authSession.create({
          data: {
            userId: user.id,
            tokenHash,
            expiresAt
          },
          select: { id: true }
        });
        const principal: AuthPrincipal = {
          ...principalBase,
          sessionId: session.id
        };

        return auditedResult(
          {
            token,
            principal,
            expiresAt
          },
          {
            sessionId: session.id,
            expiresAt: expiresAt.toISOString()
          }
        );
      }
    });
  }

  async authenticateSessionToken(token: string): Promise<AuthPrincipal | null> {
    const tokenHash = hashSessionToken(token);
    const session = await this.prisma.authSession.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { deletedAt: null }
      },
      select: {
        id: true,
        user: {
          select: {
            id: true,
            email: true,
            role: true,
            clientId: true
          }
        }
      }
    });

    if (!session) {
      return null;
    }

    return {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
      clientId: session.user.clientId
    };
  }

  async logout(principal: AuthPrincipal, operationId?: string): Promise<void> {
    const revokedAt = new Date();

    await this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      resourceType: 'AUTH_SESSION',
      resourceId: principal.sessionId,
      action: 'AUTH_LOGOUT',
      ...(principal.clientId === null ? {} : { clientId: principal.clientId }),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        await transaction.authSession.updateMany({
          where: {
            id: principal.sessionId,
            userId: principal.userId,
            revokedAt: null
          },
          data: { revokedAt }
        });

        return auditedResult(undefined, {
          sessionId: principal.sessionId,
          revokedAt: revokedAt.toISOString()
        });
      }
    });
  }
}

function invalidCredentials(): UnauthorizedException {
  return new UnauthorizedException({
    code: 'INVALID_CREDENTIALS',
    message: 'Invalid email or password.'
  });
}
