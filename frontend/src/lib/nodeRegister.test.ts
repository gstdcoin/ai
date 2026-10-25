import { describe, expect, it } from 'vitest';
import { normalizeNodeCapabilities } from '../pages/api/v1/nodes/register';

describe('node registration capabilities', () => {
    it('preserves capabilities supplied as an array by A2A and browser workers', () => {
        expect(normalizeNodeCapabilities({
            capabilities: ['text-processing', 'data-validation'],
        })).toEqual(['text-processing', 'data-validation']);
    });

    it('supports the legacy nested models and top-level models formats', () => {
        expect(normalizeNodeCapabilities({
            capabilities: { models: ['llama3'] },
        })).toEqual(['llama3']);
        expect(normalizeNodeCapabilities({ models: ['inference'] })).toEqual(['inference']);
    });

    it('ignores invalid capability values', () => {
        expect(normalizeNodeCapabilities({ capabilities: [1, 'inference', null] }))
            .toEqual(['inference']);
        expect(normalizeNodeCapabilities({ capabilities: { models: 'inference' } }))
            .toEqual([]);
    });
});
