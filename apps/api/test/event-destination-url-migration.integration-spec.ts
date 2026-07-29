import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client, type DatabaseError } from 'pg';
import { describe, expect, it } from 'vitest';

const migrationName = '20260728230000_validate_destination_url_encoding';
const migrationsRoot = resolve(process.cwd(), 'prisma/migrations');

describe('Event destination URL migration', () => {
  it('rejects a legacy invalid row without leaking it and applies after the row is corrected', async () => {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error('DATABASE_URL is required.');

    const databaseName = `codex070_url_migration_${randomUUID().replaceAll('-', '')}`;
    const adminUrl = new URL(databaseUrl);
    adminUrl.pathname = '/postgres';
    adminUrl.searchParams.delete('schema');
    const isolatedUrl = new URL(databaseUrl);
    isolatedUrl.pathname = `/${databaseName}`;
    isolatedUrl.searchParams.delete('schema');

    const admin = new Client({ connectionString: adminUrl.toString() });
    let isolated: Client | undefined;
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      isolated = new Client({ connectionString: isolatedUrl.toString() });
      await isolated.connect();

      const migrationDirectories = (await readdir(migrationsRoot, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory() && entry.name !== migrationName)
        .map((entry) => entry.name)
        .sort();
      expect(migrationDirectories).toHaveLength(25);
      for (const directory of migrationDirectories) {
        const sql = await readFile(resolve(migrationsRoot, directory, 'migration.sql'), 'utf8');
        await isolated.query(sql);
      }

      const clientId = randomUUID();
      const userId = randomUUID();
      const eventId = randomUUID();
      await isolated.query(
        `
          WITH "created_client" AS (
            INSERT INTO "client" ("id", "type", "name", "created_at", "updated_at")
            VALUES ($1::uuid, 'PLANNER', 'Legacy destination migration', NOW(), NOW())
            RETURNING "id"
          ),
          "created_user" AS (
            INSERT INTO "app_user" (
              "id", "email", "password_hash", "role", "client_id", "created_at", "updated_at"
            )
            SELECT
              $2::uuid,
              '${randomUUID()}@example.com',
              'scrypt$migration-test-only',
              'INDEPENDENT_PLANNER',
              "id",
              NOW(),
              NOW()
            FROM "created_client"
            RETURNING "id", "client_id"
          )
          INSERT INTO "event" (
            "id", "client_id", "created_by_user_id", "location_url", "created_at", "updated_at"
          )
          SELECT $3::uuid, "client_id", "id", 'https://example.com/%ZZ', NOW(), NOW()
          FROM "created_user"
        `,
        [clientId, userId, eventId]
      );
      const migrationSql = await readFile(resolve(migrationsRoot, migrationName, 'migration.sql'), 'utf8');

      let migrationError: DatabaseError | undefined;
      try {
        await isolated.query(migrationSql);
      } catch (error) {
        migrationError = error as DatabaseError;
        await isolated.query('ROLLBACK');
      }

      expect(migrationError?.code).toBe('P0001');
      expect(migrationError?.message).toBe('EVENT_DESTINATION_URL_LEGACY_INVALID count=1');
      expect(migrationError?.message).not.toContain('%ZZ');
      expect(migrationError?.message).not.toContain('example.com');
      expect(
        (
          await isolated.query<{ accepted: boolean }>(
            `SELECT "is_valid_event_destination_url"('https://example.com/%ZZ') AS "accepted"`
          )
        ).rows[0]!.accepted
      ).toBe(true);

      await isolated.query(
        `UPDATE "event" SET "location_url" = 'https://example.com/sal%C3%B3n' WHERE "id" = $1::uuid`,
        [eventId]
      );
      await isolated.query(migrationSql);

      const result = await isolated.query<{
        malformedAccepted: boolean;
        validUtf8Accepted: boolean;
        storedValue: string;
      }>(
        `
            SELECT
              "is_valid_event_destination_url"('https://example.com/%ZZ') AS "malformedAccepted",
              "is_valid_event_destination_url"('https://example.com/sal%C3%B3n') AS "validUtf8Accepted",
              "location_url" AS "storedValue"
            FROM "event"
            WHERE "id" = $1::uuid
          `,
        [eventId]
      );
      expect(result.rows[0]).toEqual({
        malformedAccepted: false,
        validUtf8Accepted: true,
        storedValue: 'https://example.com/sal%C3%B3n'
      });
    } finally {
      if (isolated) {
        await isolated.query('ROLLBACK').catch(() => undefined);
        await isolated.end();
      }
      await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await admin.end();
    }
  }, 60_000);
});
