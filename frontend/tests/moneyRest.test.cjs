const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Redis } = require('@upstash/redis/cloudflare');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const { outputText } = ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    module._compile(outputText, filename);
};

let stage = 'provision';
async function run() {
    const response = await fetch('https://upstash.com/start-redis', {
        method: 'POST', signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
        console.log(JSON.stringify({ stage, status: response.status }));
        process.exitCode = 1;
        return;
    }
    const descriptor = await response.text();
    const url = descriptor.match(/https:\/\/[a-z\d-]+\.upstash\.io(?=[\s`"'\/]|$)/i)?.[0];
    const token = descriptor.match(/(?:REST_TOKEN\s*["']?\s*[:=]\s*["'`]?|Authorization:\s*Bearer\s+)([\w+=\/-]{24,})/i)?.[1];
    if (!url || !token) {
        console.log(JSON.stringify({ stage: 'credential_format', status: response.status }));
        process.exitCode = 1;
        return;
    }
    stage = 'verify_empty';
    const redis = new Redis({ url, token });
    assert.equal(await redis.ping(), 'PONG');
    assert.equal(await redis.dbsize(), 0);
    process.env.NODE_ENV = 'production';
    process.env.KV_REST_API_URL = url;
    process.env.KV_REST_API_TOKEN = token;

    stage = 'signed_assignment_state';
    const kv = require('../src/lib/kv.ts');
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
    console.log(JSON.stringify({ backend: 'Upstash Redis REST', failureReports: '1 of 8 recorded', reservations: '1 of 8 acquired', split: '85/10/5', replay: 'same accepted; changed rejected', refund: '1 synthetic GSTD' }));
}

if (!process.argv.includes('--create-free-database')) {
    console.error('Run with --create-free-database to create an isolated Upstash database with automatic 72-hour expiry.');
    process.exitCode = 1;
} else run().catch(error => {
    console.error(JSON.stringify({ stage, failure: error instanceof assert.AssertionError ? 'assertion' : 'runtime', code: error instanceof assert.AssertionError ? error.code : undefined }));
    process.exitCode = 1;
});
