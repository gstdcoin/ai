/* Run against disposable local Redis, never the production Upstash instance. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const Module = require('node:module');
const ts = require('typescript');
const serverBin = process.env.MONEY_REDIS_SERVER || 'redis-server';
const cliBin = process.env.MONEY_REDIS_CLI || 'redis-cli';
const directory = fs.mkdtempSync(path.join(os.tmpdir(),'gstd-money-redis-'));
const socket = path.join(directory,'redis.sock');
const server = spawn(serverBin,['--port','0','--unixsocket',socket,'--save','','--appendonly','no'],{stdio:'ignore'});
const serverError = new Promise((_,reject)=>server.once('error',reject));
function command(...args) {
    return JSON.parse(execFileSync(cliBin,['-s',socket,'--json',...args.map(String)],{encoding:'utf8'}));
}
class Redis {
    async mget(...keys) {
        return command('MGET',...keys).map(value=>{
            if(value===null)return null;
            try{return JSON.parse(value);}catch{return value;}
        });
    }
    async get(key) { const value=command('GET',key);try{return JSON.parse(value);}catch{return value;} }
    async eval(script,keys,args) { return command('EVAL',script,keys.length,...keys,...args); }
    async zrange(key,min,max,opts) { return command('ZRANGEBYSCORE',key,min,max,'LIMIT',opts.offset,opts.count); }
}
const originalLoad = Module._load;
Module._load = function(request,parent,isMain) {
    if(request==='@upstash/redis/cloudflare')return {Redis};
    return originalLoad.call(this,request,parent,isMain);
};
require.extensions['.ts']=(module,filename)=>{
    const source=fs.readFileSync(filename,'utf8');
    module._compile(ts.transpileModule(source,{compilerOptions:{
        module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true
    }}).outputText,filename);
};
process.env.NODE_ENV='production'; // Redis failures must throw; memory fallback cannot mask a broken Lua script.
process.env.KV_REST_API_URL='https://isolated-money-test.invalid';
process.env.KV_REST_API_TOKEN='isolated-test';
async function run() {
    for(let n=0;!fs.existsSync(socket);n++) {
        if(n>200)throw new Error('Local Redis did not start');
        await Promise.race([new Promise(resolve=>setTimeout(resolve,10)),serverError]);
    }
    const m=require('../src/lib/money.ts');
    const payer='0:'+'11'.repeat(32),operator='0:'+'22'.repeat(32),custody='0:'+'33'.repeat(32);
    await m.reconcileMoney({owner:custody,jettonWallet:custody,reserve:m.nano('1000000000').toString()},
        {manifest:'redis-inventory',legacyHold:'0',migrationReviewed:true,
         allocations:[{wallet:payer,amount_nano:m.nano('100000001').toString(),reference:'redis-funding'}]});
    const races=await Promise.all(Array.from({length:8},()=>m.reserveMoney(payer,'race',m.nano('100000000'),'same',Date.now()+60_000)));
    assert.equal(races.filter(x=>x.acquired).length,1);
    await m.captureMoney('race',operator,{answer:'accepted'});
    assert.equal((await m.moneyBalance(operator)).pending_nano,'85000000000000000');
    assert.deepEqual(JSON.parse(command('GET','money:v2:fund:protocol')),{nano:'10000000000000000'});
    const claim=await m.claimMoney(operator);
    assert.equal(claim.amount,85000000000000000n);
    await m.captureMoney('race',operator,{answer:'retry'});
    assert.equal((await m.moneyBalance(operator)).pending_nano,'0');
    // CAS + queue type failure must not leave a half-reserved campaign task.
    await m.reserveMoney(payer,'campaign:test',m.nano('1'),'campaign',Date.now()+60_000,'campaign',
        {key:'campaign:test',value:JSON.stringify({remaining_budget:1})});
    command('SET','tasks:queue','wrong-type');
    await assert.rejects(()=>m.reserveCampaignTask('test',{task_id:'child'},m.nano('0.001'),Date.now()+30_000,{}));
    assert.equal((await m.moneyJob('campaign:test')).available,'1000000000');
    assert.equal(await m.moneyJob('child'),null);
    command('DEL','tasks:queue');
    await m.reserveCampaignTask('test',{task_id:'child'},m.nano('0.001'),Date.now()+30_000,{});
    assert.equal(command('LLEN','tasks:queue'),1);
    await m.releaseMoney('child');
    await m.releaseMoney('campaign:test');
    assert.equal((await m.moneyBalance(payer)).available_nano,'1000000000');
    assert.equal((await m.moneyBalance(payer)).reserved_nano,'0');
    const snapshot=command('GET','money:v2:account:'+payer);
    // A storage fault fails closed in production.
    command('SET','money:v2:due','wrong-type');
    await assert.rejects(()=>m.reserveMoney(payer,'failure',1n,'bad',Date.now()+60_000));
    assert.equal(command('GET','money:v2:account:'+payer),snapshot);
    // Exercise the production empty-ledger bootstrap Lua against the disposable database.
    const bootstrap=fs.readFileSync(path.join(__dirname,'../../scripts/bootstrap-empty-money.mjs'),'utf8');
    const lua=bootstrap.match(/const script=`([\s\S]*?)`;/)[1];
    const initialise=()=>command('EVAL',lua,2,'money:v2:system','money:v2:inventory:bootstrap','{"allocated":"0"}','{"kind":"empty"}');
    command('FLUSHDB');
    assert.equal(initialise(),'initialised_empty');
    assert.equal(initialise(),'already_initialised');
    command('FLUSHDB');command('SET','balance:legacy','1');
    assert.equal(initialise(),'nonempty_legacy_requires_review');
    assert.equal(command('GET','money:v2:system'),null);
    command('FLUSHDB');command('SET','money:v2:account:legacy','{"available":"1","pending":"0","reserved":"0"}');
    assert.equal(initialise(),'nonempty_v2_requires_review');
    command('FLUSHDB');command('SET','money:v2:account:promo','{"available":"0","pending":"0","reserved":"0","promo":"5"}');
    assert.equal(initialise(),'initialised_empty');
    console.log('Redis production-path money checks passed: CAS races, exact amounts above 2^53, atomic capture/claim, queue rollback, fail-closed storage.');
}
run().then(()=>{process.exitCode=0;},error=>{console.error(error);process.exitCode=1;}).finally(async()=>{
    server.kill('SIGTERM');
    await new Promise(resolve=>{if(server.exitCode!==null)return resolve();server.once('exit',resolve);setTimeout(resolve,2000);});
    Module._load=originalLoad;
    if(directory.startsWith(path.join(os.tmpdir(),'gstd-money-redis-')))fs.rmSync(directory,{recursive:true,force:true});
});
