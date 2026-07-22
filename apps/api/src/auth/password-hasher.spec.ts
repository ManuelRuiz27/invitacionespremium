import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password-hasher';

describe('password hashing', () => {
  it('creates salted scrypt hashes and validates the original password', async () => {
    const first = await hashPassword('correct horse battery staple');
    const second = await hashPassword('correct horse battery staple');

    expect(first).toMatch(/^scrypt\$v=1\$/);
    expect(second).not.toBe(first);
    await expect(verifyPassword('correct horse battery staple', first)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', first)).resolves.toBe(false);
  });

  it('rejects malformed or unsupported hashes without throwing', async () => {
    await expect(verifyPassword('password', 'not-a-password-hash')).resolves.toBe(false);
    await expect(
      verifyPassword('password', 'scrypt$v=1$N=1024,r=8,p=1$aW52YWxpZC1zYWx0$aW52YWxpZC1rZXk')
    ).resolves.toBe(false);
  });
});
