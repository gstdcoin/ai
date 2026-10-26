import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import test from 'node:test';
import { beginCell, Cell, storeStateInit } from '@ton/core';
import { keyPairFromSeed, sign } from '@ton/crypto';
import {
    WalletContractV1R1,
    WalletContractV1R2,
    WalletContractV1R3,
    WalletContractV2R1,
    WalletContractV2R2,
    WalletContractV3R1,
    WalletContractV3R2,
    WalletContractV4,
    WalletContractV5R1,
} from '@ton/ton';

const require = createRequire(import.meta.url);
const typescript = require('typescript');
require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const compiled = typescript.transpileModule(source, {
        compilerOptions: {
            module: typescript.ModuleKind.CommonJS,
            target: typescript.ScriptTarget.ES2020,
            esModuleInterop: true,
        },
    });
    module._compile(compiled.outputText, filename);
};
const { verifyTonConnectProof } = require('../src/lib/tonProof.ts');

process.env.NODE_ENV = 'test';
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;

const DOMAIN = 'app.gstdtoken.com';
const PAYLOAD = 'e2b6ba11d21a9e75'.repeat(4);
const WALLET_VERSIONS = [
    ['V1R1', (publicKey) => WalletContractV1R1.create({ workchain: 0, publicKey })],
    ['V1R2', (publicKey) => WalletContractV1R2.create({ workchain: 0, publicKey })],
    ['V1R3', (publicKey) => WalletContractV1R3.create({ workchain: 0, publicKey })],
    ['V2R1', (publicKey) => WalletContractV2R1.create({ workchain: 0, publicKey })],
    ['V2R2', (publicKey) => WalletContractV2R2.create({ workchain: 0, publicKey })],
    ['V3R1', (publicKey) => WalletContractV3R1.create({ workchain: 0, publicKey })],
    ['V3R2', (publicKey) => WalletContractV3R2.create({ workchain: 0, publicKey })],
    ['V4', (publicKey) => WalletContractV4.create({ workchain: 0, publicKey })],
    ['V5R1', (publicKey) => WalletContractV5R1.create({ workchain: 0, publicKey })],
];

function signedDigest(address, proof) {
    const [workchain, hash] = address.split(':');
    const workchainBytes = Buffer.alloc(4);
    workchainBytes.writeInt32BE(Number(workchain));
    const domainBytes = Buffer.from(proof.domain.value, 'utf8');
    const domainLength = Buffer.alloc(4);
    domainLength.writeUInt32LE(domainBytes.length);
    const timestamp = Buffer.alloc(8);
    timestamp.writeBigUInt64LE(BigInt(proof.timestamp));

    const message = Buffer.concat([
        Buffer.from('ton-proof-item-v2/'),
        workchainBytes,
        Buffer.from(hash, 'hex'),
        domainLength,
        domainBytes,
        timestamp,
        Buffer.from(proof.payload, 'utf8'),
    ]);
    const messageHash = createHash('sha256').update(message).digest();
    return createHash('sha256')
        .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), messageHash]))
        .digest();
}

function createSignedLogin(createWallet, seed = 7, payload = PAYLOAD) {
    const keys = keyPairFromSeed(Buffer.alloc(32, seed));
    const wallet = createWallet(keys.publicKey);
    const stateInit = Cell.fromBoc(
        beginCell().store(storeStateInit(wallet.init)).endCell().toBoc(),
    )[0];
    const address = wallet.address.toRawString();
    const proof = {
        timestamp: Math.floor(Date.now() / 1000),
        domain: { lengthBytes: Buffer.byteLength(DOMAIN), value: DOMAIN },
        payload,
        signature: '',
    };
    proof.signature = sign(signedDigest(address, proof), keys.secretKey).toString('base64');

    return {
        login: {
            address,
            publicKey: keys.publicKey.toString('hex'),
            walletStateInit: stateInit.toBoc().toString('base64'),
            proof,
        },
        keys,
    };
}

for (const [name, createWallet] of WALLET_VERSIONS) {
    test(`verifies a fresh TonConnect proof for ${name}`, () => {
        const { login } = createSignedLogin(createWallet);
        assert.equal(verifyTonConnectProof(login, PAYLOAD, [DOMAIN]), true);
    });
}

