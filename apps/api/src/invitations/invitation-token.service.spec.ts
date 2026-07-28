import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { InvitationTokenService } from './invitation-token.service';

const service = new InvitationTokenService({
  invitationTokenSigningSecret: 'test-invitation-signing-secret-at-least-32-bytes',
  publicInvitationBaseUrl: 'https://example.com/invitacion'
} as AppConfigService);

describe('InvitationTokenService', () => {
  it('issues recoverable purpose-separated tokens without PII', () => {
    const invitationId = '0fbc468d-51cb-442b-8591-a4d80cf6efbb';
    const invitationNonce = service.createNonce();
    const qrNonce = service.createNonce();
    const invitation = service.issue('INVITATION', invitationId, invitationNonce);
    const qr = service.issue('QR', invitationId, qrNonce);

    expect(invitation).not.toBe(qr);
    expect(service.verify('INVITATION', invitation)).toEqual({
      invitationId,
      nonce: invitationNonce,
      version: 1
    });
    expect(service.verify('QR', qr)).toEqual({ invitationId, nonce: qrNonce, version: 1 });
    expect(service.verify('QR', invitation)).toBeNull();
    expect(service.verify('INVITATION', qr)).toBeNull();
    expect(invitation).not.toContain('name');
    expect(service.invitationLink(invitationId, invitationNonce)).toContain(invitation);

    const rotated = service.issue('QR', invitationId, qrNonce, 2);
    expect(service.verify('QR', rotated)).toEqual({ invitationId, nonce: qrNonce, version: 2 });
  });

  it('verifies production tokens only across instances sharing the same secret', () => {
    const sharedSecret = 'production-shared-invitation-secret-at-least-32-bytes';
    const first = tokenService(sharedSecret);
    const second = tokenService(sharedSecret);
    const unrelated = tokenService('different-production-invitation-secret-at-least-32-bytes');
    const invitationId = '0fbc468d-51cb-442b-8591-a4d80cf6efbb';
    const nonce = first.createNonce();
    const token = first.issue('INVITATION', invitationId, nonce);

    expect(second.verify('INVITATION', token)).toEqual({ invitationId, nonce, version: 1 });
    expect(unrelated.verify('INVITATION', token)).toBeNull();
  });

  it('rejects a correctly signed token whose resource id is not a UUID', () => {
    const token = service.issue('QR', 'not-a-uuid', service.createNonce());
    expect(service.verify('QR', token)).toBeNull();
  });
});

function tokenService(secret: string): InvitationTokenService {
  return new InvitationTokenService({
    invitationTokenSigningSecret: secret,
    publicInvitationBaseUrl: 'https://invitaciones.example.com/invitacion'
  } as AppConfigService);
}
