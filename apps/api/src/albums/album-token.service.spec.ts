import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { InvitationTokenService } from '../invitations/invitation-token.service';
import { AlbumTokenService } from './album-token.service';

const config = {
  invitationTokenSigningSecret: 'test-album-signing-secret-at-least-32-bytes',
  publicInvitationBaseUrl: 'https://example.com/invitacion'
} as AppConfigService;

describe('AlbumTokenService', () => {
  it('issues and verifies a purpose-separated token without storing PII', () => {
    const service = new AlbumTokenService(config);
    const albumId = '0fbc468d-51cb-442b-8591-a4d80cf6efbb';
    const invitationId = '1fbc468d-51cb-442b-8591-a4d80cf6efbc';
    const nonce = service.createNonce();
    const token = service.issue(albumId, invitationId, nonce);

    expect(service.verify(token)).toEqual({ albumId, invitationId, nonce, version: 1 });
    expect(token.startsWith('al1.')).toBe(true);
    expect(token).not.toContain('name');
    expect(new InvitationTokenService(config).verify('INVITATION', token)).toBeNull();
  });

  it('rejects altered signatures and unsupported versions', () => {
    const service = new AlbumTokenService(config);
    const token = service.issue(
      '0fbc468d-51cb-442b-8591-a4d80cf6efbb',
      '1fbc468d-51cb-442b-8591-a4d80cf6efbc',
      service.createNonce()
    );
    const alteredLastCharacter = token.endsWith('A') ? 'B' : 'A';
    expect(service.verify(`${token.slice(0, -1)}${alteredLastCharacter}`)).toBeNull();
    expect(service.verify(token.replace(/^al1/u, 'al2'))).toBeNull();
  });
});
