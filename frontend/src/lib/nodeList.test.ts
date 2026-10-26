import { describe, expect, it, vi } from 'vitest';
vi.mock('./kv', () => ({
    kvKeys: vi.fn(async () => ['node:real', 'node:latest_version', 'node:broken', 'node:scalar']),
    kvGet: vi.fn(async () => '50'),
    kvMGet: vi.fn(async () => [JSON.stringify({ node_id: 'real', last_seen: new Date().toISOString() }), '3.5.0', '{broken', '42']),
    kvSet: vi.fn(async () => {}),
}));
import handler from '../pages/api/v1/nodes/list';
describe('public node registry', () => {
    it('lists live nodes even when the prefix contains version metadata or corrupt records', async () => {
        const json = vi.fn();
        const response = { status: vi.fn().mockReturnThis(), json };
        await handler({ method: 'GET' } as any, response as any);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(json.mock.calls[0][0]).toMatchObject({ count: 1, total_registered: 1, offline_count: 0, registration_events: 50, nodes: [{ node_id: 'real' }] });
    });
});
