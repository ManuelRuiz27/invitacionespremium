import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface VerifiedNominalAccessToken {
  credentialId: string;
  nonce: string;
  version: number;
}

@Injectable()
export class NominalAccessTokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  createNonce(): string {
    return randomBytes(32).toString('hex');
  }

  issue(credentialId: string, nonce: string, version = 1): string {
    if (!validMaterial(credentialId, nonce, version)) throw new Error('Invalid nominal credential material.');
    const payload = `na${version}.${credentialId}.${nonce}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string): VerifiedNominalAccessToken | null {
    if (token.length !== 149) return null;
    const parts = token.split('.');
    if (parts.length !== 4) return null;
    const [prefix, credentialId, nonce, signature] = parts;
    if (
      prefix !== 'na1' ||
      !credentialId ||
      !nonce ||
      !signature ||
      !validMaterial(credentialId, nonce, 1) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(signature)
    )
      return null;
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(this.sign(`${prefix}.${credentialId}.${nonce}`))))
      return null;
    return { credentialId, nonce, version: 1 };
  }

  matches(
    token: string,
    credential: { id: string; qrTokenNonce: string; qrTokenVersion: number; revokedAt: Date | null }
  ): boolean {
    const verified = this.verify(token);
    return (
      verified !== null &&
      validMaterial(credential.id, credential.qrTokenNonce, credential.qrTokenVersion) &&
      credential.revokedAt === null &&
      verified.credentialId === credential.id &&
      verified.version === credential.qrTokenVersion &&
      credential.qrTokenNonce.length === verified.nonce.length &&
      timingSafeEqual(Buffer.from(verified.nonce), Buffer.from(credential.qrTokenNonce))
    );
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.invitationTokenSigningSecret)
      .update(`InvitacionesPremium:NOMINAL_ACCESS:${payload}`)
      .digest('base64url');
  }
}

function validMaterial(id: string, nonce: string, version: number): boolean {
  return (
    version === 1 &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(id) &&
    /^[0-9a-f]{64}$/u.test(nonce)
  );
}
