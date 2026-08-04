import {
  createPublicRegistrationClient,
  type RegisterPlannerInput,
  type RegisterPlannerResult
} from '@invitaciones/api-client';
import { getLandingConfig } from './config/landing-config';

export interface PlannerRegistrationClient {
  registerPlanner(input: RegisterPlannerInput, signal?: AbortSignal): Promise<RegisterPlannerResult>;
}

export function createLandingRegistrationClient(): PlannerRegistrationClient | undefined {
  const { apiBaseUrl } = getLandingConfig().urls;
  if (!apiBaseUrl) return undefined;
  return createPublicRegistrationClient({ baseUrl: apiBaseUrl });
}
