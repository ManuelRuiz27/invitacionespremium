import { createHash } from 'node:crypto';
import { HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import QRCode from 'qrcode';
import { PrismaService } from '../common/database/prisma.service';
import { CRITICAL_TRANSACTION_OPTIONS } from '../common/database/transaction-policy';
import { DomainError } from '../common/errors/domain-error';
import { AssistantResponseStatus, EventStatus, InvitationResponseStatus, Prisma } from '../generated/prisma/client';
import { InvitationTokenService, type VerifiedInvitationToken } from '../invitations/invitation-token.service';

export const INVITATION_QR_SVG_OPTIONS = {
  errorCorrectionLevel: 'M',
  margin: 4,
  width: 512,
  darkColor: '#111827',
  lightColor: '#FFFFFF'
} as const;

const OPERATIONAL_STATUSES = new Set<EventStatus>([EventStatus.ACTIVE, EventStatus.EVENT_DAY]);
const qrInclude = {
  contact: true,
  assistants: {
    where: { deletedAt: null },
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }]
  },
  event: true
} satisfies Prisma.InvitationInclude;

type QrInvitation = Prisma.InvitationGetPayload<{ include: typeof qrInclude }>;

export interface InvitationQrContent {
  bytes: Buffer;
  etag: string;
}

export interface ResolvedInvitationQr {
  eventId: string;
  invitationId: string;
}

@Injectable()
export class InvitationQrRenderer {
  async render(qrToken: string): Promise<Buffer> {
    const svg = await QRCode.toString(qrToken, {
      type: 'svg',
      errorCorrectionLevel: INVITATION_QR_SVG_OPTIONS.errorCorrectionLevel,
      margin: INVITATION_QR_SVG_OPTIONS.margin,
      width: INVITATION_QR_SVG_OPTIONS.width,
      color: {
        dark: INVITATION_QR_SVG_OPTIONS.darkColor,
        light: INVITATION_QR_SVG_OPTIONS.lightColor
      }
    });
    assertSafeInvitationQrSvg(svg, qrToken);
    return Buffer.from(svg, 'utf8');
  }
}

@Injectable()
export class InvitationQrService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(InvitationTokenService) private readonly tokens: InvitationTokenService,
    @Inject(InvitationQrRenderer) private readonly renderer: InvitationQrRenderer
  ) {}

  async getSvg(invitationToken: string): Promise<InvitationQrContent> {
    const verified = this.verifyInvitationToken(invitationToken);
    return this.serializable(async (tx) => {
      await this.lockInvitationContext(tx, verified.invitationId);
      const invitation = await this.resolveInvitation(tx, verified, 'INVITATION');
      this.assertQrAvailable(invitation);
      const qrToken = this.tokens.issue('QR', invitation.id, invitation.qrTokenNonce, invitation.qrTokenVersion);
      let bytes: Buffer;
      try {
        bytes = await this.renderer.render(qrToken);
      } catch {
        throw new DomainError(
          'QR_GENERATION_FAILURE',
          'The invitation QR could not be generated.',
          HttpStatus.INTERNAL_SERVER_ERROR
        );
      }
      const hash = createHash('sha256').update(bytes).digest('hex');
      return { bytes, etag: `"sha256-${hash}"` };
    });
  }

  async resolveQrToken(qrToken: string): Promise<ResolvedInvitationQr | null> {
    const verified = this.tokens.verify('QR', qrToken);
    if (!verified) return null;
    return this.serializable(async (tx) => {
      const context = await tx.invitation.findUnique({
        where: { id: verified.invitationId },
        select: { eventId: true }
      });
      if (!context) return null;
      await this.lockRows(tx, context.eventId, verified.invitationId);
      const invitation = await this.findInvitation(tx, verified, 'QR');
      if (!invitation || !isInvitationQrAvailable(invitation)) return null;
      return { eventId: invitation.eventId, invitationId: invitation.id };
    });
  }

  private verifyInvitationToken(invitationToken: string): VerifiedInvitationToken {
    const verified = this.tokens.verify('INVITATION', invitationToken);
    if (!verified) throw invitationNotFound();
    return verified;
  }

  private async resolveInvitation(
    tx: Prisma.TransactionClient,
    verified: VerifiedInvitationToken,
    purpose: 'INVITATION' | 'QR'
  ): Promise<QrInvitation> {
    const invitation = await this.findInvitation(tx, verified, purpose);
    if (!invitation || invitation.event.status === EventStatus.ARCHIVED) throw invitationNotFound();
    return invitation;
  }

  private findInvitation(
    database: Prisma.TransactionClient,
    verified: VerifiedInvitationToken,
    purpose: 'INVITATION' | 'QR'
  ): Promise<QrInvitation | null> {
    return database.invitation.findFirst({
      where: {
        id: verified.invitationId,
        ...(purpose === 'INVITATION'
          ? {
              invitationTokenNonce: verified.nonce,
              invitationTokenVersion: verified.version
            }
          : {
              qrTokenNonce: verified.nonce,
              qrTokenVersion: verified.version
            }),
        deletedAt: null,
        contact: { deletedAt: null },
        event: { deletedAt: null }
      },
      include: qrInclude
    });
  }

  private assertQrAvailable(invitation: QrInvitation): void {
    if (!isInvitationQrAvailable(invitation)) {
      throw new DomainError('QR_NOT_AVAILABLE', 'The invitation QR is not available.', HttpStatus.CONFLICT);
    }
  }

  private async lockInvitationContext(tx: Prisma.TransactionClient, invitationId: string): Promise<void> {
    const context = await tx.invitation.findUnique({ where: { id: invitationId }, select: { eventId: true } });
    if (!context) throw invitationNotFound();
    await this.lockRows(tx, context.eventId, invitationId);
  }

  private async lockRows(tx: Prisma.TransactionClient, eventId: string, invitationId: string): Promise<void> {
    await tx.$queryRaw`SELECT "id" FROM "event" WHERE "id" = ${eventId}::uuid FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "invitation" WHERE "id" = ${invitationId}::uuid FOR UPDATE`;
  }

  private async serializable<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        return await this.prisma.$transaction(work, CRITICAL_TRANSACTION_OPTIONS);
      } catch (error) {
        if (isRetryable(error) && attempt < 19) continue;
        throw error;
      }
    }
    throw new DomainError(
      'QR_CONCURRENCY_CONFLICT',
      'The invitation QR operation could not be serialized.',
      HttpStatus.CONFLICT
    );
  }
}

