import { afterEach, describe, expect, it, vi } from 'vitest';
import { AttemptManager } from './attempt-manager';

afterEach(() => vi.unstubAllGlobals());

describe('operation attempt keys', () => {
  it('uses the native cryptographic UUID when available', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    const getRandomValues = vi.fn();
    vi.stubGlobal('crypto', { randomUUID, getRandomValues });
    const manager = new AttemptManager();
    const attempt = manager.start('csv', 'preview-a');
    expect(attempt.key).toBe('00000000-0000-4000-8000-000000000001');
    expect(manager.start('csv', 'preview-a')).toBe(attempt);
    expect(randomUUID).toHaveBeenCalledOnce();
    expect(getRandomValues).not.toHaveBeenCalled();
  });

  it('generates an RFC 4122 version 4 UUID from secure bytes when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.set(Array.from({ length: 16 }, (_, index) => index));
      return bytes;
    });
    vi.stubGlobal('crypto', { getRandomValues });
    const weakRandom = vi.spyOn(Math, 'random');
    const attempt = new AttemptManager().start('csv', 'preview-a');
    expect(attempt.key).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f');
    expect(getRandomValues).toHaveBeenCalledOnce();
    expect(weakRandom).not.toHaveBeenCalled();
  });

  it('retains retries and rotates new operations using the fallback without clearing another attempt', () => {
    let sequence = 0;
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(++sequence));
    vi.stubGlobal('crypto', { getRandomValues });
    const manager = new AttemptManager();
    const first = manager.start('csv', 'preview-a');
    expect(manager.start('csv', 'preview-a')).toBe(first);
    manager.clear('csv', 'another-key');
    expect(manager.current('csv')).toBe(first);
    const next = manager.start('csv', 'preview-b');
    const intentional = manager.start('csv', 'preview-b', true);
    expect(new Set([first.key, next.key, intentional.key]).size).toBe(3);
    manager.clear('csv', intentional.key);
    expect(manager.current('csv')).toBeUndefined();
    expect(manager.start('csv', 'preview-b').key).not.toBe(intentional.key);
    expect(getRandomValues).toHaveBeenCalledTimes(4);
  });

  it('fails without weak randomness and leaves no attempt when cryptography is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    const manager = new AttemptManager();
    expect(() => manager.start('csv', 'preview-a')).toThrow(/secure randomness/i);
    expect(manager.current('csv')).toBeUndefined();
  });
});