test('rejects proofs with altered domain, payload, key, address, timestamp, or signature', () => {
    const { login } = createSignedLogin(
        (publicKey) => WalletContractV4.create({ workchain: 0, publicKey }),
        8,
    );
    const secondWallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keyPairFromSeed(Buffer.alloc(32, 9)).publicKey,
    });
    const expiredProof = {
        ...login.proof,
        timestamp: Math.floor(Date.now() / 1000) - 301,
    };

    assert.equal(verifyTonConnectProof(login, PAYLOAD, ['platform.gstdtoken.com']), false);
    assert.equal(verifyTonConnectProof(login, 'other-payload', [DOMAIN]), false);
    assert.equal(verifyTonConnectProof({ ...login, publicKey: '00'.repeat(32) }, PAYLOAD, [DOMAIN]), false);
    assert.equal(verifyTonConnectProof({ ...login, address: secondWallet.address.toRawString() }, PAYLOAD, [DOMAIN]), false);
    assert.equal(verifyTonConnectProof({ ...login, proof: expiredProof }, PAYLOAD, [DOMAIN]), false);
    assert.equal(verifyTonConnectProof({ ...login, proof: { ...login.proof, signature: 'AA==' } }, PAYLOAD, [DOMAIN]), false);
});

test('requires a one-time challenge and invalidates pre-proof sessions', async () => {
    const challengeHandler = require('../src/pages/api/v1/users/challenge.ts').default;
    const loginHandler = require('../src/pages/api/v1/users/login.ts').default;
    const balanceHandler = require('../src/pages/api/v1/users/balance.ts').default;
    const { kvSet } = require('../src/lib/kv.ts');

    function mockResponse() {
        return {
            statusCode: 200,
            body: undefined,
            status(code) {
                this.statusCode = code;
                return this;
            },
            setHeader() { return this; },
            json(value) {
                this.body = value;
                return this;
            },
        };
    }

    const challengeResponse = mockResponse();
    await challengeHandler({ method: 'POST' }, challengeResponse);
    assert.equal(challengeResponse.statusCode, 200);

    const createWallet = (publicKey) => WalletContractV4.create({ workchain: 0, publicKey });
    const { login, keys } = createSignedLogin(createWallet, 10, challengeResponse.body.payload);
    const insecureResponse = mockResponse();
    await loginHandler({
        method: 'POST',
        body: { connect_payload: { wallet_address: login.address } },
    }, insecureResponse);
    assert.equal(insecureResponse.statusCode, 401);

    const loginResponse = mockResponse();
    await loginHandler({
        method: 'POST',
        body: {
            connect_payload: {
                wallet_address: login.address,
                public_key: keys.publicKey.toString('hex'),
                wallet_state_init: login.walletStateInit,
                ton_proof: { name: 'ton_proof', proof: login.proof },
            },
        },
    }, loginResponse);
    assert.equal(loginResponse.statusCode, 200);

    const balanceResponse = mockResponse();
    await balanceHandler({
        method: 'GET',
        headers: { 'x-session-token': loginResponse.body.session_token }, query: {},
    }, balanceResponse);
    assert.equal(balanceResponse.statusCode, 200);
    assert.equal(balanceResponse.body.wallet, login.address.toLowerCase());

    const replayResponse = mockResponse();
    await loginHandler({
        method: 'POST',
        body: {
            connect_payload: {
                wallet_address: login.address,
                public_key: keys.publicKey.toString('hex'),
                wallet_state_init: login.walletStateInit,
                ton_proof: { name: 'ton_proof', proof: login.proof },
            },
        },
    }, replayResponse);
    assert.equal(replayResponse.statusCode, 401);

    await kvSet('session:legacy-token', login.address.toLowerCase(), 60);
    const legacySessionResponse = mockResponse();
    await balanceHandler({
        method: 'GET',
        headers: { 'x-session-token': 'legacy-token' }, query: {},
    }, legacySessionResponse);
    assert.equal(legacySessionResponse.statusCode, 401);
});
