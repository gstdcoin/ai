import { afterEach, describe, expect, it, vi } from 'vitest';
const { mget, rpop } = vi.hoisted(() => ({ mget: vi.fn(), rpop: vi.fn() }));
vi.mock('@upstash/redis/cloudflare', () => ({ Redis: class { mget = mget; rpop = rpop; } }));
import { kvMGet, kvPop } from './kv';
afterEach(() => vi.unstubAllEnvs());
describe('Redis multi-get serialization', () => {
    it('preserves decoded queued task payloads rather than silently discarding them', async () => {
        vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
        vi.stubEnv('KV_REST_API_TOKEN', 'test');
        const task = { task_id: 'task-1', type: 'inference', payload: { prompt: 'hello' } };
        rpop.mockResolvedValue(task);
        expect(JSON.parse((await kvPop('tasks:queue'))!)).toEqual(task);
    });
    it('preserves SDK-decoded objects as JSON, alongside strings and missing keys', async () => {
        vi.stubEnv('KV_REST_API_URL', 'https://example.upstash.io');
        vi.stubEnv('KV_REST_API_TOKEN', 'test');
        mget.mockResolvedValue([{ node_id: 'real-node', capabilities: ['inference'] }, '3.5.0', null]);
        const values = await kvMGet(['node:real-node', 'node:latest_version', 'missing']);
        expect(JSON.parse(values[0]!)).toEqual({ node_id: 'real-node', capabilities: ['inference'] });
        expect(values.slice(1)).toEqual(['3.5.0', null]);
    });
});
