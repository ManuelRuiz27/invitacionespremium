import { createPublicPricingApiClient } from '@invitaciones/api-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiBaseUrl: undefined as string | undefined, client: { list: vi.fn() } }));

vi.mock('./config/landing-config', () => ({
  getLandingConfig: () => ({ urls: { apiBaseUrl: mocks.apiBaseUrl } })
}));
vi.mock('@invitaciones/api-client', () => ({
  createPublicPricingApiClient: vi.fn(() => mocks.client)
}));

import { createLandingPricingClient } from './pricing-client';

describe('createLandingPricingClient', () => {
  beforeEach(() => {
    mocks.apiBaseUrl = undefined;
    vi.clearAllMocks();
  });

  it('creates the generated public pricing client from the configured API base URL', () => {
    mocks.apiBaseUrl = 'https://api.example/api/v1';
    expect(createLandingPricingClient()).toBe(mocks.client);
    expect(createPublicPricingApiClient).toHaveBeenCalledWith({ baseUrl: 'https://api.example/api/v1' });
  });

  it('is unavailable when the API base URL is absent', () => {
    expect(createLandingPricingClient()).toBeUndefined();
    expect(createPublicPricingApiClient).not.toHaveBeenCalled();
  });
});
