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

const isInvitation = (value: unknown): value is PublicInvitationView =>
  isRecord(value) && ['AVAILABLE', 'CANCELLED', 'CLOSED'].includes(String(value.status));
const isMutation = (value: unknown): value is PublicRsvpMutation =>
  isRecord(value) && Array.isArray(value.assistants) && typeof value.responseStatus === 'string';
const isAlbum = (value: unknown): value is PublicAlbum =>
  isRecord(value) && value.status === 'AVAILABLE' && isRecord(value.album) && isRecord(value.event);

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
