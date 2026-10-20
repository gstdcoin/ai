import { describe, expect, it } from 'vitest';
import { supportsTaskKind } from './taskKinds';

describe('worker task-kind filtering', () => {
    it('keeps existing behavior when a worker does not request a task-kind filter', () => {
        expect(supportsTaskKind({ type: 'inference', payload: {} }, [])).toBe(true);
    });

    it('matches only explicitly supported payload kinds', () => {
        expect(supportsTaskKind({ payload: { kind: 'sha256_verify' } }, ['sha256_verify'])).toBe(true);
        expect(supportsTaskKind({ payload: { kind: 'llm_inference' } }, ['sha256_verify'])).toBe(false);
        expect(supportsTaskKind({ payload: {} }, ['sha256_verify'])).toBe(false);
        expect(supportsTaskKind({ payload: '{"kind":"sha256_verify"}' }, ['sha256_verify'])).toBe(false);
    });
});
