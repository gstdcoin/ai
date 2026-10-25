import { describe, it, expect, vi } from 'vitest';
import { heartbeatWorker, signedHeaders, executeTask, type WorkerIdentity } from './browserWorker';
import { verifyNodeSignature } from './nodeAuth';

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, '0')).join('');

async function identity(): Promise<WorkerIdentity> {
    const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify'])) as CryptoKeyPair;
    const pubkeyHex = hex(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { nodeId: `web-${pubkeyHex.slice(0, 16)}`, pubkeyHex, privateKey: kp.privateKey };
}

describe('browser worker', () => {
    it('signs requests that the server-side node auth accepts', async () => {
        const id = await identity();
        const now = Date.now();
        const h = await signedHeaders(id, 'EQwallet', now);
        expect(verifyNodeSignature(id.nodeId, id.pubkeyHex, h['X-GSTD-Node-Ts'], h['X-GSTD-Node-Sig'], now)).toBe(true);
        expect(verifyNodeSignature('web-other', id.pubkeyHex, h['X-GSTD-Node-Ts'], h['X-GSTD-Node-Sig'], now)).toBe(false);
    });

    it('recomputes sha256 for sha256_verify tasks', async () => {
        const out = await executeTask({ payload: { kind: 'sha256_verify', data: 'abc', expected_hash: 'BA7816BF8F01CFEA414140DE5DAE2223B00361A396177A9CB410FF61F20015AD' } });
        expect(out).toMatchObject({ hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', matches: true });
    });

    it('ignores task kinds it cannot run', async () => {
        expect(await executeTask({ payload: { kind: 'llm_inference', data: 'x' } })).toBeNull();
        expect(await executeTask({ payload: { kind: 'sha256_verify', data: 'x'.repeat(1_000_001) } })).toBeNull();
    });

    it('refreshes the registered node with a signed heartbeat', async () => {
        const id = await identity();
        const requests: Array<{ path: string; init: RequestInit }> = [];
        vi.stubGlobal('fetch', async (path: string, init: RequestInit) => {
            requests.push({ path, init });
            return { ok: true } as Response;
        });

        try {
            expect(await heartbeatWorker(id, 'EQwallet')).toBe(true);
        } finally {
            vi.unstubAllGlobals();
        }

        expect(requests).toHaveLength(1);
        expect(requests[0].path).toBe('/api/v1/nodes/heartbeat');
        const headers = requests[0].init.headers as Record<string, string>;
        expect(verifyNodeSignature(
            id.nodeId, id.pubkeyHex, headers['X-GSTD-Node-Ts'], headers['X-GSTD-Node-Sig'],
        )).toBe(true);
        expect(JSON.parse(requests[0].init.body as string)).toMatchObject({
            node_id: id.nodeId,
            wallet_address: 'EQwallet',
            mode: 'browser',
            capabilities: ['browser-sha256-verify'],
        });
    });
});