import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';

export interface VerifiedAlbumToken {
  albumId: string;
  invitationId: string;
  nonce: string;
  version: number;
}

@Injectable()
export class AlbumTokenService {
  constructor(@Inject(AppConfigService) private readonly config: AppConfigService) {}

  createNonce(): string {
    return randomBytes(32).toString('hex');
  }

  issue(albumId: string, invitationId: string, nonce: string, version = 1): string {
    const payload = `al${version}.${albumId}.${invitationId}.${nonce}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string): VerifiedAlbumToken | null {
    const parts = token.split('.');
    if (parts.length !== 5) return null;
    const [prefixAndVersion, albumId, invitationId, nonce, signature] = parts;
    const match = /^al([1-9][0-9]*)$/u.exec(prefixAndVersion ?? '');
    const version = Number(match?.[1]);
    if (
      !match ||
      version !== 1 ||
      !isUuid(albumId) ||
      !isUuid(invitationId) ||
      !nonce ||
      !/^[0-9a-f]{64}$/u.test(nonce) ||
      !signature ||
      !/^[A-Za-z0-9_-]{43}$/u.test(signature)
    ) {
      return null;
    }
    const expected = this.sign(`${prefixAndVersion}.${albumId}.${invitationId}.${nonce}`);
    const actualBytes = Buffer.from(signature, 'utf8');
    const expectedBytes = Buffer.from(expected, 'utf8');
    if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return null;
    return { albumId, invitationId, nonce, version };
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.config.invitationTokenSigningSecret)
      .update(`InvitacionesPremium:ALBUM:${payload}`)
      .digest('base64url');
  }
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value));
}
