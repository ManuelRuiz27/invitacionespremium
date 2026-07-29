import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AppConfigService } from '../config/app-config.service';
import { PhysicalPassTokenService } from './physical-pass-token.service';

describe('PhysicalPassTokenService', () => {
  const service = new PhysicalPassTokenService({
    invitationTokenSigningSecret: 'physical-pass-unit-secret-at-least-32-bytes'
  } as AppConfigService);

  it('issues and verifies only pp1 purpose-separated tokens', () => {
    const id = randomUUID();
    const nonce = service.createNonce();
    const token = service.issue(id, nonce);
    expect(token).toMatch(/^pp1\.[0-9a-f-]{36}\.[0-9a-f]{64}\.[A-Za-z0-9_-]{43}$/u);
    expect(service.verify(token)).toEqual({ physicalPassId: id, nonce, version: 1 });
    expect(service.verify(token.replace(/^pp1/u, 'qr1'))).toBeNull();
    expect(service.verify(service.issue(id, nonce, 2))).toBeNull();
  });

  it('rejects tampering without exposing partial material', () => {
    const token = service.issue(randomUUID(), service.createNonce());
    const tampered = `${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`;
    expect(service.verify(tampered)).toBeNull();
    expect(service.verify('not-a-token')).toBeNull();
  });
});
