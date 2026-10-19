/**
 * Browser/phone worker: speaks the same signed node protocol as gstdbot
 * (Ed25519 over sha256(`${node_id}:${ts}`), see lib/nodeAuth.ts), so a phone can
 * register, poll and complete tasks without any server-side special casing.
 *
 * Supported task kind: `sha256_verify` (payload { data, expected_hash? }) — independent
 * recomputation of a result hash, the building block of quorum verification.
 * Anything else is left unclaimed (the worker only advertises what it can run).
 */
export const BROWSER_CAPABILITY = 'browser-sha256-verify';

const KEY_STORAGE = 'gstd_browser_worker_key_v1';
const toHex = (b: ArrayBuffer | Uint8Array) =>
    Array.from(new Uint8Array(b as ArrayBuffer)).map((x) => x.toString(16).padStart(2, '0')).join('');

export interface WorkerIdentity {
    nodeId: string;
    pubkeyHex: string;
    privateKey: CryptoKey;
}

export function isBrowserWorkerSupported(): boolean {
    return typeof crypto !== 'undefined' && !!crypto.subtle && typeof localStorage !== 'undefined';
}

async function sha256Hex(text: string): Promise<string> {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export async function loadOrCreateIdentity(): Promise<WorkerIdentity> {
    const stored = localStorage.getItem(KEY_STORAGE);
    let pair: { privateJwk: JsonWebKey; publicHex: string; nodeId: string };
    if (stored) {
        pair = JSON.parse(stored);
    } else {
        const kp = (await crypto.subtle.generateKey({ name: 'Ed25519' } as any, true, ['sign', 'verify'])) as CryptoKeyPair;
        const publicHex = toHex(await crypto.subtle.exportKey('raw', kp.publicKey));
        pair = {
            privateJwk: await crypto.subtle.exportKey('jwk', kp.privateKey),
            publicHex,
            nodeId: `web-${publicHex.slice(0, 16)}`,
        };
        localStorage.setItem(KEY_STORAGE, JSON.stringify(pair));
    }
    const privateKey = await crypto.subtle.importKey('jwk', pair.privateJwk, { name: 'Ed25519' } as any, false, ['sign']);
    return { nodeId: pair.nodeId, pubkeyHex: pair.publicHex, privateKey };
}

export async function signedHeaders(id: WorkerIdentity, wallet: string, now = Date.now()): Promise<Record<string, string>> {
    const msg = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id.nodeId}:${now}`));
    const sig = await crypto.subtle.sign({ name: 'Ed25519' } as any, id.privateKey, msg);
    return {
        'Content-Type': 'application/json',
        'X-Wallet-Address': wallet,
        'X-GSTD-Node-Ts': String(now),
        'X-GSTD-Node-Sig': toHex(sig),
    };
}

/** Returns the task result, or null when this worker cannot run the task. */
export async function executeTask(task: any): Promise<Record<string, unknown> | null> {
    const p = task?.payload;
    if (!p || p.kind !== 'sha256_verify' || typeof p.data !== 'string' || p.data.length > 1_000_000) return null;
    const hash = await sha256Hex(p.data);
    return { kind: 'sha256_verify', hash, matches: p.expected_hash ? p.expected_hash.toLowerCase() === hash : undefined };
}

async function post(path: string, id: WorkerIdentity, wallet: string, body: unknown) {
    return fetch(path, { method: 'POST', headers: await signedHeaders(id, wallet), body: JSON.stringify(body) });
}

export async function registerWorker(id: WorkerIdentity, wallet: string): Promise<boolean> {
    const r = await post('/api/v1/nodes/register', id, wallet, {
        node_id: id.nodeId,
        node_pubkey: id.pubkeyHex,
        name: id.nodeId,
        wallet_address: wallet,
        platform: 'browser',
        arch: 'wasm',
        cpu_cores: (navigator as any).hardwareConcurrency || 2,
        ram_mb: Math.round(((navigator as any).deviceMemory || 2) * 1024),
        mode: 'browser',
        version: 'web-1',
        capabilities: [BROWSER_CAPABILITY],
    });
    return r.ok;
}

/** One poll → execute → complete cycle. Returns true when a task was completed. */
export async function runOnce(id: WorkerIdentity, wallet: string): Promise<boolean> {
    const poll = await post('/api/v1/tasks/poll', id, wallet, {
        node_id: id.nodeId,
        capabilities: [BROWSER_CAPABILITY],
        resources: { cpu_cores: (navigator as any).hardwareConcurrency || 2 },
    });
    if (!poll.ok) return false;
    const { task } = await poll.json();
    if (!task?.task_id && !task?.id) return false;
    const taskId = task.task_id || task.id;
    const result = await executeTask(task);
    if (!result) {
        await post('/api/v1/tasks/fail', id, wallet, { node_id: id.nodeId, task_id: taskId, error: 'unsupported task kind' }).catch(() => {});
        return false;
    }
    const done = await post('/api/v1/tasks/complete', id, wallet, { node_id: id.nodeId, task_id: taskId, result });
    return done.ok;
}
