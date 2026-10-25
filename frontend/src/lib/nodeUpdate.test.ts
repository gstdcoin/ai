import { describe, expect, it } from 'vitest';
import { compareVersions } from './nodeUpdate';

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
