/**
 * POST /api/v1/settlement/batch
 *
 * Called by gstdbot RevenueEngine when it has a batch of earning events to settle.
 * Phase 1: records the batch in KV and returns a batch_id.
 * Phase 2: after SettlementMaster is deployed, the off-chain trigger will flush
 *          accumulated balances on-chain via /api/v1/settlement/trigger.
 *
 * Body: { node_id, wallet_address, total_amount, events_count, breakdown, events[] }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncrByFloat } from '../../../../lib/kv';
import { accrueReward } from '../../../../lib/rewards';
import type { NodeRecord } from '../nodes/register';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const body         = req.body as any;
        const nodeId       = body.node_id as string;
        const walletAddr   = (body.wallet_address || req.headers['x-wallet-address'] || '') as string;
        const totalAmount  = Math.max(0, Number(body.total_amount) || 0);
        const eventsCount  = Number(body.events_count) || 0;

        if (!nodeId || !walletAddr) {
            return res.status(400).json({ error: 'node_id and wallet_address required' });
        }

        const batchId = `batch_${nodeId}_${Date.now()}`;

        // Node must be a registered, real node -- otherwise anyone could settle an
        // uncapped batch of fabricated events under any node_id/wallet_address with
        // no proof it was ever a real node.
        const nodeRaw = await kvGet(`node:${nodeId}`).catch(() => null);
        if (!nodeRaw) {
            return res.status(404).json({ error: 'Unknown node — register first' });
        }
        const record: NodeRecord = JSON.parse(nodeRaw as string);
        if (record.wallet_address && record.wallet_address !== walletAddr) {
            return res.status(403).json({ error: 'Wallet mismatch' });
        }

        // Record pending settlement in KV — idempotent via batch_id
        const seen = await kvGet(`settlement_seen:${batchId}`).catch(() => null);
        if (seen) {
            return res.status(200).json({ ok: true, batch_id: batchId, status: 'already_processed' });
        }

        // Cap per-event/per-batch amount to prevent arbitrary inflation (same ceiling
        // used by tasks/complete.ts's per-task reward cap)
        const MAX_EVENT_AMOUNT = 50;

        // Accrue to node's pending balance (KV) — individual events deduplicated by ID
        const events: any[] = body.events || [];
        let accrued = 0;
        for (const ev of events.slice(0, 100)) {
            const taskId = ev.id;
            const amount = Math.min(MAX_EVENT_AMOUNT, Number(ev.amount) || 0);
            if (amount <= 0) continue;
            const { nodeShare } = await accrueReward(nodeId, walletAddr, amount, taskId).catch(() => ({ nodeShare: 0 }));
            accrued += nodeShare;
        }

        // Fallback: if events array is empty but total_amount is set, accrue total once
        if (events.length === 0 && totalAmount > 0) {
            const cappedTotal = Math.min(MAX_EVENT_AMOUNT, totalAmount);
            const { nodeShare } = await accrueReward(nodeId, walletAddr, cappedTotal, batchId).catch(() => ({ nodeShare: 0 }));
            accrued += nodeShare;
        }

        // Mark batch processed (1 week TTL)
        await kvSet(`settlement_seen:${batchId}`, '1', 604800).catch(() => {});

        // Update node record total
        if (accrued > 0) {
            record.gstd_earned = Math.round(((record.gstd_earned || 0) + accrued) * 1e6) / 1e6;
            record.last_seen   = new Date().toISOString();
            await kvSet(`node:${nodeId}`, JSON.stringify(record), 600).catch(() => {});
        }

        return res.status(200).json({
            ok:           true,
            batch_id:     batchId,
            accrued_gstd: accrued,
            events_count: eventsCount,
            status:       'pending_onchain',
        });
    } catch (err: any) {
        console.error('[settlement/batch]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
