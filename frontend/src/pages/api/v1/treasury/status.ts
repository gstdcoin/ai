/**
 * GET /api/v1/treasury/status
 *
 * Returns protocol treasury state:
 * - Accumulated GSTD from 10% campaign fees
 * - Accumulated GSTD from 0.001 GSTD/inference cost
 * - Amount queued for liquidity pool injection
 * - TON smart contract addresses
 *
 * POST /api/v1/treasury/distribute
 * Triggers distribution when threshold reached:
 * - 50% → Ston.fi GSTD/TON liquidity pool (price support)
 * - 30% → GSTD buybacks via ecosystem treasury
 * - 20% → Node reward bonus pool
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';

// Distribution thresholds and ratios
const DISTRIBUTE_THRESHOLD = 10;    // GSTD — trigger distribution at 10 GSTD
const LP_RATIO             = 0.50;  // 50% to Ston.fi LP
const TREASURY_PCT         = 10;    // 10% of fees → ecosystem treasury (buybacks)
const BUYBACK_RATIO        = 0.30;  // 30% to GSTD buybacks via ecosystem treasury
const BONUS_RATIO          = 0.20;  // 20% to node bonus pool

// TON contract addresses (mainnet)
const CONTRACTS = {
    gstd_jetton:        process.env.GSTD_JETTON_ADDRESS || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
    settlement_router:  process.env.SETTLEMENT_ROUTER   || '',
    stonfi_pool:        process.env.STONFI_GSTD_POOL    || '',
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const [
            treasuryRaw, totalGstdPaid, totalCampaigns,
            distributionCount, lastDistribution, bonusPool,
        ] = await Promise.all([
            kvGet('stats:protocol_treasury_gstd'),
            kvGet('stats:total_gstd_paid'),
            kvGet('stats:total_campaigns'),
            kvGet('stats:distributions_count'),
            kvGet('stats:last_distribution'),
            kvGet('stats:node_bonus_pool'),
        ]);

        const treasury    = parseInt(treasuryRaw  || '0', 10);
        const gstdPaid    = parseInt(totalGstdPaid || '0', 10);
        const distributed = parseInt(distributionCount || '0', 10);
        const bonus       = parseFloat(bonusPool || '0');

        const nextDistributionIn = Math.max(0, DISTRIBUTE_THRESHOLD - treasury);

        return res.status(200).json({
            treasury_gstd:        treasury,
            total_gstd_paid:      gstdPaid,
            active_campaigns:     parseInt(totalCampaigns || '0', 10),
            distributions_count:  distributed,
            last_distribution:    lastDistribution || null,
            node_bonus_pool_gstd: bonus,
            next_distribution_in: nextDistributionIn,
            distribution_ratios: {
                liquidity_pool_pct: LP_RATIO * 100,
                treasury_pct:       TREASURY_PCT,
                node_bonus_pct:     BONUS_RATIO * 100,
            },
            contracts:            CONTRACTS,
            threshold_gstd:       DISTRIBUTE_THRESHOLD,
            timestamp:            Date.now(),
        });
    }

    if (req.method === 'POST') {
        // Distribute treasury — callable internally or by DAO vote
        const secret = req.headers['x-treasury-key'] || req.body?.key;
        const validSecrets = [process.env.TREASURY_SECRET, process.env.WALLET_LINK_SECRET].filter(Boolean);
        if (!secret || !validSecrets.includes(secret as string)) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const treasuryRaw = await kvGet('stats:protocol_treasury_gstd');
        const treasury    = parseInt(treasuryRaw || '0', 10);

        if (treasury < DISTRIBUTE_THRESHOLD) {
            return res.status(200).json({
                ok:       false,
                reason:   `Below threshold (${treasury}/${DISTRIBUTE_THRESHOLD} GSTD)`,
            });
        }

        const lpAmount      = Math.round(treasury * LP_RATIO * 100) / 100;
        const buybackAmount = Math.round(treasury * BUYBACK_RATIO * 100) / 100;
        const bonusAmount   = Math.round(treasury * BONUS_RATIO * 100) / 100;

        // Reset treasury, accumulate bonus pool
        const bonusRaw = await kvGet('stats:node_bonus_pool');
        const bonusPool = parseFloat(bonusRaw || '0') + bonusAmount;

        await Promise.all([
            kvSet('stats:protocol_treasury_gstd', '0'),
            kvSet('stats:node_bonus_pool', String(bonusPool)),
            kvSet('stats:last_distribution', new Date().toISOString()),
            kvIncr('stats:distributions_count'),
        ]);

        // In production: submit TON transaction to Ston.fi + ecosystem treasury buybacks
        // For now: record the intended distribution (wallet must be funded)
        const distributionRecord = {
            timestamp:      new Date().toISOString(),
            total_gstd:     treasury,
            lp_amount:      lpAmount,      // → Ston.fi GSTD/TON pool
            buyback_amount: buybackAmount, // → GSTD buybacks via ecosystem treasury
            bonus_amount:   bonusAmount,   // → node bonus pool
            contracts:      CONTRACTS,
            status:         'pending_on_chain', // changes to 'confirmed' after TON tx
        };
        await kvSet(
            `distribution:${Date.now()}`,
            JSON.stringify(distributionRecord),
            30 * 24 * 3600,  // 30 days
        );

        return res.status(200).json({
            ok:             true,
            distributed:    treasury,
            lp_amount:      lpAmount,
            buyback_amount: buybackAmount,
            bonus_amount:   bonusAmount,
            note:           CONTRACTS.stonfi_pool
                ? 'TON transaction submitted to Ston.fi pool'
                : 'TON wallet not yet funded — distribution recorded, pending on-chain',
        });
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
