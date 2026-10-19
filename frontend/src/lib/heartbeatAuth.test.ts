import { describe, it, expect } from 'vitest';
import { kvSet } from './kv';
import { signedHeaders, type WorkerIdentity } from './browserWorker';
import heartbeat from '../pages/api/v1/nodes/heartbeat';
import { nodeKeyRedisKey } from './nodeAuth';

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');

function call(body: any, headers: Record<string, any> = {}): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
        const res: any = {
            statusCode: 200,
            status(c: number) { this.statusCode = c; return this; },
            json(j: any) { resolve({ status: this.statusCode, json: j }); return this; },
        };
        Promise.resolve(heartbeat({ method: 'POST', body, headers: { 'x-forwarded-for': '203.0.113.9', ...headers }, query: {} } as any, res)).catch(reject);
    });
}

describe('heartbeat authentication', () => {
    it('requires a signature once a node has a bound key', async () => {
        const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify'])) as CryptoKeyPair;
        const pubkeyHex = hex(await crypto.subtle.exportKey('raw', kp.publicKey));
        const id: WorkerIdentity = { nodeId: `web-${pubkeyHex.slice(0, 16)}`, pubkeyHex, privateKey: kp.privateKey };
        await kvSet(nodeKeyRedisKey(id.nodeId), pubkeyHex, 600);

        expect((await call({ node_id: id.nodeId })).status).toBe(401);
        const sigHeaders = Object.fromEntries(Object.entries(await signedHeaders(id, 'UQtest')).map(([k, v]) => [k.toLowerCase(), v]));
        expect((await call({ node_id: id.nodeId }, sigHeaders)).status).toBe(200);
    });

    it('keeps accepting unbound legacy nodes', async () => {
        const r = await call({ node_id: `legacy${Math.random().toString(16).slice(2, 10)}` });
        expect(r.status).toBe(200);
    });
});
