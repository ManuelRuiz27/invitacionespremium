import {
  createPublicCommercialLeadsApiClient,
  type CommercialLeadAccepted,
  type CommercialLeadInput
} from '@invitaciones/api-client';
import { getLandingConfig } from './config/landing-config';

export interface LandingCommercialLeadsClient {
  submit(input: CommercialLeadInput, signal?: AbortSignal): Promise<CommercialLeadAccepted>;
}

export function createLandingCommercialLeadsClient(): LandingCommercialLeadsClient | undefined {
  const { apiBaseUrl } = getLandingConfig().urls;
  if (!apiBaseUrl) return undefined;
  return createPublicCommercialLeadsApiClient({ baseUrl: apiBaseUrl });
}
