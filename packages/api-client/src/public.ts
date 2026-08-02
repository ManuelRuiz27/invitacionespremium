import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

export type PublicInvitationView = components['schemas']['PublicInvitationViewResponseDto'];
export type PublicRsvpAssistant = components['schemas']['PublicRsvpAssistantResponseDto'];
export type PublicRsvpAssistantInput = components['schemas']['RsvpAssistantInputDto'];
export type PublicRsvpMutation = components['schemas']['RsvpMutationResponseDto'];
export type PublicAlbum = components['schemas']['PublicAlbumResponseDto'];
export type PublicAlbumPhoto = components['schemas']['PublicAlbumPhotoDto'];

const segment = (value: string) => encodeURIComponent(value);
const publicRequest = <T>(
  request: ApiRequester,
  options: Parameters<ApiRequester>[0],
  validate?: (value: unknown) => value is T
) => request<T>({ ...options, credentials: 'omit' }, validate);

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isResponseStatus = (value: unknown) => ['PENDING', 'CONFIRMED', 'REJECTED'].includes(String(value));
const isAssistant = (value: unknown) =>
  isRecord(value) &&
  isString(value.id) &&
  isString(value.name) &&
  typeof value.isPrimary === 'boolean' &&
  isResponseStatus(value.responseStatus);
const isAsset = (value: unknown) => isRecord(value) && isString(value.id) && isString(value.contentPath);
const isHotspot = (value: unknown) =>
  isRecord(value) &&
  isString(value.id) &&
  ['RSVP', 'LOCATION', 'GIFT_REGISTRY', 'QR_AREA', 'EXTERNAL_LINK'].includes(String(value.action)) &&
  (value.destination === null || isString(value.destination)) &&
  (value.flipbookPageId === null || isString(value.flipbookPageId)) &&
  ['FLYER', 'FLIPBOOK_PAGE'].includes(String(value.visualOwnerType)) &&
  ['x', 'y', 'width', 'height', 'priority'].every((field) => isNumber(value[field]));
const isAlbumProjection = (value: unknown) =>
  value === undefined ||
  (isRecord(value) &&
    ((value.state === 'AVAILABLE' && isString(value.contentPath)) ||
      (value.state === 'RESTRICTED' && (value.message === undefined || isString(value.message)))));

const isAvailableInvitation = (value: Record<string, unknown>) =>
  isRecord(value.event) &&
  isString(value.event.name) &&
  isString(value.event.eventDateTime) &&
  isString(value.event.timeZone) &&
  isRecord(value.invitation) &&
  isString(value.invitation.id) &&
  ['INDIVIDUAL', 'FAMILY_NOMINAL'].includes(String(value.invitation.mode)) &&
  isResponseStatus(value.invitation.responseStatus) &&
  isNumber(value.invitation.additionalAssistantLimit) &&
  typeof value.invitation.cancelled === 'boolean' &&
  isRecord(value.confirmation) &&
  typeof value.confirmation.open === 'boolean' &&
  Array.isArray(value.assistants) &&
  value.assistants.every(isAssistant) &&
  ['FLYER', 'FLIPBOOK'].includes(String(value.designType)) &&
  isRecord(value.design) &&
  value.design.type === value.designType &&
  Array.isArray(value.design.hotspots) &&
  value.design.hotspots.every(isHotspot) &&
  Array.isArray(value.design.pages) &&
  value.design.pages.every(
    (page) => isRecord(page) && isString(page.id) && isNumber(page.position) && isAsset(page.asset)
  ) &&
  (value.design.flyerInitialAsset === undefined || isAsset(value.design.flyerInitialAsset)) &&
  (value.design.flyerQrAsset === undefined || isAsset(value.design.flyerQrAsset)) &&
  (value.designType !== 'FLYER' || isAsset(value.design.flyerInitialAsset)) &&
  (value.designType !== 'FLIPBOOK' || value.design.pages.length > 0) &&
  isRecord(value.qr) &&
  typeof value.qr.available === 'boolean' &&
  (!value.qr.available || isString(value.qr.contentPath)) &&
  isAlbumProjection(value.album);

const isInvitation = (value: unknown): value is PublicInvitationView => {
  if (!isRecord(value)) return false;
  if (value.status === 'AVAILABLE') return isAvailableInvitation(value);
  if (value.status === 'CANCELLED') return isString(value.message);
  return value.status === 'CLOSED' && isAlbumProjection(value.album);
};
const isMutation = (value: unknown): value is PublicRsvpMutation =>
  isRecord(value) &&
  isString(value.invitationId) &&
  isResponseStatus(value.responseStatus) &&
  Array.isArray(value.assistants) &&
  value.assistants.every(isAssistant);
const isAlbum = (value: unknown): value is PublicAlbum =>
  isRecord(value) &&
  value.status === 'AVAILABLE' &&
  isRecord(value.event) &&
  isString(value.event.name) &&
  isRecord(value.album) &&
  isString(value.album.title) &&
  isString(value.album.publishedAt) &&
  isString(value.album.expiresAt) &&
  isRecord(value.album.theme) &&
  isString(value.album.theme.backgroundColor) &&
  isString(value.album.theme.textColor) &&
  isString(value.album.theme.accentColor) &&
  Array.isArray(value.album.photos) &&
  value.album.photos.every(
    (photo) => isRecord(photo) && isString(photo.id) && isNumber(photo.position) && isString(photo.contentPath)
  );

export function createPublicInvitationClient(request: ApiRequester) {
  const base = (token: string) => `/public/invitations/${segment(token)}`;
  return {
    resolve: (token: string, signal?: AbortSignal) =>
      publicRequest(request, { path: base(token), response: 'json', ...(signal ? { signal } : {}) }, isInvitation),
    confirm: (token: string, additionalAssistants: PublicRsvpAssistantInput[], signal?: AbortSignal) =>
      publicRequest(
        request,
        {
          method: 'POST',
          path: `${base(token)}/confirm`,
          body: { additionalAssistants },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isMutation
      ),
    reject: (token: string, signal?: AbortSignal) =>
      publicRequest(
        request,
        { method: 'POST', path: `${base(token)}/reject`, response: 'json', ...(signal ? { signal } : {}) },
        isMutation
      ),
    updateAssistants: (token: string, additionalAssistants: PublicRsvpAssistantInput[], signal?: AbortSignal) =>
      publicRequest(
        request,
        {
          method: 'PATCH',
          path: `${base(token)}/assistants`,
          body: { additionalAssistants },
          response: 'json',
          ...(signal ? { signal } : {})
        },
        isMutation
      ),
    asset: (token: string, fileAssetId: string, signal?: AbortSignal) =>
      publicRequest<Blob>(request, {
        path: `${base(token)}/assets/${segment(fileAssetId)}/content`,
        response: 'blob',
        ...(signal ? { signal } : {})
      }),
    qr: (token: string, signal?: AbortSignal) =>
      publicRequest<Blob>(request, {
        path: `${base(token)}/qr.svg`,
        response: 'blob',
        ...(signal ? { signal } : {})
      })
  };
}

export function createPublicAlbumClient(request: ApiRequester) {
  const base = (token: string) => `/public/albums/${segment(token)}`;
  return {
    resolve: (token: string, signal?: AbortSignal) =>
      publicRequest(request, { path: base(token), response: 'json', ...(signal ? { signal } : {}) }, isAlbum),
    photo: (token: string, photoId: string, signal?: AbortSignal) =>
      publicRequest<Blob>(request, {
        path: `${base(token)}/photos/${segment(photoId)}/content`,
        response: 'blob',
        ...(signal ? { signal } : {})
      })
  };
}
