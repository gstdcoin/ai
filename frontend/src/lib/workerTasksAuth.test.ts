import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';

const { store, queues, kvPop, kvPush, kvSetNX, kvCompleteAssignedTask } = vi.hoisted(() => ({
    store: new Map<string, string>(),
    queues: new Map<string, string[]>(),
    kvPop: vi.fn(async (key: string) => queues.get(key)?.shift() ?? null),
    kvPush: vi.fn(async (key: string, value: string) => {
        const queue = queues.get(key) ?? [];
        queue.push(value);
        queues.set(key, queue);
    }),
    kvSetNX: vi.fn(async (key: string, value: string) => {
        if (store.has(key)) return false;
        store.set(key, value);
        return true;
    }),
    kvCompleteAssignedTask: vi.fn(async () => ({
        status: 'ok' as const,
        assignment: JSON.stringify({ reward_gstd: 0, protocol_fee_gstd: 0 }),
    })),
}));

vi.mock('./kv', () => ({
    kvGet: vi.fn(async (key: string) => store.get(key) ?? null),
    kvSet: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    kvIncr: vi.fn(async () => 1),
    kvIncrByFloat: vi.fn(async () => 1),
    kvSetNX,
    kvPop,
    kvPush,
    kvCompleteAssignedTask,
}));

import pending from '../pages/api/v1/tasks/worker/pending';
import submit from '../pages/api/v1/tasks/worker/submit';
import poll from '../pages/api/v1/tasks/poll';

const nodeId = 'node-test-1';
const wallet = 'UQtest';
const keyPair = keyPairFromSeed(Buffer.alloc(32, 19));
const publicKey = keyPair.publicKey.toString('hex');

function call(
    handler: (req: any, res: any) => Promise<unknown>,
    method: string,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
): Promise<{ status: number; json: unknown }> {
    return new Promise((resolve, reject) => {
        const res: any = {
            statusCode: 200,
            status(code: number) { this.statusCode = code; return this; },
            json(json: unknown) { resolve({ status: this.statusCode, json }); return this; },
        };
        Promise.resolve(handler({
            method,
            body,
            query: { node_id: nodeId },
            headers: { 'x-wallet-address': wallet, ...headers },
        }, res)).catch(reject);
    });
}

function signedHeaders(): Record<string, string> {
    const timestamp = Date.now();
    const message = createHash('sha256').update(`${nodeId}:${timestamp}`).digest();
    return {
        'x-gstd-node-ts': String(timestamp),
        'x-gstd-node-sig': Buffer.from(sign(message, keyPair.secretKey)).toString('hex'),
    };
}

beforeEach(() => {
    store.clear();
    queues.clear();
    kvPop.mockClear();
    kvPush.mockClear();
    kvSetNX.mockClear();
    kvCompleteAssignedTask.mockClear();
    store.set(`node:${nodeId}`, JSON.stringify({ node_id: nodeId, wallet_address: wallet, capabilities: [] }));
    store.set('task_assigned:task-1', JSON.stringify({node_id:nodeId,reward_gstd:0,protocol_fee_gstd:0}));
});

describe('legacy worker task routes', () => {
    it('rejects unbound legacy identities before polling the task queue', async () => {
        const response = await call(pending, 'GET', {});
        expect(response.status).toBe(403);
        expect(kvPop).not.toHaveBeenCalled();
    });

    it('requires a fresh identity signature before polling for bound nodes', async () => {
        store.set(`node_key:${nodeId}`, publicKey);
        const response = await call(pending, 'GET', {});
        expect(response.status).toBe(401);
        expect(kvPop).not.toHaveBeenCalled();
    });

    it('rejects empty results before consuming an assignment', async () => {
        store.set(`node_key:${nodeId}`, publicKey);
        const response = await call(submit, 'POST', {
            task_id: 'task-1',
            node_id: nodeId,
            result: {},
        }, signedHeaders());
        expect(response.status).toBe(422);
        expect(kvCompleteAssignedTask).not.toHaveBeenCalled();
    });

    it('requires a fresh identity signature before completing bound-node work', async () => {
        store.set(`node_key:${nodeId}`, publicKey);
        const response = await call(submit, 'POST', {
            task_id: 'task-1',
            node_id: nodeId,
            result: { output: 'done' },
        });
        expect(response.status).toBe(401);
        expect(kvCompleteAssignedTask).not.toHaveBeenCalled();
    });

    it('accepts a valid signature and non-empty result for a bound node', async () => {
        store.set(`node_key:${nodeId}`, publicKey);
        const response = await call(submit, 'POST', {
            task_id: 'task-1',
            node_id: nodeId,
            result: { output: 'done' },
        }, signedHeaders());
        expect(response.status).toBe(200);
        expect(kvCompleteAssignedTask).toHaveBeenCalledOnce();
    });

    it('leaves unsupported tasks queued and gives browser workers only verification probes', async () => {
        store.set(`node_key:${nodeId}`, publicKey);
        const ordinaryTask = JSON.stringify({
            task_id: 'inference-1',
            type: 'inference',
            payload: { prompt: 'not supported in browser' },
        });
        queues.set(`tasks:inference:${nodeId}`, [ordinaryTask]);
        queues.set('tasks:queue', [ordinaryTask]);

        const response = await call(poll, 'POST', {
            node_id: nodeId,
            capabilities: ['browser-sha256-verify'],
            supported_task_kinds: ['sha256_verify'],
            resources: { cpu_cores: 2 },
        }, signedHeaders()) as { status: number; json: { task?: any; source?: string } };

        expect(response.status).toBe(200);
        expect(response.json.source).toBe('probe');
        expect(response.json.task.payload.kind).toBe('sha256_verify');
        expect(response.json.task.expected_hash).toBeUndefined();
        expect(queues.get(`tasks:inference:${nodeId}`)).toEqual([ordinaryTask]);
        expect(queues.get('tasks:queue')).toEqual([ordinaryTask]);
    });
});
