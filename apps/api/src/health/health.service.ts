import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../common/database/prisma.service';
import type { HealthResponseDto } from './health.dto';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async getHealth(): Promise<HealthResponseDto> {
    const databaseStartedAt = performance.now();

    try {
      await this.prisma.ping();
    } catch {
      throw new ServiceUnavailableException({
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database health check failed.'
      });
    }

    return {
      status: 'ok',
      service: 'invitacionespremium-api',
      timestamp: new Date().toISOString(),
      checks: {
        api: {
          status: 'up'
        },
        database: {
          status: 'up',
          latencyMs: Math.round((performance.now() - databaseStartedAt) * 100) / 100
        }
      }
    };
  }
}
