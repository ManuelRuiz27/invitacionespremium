export type Attempt = { identity: string; key: string };

/** Keeps only an unresolved operation attempt. Resolved keys are never persisted. */
export class AttemptManager {
  private readonly attempts = new Map<string, Attempt>();

  start(scope: string, identity: string, forceNew = false): Attempt {
    const current = this.attempts.get(scope);
    if (!forceNew && current?.identity === identity) return current;
    const attempt = { identity, key: createAttemptKey() };
    this.attempts.set(scope, attempt);
    return attempt;
  }

  current(scope: string): Attempt | undefined {
    return this.attempts.get(scope);
  }

  clear(scope: string, key?: string): void {
    if (!key || this.attempts.get(scope)?.key === key) this.attempts.delete(scope);
  }
}

function createAttemptKey(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto?.getRandomValues !== 'function') throw new Error('Secure randomness is unavailable.');

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function isUncertainFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');
}
