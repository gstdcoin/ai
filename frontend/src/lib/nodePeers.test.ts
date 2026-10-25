import { describe, expect, it, vi } from 'vitest';
vi.mock('./kv', () => ({
    kvKeys: vi.fn(async () => ['node:old', 'node:current', 'node:metadata']),
    kvMGet: vi.fn(async () => [
        JSON.stringify({ node_id: 'old', node_url: 'https://node.example', multiaddrs: ['https://node.example'], last_seen: new Date(Date.now() - 5000).toISOString() }),
        JSON.stringify({ node_id: 'current', node_url: 'https://node.example', multiaddrs: ['https://node.example', 'https://node.example'], last_seen: new Date().toISOString() }),
        '3.5.4',
    ]),
}));
import handler from '../pages/api/v1/nodes/peers';
describe('public bootstrap peers', () => {
    it('advertises the freshest identity once when historical aliases share its endpoint', async () => {
        const json = vi.fn();
        const response = { status: vi.fn().mockReturnThis(), json };
        await handler({ method: 'GET' } as any, response as any);
        expect(response.status).toHaveBeenCalledWith(200);
        expect(json.mock.calls[0][0]).toMatchObject({
            count: 1, peers: [{ node_id: 'current' }], addrs: ['https://node.example'],
        });
    });
});
