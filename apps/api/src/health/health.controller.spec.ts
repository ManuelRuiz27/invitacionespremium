import { describe, expect, it } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns the service health payload', () => {
    const controller = new HealthController();

    expect(controller.getHealth()).toEqual({
      status: 'ok',
      service: 'invitacionespremium-api'
    });
  });
});
