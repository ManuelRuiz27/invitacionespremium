import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuditActorType, ClientStatus, ClientType, UserRole, type Client, type User } from '../generated/prisma/client';
import { AuditedMutationService, auditedResult } from '../audit/audited-mutation.service';
import type { AuthPrincipal } from '../auth/auth.types';
import { normalizeEmail } from '../auth/auth-token';
import { hashPassword } from '../auth/password-hasher';
import { PrismaService } from '../common/database/prisma.service';
import { ClientAccessPolicy, clientNotFound } from './client-access.policy';
import type {
  ClientCreatedResponseDto,
  ClientResponseDto,
  CreateOrganizationInput,
  RegisterPlannerInput,
  SuspendClientInput,
  UpdateClientInput
} from './clients.dto';

export type ClientRecord = Pick<
  Client,
  'id' | 'type' | 'name' | 'status' | 'suspendedAt' | 'suspensionReason' | 'createdAt' | 'updatedAt'
>;

export type ClientUserRecord = Pick<User, 'id' | 'email' | 'role' | 'clientId' | 'createdAt' | 'updatedAt'>;

@Injectable()
export class ClientsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditedMutationService) private readonly auditedMutation: AuditedMutationService,
    @Inject(ClientAccessPolicy) private readonly accessPolicy: ClientAccessPolicy
  ) {}

  async registerPlanner(input: RegisterPlannerInput, operationId?: string): Promise<ClientCreatedResponseDto> {
    const email = normalizeEmail(input.email);
    const passwordHash = await hashPassword(input.password);

    try {
      return await this.auditedMutation.execute({
        actor: { type: AuditActorType.SYSTEM },
        resourceType: 'CLIENT',
        action: 'CLIENT_REGISTER_PLANNER',
        ...(operationId === undefined ? {} : { operationId }),
        metadata: { clientType: ClientType.PLANNER },
        mutate: async (transaction) => {
          const client = await transaction.client.create({
            data: {
              type: ClientType.PLANNER,
              name: input.name
            }
          });
          const user = await transaction.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.INDEPENDENT_PLANNER,
              clientId: client.id
            }
          });

          return auditedResult(
            {
              client: toClientResponse(client),
              user: toClientUserResponse(user)
            },
            {
              clientId: client.id,
              clientType: client.type,
              userId: user.id,
              role: user.role
            }
          );
        }
      });
    } catch (error) {
      throw mapClientMutationError(error);
    }
  }

  async createOrganization(
    input: CreateOrganizationInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientCreatedResponseDto> {
    const email = normalizeEmail(input.adminEmail);
    const passwordHash = await hashPassword(input.adminPassword);

    try {
      return await this.auditedMutation.execute({
        actor: { type: AuditActorType.USER, id: principal.userId },
        resourceType: 'CLIENT',
        action: 'CLIENT_CREATE_ORGANIZATION',
        ...(operationId === undefined ? {} : { operationId }),
        metadata: { clientType: ClientType.ORGANIZATION },
        mutate: async (transaction) => {
          const client = await transaction.client.create({
            data: {
              type: ClientType.ORGANIZATION,
              name: input.name
            }
          });
          const user = await transaction.user.create({
            data: {
              email,
              passwordHash,
              role: UserRole.ORGANIZATION_ADMIN,
              clientId: client.id
            }
          });

          return auditedResult(
            {
              client: toClientResponse(client),
              user: toClientUserResponse(user)
            },
            {
              clientId: client.id,
              clientType: client.type,
              userId: user.id,
              role: user.role
            }
          );
        }
      });
    } catch (error) {
      throw mapClientMutationError(error);
    }
  }

  async listAdmin(): Promise<ClientResponseDto[]> {
    const clients = await this.prisma.client.findMany({
      where: { deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }]
    });

    return clients.map(toClientResponse);
  }

  async getAdmin(clientId: string): Promise<ClientResponseDto> {
    return toClientResponse(await this.findActiveClient(clientId));
  }

  async getOwned(clientId: string, principal: AuthPrincipal): Promise<ClientResponseDto> {
    this.accessPolicy.assertOwnedClient(principal, clientId);
    return toClientResponse(await this.findActiveClient(clientId));
  }

  async updateAdmin(
    clientId: string,
    input: UpdateClientInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientResponseDto> {
    return this.update(clientId, input, principal, operationId);
  }

  async updateOwned(
    clientId: string,
    input: UpdateClientInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientResponseDto> {
    this.accessPolicy.assertOwnedClient(principal, clientId);
    return this.update(clientId, input, principal, operationId);
  }

  async suspend(
    clientId: string,
    input: SuspendClientInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientResponseDto> {
    const current = await this.findActiveClient(clientId);

    if (current.status === ClientStatus.SUSPENDED) {
      throw new ConflictException({
        code: 'CLIENT_ALREADY_SUSPENDED',
        message: 'The Client is already suspended.'
      });
    }

    const suspendedAt = new Date();

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId,
      resourceType: 'CLIENT',
      resourceId: clientId,
      action: 'CLIENT_SUSPEND',
      beforeData: clientAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const client = await transaction.client.update({
          where: { id: clientId },
          data: {
            status: ClientStatus.SUSPENDED,
            suspendedAt,
            suspensionReason: input.reason ?? null
          }
        });

        return auditedResult(toClientResponse(client), clientAuditSnapshot(client));
      }
    });
  }

  async restore(clientId: string, principal: AuthPrincipal, operationId?: string): Promise<ClientResponseDto> {
    const current = await this.findActiveClient(clientId);

    if (current.status === ClientStatus.ACTIVE) {
      throw new ConflictException({
        code: 'CLIENT_ALREADY_ACTIVE',
        message: 'The Client is already active.'
      });
    }

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId,
      resourceType: 'CLIENT',
      resourceId: clientId,
      action: 'CLIENT_RESTORE',
      beforeData: clientAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const client = await transaction.client.update({
          where: { id: clientId },
          data: {
            status: ClientStatus.ACTIVE,
            suspendedAt: null,
            suspensionReason: null
          }
        });

        return auditedResult(toClientResponse(client), clientAuditSnapshot(client));
      }
    });
  }

  async requireOrganization(clientId: string): Promise<ClientRecord> {
    const client = await this.findActiveClient(clientId);

    if (client.type !== ClientType.ORGANIZATION) {
      throw clientNotFound();
    }

    return client;
  }

  private async update(
    clientId: string,
    input: UpdateClientInput,
    principal: AuthPrincipal,
    operationId?: string
  ): Promise<ClientResponseDto> {
    const current = await this.findActiveClient(clientId);

    return this.auditedMutation.execute({
      actor: { type: AuditActorType.USER, id: principal.userId },
      clientId,
      resourceType: 'CLIENT',
      resourceId: clientId,
      action: 'CLIENT_UPDATE',
      beforeData: clientAuditSnapshot(current),
      ...(operationId === undefined ? {} : { operationId }),
      mutate: async (transaction) => {
        const client = await transaction.client.update({
          where: { id: clientId },
          data: {
            ...(input.name === undefined ? {} : { name: input.name })
          }
        });

        return auditedResult(toClientResponse(client), clientAuditSnapshot(client));
      }
    });
  }

  private async findActiveClient(clientId: string): Promise<ClientRecord> {
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        deletedAt: null
      }
    });

    if (!client) {
      throw clientNotFound();
    }

    return client;
  }
}

export function toClientResponse(client: ClientRecord): ClientResponseDto {
  return {
    id: client.id,
    type: client.type,
    name: client.name,
    status: client.status,
    suspendedAt: client.suspendedAt?.toISOString() ?? null,
    suspensionReason: client.suspensionReason,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString()
  };
}

export function toClientUserResponse(user: ClientUserRecord): import('./clients.dto').ClientUserResponseDto {
  if (user.clientId === null) {
    throw new TypeError('Client user is missing clientId.');
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    clientId: user.clientId,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString()
  };
}

function clientAuditSnapshot(client: ClientRecord): Record<string, unknown> {
  return {
    id: client.id,
    type: client.type,
    name: client.name,
    status: client.status,
    suspendedAt: client.suspendedAt,
    suspensionReason: client.suspensionReason
  };
}

function mapClientMutationError(error: unknown): unknown {
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
