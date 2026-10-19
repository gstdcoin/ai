import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { maybeCreateVerifyProbe, probeResultMatches, VERIFY_CAP } from './verifyProbe';
import { assignTaskToNode } from './task-assignment';
import { kvCompleteAssignedTask, kvSet } from './kv';

describe('verify probe', () => {
    it('is only created for capable nodes and rate limited', async () => {
        const id = `n-${Math.random().toString(16).slice(2)}`;
        expect(await maybeCreateVerifyProbe(id, ['inference'])).toBeNull();
        const probe = await maybeCreateVerifyProbe(id, [VERIFY_CAP]);
        expect(probe?.payload.kind).toBe('sha256_verify');
        expect(probe?.expected_hash).toBe(createHash('sha256').update(probe!.payload.data).digest('hex'));
        expect(await maybeCreateVerifyProbe(id, [VERIFY_CAP])).toBeNull();
    });

    it('checks the returned hash', async () => {
        const probe = (await maybeCreateVerifyProbe(`m-${Math.random().toString(16).slice(2)}`, [VERIFY_CAP]))!;
        expect(probeResultMatches(probe.expected_hash, { hash: probe.expected_hash })).toBe(true);
        expect(probeResultMatches(probe.expected_hash, { hash: 'ab' })).toBe(false);
        expect(probeResultMatches(undefined, { hash: 'ab' })).toBe(false);
    });

    it('probe assignment carries no reward and a second completion is a duplicate', async () => {
        const nodeId = `web-${Math.random().toString(16).slice(2)}`;
        const wallet = 'UQtest';
        await kvSet(`node:${nodeId}`, JSON.stringify({ node_id: nodeId, wallet_address: wallet }), 600);
        const probe = (await maybeCreateVerifyProbe(nodeId, [VERIFY_CAP]))!;
        expect(await assignTaskToNode(probe, nodeId, 3600)).toBe(true);
        expect(await assignTaskToNode(probe, nodeId, 3600)).toBe(false);

        const first = await kvCompleteAssignedTask(probe.task_id, nodeId, wallet, 0, 0, 600, 3600);
        expect(first.status).not.toBe('duplicate');
        if ('assignment' in first) {
            const a = JSON.parse(first.assignment);
            expect(a.reward_gstd).toBe(0);
            expect(a.expected_hash).toBe(probe.expected_hash);
        }
        const second = await kvCompleteAssignedTask(probe.task_id, nodeId, wallet, 0, 0, 600, 3600);
        expect(second.status).toBe('duplicate');
    });

    it('rejects completion of an unassigned or expired task', async () => {
        const r = await kvCompleteAssignedTask('deadbeefdeadbeef', 'web-x', 'UQtest', 0, 0, 600, 3600);
        expect(r.status).not.toBe('ok');
        expect(r.status).not.toBe('duplicate');
    });
});
