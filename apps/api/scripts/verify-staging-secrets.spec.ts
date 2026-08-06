import { describe, expect, it } from 'vitest';
import { assertDemoSecretConsistency } from './verify-staging-secrets';

describe('staging demo secret synchronization', () => {
  const valid = {
    email: 'staging-planner@example.invalid',
    eventId: '14000000-0000-4000-8000-000000000010',
    auth: { user: { email: 'staging-planner@example.invalid', clientId: 'client-demo' } },
    event: { id: '14000000-0000-4000-8000-000000000010', clientId: 'client-demo' },
    invitation: { invitation: { id: '14000000-0000-4000-8000-000000000031' } },
    staffSession: { event: { id: '14000000-0000-4000-8000-000000000010' } }
  };

  it('accepts synchronized credentials bound to the same demo Client and Event', () => {
    expect(() => assertDemoSecretConsistency(valid)).not.toThrow();
  });

  it('rejects a stale secret after a seed changes its Event binding', () => {
    expect(() =>
      assertDemoSecretConsistency({
        ...valid,
        staffSession: { event: { id: '14000000-0000-4000-8000-000000000011' } }
      })
    ).toThrow('stale');
  });
});
