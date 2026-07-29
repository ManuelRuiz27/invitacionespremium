import { Inject, Injectable } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { readCookie } from '../auth/auth-cookie';
import { PrismaService } from '../common/database/prisma.service';
import { AppConfigService } from '../config/app-config.service';
import { eventOwnedWhere } from '../events/event-access.policy';
import { UserRole } from '../generated/prisma/client';
import { StaffTokenResolverService, type RealtimeStaffResolution } from '../staff-access/staff-access.service';
import { z } from 'zod';
import { REALTIME_PROTOCOL_VERSION, realtimeRoomName, type RealtimeRoomType } from './realtime-contract';
import { RealtimeConnectionError, type RealtimeErrorCode } from './realtime-errors';

const userHandshakeSchema = z
  .object({
    protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
    actorMode: z.literal('USER'),
    roomType: z.enum(['dashboard', 'floorplan']),
    eventId: z.string().uuid(),
    administrative: z.boolean()
  })
  .strict();

const staffHandshakeSchema = z
  .object({
    protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
    actorMode: z.literal('STAFF_TOKEN'),
    roomType: z.enum(['scanner', 'floorplan']),
    staffToken: z.string().min(1).max(512)
  })
  .strict();

export interface RealtimeSocketMetadata {
  actorMode: 'USER' | 'STAFF_TOKEN';
  eventId: string;
  roomType: RealtimeRoomType;
}

export interface RealtimeAuthorization {
  metadata: RealtimeSocketMetadata;
  room: string;
}

export interface RealtimeHandshake {
  auth: unknown;
  cookieHeader: string | undefined;
  query: Record<string, unknown>;
}

@Injectable()
export class RealtimeAuthService {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StaffTokenResolverService) private readonly staffTokens: StaffTokenResolverService
  ) {}

  async authorize(handshake: RealtimeHandshake): Promise<RealtimeAuthorization> {
    const auth = record(handshake.auth);
    if (auth?.protocolVersion !== REALTIME_PROTOCOL_VERSION) {
      throw new RealtimeConnectionError('SOCKET_PAYLOAD_VERSION_UNSUPPORTED');
    }
    if (hasCredentialInQuery(handshake.query)) {
      throw new RealtimeConnectionError('SOCKET_UNAUTHORIZED');
    }
    if (auth.actorMode === 'USER') {
      return this.authorizeUser(auth, handshake.cookieHeader);
    }
    if (auth.actorMode === 'STAFF_TOKEN') {
      if ('eventId' in auth) {
        throw new RealtimeConnectionError('SOCKET_EVENT_FORBIDDEN');
      }
      return this.authorizeStaff(auth);
    }
    throw new RealtimeConnectionError('SOCKET_UNAUTHORIZED');
  }

  private async authorizeUser(auth: Record<string, unknown>, cookieHeader: string | undefined) {
    const parsed = userHandshakeSchema.safeParse(auth);
    if (!parsed.success) {
      throw new RealtimeConnectionError(roomError(auth));
    }
    const sessionToken = readCookie(cookieHeader, this.config.authCookieName);
    if (!sessionToken) {
      throw new RealtimeConnectionError('SOCKET_UNAUTHORIZED');
    }
    const principal = await this.auth.authenticateSessionToken(sessionToken);
    if (!principal) {
      throw new RealtimeConnectionError('SOCKET_UNAUTHORIZED');
    }
    const { administrative, eventId, roomType } = parsed.data;
    if (principal.role === UserRole.PLATFORM_ADMIN) {
      if (!administrative || roomType !== 'dashboard' || principal.clientId !== null) {
        throw new RealtimeConnectionError('SOCKET_ROOM_FORBIDDEN');
      }
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, deletedAt: null },
        select: { id: true }
      });
      if (!event) {
        throw new RealtimeConnectionError('SOCKET_EVENT_FORBIDDEN');
      }
    } else {
      if (administrative) {
        throw new RealtimeConnectionError('SOCKET_ROOM_FORBIDDEN');
      }
      const event = await this.prisma.event.findFirst({
        where: { id: eventId, deletedAt: null, ...eventOwnedWhere(principal) },
        select: { id: true, floorplanEnabled: true }
      });
      if (!event) {
        throw new RealtimeConnectionError('SOCKET_EVENT_FORBIDDEN');
      }
      if (roomType === 'floorplan' && !event.floorplanEnabled) {
        throw new RealtimeConnectionError('SOCKET_ROOM_FORBIDDEN');
      }
    }
    return authorization('USER', eventId, roomType);
  }

  private async authorizeStaff(auth: Record<string, unknown>) {
    const parsed = staffHandshakeSchema.safeParse(auth);
    if (!parsed.success) {
      throw new RealtimeConnectionError(roomError(auth));
    }
    const resolution = await this.staffTokens.resolveRealtimeStaffToken(parsed.data.staffToken);
    assertStaffAvailable(resolution);
    if (parsed.data.roomType === 'floorplan' && !resolution.event.floorplanEnabled) {
      throw new RealtimeConnectionError('SOCKET_ROOM_FORBIDDEN');
    }
    return authorization('STAFF_TOKEN', resolution.event.id, parsed.data.roomType);
  }
}

function authorization(
  actorMode: RealtimeSocketMetadata['actorMode'],
  eventId: string,
  roomType: RealtimeRoomType
): RealtimeAuthorization {
  return {
    metadata: { actorMode, eventId, roomType },
    room: realtimeRoomName(eventId, roomType)
  };
}

function assertStaffAvailable(
  resolution: RealtimeStaffResolution
): asserts resolution is Extract<RealtimeStaffResolution, { kind: 'AVAILABLE' }> {
  const codeByKind: Partial<Record<RealtimeStaffResolution['kind'], RealtimeErrorCode>> = {
    INVALID: 'SOCKET_UNAUTHORIZED',
    EXPIRED: 'SOCKET_STAFF_TOKEN_EXPIRED',
    CLOSED: 'SOCKET_EVENT_CLOSED',
    CANCELLED: 'SOCKET_EVENT_CANCELLED',
    EVENT_NOT_OPERATIONAL: 'SOCKET_EVENT_NOT_OPERATIONAL'
  };
  if (resolution.kind !== 'AVAILABLE') {
    throw new RealtimeConnectionError(codeByKind[resolution.kind] ?? 'SOCKET_UNAUTHORIZED');
  }
}

function roomError(auth: Record<string, unknown>): RealtimeErrorCode {
  return typeof auth.roomType === 'string' ? 'SOCKET_ROOM_FORBIDDEN' : 'SOCKET_UNAUTHORIZED';
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasCredentialInQuery(query: Record<string, unknown>): boolean {
  return ['token', 'staffToken', 'sessionToken', 'eventId'].some((key) => key in query);
}
