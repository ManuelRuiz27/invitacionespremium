import { createPublicPricingApiClient, type PublicPricing } from '@invitaciones/api-client';
import { getLandingConfig } from './config/landing-config';

export interface LandingPricingClient {
  list(signal?: AbortSignal): Promise<PublicPricing[]>;
}

export function createLandingPricingClient(): LandingPricingClient | undefined {
  const { apiBaseUrl } = getLandingConfig().urls;
  if (!apiBaseUrl) return undefined;
  return createPublicPricingApiClient({ baseUrl: apiBaseUrl });
}
