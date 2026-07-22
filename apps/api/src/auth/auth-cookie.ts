import type { AppConfigService } from '../config/app-config.service';

const SAME_SITE_ATTRIBUTE = {
  strict: 'Strict',
  lax: 'Lax',
  none: 'None'
} as const;

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) {
    return undefined;
  }

  for (const part of cookieHeader.split(';')) {
    const separatorIndex = part.indexOf('=');

    if (separatorIndex < 0) {
      continue;
    }

    const cookieName = part.slice(0, separatorIndex).trim();

    if (cookieName !== name) {
      continue;
    }

    const encodedValue = part.slice(separatorIndex + 1).trim();

    try {
      return decodeURIComponent(encodedValue);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

export function buildSessionCookie(
  token: string,
  config: Pick<
    AppConfigService,
    | 'authCookieName'
    | 'authCookiePath'
    | 'authCookieSameSite'
    | 'authCookieSecure'
    | 'authSessionTtlSeconds'
  >
): string {
  return serializeCookie(config.authCookieName, token, {
    maxAge: config.authSessionTtlSeconds,
    path: config.authCookiePath,
    sameSite: config.authCookieSameSite,
    secure: config.authCookieSecure
  });
}

export function buildClearedSessionCookie(
  config: Pick<
    AppConfigService,
    'authCookieName' | 'authCookiePath' | 'authCookieSameSite' | 'authCookieSecure'
  >
): string {
  return serializeCookie(config.authCookieName, '', {
    maxAge: 0,
    path: config.authCookiePath,
    sameSite: config.authCookieSameSite,
    secure: config.authCookieSecure
  });
}

function serializeCookie(
  name: string,
  value: string,
  options: {
    maxAge: number;
    path: string;
    sameSite: keyof typeof SAME_SITE_ATTRIBUTE;
    secure: boolean;
  }
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${SAME_SITE_ATTRIBUTE[options.sameSite]}`
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}
