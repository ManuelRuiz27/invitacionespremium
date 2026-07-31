const invitationAssetPattern = /^\/api\/v1\/public\/invitations\/([^/?#]+)\/assets\/([0-9a-f-]{36})\/content$/i;
const albumContentPattern = /^\/api\/v1\/public\/albums\/([^/?#]+)$/;
const albumPhotoPattern = /^\/api\/v1\/public\/albums\/([^/?#]+)\/photos\/([0-9a-f-]{36})\/content$/i;

function safelyDecode(segment: string): string | null {
  try {
    const value = decodeURIComponent(segment);
    return value && !/[/?#\\]/u.test(value) ? value : null;
  } catch {
    return null;
  }
}

export function invitationAssetIdFromPath(path: string, invitationToken: string): string | null {
  const match = invitationAssetPattern.exec(path);
  return match && safelyDecode(match[1] ?? '') === invitationToken ? (match[2] ?? null) : null;
}

export function albumTokenFromContentPath(path: string): string | null {
  const match = albumContentPattern.exec(path);
  return match ? safelyDecode(match[1] ?? '') : null;
}

export function albumPhotoIdFromPath(path: string, albumToken: string): string | null {
  const match = albumPhotoPattern.exec(path);
  return match && safelyDecode(match[1] ?? '') === albumToken ? (match[2] ?? null) : null;
}

export function safeHttpsUrl(value: string | null | undefined, forbiddenToken?: string): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
    if (forbiddenToken && (value.includes(forbiddenToken) || value.includes(encodeURIComponent(forbiddenToken))))
      return null;
    return parsed.href;
  } catch {
    return null;
  }
}
