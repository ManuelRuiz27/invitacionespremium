import { describe, expect, it } from 'vitest';
import { parseAssignManagedContract } from './managed-contracts.dto';

const versionId = '10000000-0000-4000-8000-000000000001';

describe('Managed contract input', () => {
  it('accepts a version identifier and an unambiguous calendar start date', () => {
    expect(parseAssignManagedContract({ planVersionId: versionId, startsOn: '2028-02-29' })).toEqual({
      planVersionId: versionId,
      startsOn: '2028-02-29'
    });
  });

  it.each(['2027-02-29', '2027-02-30', '2027-13-01', '0000-01-01', '2027-01-01T00:00:00Z'])(
    'rejects invalid or non-date-only start %s',
    (startsOn) => expect(() => parseAssignManagedContract({ planVersionId: versionId, startsOn })).toThrow()
  );

  it('rejects invalid identifiers and attempts to submit authoritative terms or account permissions', () => {
    expect(() => parseAssignManagedContract({ planVersionId: 'missing', startsOn: '2027-01-01' })).toThrow();
    expect(() =>
      parseAssignManagedContract({ planVersionId: versionId, startsOn: '2027-01-01', monthlyAmountMxnCents: 1 })
    ).toThrow();
    expect(() =>
      parseAssignManagedContract({ planVersionId: versionId, startsOn: '2027-01-01', operatingProfile: 'MANAGED' })
    ).toThrow();
  });
});
