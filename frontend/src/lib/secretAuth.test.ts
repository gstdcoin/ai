import { describe, expect, it } from 'vitest';
import { matchesAnySecret, matchesSecret } from './secretAuth';

describe('shared-secret authentication', () => {
    it('matches only configured string secrets', () => {
        expect(matchesSecret('configured-secret', 'configured-secret')).toBe(true);
        expect(matchesSecret('different-secret', 'configured-secret')).toBe(false);
        expect(matchesSecret('configured-secret', '')).toBe(false);
        expect(matchesSecret(undefined, 'configured-secret')).toBe(false);
        expect(matchesSecret(['configured-secret'], 'configured-secret')).toBe(false);
    });

    it('supports any configured secret without short-circuiting on an earlier match', () => {
        expect(matchesAnySecret('second-secret', [undefined, 'first-secret', 'second-secret'])).toBe(true);
        expect(matchesAnySecret('unconfigured', [undefined, 'first-secret', 'second-secret'])).toBe(false);
        expect(matchesAnySecret('anything', [])).toBe(false);
    });
});
