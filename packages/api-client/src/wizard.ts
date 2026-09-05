import type { components, operations } from './generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from './api-client';

type S = components['schemas'];
export type AvailableService = S['AvailableServiceResponseDto'];
export type Contact = S['ContactResponseDto'];
export type ContactGroup = S['ContactGroupResponseDto'];
export type ContactInput = S['CreateContactRequestDto'];
export type ContactUpdate = S['UpdateContactRequestDto'];
export type GroupInput = S['GroupRequestDto'];
export type ImportPreview = S['ImportPreviewResponseDto'];
export type ImportCommit = S['CommitImportResponseDto'];
export type Invitation = S['InvitationResponseDto'];
export type InvitationUpdate = S['UpdateInvitationRequestDto'];
export type Assistant = S['AssistantResponseDto'];
export type AssistantInput = S['AssistantRequestDto'];
export type FileAsset = S['FileAssetResponseDto'];
export type FileAssetType = S['FileAssetType'];
export type FileAssetOwnerType = S['FileAssetOwnerType'];
export type InvitationDesign = S['InvitationDesignResponseDto'];
export type DesignReadiness = S['DesignReadinessResponseDto'];
export type FlyerInput = S['CreateFlyerRequestDto'];
export type FlipbookPageInput = S['AddFlipbookPageRequestDto'];
export type FlipbookReorderInput = S['ReorderFlipbookPagesRequestDto'];
export type ReplaceDesignAssetInput = S['ReplaceDesignAssetRequestDto'];
export type Hotspot = S['HotspotResponseDto'];
export type HotspotInput = S['CreateHotspotRequestDto'];
export type HotspotUpdate = S['UpdateHotspotRequestDto'];
export type Floorplan = Omit<S['FloorplanResponseDto'], 'seatingMode' | 'seats'> & {
  seatingMode?: S['FloorplanResponseDto']['seatingMode'];
  seats?: S['FloorplanResponseDto']['seats'];
};
export type FloorplanShape = S['FloorplanShapeResponseDto'];
export type FloorplanShapeInput = S['FloorplanShapeRequestDto'];
export type FloorplanShapeUpdate = S['UpdateFloorplanShapeRequestDto'];
export type FloorplanSeat = S['FloorplanSeatResponseDto'];
export type AssignSeatsInput = S['AssignSeatsRequestDto'];
export type SeatingWorkspacePage = S['SeatingWorkspacePageDto'];
export type SeatingWorkspaceItem = S['SeatingWorkspaceItemDto'];
export type SeatingWorkspaceQuery = operations['FloorplanController_seatingWorkspace']['parameters']['query'];
export type AssignSeatingInput = S['AssignSeatingRequestDto'];
export type AssignFamilyInput = S['AssignFamilyRequestDto'];
export type AssignGroupInput = S['AssignGroupRequestDto'];
export type UpdateSeatingInput = S['UpdateSeatingRequestDto'];
export type SeatingMutationResult = S['SeatingMutationResponseDto'];
export type PhysicalPass = S['PhysicalPassResponseDto'];
export type GeneratePhysicalPassesInput = S['GeneratePhysicalPassesRequestDto'];
export type GeneratePhysicalPassesResult = S['GeneratePhysicalPassesResponseDto'];

const id = encodeURIComponent;
const record = isRecord as (value: unknown) => value is never;
const records = isRecordArray as (value: unknown) => value is never;

export function createServicesClient(request: ApiRequester) {
  return {
    listAvailable: (signal?: AbortSignal) =>
      request<AvailableService[]>({ path: '/services', response: 'json', ...(signal ? { signal } : {}) }, records)
  };
}

