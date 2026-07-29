import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface VerifiedPhysicalPassToken {
  physicalPassId: string;
  nonce: string;
  version: number;
}

@Injectable()
export class PhysicalPassTokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  createNonce(): string {
    return randomBytes(32).toString('hex');
  }

  issue(physicalPassId: string, nonce: string, version = 1): string {
    const payload = `pp${version}.${physicalPassId}.${nonce}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string): VerifiedPhysicalPassToken | null {
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [prefixAndVersion, physicalPassId, nonce, signature] = parts;
    const match = /^pp([1-9][0-9]*)$/u.exec(prefixAndVersion ?? '');
    const version = Number(match?.[1]);
    if (
      !match ||
      version !== 1 ||
      !physicalPassId ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(physicalPassId) ||
      !nonce ||
      !/^[0-9a-f]{64}$/u.test(nonce) ||
      !signature ||
      !/^[A-Za-z0-9_-]{43}$/u.test(signature)
    ) {
      return null;
    }
    const expected = this.sign(`${prefixAndVersion}.${physicalPassId}.${nonce}`);
    const actualBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    return { physicalPassId, nonce, version };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.invitationTokenSigningSecret)
      .update(`InvitacionesPremium:PHYSICAL_PASS:${payload}`)
      .digest('base64url');
  }
}
