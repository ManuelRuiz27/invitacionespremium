import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuditActorType, UserRole } from '../generated/prisma/client';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { normalizeEmail } from '../auth/auth-token';
import { hashPassword } from '../auth/password-hasher';
import { PrismaService } from '../common/database/prisma.service';
import { ClientAccessPolicy, clientNotFound } from '../clients/client-access.policy';
import type { ClientUserResponseDto, CreatePlannerUserInput, UpdateClientUserInput } from '../clients/clients.dto';
import { ClientsService, toClientUserResponse } from '../clients/clients.service';

@Injectable()
export class ClientUsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(ClientsService) private readonly clients: ClientsService,
    @Inject(ClientAccessPolicy) private readonly accessPolicy: ClientAccessPolicy
  ) {}

  async listOwned(clientId: string, principal: AuthPrincipal): Promise<ClientUserResponseDto[]> {
    this.accessPolicy.assertOrganizationClient(principal, clientId);
    return this.listOrganizationUsers(clientId);
  }

  async listAdmin(clientId: string): Promise<ClientUserResponseDto[]> {
    return this.listOrganizationUsers(clientId);
  }

  async createOwned(
    clientId: string,
    input: CreatePlannerUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    this.accessPolicy.assertOrganizationClient(principal, clientId);
    return this.createPlanner(clientId, input, principal, operationId);
  }

  async createAdmin(
    clientId: string,
    input: CreatePlannerUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    return this.createPlanner(clientId, input, principal, operationId);
  }

  async updateOwned(
    clientId: string,
    userId: string,
    input: UpdateClientUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    this.accessPolicy.assertOrganizationClient(principal, clientId);
    return this.updateUser(clientId, userId, input, principal, operationId);
  }

  async updateAdmin(
    clientId: string,
    userId: string,
    input: UpdateClientUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    return this.updateUser(clientId, userId, input, principal, operationId);
  }

  private async listOrganizationUsers(clientId: string): Promise<ClientUserResponseDto[]> {
    await this.clients.requireOrganization(clientId);
    const users = await this.prisma.user.findMany({
      where: {
        clientId,
        deletedAt: null,
        role: { in: [UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER] }
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
    });

    return users.map(toClientUserResponse);
  }

  private async createPlanner(
    clientId: string,
    input: CreatePlannerUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    await this.clients.requireOrganization(clientId);
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.auditedMutation.execute({
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId,
        resourceType: 'USER',
        action: 'CLIENT_USER_CREATE_PLANNER',
        ...(operationId === undefined ? {} : { operationId }),
        mutate: async (transaction) => {
          const user = await transaction.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.ORGANIZATION_PLANNER,
              clientId
            }
          });

          return auditedResult(toClientUserResponse(user), {
            userId: user.id,
            role: user.role,
            clientId
          });
        }
      });
    } catch (error) {
      throw mapUserMutationError(error);
    }
  }

  private async updateUser(
    clientId: string,
    userId: string,
    input: UpdateClientUserInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientUserResponseDto> {
    await this.clients.requireOrganization(clientId);
    const current = await this.prisma.user.findFirst({
      where: {
        id: userId,
        clientId,
        deletedAt: null,
        role: { in: [UserRole.ORGANIZATION_ADMIN, UserRole.ORGANIZATION_PLANNER] }
      }
    });

    if (!current) {
      throw clientNotFound();
    }

    const email = input.email === undefined ? undefined : normalizeEmail(input.email);
    const passwordHash = input.password === undefined ? undefined : await hashPassword(input.password);

    try {
      return await this.auditedMutation.execute({
        actor: { type: AuditActorType.USER, id: principal.userId },
        clientId,
        resourceType: 'USER',
        resourceId: userId,
        action: 'CLIENT_USER_UPDATE',
        beforeData: {
          userId: current.id,
          email: current.email,
          role: current.role,
          clientId: current.clientId
        },
        ...(operationId === undefined ? {} : { operationId }),
        mutate: async (transaction) => {
          const user = await transaction.user.update({
            where: { id: userId },
            data: {
              ...(email === undefined ? {} : { email }),
              ...(passwordHash === undefined ? {} : { passwordHash })
            }
          });

          if (passwordHash !== undefined) {
            await transaction.authSession.updateMany({
              where: {
                userId,
                revokedAt: null
              },
              data: { revokedAt: new Date() }
            });
          }

          return auditedResult(toClientUserResponse(user), {
            userId: user.id,
            email: user.email,
            role: user.role,
            clientId: user.clientId,
            sessionsRevoked: passwordHash !== undefined
          });
        }
      });
    } catch (error) {
      throw mapUserMutationError(error);
    }
  }
}

function mapUserMutationError(error: unknown): unknown {
  if (hasPrismaCode(error, 'P2002')) {
    return new ConflictException({
      code: 'EMAIL_ALREADY_EXISTS',
      message: 'A user with that email already exists.'
    });
  }

  return error;
}

function hasPrismaCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
