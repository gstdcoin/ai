import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {previewFetch} from '../../scripts/preview-fetch.mjs';
import temporary from '../scripts/temporary-upstash.cjs';

test('private preview protects static assets and has no production route or cron',()=>{
    const preview=JSON.parse(readFileSync(new URL('../wrangler.jsonc',import.meta.url),'utf8'));
    const production=JSON.parse(readFileSync(new URL('../wrangler.production.jsonc',import.meta.url),'utf8'));
    assert.equal(preview.vars.GSTD_PRIVATE_PREVIEW,'true');assert.equal(preview.assets.run_worker_first,true);
    assert.deepEqual(preview.triggers.crons,[]);assert.equal(preview.routes,undefined);
    assert.equal(production.vars.GSTD_PRIVATE_PREVIEW,undefined);assert.notEqual(preview.name,production.name);
});
test('provisioning parses official descriptor formats without executing descriptor content',()=>{
    const token='test-only-credential-'.repeat(3),url='https://fixture.upstash.io';
    for(const descriptor of [`**Endpoint:** ${url}\n**Token:** \`${token}\``,`${url}\nREST_TOKEN="${token}"`,`${url}\nAuthorization: Bearer ${token}`]){
        assert.deepEqual(temporary.descriptorCredentials(descriptor),{url,token});
    }
    assert.throws(()=>temporary.descriptorCredentials('https://fixture.invalid\n**Token:** '+token));
});
test('preview capability follows same-origin redirects and never leaves the preview origin',async()=>{
    const original=globalThis.fetch,previous=process.env.GSTD_PREVIEW_ACCESS_KEY,key='a'.repeat(64),calls=[];
    process.env.GSTD_PREVIEW_ACCESS_KEY=key;
    try{
        globalThis.fetch=async(url,options)=>{
            calls.push(String(url));assert.equal(options.headers['x-gstd-preview-key'],key);assert.equal(options.redirect,'manual');
            return new Response(null,{status:302,headers:{location:'https://outside.invalid/path'}});
        };
        await assert.rejects(()=>previewFetch('https://fixture.workers.dev','/'),/cross_origin_redirect_blocked/);
        assert.deepEqual(calls,['https://fixture.workers.dev/']);
        calls.length=0;
        globalThis.fetch=async(url,options)=>{
            calls.push(String(url));assert.equal(options.headers['x-gstd-preview-key'],key);
            return calls.length===1?new Response(null,{status:302,headers:{location:'/en'}}):new Response('ok');
        };
        assert.equal((await previewFetch('https://fixture.workers.dev','/')).status,200);
        assert.deepEqual(calls,['https://fixture.workers.dev/','https://fixture.workers.dev/en']);
        await assert.rejects(()=>previewFetch('https://app.gstdtoken.xyz','/'),/invalid_private_preview_request/);
    }finally{
        globalThis.fetch=original;
        if(previous===undefined)delete process.env.GSTD_PREVIEW_ACCESS_KEY;else process.env.GSTD_PREVIEW_ACCESS_KEY=previous;
    }
});
