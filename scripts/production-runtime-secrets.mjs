// Stdout is piped directly to wrangler secret bulk, never to a log or file.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {Cell}=require('@ton/core');
export async function runtimeSecretPayload(env,fetcher=fetch){
    const payload={};
    for(const name of ['KV_REST_API_URL','KV_REST_API_TOKEN','OPEN_INTELLIGENCE_CRON_SECRET']){
        if(typeof env[name]!=='string'||!env[name]||/[\r\n]/.test(env[name]))throw Error('missing_runtime_secret');
        payload[name]=env[name];
    }
    const key=env.ESCROW_MAINNET_TONCENTER_API_KEY?.trim();
    // Missing optional input must never erase an existing Worker binding.
    if(key){
        if(key.length>4096||/[\r\n]/.test(key))throw Error('invalid_mainnet_rpc_key');
        const response=await fetcher('https://toncenter.com/api/v2/getConfigParam?config_id=19',{
            headers:{'X-API-Key':key},signal:AbortSignal.timeout(10000),redirect:'error'});
        if(!response.ok)throw Error('mainnet_rpc_read_probe_failed');
        const data=await response.json(),bytes=data.result?.config?.bytes;
        if(data.ok!==true||typeof bytes!=='string'||bytes.length>100000
            ||Cell.fromBase64(bytes).beginParse().loadInt(32)!==-239)throw Error('mainnet_rpc_network_mismatch');
        payload.ESCROW_MAINNET_TONCENTER_API_KEY=key;
    }
    return payload;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    try{
        if(process.env.GITHUB_ACTIONS!=='true'||process.stdout.isTTY)throw Error('workflow_pipe_required');
        process.stdout.write(JSON.stringify(await runtimeSecretPayload(process.env)));
    }
    catch{console.error('Production runtime secret validation failed; no credentials were emitted.');process.exitCode=1;}
}
