import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ClientOperatingProfile } from '../generated/prisma/client';
import { parseCreateOrganizationRequest, parseRegisterPlannerRequest } from './clients.dto';

const organization = {
  name: 'Salón de prueba',
  adminEmail: 'admin@example.com',
  adminPassword: 'correct horse battery staple'
};

describe('Organization creation request', () => {
  it.each(Object.values(ClientOperatingProfile))('accepts the existing %s profile', (operatingProfile) => {
    expect(parseCreateOrganizationRequest({ ...organization, operatingProfile })).toEqual({
      ...organization,
      operatingProfile
    });
  });

  it('preserves requests that omit the profile', () => {
    expect(parseCreateOrganizationRequest(organization)).toEqual(organization);
  });

  it.each([null, 'VENUE', '', 1])('rejects invalid profile %s', (operatingProfile) => {
    expect(() => parseCreateOrganizationRequest({ ...organization, operatingProfile })).toThrow(BadRequestException);
  });

  it('keeps profile selection out of public Planner registration', () => {
    expect(() =>
      parseRegisterPlannerRequest({
        name: organization.name,
        email: organization.adminEmail,
        password: organization.adminPassword,
        operatingProfile: ClientOperatingProfile.MANAGED
      })
    ).toThrow(BadRequestException);
  });
});
