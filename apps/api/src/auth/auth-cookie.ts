import type { AppConfigService } from '../config/app-config.service';

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
    sameSite: 'strict' | 'lax' | 'none';
    secure: boolean;
  }
): string {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${Math.max(0, Math.floor(options.maxAge))}`,
    `Path=${options.path}`,
    'HttpOnly',
    `SameSite=${capitalize(options.sameSite)}`
  ];

  if (options.secure) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

function capitalize(value: 'strict' | 'lax' | 'none'): 'Strict' | 'Lax' | 'None' {
  return `${value[0].toUpperCase()}${value.slice(1)}` as 'Strict' | 'Lax' | 'None';
}
