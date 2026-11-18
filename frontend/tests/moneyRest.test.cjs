const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Redis } = require('@upstash/redis/cloudflare');
const http = require('node:http');
const {randomUUID} = require('node:crypto');
const {createTemporaryRedis} = require('../scripts/temporary-upstash.cjs');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    module._compile(outputText, filename);
};

let stage = 'provision';
let proxy,offline=false,loseCommitReply=false,cutReplies=0;
async function run() {
    const {url,token}=await createTemporaryRedis();
    // A real transport fault injector, not an SDK/Redis substitute. Successful
    // responses come unchanged from this newly created remote database only.
    proxy=http.createServer(async(req,res)=>{
        try{
            if(req.method!=='POST'||!['/','/pipeline','/multi-exec'].includes(req.url)
                || req.headers.authorization!==`Bearer ${token}`){res.writeHead(403).end();return;}
            const chunks=[];let bytes=0;
            for await(const chunk of req){bytes+=chunk.length;if(bytes>524288)throw Error('body_limit');chunks.push(chunk);}
            if(offline){res.destroy();return;}
            const body=Buffer.concat(chunks);
            const headers={'Authorization':`Bearer ${token}`,'Content-Type':'application/json'};
            if(req.headers['upstash-encoding'])headers['Upstash-Encoding']=req.headers['upstash-encoding'];
            if(req.headers['upstash-sync-token'])headers['Upstash-Sync-Token']=req.headers['upstash-sync-token'];
            const response=await fetch(url+req.url,{method:'POST',headers,body,redirect:'error',signal:AbortSignal.timeout(15000)});
            const data=Buffer.from(await response.arrayBuffer());
            if(loseCommitReply && /"EVAL"/i.test(body.toString())){cutReplies++;res.destroy();return;}
            const replyHeaders={'Content-Type':'application/json'};
            if(response.headers.has('upstash-sync-token'))replyHeaders['Upstash-Sync-Token']=response.headers.get('upstash-sync-token');
            res.writeHead(response.status,replyHeaders).end(data);
        }catch{res.destroy();}
    });
    await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(0,'127.0.0.1',resolve);});
    stage = 'verify_empty';
    const localUrl=`http://127.0.0.1:${proxy.address().port}`;
    const redis = new Redis({ url:localUrl, token });
    assert.equal(await redis.ping(), 'PONG');
    assert.equal(await redis.dbsize(), 0);
    process.env.NODE_ENV = 'production';
    process.env.KV_REST_API_URL = localUrl;
    process.env.KV_REST_API_TOKEN = token;

    stage = 'signed_assignment_state';
    const kv = require('../src/lib/kv.ts');
    stage='lease_races';
    const key='smoke:lease',owners=Array.from({length:16},()=>randomUUID());
    const leases=await Promise.all(owners.map(owner=>redis.set(key,owner,{nx:true,px:5000})));
    assert.equal(leases.filter(value=>value==='OK').length,1);
    const winner=owners[leases.findIndex(value=>value==='OK')];
    const release=`if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0`;
    assert.equal(await redis.eval(release,[key],['stale-owner']),0);
    assert.equal(await redis.eval(release,[key],[winner]),1);
    await redis.set(key,'expired-owner',{nx:true,px:50});
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.equal(await redis.set(key,'new-owner',{nx:true,px:5000}),'OK');
    assert.equal(await redis.eval(release,[key],['expired-owner']),0);
    await redis.del(key);

    stage='testnet_transaction_round_trip';
    // Public, confirmed v2 refund from contracts/docs/evidence; this is not
    // interpreted as a production withdrawal or a synthetic ledger deposit.
    const txHash='5318a28af74bcf78313d6692af4f65696691899ccbe083545488eda3252aeda5';
    const txResponse=await fetch('https://testnet.tonapi.io/v2/blockchain/transactions/'+txHash,{signal:AbortSignal.timeout(15000),redirect:'error'});
    assert.equal(txResponse.status,200);const tx=await txResponse.json();
    assert.equal(tx.hash,txHash);assert.equal(tx.success,true);
    const txKey='smoke:testnet:transaction',prepared=JSON.stringify({network:-3,hash:txHash,status:'submitted'});
    assert.equal(await kv.kvMoneyCAS({[txKey]:null},{[txKey]:prepared},undefined,undefined,{[txKey]:60}),true);
    const confirmed=JSON.stringify({network:-3,hash:txHash,status:'confirmed'});
    assert.equal(await kv.kvMoneyCAS({[txKey]:prepared},{[txKey]:confirmed},undefined,undefined,{[txKey]:60}),true);
    assert.deepEqual(JSON.parse(await kv.kvGet(txKey)),{network:-3,hash:txHash,status:'confirmed'});
    await redis.set('node:fixture', { wallet_address: 'wallet' }, { ex: 120 });
    await redis.set('task_assigned:fixture', { node_id: 'fixture' }, { ex: 120 });
    assert.equal(await kv.kvRecordAssignedTaskFailure('fixture', 'fixture', 'other'), 'invalid');
    const reports = await Promise.all(Array.from({ length: 8 }, () => kv.kvRecordAssignedTaskFailure('fixture', 'fixture', 'wallet')));
    assert.equal(reports.filter(status => status === 'recorded').length, 1);
    assert.equal(reports.filter(status => status === 'duplicate').length, 7);

    stage = 'initial_ledger';
    const money = require('../src/lib/money.ts');
    const { MAINNET_ESCROW } = require('../src/lib/mainnetEscrowManifest.ts');
    const payer = '0:' + '11'.repeat(32), executor = '0:' + '22'.repeat(32), custody = '0:' + '33'.repeat(32);
    await money.reconcileMoney({ owner: custody, jettonWallet: custody, reserve: money.nano('1000').toString() }, {
        manifest: 'temporary-zero-budget-test', legacyHold: '0', migrationReviewed: true,
        allocations: [{ wallet: payer, amount_nano: money.nano('101').toString(), reference: 'synthetic-inventory' }],
    });
    stage = 'concurrent_reservation';
    const expiry = Date.now() + 180_000;
    const attempts = await Promise.all(Array.from({ length: 8 }, () => money.reserveMoney(payer, 'race', money.nano('100'), 'identical', expiry, 'task')));
    assert.equal(attempts.filter(job => job.acquired).length, 1);
    stage = 'capture_and_retry';
    const result = { answer: 'synthetic-check' };
    await money.captureMoney('race', executor, result);
    await money.captureMoney('race', executor, result);
    await assert.rejects(() => money.captureMoney('race', executor, { answer: 'changed' }), /idempotency_conflict/);
    const worker = await money.moneyBalance(executor);
    const protocol = await money.moneyBalance(MAINNET_ESCROW.protocol);
    const reserve = await redis.get('money:v2:fund:reserve');
    assert.equal(worker.pending_nano, money.nano('85').toString());
    assert.equal(protocol.available_nano, money.nano('10').toString());
    assert.equal(reserve.nano, money.nano('5').toString());
    stage = 'refund';
    await money.reserveMoney(payer, 'refund', money.nano('1'), 'refundable', expiry, 'task');
    await money.releaseMoney('refund');
    const refund = await money.moneyBalance(payer);
    assert.equal(refund.available_nano, money.nano('1').toString());
    assert.equal(refund.reserved_nano, '0');
    stage='disconnect_before_write';
    const before=await money.moneyBalance(payer);
    offline=true;
    try{await assert.rejects(()=>money.reserveMoney(payer,'unwritten',money.nano('0.1'),'fault',expiry,'task'));}
    finally{offline=false;}
    assert.deepEqual(await money.moneyBalance(payer),before);assert.equal(await money.moneyJob('unwritten'),null);
    stage='lost_committed_reply';
    loseCommitReply=true;
    try{await assert.rejects(()=>money.reserveMoney(payer,'ambiguous',money.nano('0.1'),'recoverable',expiry,'task'));}
    finally{loseCommitReply=false;}
    assert.ok(cutReplies>0);
    const recovered=await money.reserveMoney(payer,'ambiguous',money.nano('0.1'),'recoverable',expiry,'task');
    assert.equal(recovered.acquired,false);
    assert.equal((await money.moneyBalance(payer)).reserved_nano,money.nano('0.1').toString());
    await money.releaseMoney('ambiguous');
    assert.deepEqual(await money.moneyBalance(payer),before);
    console.log(JSON.stringify({backend:'real disposable Upstash REST',fixtureLedgerOnly:true,realPayments:false,
        lockRace:'1 of 16',failureReports:'1 of 8',reservations:'1 of 8',split:'85/10/5',
        testnetHash:txHash,disconnect:'fails closed; same client recovers',lostReply:'committed once; same ID recovers; no duplicate debit',refund:'1 synthetic GSTD'}));
}

if (!process.argv.includes('--create-free-database')) {
    console.error('Run with --create-free-database to create an isolated Upstash database with automatic 72-hour expiry.');
    process.exitCode = 1;
} else run().catch(error => {
    console.error(JSON.stringify({ stage, failure: error instanceof assert.AssertionError ? 'assertion' : 'runtime', code: error instanceof assert.AssertionError ? error.code : undefined }));
    process.exitCode = 1;
}).finally(async()=>{proxy?.closeAllConnections();if(proxy)await new Promise(resolve=>proxy.close(resolve));});
