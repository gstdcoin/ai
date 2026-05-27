/**
 * POST /api/v1/mobile/node/register
 *
 * Register or heartbeat a mobile node. Returns session info + reward tier.
 * Called periodically (every 5 min) by the Telegram Mini App while node is active.
 *
 * Tiers based on device resources:
 *   Bronze:   CPU < 4 cores or RAM < 3GB                     — 0.5 GSTD/h
 *   Silver:   CPU 4–7 cores or RAM 3–7GB                     — 1.0 GSTD/h
 *   Gold:     CPU 8+ cores or RAM 8–15GB or bandwidth 10+    — 2.0 GSTD/h
 *   Platinum: RAM 16GB+ or bandwidth 50Mbps+                 — 5.0 GSTD/h
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../../lib/kv';

const MOBILE_NODE_TTL = 360; // 6 minutes (heartbeat every 5 min)

const TIER_RATES: Record<string, number> = {
    bronze: 0.5,
    silver: 1.0,
    gold: 2.0,
    platinum: 5.0,
};

function determineTier(cpu_cores: number, ram_gb: number, bandwidth_mbps: number): string {
    if (ram_gb >= 16 || bandwidth_mbps >= 50) return 'platinum';
    if (cpu_cores >= 8 || ram_gb >= 8 || bandwidth_mbps >= 10) return 'gold';
    if (cpu_cores >= 4 || ram_gb >= 3) return 'silver';
    return 'bronze';
}

function validateTelegramInitData(initData: string): string | null {
    // Basic validation: check that initData contains user field
    // Full HMAC validation requires TELEGRAM_BOT_TOKEN on backend
    if (!initData) return null;
    try {
        const params = new URLSearchParams(initData);
        const userStr = params.get('user');
        if (!userStr) return null;
        const user = JSON.parse(decodeURIComponent(userStr));
        return String(user.id || '');
    } catch { return null; }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const {
        telegram_init_data,
        device_id,
        cpu_cores = 4,
        ram_gb = 4,
        battery_pct = 100,
        network_type = 'wifi',
        bandwidth_mbps = 5,
        wallet_address,
    } = req.body as any;

    // Validate Telegram auth
    const tg_user_id = validateTelegramInitData(telegram_init_data);
    if (!tg_user_id) {
        return res.status(401).json({ error: 'Invalid Telegram auth' });
    }

    if (!device_id) {
        return res.status(400).json({ error: 'device_id required' });
    }

    const sessionKey = `mobile_node:${tg_user_id}:${device_id}`;
    const now = new Date().toISOString();
    const nowTs = Date.now();

    // Load existing session or start new one
    const existingRaw = await kvGet(sessionKey);
    const existing = existingRaw ? JSON.parse(existingRaw) : null;

    const tier = determineTier(Number(cpu_cores), Number(ram_gb), Number(bandwidth_mbps));
    const rate = TIER_RATES[tier];

    // Calculate earnings since last heartbeat
    let accumulatedGstd = existing?.accumulated_gstd || 0;
    if (existing?.last_heartbeat_ts) {
        const elapsedHours = (nowTs - existing.last_heartbeat_ts) / 3_600_000;
        const earned = elapsedHours * rate;
        accumulatedGstd += earned;
    }

    const session = {
        tg_user_id,
        device_id,
        wallet_address: wallet_address || existing?.wallet_address || '',
        tier,
        rate_per_hour: rate,
        cpu_cores,
        ram_gb,
        battery_pct,
        network_type,
        bandwidth_mbps,
        started_at: existing?.started_at || now,
        last_heartbeat: now,
        last_heartbeat_ts: nowTs,
        accumulated_gstd: accumulatedGstd,
        tasks_completed: existing?.tasks_completed || 0,
        uptime_minutes: existing
            ? Math.round((nowTs - new Date(existing.started_at).getTime()) / 60000)
            : 0,
        status: battery_pct < 20 ? 'low_battery' : 'active',
    };

    await kvSet(sessionKey, JSON.stringify(session), MOBILE_NODE_TTL);

    // Track active mobile nodes count
    if (!existing) {
        await kvIncr('stats:mobile_nodes_total');
    }

    return res.status(200).json({
        ok: true,
        session_key: sessionKey,
        tier,
        tier_label: tier.charAt(0).toUpperCase() + tier.slice(1),
        rate_per_hour: rate,
        accumulated_gstd: Math.round(accumulatedGstd * 10000) / 10000,
        uptime_minutes: session.uptime_minutes,
        tasks_completed: session.tasks_completed,
        status: session.status,
        next_heartbeat_ms: 300_000, // 5 min
        ttl_seconds: MOBILE_NODE_TTL,
    });
}
