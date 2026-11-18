import {test} from 'node:test';
import assert from 'node:assert/strict';
import {beginCell} from '@ton/core';
import {runtimeSecretPayload} from '../../scripts/production-runtime-secrets.mjs';
const base={KV_REST_API_URL:'https://fixture.upstash.io',KV_REST_API_TOKEN:'test-fixture-token',OPEN_INTELLIGENCE_CRON_SECRET:'test-fixture-cron'};
const key='test-fixture-owner-rpc';
const result=network=>new Response(JSON.stringify({ok:true,result:{config:{bytes:beginCell().storeInt(network,32).endCell().toBoc().toString('base64')}}}));
test('absent optional RPC input preserves existing Worker bindings',async()=>{
    assert.deepEqual(await runtimeSecretPayload({...base,UNRELATED_PRIVATE_KEY:'not-exported'},()=>{throw Error('unexpected probe');}),base);
});
test('a supplied key is probed read-only on fixed mainnet before forwarding',async()=>{
    const payload=await runtimeSecretPayload({...base,ESCROW_MAINNET_TONCENTER_API_KEY:key},async(url,options)=>{
        assert.equal(url,'https://toncenter.com/api/v2/getConfigParam?config_id=19');
        assert.equal(options.headers['X-API-Key'],key);assert.equal(options.body,undefined);assert.equal(options.redirect,'error');
        return result(-239);
    });
    assert.deepEqual(payload,{...base,ESCROW_MAINNET_TONCENTER_API_KEY:key});
});
test('invalid credentials or Testnet config cannot be published as mainnet RPC',async()=>{
    for(const response of [new Response('{}',{status:401}),result(-3)]){
        await assert.rejects(()=>runtimeSecretPayload({...base,ESCROW_MAINNET_TONCENTER_API_KEY:key},async()=>response));
    }
});
