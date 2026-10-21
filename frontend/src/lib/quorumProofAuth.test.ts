import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Address, beginCell } from '@ton/core';
import { keyPairFromSeed, sign } from '@ton/crypto';
import { createHash } from 'crypto';

const { store, writes, rateLimit } = vi.hoisted(() => ({
    store: new Map<string, string>(),
    writes: [] as Array<{ key: string; value: string }>,
    rateLimit: vi.fn(async () => true),
}));

vi.mock('./kv', () => ({
    kvGet: vi.fn(async (key: string) => store.get(key) ?? null),
    kvSet: vi.fn(async (key: string, value: string) => {
        writes.push({ key, value });
        store.set(key, value);
    }),
    kvRateLimit: rateLimit,
}));

import handler from '../pages/api/v1/settlement/quorum-proof';

const nodeId = 'quorum-node-test';
const nodeKey = keyPairFromSeed(Buffer.alloc(32, 1));
const attestors = [
    keyPairFromSeed(Buffer.alloc(32, 2)),
    keyPairFromSeed(Buffer.alloc(32, 3)),
];
const settlementAddress = Address.parse(`0:${'4'.repeat(64)}`);
const workerAddress = Address.parse(`0:${'5'.repeat(64)}`);
const taskId = '11111111-1111-1111-1111-111111111111';
const resultHash = 'ab'.repeat(32);

function taskIdToUint64(id: string): bigint {
    return BigInt(`0x${createHash('sha256').update(id, 'utf8').digest().subarray(0, 8).toString('hex')}`);
}

function makeRequestBody(address = settlementAddress) {
    const messageHash = beginCell()
        .storeAddress(address)
        .storeUint(taskIdToUint64(taskId), 64)
        .storeAddress(workerAddress)
        .storeUint(BigInt(`0x${resultHash}`), 256)
        .storeCoins(0n)
        .storeUint(1, 64)
        .endCell()
        .hash();
    return {
        taskId,
        workerAddr: workerAddress.toString(),
        resultHash,
        gstdBonusAmount: '0',
        computeUnits: 1,
        attestations: attestors.map((key) => ({
            pubkeyHex: key.publicKey.toString('hex'),
            signatureHex: sign(Buffer.from(messageHash), key.secretKey).toString('hex'),
        })),
    };
}

function signedHeaders() {
    const timestamp = Date.now();
    const message = createHash('sha256').update(`${nodeId}:${timestamp}`).digest();
    return {
        'x-gstd-node-id': nodeId,
        'x-gstd-node-ts': String(timestamp),
        'x-gstd-node-sig': sign(message, nodeKey.secretKey).toString('hex'),
    };
}

async function call(body: Record<string, unknown>) {
    return new Promise<{ status: number; json: unknown }>((resolve, reject) => {
        const res: any = {
            statusCode: 200,
            status(code: number) { this.statusCode = code; return this; },
            json(json: unknown) { resolve({ status: this.statusCode, json }); },
        };
        Promise.resolve(handler({
            method: 'POST',
            body,
            headers: signedHeaders(),
        } as any, res)).catch(reject);
    });
}

beforeEach(() => {
    store.clear();
    writes.length = 0;
    rateLimit.mockClear();
    rateLimit.mockResolvedValue(true);
    store.set(`node_key:${nodeId}`, nodeKey.publicKey.toString('hex'));
    vi.stubEnv('GSTD_SETTLEMENT_ADDRESS', settlementAddress.toString());
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe('quorum proof admission', () => {
    it('accepts only signatures bound to the configured settlement contract', async () => {
        const response = await call(makeRequestBody());

        expect(response.status).toBe(200);
        expect(writes).toHaveLength(1);
        expect(rateLimit).toHaveBeenCalledWith('quorum-proof:global', 100, 60_000);
        expect(JSON.parse(writes[0].value).resultHash).toBe(resultHash);
    });

    it('rejects signatures made for a different settlement contract', async () => {
        const otherAddress = Address.parse(`0:${'6'.repeat(64)}`);
        const response = await call(makeRequestBody(otherAddress));

        expect(response.status).toBe(400);
        expect(writes).toHaveLength(0);
    });

    it('fails closed when the settlement contract is not configured', async () => {
        vi.stubEnv('GSTD_SETTLEMENT_ADDRESS', '');

        const response = await call(makeRequestBody());

        expect(response.status).toBe(503);
        expect(writes).toHaveLength(0);
    });

    it('caps attestations at the contract-supported maximum', async () => {
        const body = makeRequestBody();
        body.attestations = Array.from({ length: 6 }, (_, index) => ({
            pubkeyHex: (index + 10).toString(16).padStart(64, '0'),
            signatureHex: '00'.repeat(64),
        }));

        const response = await call(body);

        expect(response.status).toBe(400);
        expect(writes).toHaveLength(0);
    });
});
