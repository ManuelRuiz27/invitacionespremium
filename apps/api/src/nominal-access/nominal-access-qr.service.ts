import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { assertSafeInvitationQrSvg, InvitationQrRenderer } from '../public-rsvp/invitation-qr.service';

export interface NominalAccessSvgContent {
  bytes: Buffer;
  etag: string;
}

@Injectable()
export class NominalAccessQrService {
  constructor(@Inject(InvitationQrRenderer) private readonly renderer: InvitationQrRenderer) {}

  async render(token: string): Promise<NominalAccessSvgContent> {
    const bytes = await this.renderer.render(token);
    assertSafeInvitationQrSvg(bytes.toString('utf8'), token);
    return { bytes, etag: `"sha256-${createHash('sha256').update(bytes).digest('hex')}"` };
  }
}
