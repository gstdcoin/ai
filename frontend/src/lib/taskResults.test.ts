import { beforeEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';
import { kvGet, kvSet } from './kv';
import { nodeKeyRedisKey } from './nodeAuth';
import { assignTaskToNode } from './task-assignment';
import resultHandler from '../pages/api/v1/tasks/result';
import completeHandler from '../pages/api/v1/tasks/complete';

const nodeId = 'result-owner';
const wallet = 'uq-result-owner';
const key = keyPairFromSeed(Buffer.alloc(32, 71));
const headers = () => {
    const ts = Date.now();
    return { 'x-wallet-address': wallet, 'x-gstd-node-ts': String(ts),
        'x-gstd-node-sig': sign(createHash('sha256').update(`${nodeId}:${ts}`).digest(), key.secretKey).toString('hex') };
};
async function call(handler: any, method: string, body: any, requestHeaders: any = headers()) {
    let status = 200; let value: any;
    const res = { status(code: number) { status = code; return this; }, json(data: any) { value = data; return this; } };
    await handler({ method, body, query: { task_id: body.task_id }, headers: requestHeaders }, res);
    return { status, value };
}
beforeEach(async () => {
    await kvSet(nodeKeyRedisKey(nodeId), key.publicKey.toString('hex'), 600);
    await kvSet(`node:${nodeId}`, JSON.stringify({ node_id: nodeId, wallet_address: wallet, tasks_completed: 0, gstd_earned: 0 }), 600);
});
describe('assigned task result delivery', () => {
    it('rejects unsigned and unassigned result injection', async () => {
        const body = { task_id: 'unassigned-result', node_id: nodeId, result: 'forged' };
        expect((await call(resultHandler, 'POST', body, { 'x-wallet-address': wallet })).status).toBe(401);
        expect((await call(resultHandler, 'POST', body)).status).toBe(409);
        expect((await call(resultHandler, 'GET', body)).value).toEqual({ ready: false });
    });
    it('delivers an assigned signed result without crediting unaccepted work', async () => {
        const taskId = 'signed-result-delivery';
        await assignTaskToNode({ task_id: taskId, type: 'inference' }, nodeId, 600);
        const body = { task_id: taskId, node_id: nodeId, result: { response: 'GSTD_OK' } };
        expect((await call(resultHandler, 'POST', body)).status).toBe(200);
        expect((await call(resultHandler, 'GET', body)).value).toMatchObject({ ready: true, result: { response: 'GSTD_OK' } });
        expect(JSON.parse((await kvGet(`node:${nodeId}`))!).tasks_completed).toBe(0);
    });
    it('makes completion-only results retrievable and credits an unfunded task zero', async () => {
        const taskId = 'completion-result-delivery';
        await assignTaskToNode({ task_id: taskId, type: 'inference' }, nodeId, 600);
        const body = { task_id: taskId, node_id: nodeId, result: 'GSTD_E2E_OK' };
        const completed = await call(completeHandler, 'POST', body);
        expect(completed.status).toBe(200);
        expect(completed.value.reward_gstd).toBe(0);
        expect((await call(resultHandler, 'GET', body)).value).toMatchObject({ ready: true, result: 'GSTD_E2E_OK' });
        expect(JSON.parse((await kvGet(`node:${nodeId}`))!)).toMatchObject({ tasks_completed: 1, gstd_earned: 0 });
    });
});
