import { describe, expect, it } from 'vitest';
import {
  albumPhotoIdFromPath,
  albumTokenFromContentPath,
  invitationAssetIdFromPath,
  safeHttpsUrl
} from './public-content-path';

const uuid = '2e07a475-7865-4782-9916-04dba57fb2ef';

describe('public content paths', () => {
  it('accepts only exact invitation-scoped asset paths', () => {
    expect(invitationAssetIdFromPath(`/api/v1/public/invitations/token/assets/${uuid}/content`, 'token')).toBe(uuid);
    expect(invitationAssetIdFromPath(`/api/v1/public/invitations/other/assets/${uuid}/content`, 'token')).toBeNull();
    expect(
      invitationAssetIdFromPath(`https://evil.test/api/v1/public/invitations/token/assets/${uuid}/content`, 'token')
    ).toBeNull();
    expect(
      invitationAssetIdFromPath(`/api/v1/public/invitations/token/assets/${uuid}/content?next=evil`, 'token')
    ).toBeNull();
  });

  it('extracts an album token once and rejects queries, fragments and traversal', () => {
    expect(albumTokenFromContentPath('/api/v1/public/albums/al1.safe')).toBe('al1.safe');
    expect(albumTokenFromContentPath('/api/v1/public/albums/al1.safe?token=x')).toBeNull();
    expect(albumTokenFromContentPath('/api/v1/public/albums/%252e%252e')).toBe('%2e%2e');
    expect(albumTokenFromContentPath('/api/v1/public/albums/%2Fetc')).toBeNull();
  });

  it('accepts only album-scoped photo paths and safe HTTPS links', () => {
    expect(albumPhotoIdFromPath(`/api/v1/public/albums/album/photos/${uuid}/content`, 'album')).toBe(uuid);
    expect(albumPhotoIdFromPath(`/api/v1/public/albums/other/photos/${uuid}/content`, 'album')).toBeNull();
    expect(safeHttpsUrl('https://example.com/path')).toBe('https://example.com/path');
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpsUrl('https://example.com/secret', 'secret')).toBeNull();
  });
});
