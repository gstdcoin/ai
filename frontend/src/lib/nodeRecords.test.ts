import { describe, expect, it } from 'vitest';
import { parseNodeRecords } from './node-status';
describe('registry values', () => {
    it('ignores version metadata, scalars, arrays, nulls and malformed JSON', () => {
        expect(parseNodeRecords(['3.5.1', '42', 'null', '[]', '{}', '{bad', null,
            JSON.stringify({ node_id: 'actual-node', last_seen: '2026-10-25T00:00:00Z' })]))
            .toEqual([{ node_id: 'actual-node', last_seen: '2026-10-25T00:00:00Z' }]);
    });
});
