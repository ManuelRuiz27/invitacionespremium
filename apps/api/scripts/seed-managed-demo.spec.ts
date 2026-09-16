import { describe, expect, it, vi } from 'vitest';
import { assertManagedDemoEnvironment, seedManagedDemo } from './seed-managed-demo';

describe('managed demo seed safety', () => {
  it('rejects production before creating an application or artifact', async () => {
    const createApplication = vi.fn();
    expect(() => assertManagedDemoEnvironment({ NODE_ENV: 'production' })).toThrow(
      'Managed demo seed is disabled in production.'
    );
    await expect(
      seedManagedDemo({ NODE_ENV: 'production', MANAGED_DEMO_ARTIFACT_PATH: 'must-not-exist.json' }, createApplication)
    ).rejects.toThrow('Managed demo seed is disabled in production.');
    expect(createApplication).not.toHaveBeenCalled();
  });
});
