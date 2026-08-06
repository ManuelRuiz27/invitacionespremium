import { describe, expect, it, vi } from 'vitest';
import type { INestApplicationContext } from '@nestjs/common';
import {
  assertAuthoritativeScannerProjection,
  remoteStoragePath,
  seedStaging,
  uploadAndVerifyRemoteFloorplan,
  type SeedCommandExecutor
} from './seed-staging';

describe('staging seed safety and fixtures', () => {
  it.each([
    [{ STAGING_ENVIRONMENT: 'production' }, 'STAGING_ENVIRONMENT'],
    [
      {
        STAGING_ENVIRONMENT: 'staging',
        DATABASE_URL: 'postgresql://staging-a',
        STAGING_DATABASE_URL: 'postgresql://staging-b'
      },
      'exactly match'
    ],
    [
      {
        STAGING_ENVIRONMENT: 'staging',
        DATABASE_URL: 'postgresql://production',
        STAGING_DATABASE_URL: 'postgresql://production',
        PRODUCTION_DATABASE_URL: 'postgresql://production'
      },
      'production database'
    ]
  ])('rejects before opening PostgreSQL or mutating audited pricing: %s', async (environment, message) => {
    const openConnection = vi.fn();
    const createAudit = vi.fn();
    const modifyService = vi.fn();
    const modifyPrice = vi.fn();
    const createApplication = vi.fn(async () => {
      openConnection();
      createAudit();
      modifyService();
      modifyPrice();
      return {} as INestApplicationContext;
    });
    await expect(seedStaging(['--confirm-staging'], environment, createApplication)).rejects.toThrow(message);
    expect(createApplication).not.toHaveBeenCalled();
    expect(openConnection).not.toHaveBeenCalled();
    expect(createAudit).not.toHaveBeenCalled();
    expect(modifyService).not.toHaveBeenCalled();
    expect(modifyPrice).not.toHaveBeenCalled();
  });

  it('resolves the recognizable floorplan under the isolated remote storage root', () => {
    expect(remoteStoragePath('/data/file-assets', 'production', 'staging-demo/floorplan.png')).toBe(
      '/data/file-assets/production/staging-demo/floorplan.png'
    );
    expect(() => remoteStoragePath('relative', 'production', 'staging-demo/floorplan.png')).toThrow();
  });

  it('fails before any FileAsset can be registered when the remote asset cannot be downloaded', async () => {
    const executor: SeedCommandExecutor = { capture: vi.fn().mockResolvedValue('{}') };
    await expect(
      uploadAndVerifyRemoteFloorplan(
        Buffer.from('not-a-real-png'),
        'staging-demo/floorplan.png',
        '/data/file-assets',
        'production',
        {
          RAILWAY_TOKEN: 'token',
          RAILWAY_PROJECT_ID: 'project',
          RAILWAY_API_SERVICE_ID: 'service'
        },
        executor
      )
    ).rejects.toThrow();
    expect(executor.capture).toHaveBeenCalledTimes(2);
  });

  it('accepts only the authoritative family projection with confirmed seated pending assistants', () => {
    expect(() =>
      assertAuthoritativeScannerProjection({
        status: 'AVAILABLE',
        invitation: { id: '14000000-0000-4000-8000-000000000034', mode: 'FAMILY_NOMINAL' },
        pendingAssistants: [
          {
            id: '14000000-0000-4000-8000-000000000036',
            name: 'Uno',
            isPrimary: false,
            table: { id: '14000000-0000-4000-8000-000000000023', name: 'Mesa' }
          },
          {
            id: '14000000-0000-4000-8000-000000000037',
            name: 'Dos',
            isPrimary: false,
            table: { id: '14000000-0000-4000-8000-000000000023', name: 'Mesa' }
          }
        ],
        confirmedCount: 3,
        pendingCount: 2,
        checkedInCount: 1
      } as never)
    ).not.toThrow();
  });
});
