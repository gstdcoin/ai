/**
 * POST /api/v1/settlement/quorum-proof
 *
 * A node that reached a 2-of-3 (or configured threshold) P2P quorum for a
 * task's result submits the attestation package here. This does NOT settle
 * anything on-chain by itself and does NOT pay out anything — it just
 * queues the proof for the admin relay (contracts/scripts/settle-quorum-proof.ts,
 * signing with the deployer wallet) to submit as SettlementMaster.SettleTaskWithProof.
 *
 * Nodes cannot self-submit on-chain today: the locally-generated node
 * wallet (src/wallet/wallet.ts in gstdbot) does not hold a real usable
 * Ed25519 private key (a pre-existing bug, unrelated to this endpoint —
 * the address is derived from a raw hash, not a real keypair). Until that's
 * fixed, an admin-operated relay is the only way to actually get a
 * SettleTaskWithProof transaction signed and sent.
 *
 * Body: {
 *   taskId: string,        // task UUID (hashed to uint64 on submission, see attestation.ts)
 *   workerAddr: string,    // TON address to be paid — should be a real, externally-linked wallet
 *   resultHash: string,    // hex, uint256
 *   attestations: { pubkeyHex: string; signatureHex: string }[],
 *   gstdBonusAmount: string, // GSTD nanotokens, bound by the quorum signatures
 *   computeUnits: number,    // bound by the quorum signatures
 * }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { Address, beginCell } from '@ton/core';
import { signVerify } from '@ton/crypto';
import { createHash } from 'crypto';
import { kvRateLimit, kvSet } from '../../../../lib/kv';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
import { randomId } from '../../../../lib/randomId';

function taskIdToUint64(taskId: string): bigint {
    const digest = createHash('sha256').update(taskId, 'utf8').digest();
    return BigInt(`0x${digest.subarray(0, 8).toString('hex')}`);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body: any = req.body || {};
        const { taskId, workerAddr, resultHash, attestations } = body;
        const nodeId = String(req.headers['x-gstd-node-id'] || '');

        if (!nodeId) {
            return res.status(401).json({ error: 'Bound node identity required' });
        }
        const auth = await requireNodeSignature(nodeId, req.headers as any);
        if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
        if (!(await kvRateLimit('quorum-proof:global', 100, 60_000))
            || !(await kvRateLimit(`quorum-proof:${nodeId}`, 10, 60_000))) {
            return res.status(429).json({ error: 'Quorum proof submission rate limit exceeded' });
        }

        const settlementAddressRaw = process.env.GSTD_SETTLEMENT_ADDRESS;
        if (!settlementAddressRaw) {
            return res.status(503).json({ error: 'Quorum settlement is not configured' });
        }
        let settlementAddress: Address;
        try {
            settlementAddress = Address.parse(settlementAddressRaw);
        } catch {
            console.error('[settlement/quorum-proof] GSTD_SETTLEMENT_ADDRESS is invalid');
            return res.status(503).json({ error: 'Quorum settlement is not configured' });
        }

        if (!taskId || typeof taskId !== 'string' || taskId.length > 128) {
            return res.status(400).json({ error: 'taskId (string) required' });
        }
        if (!workerAddr || typeof workerAddr !== 'string') {
            return res.status(400).json({ error: 'workerAddr required' });
        }
        if (!resultHash || typeof resultHash !== 'string' || !/^[0-9a-fA-F]{1,64}$/.test(resultHash)) {
            return res.status(400).json({ error: 'resultHash must be a hex string (uint256)' });
        }
        if (!Array.isArray(attestations) || attestations.length < 2 || attestations.length > 5) {
            return res.status(400).json({ error: 'attestations array must contain between 2 and 5 entries' });
        }
        const pubkeys = new Set<string>();
        for (const a of attestations) {
            if (typeof a?.pubkeyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(a.pubkeyHex)) {
                return res.status(400).json({ error: 'each attestation needs a 64-hex-char pubkeyHex' });
            }
            if (typeof a?.signatureHex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(a.signatureHex)) {
                return res.status(400).json({ error: 'each attestation needs a 128-hex-char signatureHex' });
            }
            const pubkey = a.pubkeyHex.toLowerCase();
            if (pubkeys.has(pubkey)) {
                return res.status(400).json({ error: 'attestations must use distinct public keys' });
            }
            pubkeys.add(pubkey);
        }

        if (typeof body.gstdBonusAmount !== 'string' || !/^\d{1,36}$/.test(body.gstdBonusAmount)) {
            return res.status(400).json({ error: 'gstdBonusAmount must be an unsigned decimal string in GSTD nanotokens' });
        }
        if (!Number.isSafeInteger(body.computeUnits) || body.computeUnits < 0 || body.computeUnits > 1_000_000_000) {
            return res.status(400).json({ error: 'computeUnits must be an integer between 0 and 1000000000' });
        }
        const gstdBonusAmount = body.gstdBonusAmount;
        const computeUnits = body.computeUnits;
        let messageHash: Buffer;
        try {
            const hash = beginCell()
                .storeAddress(settlementAddress)
                .storeUint(taskIdToUint64(taskId), 64)
                .storeAddress(Address.parse(workerAddr))
                .storeUint(BigInt(`0x${resultHash}`), 256)
                .storeCoins(BigInt(gstdBonusAmount))
                .storeUint(computeUnits, 64)
                .endCell()
                .hash();
            messageHash = Buffer.from(hash);
        } catch {
            return res.status(400).json({ error: 'Invalid task settlement fields' });
        }
        for (const attestation of attestations) {
            const valid = signVerify(
                messageHash,
                Buffer.from(attestation.signatureHex, 'hex'),
                Buffer.from(attestation.pubkeyHex, 'hex'),
            );
            if (!valid) {
                return res.status(400).json({ error: 'Invalid quorum attestation signature' });
            }
        }

        const id = `proof_${Date.now()}_${randomId()}`;
        const record = {
            id,
            submittedByNodeId: nodeId,
            taskId,
            workerAddr,
            resultHash: resultHash.toLowerCase(),
            attestations,
            gstdBonusAmount,
            computeUnits,
            receivedAt: Date.now(),
        };

        // 7-day TTL — if never relayed on-chain, don't keep it forever.
        await kvSet(`settlement:quorum_proof:${id}`, JSON.stringify(record), 7 * 24 * 3600);

        return res.status(200).json({ ok: true, id });
    } catch (err: any) {
        console.error('[settlement/quorum-proof]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
