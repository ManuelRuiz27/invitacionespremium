import { describe, expect, it, vi } from 'vitest';
import { HealthController } from './health.controller';
import type { HealthResponseDto } from './health.dto';
import type { HealthService } from './health.service';

const response: HealthResponseDto = {
  status: 'ok',
  service: 'invitacionespremium-api',
  timestamp: '2026-07-21T19:00:00.000Z',
  checks: {
    api: { status: 'up' },
    database: { status: 'up', latencyMs: 1.25 }
  }
};

describe('HealthController', () => {
  it('returns the service health payload', async () => {
    const healthService = {
      getHealth: vi.fn().mockResolvedValue(response)
    } as unknown as HealthService;
    const controller = new HealthController(healthService);

    await expect(controller.getHealth()).resolves.toEqual(response);
  });
});
