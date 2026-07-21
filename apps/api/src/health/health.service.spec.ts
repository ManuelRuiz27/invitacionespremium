import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../common/database/prisma.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  it('reports API and database as available', async () => {
    const prisma = {
      ping: vi.fn().mockResolvedValue(undefined)
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    const result = await service.getHealth();

    expect(result.status).toBe('ok');
    expect(result.checks.api.status).toBe('up');
    expect(result.checks.database.status).toBe('up');
    expect(result.checks.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns a safe service unavailable error when PostgreSQL fails', async () => {
    const prisma = {
      ping: vi.fn().mockRejectedValue(new Error('connection string omitted'))
    } as unknown as PrismaService;
    const service = new HealthService(prisma);

    await expect(service.getHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException
    );
  });
});