export function isInvitationQrAvailable(invitation: QrInvitation): boolean {
  if (
    !OPERATIONAL_STATUSES.has(invitation.event.status) ||
    invitation.event.deletedAt ||
    invitation.event.status === EventStatus.CANCELLED ||
    invitation.deletedAt ||
    invitation.cancelledAt ||
    invitation.contact.deletedAt ||
    invitation.responseStatus !== InvitationResponseStatus.CONFIRMED
  ) {
    return false;
  }
  const primaryCount = invitation.assistants.filter(({ isPrimary }) => isPrimary).length;
  return (
    invitation.assistants.length > 0 &&
    primaryCount === 1 &&
    invitation.assistants.every(
      ({ deletedAt, responseStatus }) => deletedAt === null && responseStatus === AssistantResponseStatus.CONFIRMED
    )
  );
}

export function assertSafeInvitationQrSvg(svg: string, qrToken: string): void {
  if (
    svg.includes(qrToken) ||
    /<\?(?:xml)?|<!DOCTYPE|<script|<foreignObject|<image|<text|<metadata|<style/iu.test(svg) ||
    /\s(?:href|xlink:href|src|on[a-z]+)\s*=/iu.test(svg) ||
    /url\s*\(/iu.test(svg)
  ) {
    throw new Error('Unsafe QR SVG output.');
  }
  const tags = svg.match(/<[^>]+>/gu) ?? [];
  if (
    tags.length !== 4 ||
    !/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="512" height="512" viewBox="0 0 [1-9][0-9]* [1-9][0-9]*" shape-rendering="crispEdges">$/u.test(
      tags[0] ?? ''
    ) ||
    !/^<path fill="#FFFFFF" d="[A-Za-z0-9 .-]+"\/>$/u.test(tags[1] ?? '') ||
    !/^<path stroke="#111827" d="[A-Za-z0-9 .-]+"\/>$/u.test(tags[2] ?? '') ||
    tags[3] !== '</svg>'
  ) {
    throw new Error('Unexpected QR SVG structure.');
  }
}

function invitationNotFound(): NotFoundException {
  return new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'Invitation not found.' });
}

function isRetryable(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  if (code === 'P2034') return true;
  if (code !== 'P2010' || !('meta' in error)) return false;
  const meta = (error as { meta?: { code?: unknown; driverAdapterError?: unknown } }).meta;
  return (
    meta?.code === '40001' ||
    meta?.code === '40P01' ||
    String(meta?.driverAdapterError).includes('TransactionWriteConflict')
  );
}