export function createContactsClient(request: ApiRequester) {
  return {
    list: (eventId: string, search?: string, signal?: AbortSignal) =>
      request<Contact[]>(
        {
          path: `/events/${id(eventId)}/contacts${search ? `?search=${encodeURIComponent(search)}` : ''}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        records
      ),
    create: (eventId: string, body: ContactInput) =>
      request<Contact>({ method: 'POST', path: `/events/${id(eventId)}/contacts`, body, response: 'json' }, record),
    update: (eventId: string, contactId: string, body: ContactUpdate) =>
      request<Contact>(
        {
          method: 'PATCH',
          path: `/events/${id(eventId)}/contacts/${id(contactId)}`,
          body,
          response: 'json'
        },
        record
      ),
    remove: (eventId: string, contactId: string) =>
      request<void>({
        method: 'DELETE',
        path: `/events/${id(eventId)}/contacts/${id(contactId)}`,
        response: 'empty'
      }),
    groups: (eventId: string) =>
      request<ContactGroup[]>({ path: `/events/${id(eventId)}/groups`, response: 'json' }, records),
    createGroup: (eventId: string, body: GroupInput) =>
      request<ContactGroup>({ method: 'POST', path: `/events/${id(eventId)}/groups`, body, response: 'json' }, record),
    updateGroup: (eventId: string, groupId: string, body: GroupInput) =>
      request<ContactGroup>(
        {
          method: 'PATCH',
          path: `/events/${id(eventId)}/groups/${id(groupId)}`,
          body,
          response: 'json'
        },
        record
      ),
    template: (eventId: string, signal?: AbortSignal) =>
      request<Blob>({
        path: `/events/${id(eventId)}/contacts/import-template`,
        response: 'blob',
        ...(signal ? { signal } : {})
      }),
    preview: (eventId: string, file: Blob, signal?: AbortSignal) => {
      const body = new FormData();
      body.append('file', file);
      return request<ImportPreview>(
        {
          method: 'POST',
          path: `/events/${id(eventId)}/contacts/import/preview`,
          body,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      );
    },
    commit: (eventId: string, previewId: string, idempotencyKey: string) =>
      request<ImportCommit>(
        {
          method: 'POST',
          path: `/events/${id(eventId)}/contacts/import/commit`,
          body: { previewId },
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json'
        },
        record
      )
  };
}

export function createInvitationsClient(request: ApiRequester) {
  return {
    list: (eventId: string) =>
      request<Invitation[]>({ path: `/events/${id(eventId)}/invitations`, response: 'json' }, records),
    get: (eventId: string, invitationId: string) =>
      request<Invitation>({ path: `/events/${id(eventId)}/invitations/${id(invitationId)}`, response: 'json' }, record),
    update: (eventId: string, invitationId: string, body: InvitationUpdate) =>
      request<Invitation>(
        {
          method: 'PATCH',
          path: `/events/${id(eventId)}/invitations/${id(invitationId)}`,
          body,
          response: 'json'
        },
        record
      ),
    addAssistant: (eventId: string, invitationId: string, body: AssistantInput) =>
      request<Assistant>(
        {
          method: 'POST',
          path: `/events/${id(eventId)}/invitations/${id(invitationId)}/assistants`,
          body,
          response: 'json'
        },
        record
      ),
    updateAssistant: (eventId: string, invitationId: string, assistantId: string, body: AssistantInput) =>
      request<Assistant>(
        {
          method: 'PATCH',
          path: `/events/${id(eventId)}/invitations/${id(invitationId)}/assistants/${id(assistantId)}`,
          body,
          response: 'json'
        },
        record
      ),
    removeAssistant: (eventId: string, invitationId: string, assistantId: string) =>
      request<void>({
        method: 'DELETE',
        path: `/events/${id(eventId)}/invitations/${id(invitationId)}/assistants/${id(assistantId)}`,
        response: 'empty'
      })
  };
}

export function createFileAssetsClient(request: ApiRequester) {
  return {
    list: (eventId: string) =>
      request<FileAsset[]>({ path: `/events/${id(eventId)}/file-assets`, response: 'json' }, records),
    get: (eventId: string, assetId: string) =>
      request<FileAsset>({ path: `/events/${id(eventId)}/file-assets/${id(assetId)}`, response: 'json' }, record),
    upload: (eventId: string, file: Blob, fileType: FileAssetType, ownerType: FileAssetOwnerType) => {
      const body = new FormData();
      body.append('file', file);
      body.append('fileType', fileType);
      body.append('ownerType', ownerType);
      return request<FileAsset>(
        { method: 'POST', path: `/events/${id(eventId)}/file-assets`, body, response: 'json' },
        record
      );
    },
    remove: (eventId: string, assetId: string) =>
      request<void>({
        method: 'DELETE',
        path: `/events/${id(eventId)}/file-assets/${id(assetId)}`,
        response: 'empty'
      }),
    content: (eventId: string, assetId: string, signal?: AbortSignal) =>
      request<Blob>({
        path: `/events/${id(eventId)}/file-assets/${id(assetId)}/content`,
        response: 'blob',
        ...(signal ? { signal } : {})
      })
  };
}

export function createDesignClient(request: ApiRequester) {
  const base = (eventId: string) => `/events/${id(eventId)}`;
  return {
    get: (eventId: string) => request<InvitationDesign>({ path: `${base(eventId)}/design`, response: 'json' }, record),
    readiness: (eventId: string) =>
      request<DesignReadiness>({ path: `${base(eventId)}/design/readiness`, response: 'json' }, record),
    createFlyer: (eventId: string, body: FlyerInput) =>
      request<InvitationDesign>(
        { method: 'POST', path: `${base(eventId)}/design/flyer`, body, response: 'json' },
        record
      ),
    replaceFlyerInitial: (eventId: string, body: ReplaceDesignAssetInput) =>
      request<InvitationDesign>(
        { method: 'PATCH', path: `${base(eventId)}/design/flyer/initial-image`, body, response: 'json' },
        record
      ),
    replaceFlyerQr: (eventId: string, body: ReplaceDesignAssetInput) =>
      request<InvitationDesign>(
        { method: 'PATCH', path: `${base(eventId)}/design/flyer/qr-image`, body, response: 'json' },
        record
      ),
    createFlipbook: (eventId: string) =>
      request<InvitationDesign>(
        { method: 'POST', path: `${base(eventId)}/design/flipbook`, body: {}, response: 'json' },
        record
      ),
    addPage: (eventId: string, body: FlipbookPageInput) =>
      request<InvitationDesign>(
        { method: 'POST', path: `${base(eventId)}/design/flipbook/pages`, body, response: 'json' },
        record
      ),
    reorderPages: (eventId: string, body: FlipbookReorderInput) =>
      request<InvitationDesign>(
        { method: 'PATCH', path: `${base(eventId)}/design/flipbook/pages/reorder`, body, response: 'json' },
        record
      ),
    replacePage: (eventId: string, pageId: string, body: ReplaceDesignAssetInput) =>
      request<InvitationDesign>(
        {
          method: 'PATCH',
          path: `${base(eventId)}/design/flipbook/pages/${id(pageId)}/asset`,
          body,
          response: 'json'
        },
        record
      ),
    removePage: (eventId: string, pageId: string) =>
      request<InvitationDesign>(
        {
          method: 'DELETE',
          path: `${base(eventId)}/design/flipbook/pages/${id(pageId)}`,
          response: 'json'
        },
        record
      ),
    hotspots: (eventId: string) => request<Hotspot[]>({ path: `${base(eventId)}/hotspots`, response: 'json' }, records),
    createHotspot: (eventId: string, body: HotspotInput) =>
      request<Hotspot>({ method: 'POST', path: `${base(eventId)}/hotspots`, body, response: 'json' }, record),
    updateHotspot: (eventId: string, hotspotId: string, body: HotspotUpdate) =>
      request<Hotspot>(
        {
          method: 'PATCH',
          path: `${base(eventId)}/hotspots/${id(hotspotId)}`,
          body,
          response: 'json'
        },
        record
      ),
    removeHotspot: (eventId: string, hotspotId: string) =>
      request<void>({
        method: 'DELETE',
        path: `${base(eventId)}/hotspots/${id(hotspotId)}`,
        response: 'empty'
      })
  };
}

export function createFloorplanClient(request: ApiRequester) {
  const base = (eventId: string) => `/events/${id(eventId)}/floorplan`;
  const eventBase = (eventId: string) => `/events/${id(eventId)}`;
  return {
    get: (eventId: string, signal?: AbortSignal) =>
      request<Floorplan>({ path: base(eventId), response: 'json', ...(signal ? { signal } : {}) }, record),
    seating: (eventId: string, query: SeatingWorkspaceQuery, signal?: AbortSignal) => {
      const parameters = new URLSearchParams({ scope: query.scope });
      if (query.tableShapeId) parameters.set('tableShapeId', query.tableShapeId);
      if (query.groupId) parameters.set('groupId', query.groupId);
      if (query.search) parameters.set('search', query.search);
      if (query.cursor) parameters.set('cursor', query.cursor);
      if (query.limit !== undefined) parameters.set('limit', String(query.limit));
      return request<SeatingWorkspacePage>(
        {
          path: `${eventBase(eventId)}/seating?${parameters.toString()}`,
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      );
    },
    assign: (eventId: string, body: AssignSeatingInput, idempotencyKey: string, signal?: AbortSignal) =>
      request<SeatingMutationResult>(
        {
          method: 'POST',
          path: `${eventBase(eventId)}/seating/assign`,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      ),
    assignSeats: (eventId: string, body: AssignSeatsInput, idempotencyKey: string, signal?: AbortSignal) =>
      request<SeatingMutationResult>({ method: 'POST', path: `${eventBase(eventId)}/seating/assign-seats`, body, headers: { 'Idempotency-Key': idempotencyKey }, response: 'json', ...(signal ? { signal } : {}) }, record),
    assignFamily: (eventId: string, body: AssignFamilyInput, idempotencyKey: string, signal?: AbortSignal) =>
      request<SeatingMutationResult>(
        {
          method: 'POST',
          path: `${eventBase(eventId)}/seating/assign-family`,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      ),
    assignGroup: (eventId: string, body: AssignGroupInput, idempotencyKey: string, signal?: AbortSignal) =>
      request<SeatingMutationResult>(
        {
          method: 'POST',
          path: `${eventBase(eventId)}/seating/assign-group`,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      ),
    updateSeating: (
      eventId: string,
      assistantId: string,
      body: UpdateSeatingInput,
      idempotencyKey: string,
      signal?: AbortSignal
    ) =>
      request<SeatingMutationResult>(
        {
          method: 'PATCH',
          path: `${eventBase(eventId)}/seating/${id(assistantId)}`,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        record
      ),
    setImage: (eventId: string, imageAssetId: string) =>
      request<Floorplan>({ method: 'POST', path: base(eventId), body: { imageAssetId }, response: 'json' }, record),
    replaceImage: (eventId: string, imageAssetId: string) =>
      request<Floorplan>({ method: 'PATCH', path: base(eventId), body: { imageAssetId }, response: 'json' }, record),
    addShape: (eventId: string, body: FloorplanShapeInput) =>
      request<FloorplanShape>({ method: 'POST', path: `${base(eventId)}/shapes`, body, response: 'json' }, record),
    updateShape: (eventId: string, shapeId: string, body: FloorplanShapeUpdate) =>
      request<FloorplanShape>(
        { method: 'PATCH', path: `${base(eventId)}/shapes/${id(shapeId)}`, body, response: 'json' },
        record
      ),
    removeShape: (eventId: string, shapeId: string) =>
      request<void>({ method: 'DELETE', path: `${base(eventId)}/shapes/${id(shapeId)}`, response: 'empty' }),
    lock: (eventId: string) =>
      request<Floorplan>({ method: 'POST', path: `${base(eventId)}/lock`, response: 'json' }, record),
    unlock: (eventId: string) =>
      request<Floorplan>({ method: 'POST', path: `${base(eventId)}/unlock`, response: 'json' }, record)
  };
}

export function createPhysicalPassesClient(request: ApiRequester) {
  const base = (eventId: string) => `/events/${id(eventId)}/physical-passes`;
  return {
    list: (eventId: string) => request<PhysicalPass[]>({ path: base(eventId), response: 'json' }, records),
    generate: (eventId: string, body: GeneratePhysicalPassesInput, idempotencyKey: string) =>
      request<GeneratePhysicalPassesResult>(
        {
          method: 'POST',
          path: `${base(eventId)}/generate`,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
          response: 'json'
        },
        record
      ),
    svg: (eventId: string, passId: string) =>
      request<string>({ path: `${base(eventId)}/${id(passId)}/svg`, response: 'text' })
  };
}
