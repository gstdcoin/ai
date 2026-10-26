import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { keyPairFromSeed, sign } from '@ton/crypto';
import { kvSet,kvDel } from './kv';
import { nodeKeyRedisKey } from './nodeAuth';
import handler from '../pages/api/v1/nodes/register';
const key = keyPairFromSeed(Buffer.alloc(32, 83));
async function call(body: any, signed = false) {
    const ts = Date.now();
    const headers: any = { 'x-wallet-address': 'uq-registration-owner' };
    if (signed) Object.assign(headers, { 'x-gstd-node-ts': String(ts),
        'x-gstd-node-sig': sign(createHash('sha256').update(`${body.node_id}:${ts}`).digest(), key.secretKey).toString('hex') });
    let status = 200; let value: any;
    await handler({ method: 'POST', body, headers } as any, {
        status(code: number) { status = code; return this; }, json(data: any) { value = data; return this; },
    } as any);
    return { status, value };
}
describe('registration identity', () => {
    it('renews the same signed identity after TTL expiry despite a saturated legacy counter',async()=>{
        const id='restart-survives-ttl';
        await kvSet('wallet_node_count:uq-registration-owner','999');
        const body={node_id:id,node_pubkey:key.publicKey.toString('hex')};
        expect((await call(body,true)).status).toBe(200);
        await kvDel('node:'+id);
        expect((await call(body,true)).status).toBe(200);
    });
    it('does not create an unsigned anonymous identity',async()=>{
        expect((await call({node_id:'anonymous-node'})).status).toBe(403);
    });

    it('rejects unsigned re-registration even when the caller omits the bound public key', async () => {
        const id = 'registration-bound-node';
        await kvSet(nodeKeyRedisKey(id), key.publicKey.toString('hex'), 600);
        expect((await call({ node_id: id })).status).toBe(401);
        expect((await call({ node_id: id }, true)).status).toBe(200);
    });
    it('never rewrites a signed identity from an old URL alias', async () => {
        const url = 'https://node-registration.example';
        await kvSet(`url_idx:${Buffer.from(url).toString('base64url').slice(0, 80)}`, 'old-url-alias', 600);
        const body = { node_id: 'registration-new-node', node_url: url, node_pubkey: key.publicKey.toString('hex') };
        const response = await call(body, true);
        expect(response.status).toBe(200);
        expect(response.value.node_id).toBe(body.node_id);
    });
});
