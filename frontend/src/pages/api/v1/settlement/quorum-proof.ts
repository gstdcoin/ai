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
 *   gstdBonusAmount?: number, // optional GSTD bonus; inert until ownJettonWallet is funded
 *   computeUnits?: number,
 * }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvSet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body: any = req.body || {};
        const { taskId, workerAddr, resultHash, attestations } = body;

        if (!taskId || typeof taskId !== 'string') {
            return res.status(400).json({ error: 'taskId (string) required' });
        }
        if (!workerAddr || typeof workerAddr !== 'string') {
            return res.status(400).json({ error: 'workerAddr required' });
        }
        if (!resultHash || typeof resultHash !== 'string' || !/^[0-9a-fA-F]{1,64}$/.test(resultHash)) {
            return res.status(400).json({ error: 'resultHash must be a hex string (uint256)' });
        }
        if (!Array.isArray(attestations) || attestations.length < 2) {
            return res.status(400).json({ error: 'attestations array required (>= 2 entries — this endpoint is for already-quorum-reached proofs)' });
        }
        for (const a of attestations) {
            if (typeof a?.pubkeyHex !== 'string' || !/^[0-9a-fA-F]{64}$/.test(a.pubkeyHex)) {
                return res.status(400).json({ error: 'each attestation needs a 64-hex-char pubkeyHex' });
            }
            if (typeof a?.signatureHex !== 'string' || !/^[0-9a-fA-F]{128}$/.test(a.signatureHex)) {
                return res.status(400).json({ error: 'each attestation needs a 128-hex-char signatureHex' });
            }
        }

        const gstdBonusAmount = typeof body.gstdBonusAmount === 'number' && body.gstdBonusAmount > 0 ? body.gstdBonusAmount : 0;
        const computeUnits = typeof body.computeUnits === 'number' && body.computeUnits > 0 ? body.computeUnits : 1;

        const id = `proof_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const record = {
            id,
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
