import type { components } from './generated/schema';
import { isRecord, type ApiRequester } from './api-client';

export type AuthUser = components['schemas']['AuthUserDto'];
export type LoginInput = components['schemas']['LoginRequestDto'];
export type LoginResult = components['schemas']['LoginResponseDto'];
export type UserRole = AuthUser['role'];

export interface AuthClient {
  login(input: LoginInput, signal?: AbortSignal): Promise<LoginResult>;
  logout(signal?: AbortSignal): Promise<void>;
  me(signal?: AbortSignal): Promise<AuthUser>;
}

export function createAuthClient(request: ApiRequester): AuthClient {
  return {
    login: (input, signal) =>
      request(
        { method: 'POST', path: '/auth/login', body: input, response: 'json', ...(signal ? { signal } : {}) },
        isLoginResult
      ),
    logout: (signal) =>
      request({ method: 'POST', path: '/auth/logout', response: 'empty', ...(signal ? { signal } : {}) }, isUndefined),
    me: (signal) => request({ path: '/auth/me', response: 'json', ...(signal ? { signal } : {}) }, isAuthUser)
  };
}

function isLoginResult(value: unknown): value is LoginResult {
  return isRecord(value) && typeof value.expiresAt === 'string' && isAuthUser(value.user);
}

function isAuthUser(value: unknown): value is AuthUser {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.email === 'string' &&
    typeof value.role === 'string' &&
    (value.clientId === null || typeof value.clientId === 'string')
  );
}

function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}
