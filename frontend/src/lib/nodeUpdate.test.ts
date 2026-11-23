import { describe, expect, it } from 'vitest';
import { compareVersions, getLatestNodeVersion, nodeUpdateInfo } from './nodeUpdate';
import approved from './nodeReleaseApproved.json';

describe('compareVersions', () => {
  it('orders semantic versions numerically', () => {
    expect(compareVersions('1.2.3', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('3.0.0', '3.0.0')).toBe(0);
  });

  it('tolerates missing segments and pre-release suffixes', () => {
    expect(compareVersions('3.0', '3.0.1')).toBe(-1);
    expect(compareVersions('3.1.0-beta', '3.1.0')).toBe(0);
  });
});
it('advertises only the approval pin, independent of newer mutable branch metadata', async () => {
  expect(await getLatestNodeVersion()).toBe(approved.version);
  const status = await nodeUpdateInfo(approved.version);
  expect(status.update_available).toBe(false);
  expect(status.approved_commit).toBe(approved.commit);
  expect(status.update_url).toContain('/' + approved.commit + '/install.sh');
});
