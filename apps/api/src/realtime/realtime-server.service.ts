import { Inject, Injectable, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { type Namespace, Server, type Socket } from 'socket.io';
import { AppConfigService } from '../config/app-config.service';
import {
  REALTIME_NAMESPACE,
  REALTIME_PATH,
  realtimeEnvelopeSchema,
  realtimeRoomName,
  type RealtimeEnvelope,
  type RealtimeRoomType
} from './realtime-contract';
import { RealtimeAuthService, type RealtimeSocketMetadata } from './realtime-auth.service';
import { RealtimeConnectionError, socketConnectionError } from './realtime-errors';

type RealtimeSocket = Socket<
  Record<string, never>,
  Record<string, unknown>,
  Record<string, never>,
  RealtimeSocketMetadata
>;

@Injectable()
export class RealtimeServerService implements OnApplicationBootstrap, OnApplicationShutdown {
  private io: Server | undefined;
  private namespace: Namespace | undefined;

  constructor(
    @Inject(HttpAdapterHost) private readonly adapterHost: HttpAdapterHost,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RealtimeAuthService) private readonly auth: RealtimeAuthService
  ) {}

  onApplicationBootstrap(): void {
    const httpServer = this.adapterHost.httpAdapter?.getHttpServer();
    if (!httpServer) {
      return;
    }
    this.io = new Server(httpServer, {
      path: REALTIME_PATH,
      cors: {
        origin: this.config.corsOrigins,
        credentials: true
      }
    });
    this.namespace = this.io.of(REALTIME_NAMESPACE);
    this.namespace.use(async (socket, next) => {
      try {
        const authorization = await this.auth.authorize({
          auth: socket.handshake.auth,
          cookieHeader: socket.handshake.headers.cookie,
          query: socket.handshake.query
        });
        socket.data = authorization.metadata;
        await socket.join(authorization.room);
        next();
      } catch (error) {
        const code = error instanceof RealtimeConnectionError ? error.code : 'SOCKET_UNAUTHORIZED';
        next(socketConnectionError(code));
      }
    });
    this.namespace.on('connection', (socket: RealtimeSocket) => {
      socket.onAny(() => {
        socket.disconnect(true);
      });
    });
  }

  emit(envelope: RealtimeEnvelope, roomTypes: RealtimeRoomType[]): void {
    const validated = realtimeEnvelopeSchema.parse(envelope);
    for (const roomType of roomTypes) {
      this.namespace?.to(realtimeRoomName(validated.eventId, roomType)).emit(validated.eventName, validated);
    }
  }

  disconnectStaff(eventId: string): void {
    for (const socket of this.namespace?.sockets.values() ?? []) {
      const metadata = socket.data as RealtimeSocketMetadata;
      if (metadata.actorMode === 'STAFF_TOKEN' && metadata.eventId === eventId) {
        socket.disconnect(true);
      }
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const io = this.io;
    this.namespace = undefined;
    this.io = undefined;
    if (!io) return;
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  }
}
