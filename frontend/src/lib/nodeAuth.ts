/**
 * Node identity: each node owns an Ed25519 key (gstdbot attestor identity).
 * The public key is bound to node_id on first registration (trust-on-first-use)
 * after the node proves possession by signing sha256(`${node_id}:${timestamp}`).
 * Paid paths (poll/complete) require a fresh signature from the bound key, so a
 * leaked node_id + wallet address alone can no longer act as that node.
 */
import { createHash } from 'crypto';
import { signVerify } from '@ton/crypto';
import { kvGet, kvSetNX } from './kv';

export const MAX_SKEW_MS = 60_000;
const KEY_TTL = 5 * 365 * 86400;
const HEX64 = /^[0-9a-f]{64}$/i;
const HEX128 = /^[0-9a-f]{128}$/i;

export function nodeKeyRedisKey(nodeId: string): string {
    return `node_key:${nodeId}`;
}

export function verifyNodeSignature(
    nodeId: string, pubkeyHex: string, tsRaw: unknown, sigHex: unknown, now = Date.now(),
): boolean {
    try {
        const ts = Number(tsRaw);
        if (!Number.isFinite(ts) || Math.abs(now - ts) > MAX_SKEW_MS) return false;
        if (typeof sigHex !== 'string' || !HEX128.test(sigHex) || !HEX64.test(pubkeyHex)) return false;
        const msg = createHash('sha256').update(`${nodeId}:${ts}`).digest();
        return signVerify(msg, Buffer.from(sigHex, 'hex'), Buffer.from(pubkeyHex, 'hex'));
    } catch {
        return false;
    }
}

function header(headers: Record<string, any>, name: string): string {
    const v = headers[name];
    return Array.isArray(v) ? v[0] : (v || '');
}

/** Requires a valid signature from the key bound to nodeId. */
export async function requireNodeSignature(
    nodeId: string, headers: Record<string, any>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const pubkey = await kvGet(nodeKeyRedisKey(nodeId));
    if (!pubkey) {
        return { ok: false, status: 403, error: 'Node has no bound identity key — update gstdbot and re-register' };
    }
    return verifyBoundNodeSignature(nodeId, pubkey, headers);
}

/** Requires proof for bound nodes but preserves the unsigned legacy-node path. */
export async function requireNodeSignatureIfBound(
    nodeId: string, headers: Record<string, any>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
    const pubkey = await kvGet(nodeKeyRedisKey(nodeId));
    if (!pubkey) return { ok: true };
    return verifyBoundNodeSignature(nodeId, pubkey, headers);
}

function verifyBoundNodeSignature(
    nodeId: string, pubkey: string, headers: Record<string, any>,
): { ok: true } | { ok: false; status: number; error: string } {
    const ok = verifyNodeSignature(
        nodeId, pubkey, header(headers, 'x-gstd-node-ts'), header(headers, 'x-gstd-node-sig'),
    );
    return ok ? { ok: true } : { ok: false, status: 401, error: 'Invalid or stale node signature' };
}

/** Binds the key on first use; later registrations must use the same key. */
export async function bindNodeKey(nodeId: string, pubkeyHex: string): Promise<boolean> {
    const key = pubkeyHex.toLowerCase();
    if (await kvSetNX(nodeKeyRedisKey(nodeId), key, KEY_TTL)) return true;
    return (await kvGet(nodeKeyRedisKey(nodeId)))?.toLowerCase() === key;
}
