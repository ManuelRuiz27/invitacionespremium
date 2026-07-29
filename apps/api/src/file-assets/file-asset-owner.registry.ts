import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { FileAssetOwnerType } from '../generated/prisma/client';

export interface FileAssetOwnerReference {
  ownerType: FileAssetOwnerType;
  ownerId: string;
}

export interface ResolvedFileAssetOwner {
  clientId: string;
  eventId: string;
}

export interface FileAssetOwnerResolver {
  readonly ownerType: FileAssetOwnerType;
  resolve(transaction: Prisma.TransactionClient, ownerId: string): Promise<ResolvedFileAssetOwner | null>;
}

@Injectable()
export class InvitationFileAssetOwnerResolver implements FileAssetOwnerResolver {
  readonly ownerType = FileAssetOwnerType.INVITATION;

  async resolve(transaction: Prisma.TransactionClient, ownerId: string): Promise<ResolvedFileAssetOwner | null> {
    const invitation = await transaction.invitation.findFirst({
      where: {
        id: ownerId,
        deletedAt: null,
        event: { deletedAt: null }
      },
      select: {
        eventId: true,
        event: { select: { clientId: true } }
      }
    });
    return invitation ? { clientId: invitation.event.clientId, eventId: invitation.eventId } : null;
  }
}

@Injectable()
export class FlyerFileAssetOwnerResolver implements FileAssetOwnerResolver {
  readonly ownerType = FileAssetOwnerType.FLYER;

  async resolve(transaction: Prisma.TransactionClient, ownerId: string): Promise<ResolvedFileAssetOwner | null> {
    const design = await transaction.invitationDesign.findFirst({
      where: {
        id: ownerId,
        type: 'FLYER',
        deletedAt: null,
        event: { deletedAt: null }
      },
      select: {
        eventId: true,
        event: { select: { clientId: true } }
      }
    });
    return design ? { clientId: design.event.clientId, eventId: design.eventId } : null;
  }
}

@Injectable()
export class FlipbookPageFileAssetOwnerResolver implements FileAssetOwnerResolver {
  readonly ownerType = FileAssetOwnerType.FLIPBOOK_PAGE;

  async resolve(transaction: Prisma.TransactionClient, ownerId: string): Promise<ResolvedFileAssetOwner | null> {
    const page = await transaction.flipbookPage.findFirst({
      where: {
        id: ownerId,
        deletedAt: null,
        design: {
          type: 'FLIPBOOK',
          deletedAt: null,
          event: { deletedAt: null }
        }
      },
      select: {
        eventId: true,
        design: { select: { event: { select: { clientId: true } } } }
      }
    });
    return page ? { clientId: page.design.event.clientId, eventId: page.eventId } : null;
  }
}

@Injectable()
export class FloorplanFileAssetOwnerResolver implements FileAssetOwnerResolver {
  readonly ownerType = FileAssetOwnerType.FLOORPLAN;

  async resolve(transaction: Prisma.TransactionClient, ownerId: string): Promise<ResolvedFileAssetOwner | null> {
    const floorplan = await transaction.floorplan.findFirst({
      where: { id: ownerId, deletedAt: null, event: { deletedAt: null } },
      select: { eventId: true, event: { select: { clientId: true } } }
    });
    return floorplan ? { clientId: floorplan.event.clientId, eventId: floorplan.eventId } : null;
  }
}

@Injectable()
export class FileAssetOwnerRegistry {
  private readonly resolvers = new Map<FileAssetOwnerType, FileAssetOwnerResolver>();

  constructor(
    @Inject(InvitationFileAssetOwnerResolver)
    invitationResolver: InvitationFileAssetOwnerResolver,
    @Inject(FlyerFileAssetOwnerResolver)
    flyerResolver: FlyerFileAssetOwnerResolver,
    @Inject(FlipbookPageFileAssetOwnerResolver)
    flipbookPageResolver: FlipbookPageFileAssetOwnerResolver,
    @Inject(FloorplanFileAssetOwnerResolver)
    floorplanResolver: FloorplanFileAssetOwnerResolver
  ) {
    this.register(invitationResolver);
    this.register(flyerResolver);
    this.register(flipbookPageResolver);
    this.register(floorplanResolver);
  }

  register(resolver: FileAssetOwnerResolver): void {
    if (this.resolvers.has(resolver.ownerType)) {
      throw new TypeError(`FileAsset owner resolver already registered for ${resolver.ownerType}.`);
    }
    this.resolvers.set(resolver.ownerType, resolver);
  }

  async resolve(
    transaction: Prisma.TransactionClient,
    reference: FileAssetOwnerReference
  ): Promise<ResolvedFileAssetOwner> {
    const resolver = this.resolvers.get(reference.ownerType);
    const owner = resolver ? await resolver.resolve(transaction, reference.ownerId) : null;
    if (!owner) {
      throw ownerMismatch();
    }
    return owner;
  }
}

export function ownerMismatch(): ConflictException {
  return new ConflictException({
    code: 'FILE_OWNER_MISMATCH',
    message: 'File asset does not match the resolved owner.'
  });
}
