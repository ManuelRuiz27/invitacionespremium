import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { AppConfigService } from '../config/app-config.service';

const REPORT_UPLOAD_LOCK_PREFIX = 'InvitacionesPremium:GENERATED_REPORT_UPLOAD:';

export function reportUploadLockDomain(reportId: string): string {
  return `${REPORT_UPLOAD_LOCK_PREFIX}${reportId}`;
}

@Injectable()
export class ReportUploadLockService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(@Inject(AppConfigService) config: AppConfigService) {
    this.pool = new Pool({
      connectionString: config.databaseUrl,
      max: config.databasePoolMax,
      connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
      idleTimeoutMillis: config.databaseIdleTimeoutMs,
      application_name: 'invitacionespremium-report-upload-lock'
    });
  }

  async withLock<T>(reportId: string, work: () => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    const domain = reportUploadLockDomain(reportId);
    let locked = false;
    let destroyConnection = false;
    try {
      await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [domain]);
      locked = true;
      return await work();
    } finally {
      if (locked) {
        destroyConnection = !(await this.unlock(client, domain));
      }
      client.release(destroyConnection);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  private async unlock(client: PoolClient, domain: string): Promise<boolean> {
    try {
      const result = await client.query<{ unlocked: boolean }>(
        'SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS "unlocked"',
        [domain]
      );
      return result.rows[0]?.unlocked === true;
    } catch {
      return false;
    }
  }
}
