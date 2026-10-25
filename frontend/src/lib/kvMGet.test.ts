import { afterEach, describe, expect, it, vi } from 'vitest';
const { mget } = vi.hoisted(() => ({ mget: vi.fn() }));
vi.mock('@upstash/redis/cloudflare', () => ({ Redis: class { mget = mget; } }));
import { kvMGet } from './kv';
afterEach(() => vi.unstubAllEnvs());
describe('Redis multi-get serialization', () => {
    it('preserves SDK-decoded objects as JSON, alongside strings and missing keys', async () => {
        vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
        vi.stubEnv('KV_REST_API_TOKEN', 'test');
        mget.mockResolvedValue([{ node_id: 'real-node', capabilities: ['inference'] }, '3.5.0', null]);
        const values = await kvMGet(['node:real-node', 'node:latest_version', 'missing']);
        expect(JSON.parse(values[0]!)).toEqual({ node_id: 'real-node', capabilities: ['inference'] });
        expect(values.slice(1)).toEqual(['3.5.0', null]);
    });
});
