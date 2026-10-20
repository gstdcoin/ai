import { describe, expect, it } from 'vitest';
import { hasTaskResult } from './taskValidation';

describe('task result validation', () => {
    it.each([
        ['', false],
        ['   ', false],
        [[], false],
        [{}, false],
        [null, false],
        [undefined, false],
        ['done', true],
        [[1], true],
        [{ ok: true }, true],
        [0, true],
        [false, true],
    ])('validates result %j as %s', (result, expected) => {
        expect(hasTaskResult(result)).toBe(expected);
    });
});
