import { createHash, randomBytes } from 'crypto';
import { kvSetNX } from './kv';

export const VERIFY_CAP = 'browser-sha256-verify';
const PROBE_INTERVAL_SECONDS = 300;

/**
 * Unpaid network self-check: a task with a server-known answer. It gives light workers
 * (phones) real work and lets the platform measure whether a node really computes.
 * Never carries a reward.
 */
export async function maybeCreateVerifyProbe(nodeId: string, caps: string[]): Promise<Record<string, any> | null> {
    if (!Array.isArray(caps) || !caps.includes(VERIFY_CAP)) return null;
    if (!(await kvSetNX(`probe:last:${nodeId}`, '1', PROBE_INTERVAL_SECONDS))) return null;

    const data = randomBytes(32).toString('hex');
    return {
        task_id: randomBytes(8).toString('hex'),
        type: 'custom',
        payload: { kind: 'sha256_verify', data },
        expected_hash: createHash('sha256').update(data).digest('hex'),
        priority: 1,
        created_at: new Date().toISOString(),
    };
}

export function probeResultMatches(expected: string | undefined, result: any): boolean {
    return !!expected && typeof result?.hash === 'string' && result.hash.toLowerCase() === expected;
}
