import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { InvitationTokenService } from '../invitations/invitation-token.service';
import { PhysicalPassTokenService } from '../physical-passes/physical-pass-token.service';
import { NominalAccessTokenService } from './nominal-access-token.service';

const config = { invitationTokenSigningSecret: 'nominal-unit-secret-with-at-least-32-bytes' } as AppConfigService;
describe('NominalAccessTokenService', () => {
  const service = new NominalAccessTokenService(config);
  it('uses independent cryptographic nonces and domain-separated signatures across instances', () => {
    const id = randomUUID(),
      nonce = service.createNonce();
    const token = service.issue(id, nonce);
    expect(nonce).toMatch(/^[0-9a-f]{64}$/u);
    expect(service.createNonce()).not.toBe(nonce);
    expect(service.verify(token)).toEqual({ credentialId: id, nonce, version: 1 });
    expect(new NominalAccessTokenService(config).verify(token)).toEqual(service.verify(token));
    expect(
      new NominalAccessTokenService({
        invitationTokenSigningSecret: 'different-secret-at-least-32-bytes'
      } as AppConfigService).verify(token)
    ).toBeNull();
    const invitation = new InvitationTokenService(config),
      physical = new PhysicalPassTokenService(config);
    for (const foreign of [
      invitation.issue('INVITATION', id, nonce),
      invitation.issue('QR', id, nonce),
      physical.issue(id, nonce)
    ]) {
      expect(service.verify(foreign)).toBeNull();
      expect(service.verify(foreign.replace(/^[^.]+/u, 'na1'))).toBeNull();
    }
    expect(invitation.verify('QR', token)).toBeNull();
    expect(physical.verify(token)).toBeNull();
  });
  it('strictly rejects malformed, tampered and unsupported material', () => {
    const token = service.issue(randomUUID(), service.createNonce());
    for (const invalid of [
      '',
      'a'.repeat(10000),
      `${token}.extra`,
      token.toUpperCase(),
      token.replace('na1', 'na01'),
      token.replace('na1', 'na2'),
      token.replace(/.$/u, token.endsWith('A') ? 'B' : 'A'),
      token.replace(/\.[0-9a-f]{64}\./u, `.${'0'.repeat(64)}.`)
    ])
      expect(service.verify(invalid)).toBeNull();
    expect(() => service.issue(randomUUID(), service.createNonce(), 2)).toThrow('Invalid nominal credential material.');
    expect(() => service.issue('not-a-uuid', service.createNonce())).toThrow();
  });
  it('binds verification to the persisted credential and irreversible revocation', () => {
    const material = { id: randomUUID(), qrTokenNonce: service.createNonce(), qrTokenVersion: 1, revokedAt: null };
    const token = service.issue(material.id, material.qrTokenNonce);
    expect(service.matches(token, material)).toBe(true);
    for (const changed of [
      { ...material, id: randomUUID() },
      { ...material, qrTokenNonce: service.createNonce() },
      { ...material, qrTokenVersion: 2 },
      { ...material, revokedAt: new Date() }
    ])
      expect(service.matches(token, changed)).toBe(false);
  });
});
