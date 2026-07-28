import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export type InvitationTokenPurpose = 'INVITATION' | 'QR';

export interface VerifiedInvitationToken {
  invitationId: string;
  nonce: string;
  version: number;
}

@Injectable()
export class InvitationTokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  createNonce(): string {
    return randomBytes(32).toString('hex');
  }

  issue(purpose: InvitationTokenPurpose, invitationId: string, nonce: string, version = 1): string {
    const prefix = purpose === 'INVITATION' ? 'ip' : 'qr';
    const payload = `${prefix}${version}.${invitationId}.${nonce}`;
    return `${payload}.${this.sign(purpose, payload)}`;
  }

  verify(purpose: InvitationTokenPurpose, token: string): VerifiedInvitationToken | null {
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [prefixAndVersion, invitationId, nonce, signature] = parts;
    const prefixMatch = /^(ip|qr)([1-9][0-9]*)$/u.exec(prefixAndVersion ?? '');
    const expectedPrefix = purpose === 'INVITATION' ? 'ip' : 'qr';
    const version = Number(prefixMatch?.[2]);
    if (
      !prefixAndVersion ||
      !nonce ||
      !signature ||
      prefixMatch?.[1] !== expectedPrefix ||
      !Number.isSafeInteger(version) ||
      version > 2_147_483_647 ||
      !invitationId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(invitationId) ||
      !/^[0-9a-f]{64}$/u.test(nonce) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(signature)
    ) {
      return null;
    }
    const payload = `${prefixAndVersion}.${invitationId}.${nonce}`;
    const expected = this.sign(purpose, payload);
    const actualBuffer = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) {
      return null;
    }
    return { invitationId, nonce, version };
  }

  invitationLink(invitationId: string, nonce: string, version = 1): string {
    return `${this.config.publicInvitationBaseUrl}/${this.issue('INVITATION', invitationId, nonce, version)}`;
  }

  private sign(purpose: InvitationTokenPurpose, payload: string): string {
    return createHmac('sha256', this.config.invitationTokenSigningSecret)
      .update(`InvitacionesPremium:${purpose}:${payload}`)
      .digest('base64url');
  }
}
