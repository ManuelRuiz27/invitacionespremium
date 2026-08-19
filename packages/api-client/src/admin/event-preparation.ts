import type { components } from '../generated/schema';
import { isRecord, isRecordArray, type ApiRequester } from '../api-client';

type S = components['schemas'];
export type AdminEventUpdateInput = S['UpdateEventRequestDto'];
export type AdminPreparationEvent = S['EventResponseDto'];
export type AdminInvitationDesign = S['InvitationDesignResponseDto'];
export type AdminDesignReadiness = S['DesignReadinessResponseDto'];
export type AdminFlyerInput = S['CreateFlyerRequestDto'];
export type AdminFlipbookPageInput = S['AddFlipbookPageRequestDto'];
export type AdminFlipbookReorderInput = S['ReorderFlipbookPagesRequestDto'];
export type AdminReplaceDesignAssetInput = S['ReplaceDesignAssetRequestDto'];
export type AdminHotspot = S['HotspotResponseDto'];
export type AdminHotspotInput = S['CreateHotspotRequestDto'];
export type AdminHotspotUpdate = S['UpdateHotspotRequestDto'];
export type AdminInvitationFileAsset = S['FileAssetResponseDto'];
export type AdminInvitationFileAssetType = S['AdministrativeInvitationFileAssetUploadRequestDto']['fileType'];
export type AdminFloorplan = S['FloorplanResponseDto'];

const id = encodeURIComponent;
const record = isRecord as (value: unknown) => value is never;
const records = isRecordArray as (value: unknown) => value is never;
const withSignal = (signal?: AbortSignal) => (signal ? { signal } : {});

export function createAdminEventPreparationClient(request: ApiRequester) {
  const base = (clientId: string, eventId: string) => `/admin/clients/${id(clientId)}/events/${id(eventId)}`;
  return {
    updateEvent: (clientId: string, eventId: string, body: AdminEventUpdateInput, signal?: AbortSignal) =>
      request<AdminPreparationEvent>(
        { method: 'PATCH', path: base(clientId, eventId), body, response: 'json', ...withSignal(signal) },
        record
      ),
    getDesign: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        { path: `${base(clientId, eventId)}/design`, response: 'json', ...withSignal(signal) },
        record
      ),
    getReadiness: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminDesignReadiness>(
        { path: `${base(clientId, eventId)}/design/readiness`, response: 'json', ...withSignal(signal) },
        record
      ),
    createFlyer: (clientId: string, eventId: string, body: AdminFlyerInput, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        {
          method: 'POST',
          path: `${base(clientId, eventId)}/design/flyer`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    replaceFlyerInitial: (
      clientId: string,
      eventId: string,
      body: AdminReplaceDesignAssetInput,
      signal?: AbortSignal
    ) =>
      request<AdminInvitationDesign>(
        {
          method: 'PATCH',
          path: `${base(clientId, eventId)}/design/flyer/initial-image`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    replaceFlyerQr: (clientId: string, eventId: string, body: AdminReplaceDesignAssetInput, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        {
          method: 'PATCH',
          path: `${base(clientId, eventId)}/design/flyer/qr-image`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    createFlipbook: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        { method: 'POST', path: `${base(clientId, eventId)}/design/flipbook`, response: 'json', ...withSignal(signal) },
        record
      ),
    addPage: (clientId: string, eventId: string, body: AdminFlipbookPageInput, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        {
          method: 'POST',
          path: `${base(clientId, eventId)}/design/flipbook/pages`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    reorderPages: (clientId: string, eventId: string, body: AdminFlipbookReorderInput, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        {
          method: 'PATCH',
          path: `${base(clientId, eventId)}/design/flipbook/pages/reorder`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    replacePage: (
      clientId: string,
      eventId: string,
      pageId: string,
      body: AdminReplaceDesignAssetInput,
      signal?: AbortSignal
    ) =>
      request<AdminInvitationDesign>(
        {
          method: 'PATCH',
          path: `${base(clientId, eventId)}/design/flipbook/pages/${id(pageId)}/asset`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    removePage: (clientId: string, eventId: string, pageId: string, signal?: AbortSignal) =>
      request<AdminInvitationDesign>(
        {
          method: 'DELETE',
          path: `${base(clientId, eventId)}/design/flipbook/pages/${id(pageId)}`,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    listHotspots: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminHotspot[]>(
        { path: `${base(clientId, eventId)}/hotspots`, response: 'json', ...withSignal(signal) },
        records
      ),
    createHotspot: (clientId: string, eventId: string, body: AdminHotspotInput, signal?: AbortSignal) =>
      request<AdminHotspot>(
        { method: 'POST', path: `${base(clientId, eventId)}/hotspots`, body, response: 'json', ...withSignal(signal) },
        record
      ),
    updateHotspot: (
      clientId: string,
      eventId: string,
      hotspotId: string,
      body: AdminHotspotUpdate,
      signal?: AbortSignal
    ) =>
      request<AdminHotspot>(
        {
          method: 'PATCH',
          path: `${base(clientId, eventId)}/hotspots/${id(hotspotId)}`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      ),
    removeHotspot: (clientId: string, eventId: string, hotspotId: string, signal?: AbortSignal) =>
      request<void>({
        method: 'DELETE',
        path: `${base(clientId, eventId)}/hotspots/${id(hotspotId)}`,
        response: 'empty',
        ...withSignal(signal)
      }),
    listInvitationAssets: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminInvitationFileAsset[]>(
        { path: `${base(clientId, eventId)}/design/file-assets`, response: 'json', ...withSignal(signal) },
        records
      ),
    uploadInvitationAsset: (
      clientId: string,
      eventId: string,
      file: Blob,
      fileType: AdminInvitationFileAssetType,
      signal?: AbortSignal
    ) => {
      const body = new FormData();
      body.append('file', file);
      body.append('fileType', fileType);
      return request<AdminInvitationFileAsset>(
        {
          method: 'POST',
          path: `${base(clientId, eventId)}/design/file-assets`,
          body,
          response: 'json',
          ...withSignal(signal)
        },
        record
      );
    },
    invitationAssetContent: (clientId: string, eventId: string, assetId: string, signal?: AbortSignal) =>
      request<Blob>({
        path: `${base(clientId, eventId)}/design/file-assets/${id(assetId)}/content`,
        response: 'blob',
        ...withSignal(signal)
      }),
    removeInvitationAsset: (clientId: string, eventId: string, assetId: string, signal?: AbortSignal) =>
      request<void>({
        method: 'DELETE',
        path: `${base(clientId, eventId)}/design/file-assets/${id(assetId)}`,
        response: 'empty',
        ...withSignal(signal)
      }),
    getFloorplan: (clientId: string, eventId: string, signal?: AbortSignal) =>
      request<AdminFloorplan>(
        { path: `${base(clientId, eventId)}/floorplan`, response: 'json', ...withSignal(signal) },
        record
      )
  };
}
