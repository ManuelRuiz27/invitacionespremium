export type Attempt = { identity: string; key: string };

/** Keeps only an unresolved operation attempt. Resolved keys are never persisted. */
export class AttemptManager {
  private readonly attempts = new Map<string, Attempt>();

  start(scope: string, identity: string, forceNew = false): Attempt {
    const current = this.attempts.get(scope);
    if (!forceNew && current?.identity === identity) return current;
    const attempt = { identity, key: globalThis.crypto.randomUUID() };
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

export function isUncertainFailure(error: unknown): boolean {
  return error instanceof TypeError || (error instanceof DOMException && error.name === 'TimeoutError');
}
