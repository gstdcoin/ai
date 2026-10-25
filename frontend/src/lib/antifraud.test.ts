import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';

const store = new Map<string, string>();
const queue: string[] = [];

vi.mock('./kv', () => ({
    kvSetNX: vi.fn(async (k: string, v: string) => {
        if (store.has(k)) return false;
        store.set(k, v);
        return true;
    }),
    kvGet: vi.fn(async (k: string) => store.get(k) ?? null),
    kvPush: vi.fn(async (_k: string, v: string) => { queue.push(v); }),
    kvLLen: vi.fn(async () => queue.length),
    kvIncr: vi.fn(async () => 1),
}));

import { assignTaskToNode } from './task-assignment';
import { verifyNodeSignature, bindNodeKey } from './nodeAuth';
import submit from '../pages/api/v1/tasks/submit';

function call(handler: any, body: any) {
    const res: any = { statusCode: 0, body: null };
    res.status = (c: number) => { res.statusCode = c; return res; };
    res.json = (b: any) => { res.body = b; return res; };
    return handler({ method: 'POST', body } as any, res).then(() => res);
}

beforeEach(() => { store.clear(); queue.length = 0; });

describe('task rewards', () => {
    it('ignores payload.reward_gstd and defaults to zero', async () => {
        await assignTaskToNode({ task_id: 't1', payload: { reward_gstd: 50 } }, 'n1', 60);
        expect(JSON.parse(store.get('task_assigned:t1')!).reward_gstd).toBe(0);
    });

    it('uses and caps the server-side reward', async () => {
        await assignTaskToNode({ task_id: 't2', reward_gstd: 1000 }, 'n1', 60);
        expect(JSON.parse(store.get('task_assigned:t2')!).reward_gstd).toBe(50);
    });

    it('assigns a task only once', async () => {
        expect(await assignTaskToNode({ task_id: 't3' }, 'n1', 60)).toBe(true);
        expect(await assignTaskToNode({ task_id: 't3' }, 'n2', 60)).toBe(false);
    });
});

describe('tasks/submit', () => {
    it('rejects unknown types and non-object payloads', async () => {
        expect((await call(submit, { type: 'bogus', payload: {} })).statusCode).toBe(400);
        expect((await call(submit, { type: 'custom', payload: [] })).statusCode).toBe(400);
    });

    it('rejects oversized payloads', async () => {
        const res = await call(submit, { type: 'custom', payload: { x: 'a'.repeat(20_000) } });
        expect(res.statusCode).toBe(413);
    });

    it('strips reward and job fields and clamps priority', async () => {
        const res = await call(submit, {
            type: 'inference', priority: 99,
            payload: { prompt: 'hi', reward_gstd: 50, job_id: 'j', shard_id: 's' },
        });
        expect(res.statusCode).toBe(200);
        const task = JSON.parse(queue[0]);
        expect(task.payload).toEqual({ prompt: 'hi' });
        expect(task.priority).toBe(10);
    });

    it('returns 503 when the queue is full', async () => {
        for (let i = 0; i < 500; i++) queue.push('{}');
        expect((await call(submit, { type: 'custom', payload: {} })).statusCode).toBe(503);
    });
});

describe('node identity', () => {
    const kp = keyPairFromSeed(Buffer.alloc(32, 7));
    const pub = kp.publicKey.toString('hex');
    const signFor = (id: string, ts: number) =>
        Buffer.from(sign(createHash('sha256').update(`${id}:${ts}`).digest(), kp.secretKey)).toString('hex');

    it('accepts a fresh valid signature', () => {
        const ts = Date.now();
        expect(verifyNodeSignature('node-1', pub, ts, signFor('node-1', ts))).toBe(true);
    });

    it('rejects stale, wrong-node and malformed signatures', () => {
        const old = Date.now() - 120_000;
        expect(verifyNodeSignature('node-1', pub, old, signFor('node-1', old))).toBe(false);
        const ts = Date.now();
        expect(verifyNodeSignature('node-2', pub, ts, signFor('node-1', ts))).toBe(false);
        expect(verifyNodeSignature('node-1', pub, ts, 'zz')).toBe(false);
    });

    it('binds a key on first use and refuses a different key', async () => {
        expect(await bindNodeKey('node-1', pub)).toBe(true);
        expect(await bindNodeKey('node-1', pub)).toBe(true);
        expect(await bindNodeKey('node-1', 'a'.repeat(64))).toBe(false);
    });
});
