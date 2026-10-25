import { describe, expect, it } from 'vitest';
import { parseNodeRecords, dedupeNodeRecords } from './node-status';
describe('registry values', () => {
    it('keeps the freshest identity when a stale named alias shares the URL', () => {
        const current = { node_id: '12345678-1234-0000-0000-000000000000', node_url: 'https://node.example', last_seen: '2026-10-25T01:00:00Z' };
        const stale = { node_id: 'old-alias', node_url: current.node_url, last_seen: '2026-10-24T01:00:00Z' };
        expect(dedupeNodeRecords([stale, current])).toEqual([current]);
    });

    it('ignores version metadata, scalars, arrays, nulls and malformed JSON', () => {
        expect(parseNodeRecords(['3.5.1', '42', 'null', '[]', '{}', '{bad', null,
            JSON.stringify({ node_id: 'actual-node', last_seen: '2026-10-25T00:00:00Z' })]))
            .toEqual([{ node_id: 'actual-node', last_seen: '2026-10-25T00:00:00Z' }]);
    });
});
