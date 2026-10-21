import { describe, expect, it } from 'vitest';
import { supportsTaskKind } from './taskKinds';

describe('worker task-kind filtering', () => {
    it('keeps existing behavior when a worker does not request a task-kind filter', () => {
        expect(supportsTaskKind({ type: 'inference', payload: {} }, [])).toBe(true);
        expect(supportsTaskKind({ type: 'finetune', payload: {} }, [])).toBe(false);
        expect(supportsTaskKind({ type: 'custom', payload: { kind: 'bridge_verify' } }, [])).toBe(false);
        expect(supportsTaskKind({ type: 'custom', required_caps: ['finetune'], payload: {} }, [])).toBe(false);
        expect(supportsTaskKind({ type: 'custom', payload: { job_id: 'legacy-job' } }, [])).toBe(false);
    });

    it('matches only explicitly supported payload kinds', () => {
        expect(supportsTaskKind({ payload: { kind: 'sha256_verify' } }, ['sha256_verify'])).toBe(true);
        expect(supportsTaskKind({ payload: { kind: 'llm_inference' } }, ['sha256_verify'])).toBe(false);
        expect(supportsTaskKind({ payload: {} }, ['sha256_verify'])).toBe(false);
        expect(supportsTaskKind({ payload: '{"kind":"sha256_verify"}' }, ['sha256_verify'])).toBe(false);
    });

    it('matches explicitly supported task types and rejects unsupported execution types', () => {
        const supported = ['inference', 'embedding', 'verification', 'storage'];
        expect(supportsTaskKind({ type: 'inference', payload: {} }, supported)).toBe(true);
        expect(supportsTaskKind({ type: 'finetune', payload: {} }, supported)).toBe(false);
        expect(supportsTaskKind({ type: 'bridge_verify', payload: {} }, supported)).toBe(false);
        expect(supportsTaskKind({ type: 'custom', payload: { kind: 'sha256_verify' } }, supported)).toBe(false);
    });
});
