import { describe, expect, it } from 'vitest';
import { hasTaskResult, declaredTaskModelMismatch } from './taskValidation';

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

describe('declared model acceptance', () => {
    it('rejects a different declared body or result model for an explicit request', () => {
        expect(declaredTaskModelMismatch('qwen:small', {model:'llama:large'})).toBe(true);
        expect(declaredTaskModelMismatch('qwen:small', {model:'qwen:small',result:{model:'llama:large'}})).toBe(true);
    });
    it('allows auto/default requests and legacy responses without model metadata', () => {
        expect(declaredTaskModelMismatch('auto', {model:'qwen:small'})).toBe(false);
        expect(declaredTaskModelMismatch(undefined, {model:'qwen:small'})).toBe(false);
        expect(declaredTaskModelMismatch('qwen:small', {result:{response:'legacy output'}})).toBe(false);
    });
    it('accepts only the equivalent default Ollama tag', () => {
        expect(declaredTaskModelMismatch('qwen', {model:'qwen:latest'})).toBe(false);
        expect(declaredTaskModelMismatch('qwen', {model:'qwen:small'})).toBe(true);
    });
});
