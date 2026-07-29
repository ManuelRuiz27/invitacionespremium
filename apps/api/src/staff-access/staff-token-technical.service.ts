import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { PrismaService } from '../common/database/prisma.service';
import type { Prisma, StaffToken } from '../generated/prisma/client';

export const STAFF_TOKEN_VERSION = 1;
export const STAFF_TOKEN_PATTERN = /^st1\.[A-Za-z0-9_-]{43}$/u;

export interface GeneratedStaffToken {
  rawToken: string;
  digestSha256: string;
  version: number;
}

@Injectable()
export class StaffTokenTechnicalService {
  generate(): GeneratedStaffToken {
    const rawToken = `st${STAFF_TOKEN_VERSION}.${randomBytes(32).toString('base64url')}`;
    return {
      rawToken,
      digestSha256: this.digest(rawToken),
      version: STAFF_TOKEN_VERSION
    };
  }

  isValidSyntax(rawToken: string): boolean {
    return STAFF_TOKEN_PATTERN.test(rawToken);
  }

  digest(rawToken: string): string {
    return createHash('sha256').update(rawToken, 'utf8').digest('hex');
  }

  lookupByDigest(database: PrismaService | Prisma.TransactionClient, digestSha256: string): Promise<StaffToken | null> {
    return database.staffToken.findUnique({ where: { tokenDigestSha256: digestSha256 } });
  }
}
