import { randomBytes, scrypt, scryptSync, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const COST = 16_384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;
const VERSION = 1;
const SCRYPT_OPTIONS: ScryptOptions = {
  cost: COST,
  blockSize: BLOCK_SIZE,
  parallelization: PARALLELIZATION,
  maxmem: MAX_MEMORY
};
const DUMMY_SALT = Buffer.from('invalid-login-salt', 'utf8');
const DUMMY_KEY = scryptSync('invalid-login-password', DUMMY_SALT, KEY_LENGTH, SCRYPT_OPTIONS);

export const DUMMY_PASSWORD_HASH = encodePasswordHash(DUMMY_SALT, DUMMY_KEY);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);

  return encodePasswordHash(salt, derivedKey);
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);

  if (!parsed) {
    return false;
  }

  const derivedKey = await deriveKey(password, parsed.salt, parsed.key.length, {
    cost: parsed.cost,
    blockSize: parsed.blockSize,
    parallelization: parsed.parallelization,
    maxmem: MAX_MEMORY
  });

  return derivedKey.length === parsed.key.length && timingSafeEqual(derivedKey, parsed.key);
}

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(derivedKey);
    });
  });
}

function encodePasswordHash(salt: Buffer, key: Buffer): string {
  return [
    'scrypt',
    `v=${VERSION}`,
    `N=${COST},r=${BLOCK_SIZE},p=${PARALLELIZATION}`,
    salt.toString('base64url'),
    key.toString('base64url')
  ].join('$');
}

function parsePasswordHash(encodedHash: string): {
  salt: Buffer;
  key: Buffer;
  cost: number;
  blockSize: number;
  parallelization: number;
} | null {
  const [algorithm, versionPart, paramsPart, saltPart, keyPart] = encodedHash.split('$');

  if (algorithm !== 'scrypt' || versionPart !== `v=${VERSION}` || !paramsPart || !saltPart || !keyPart) {
    return null;
  }

  const parameters = Object.fromEntries(
    paramsPart.split(',').map((parameter) => {
      const [name, value] = parameter.split('=');
      return [name, Number(value)];
    })
  );

  if (parameters.N !== COST || parameters.r !== BLOCK_SIZE || parameters.p !== PARALLELIZATION) {
    return null;
  }

  try {
    const salt = Buffer.from(saltPart, 'base64url');
    const key = Buffer.from(keyPart, 'base64url');

    if (salt.length < SALT_LENGTH || key.length !== KEY_LENGTH) {
      return null;
    }

    return {
      salt,
      key,
      cost: parameters.N,
      blockSize: parameters.r,
      parallelization: parameters.p
    };
  } catch {
    return null;
  }
}
