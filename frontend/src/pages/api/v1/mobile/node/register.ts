/** Mobile interface session only. Presence is not compute and earns no GSTD. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr, kvKeys } from '../../../../../lib/kv';
import { validateTelegramInitData } from '../../../../../lib/telegramAuth';

const MOBILE_NODE_TTL = 360; // 6 minutes (heartbeat every 5 min)
const MAX_SESSIONS_PER_USER = 3;

// Realistic phone/tablet upper bounds — clamp rather than reject so genuine
// high-end devices aren't blocked, but claimed specs can no longer be
// inflated arbitrarily to farm the Platinum rate for free.
function clampDeviceSpecs(cpu_cores: number, ram_gb: number, bandwidth_mbps: number) {
    return {
        cpu_cores: Math.max(1, Math.min(12, Number(cpu_cores) || 1)),
        ram_gb: Math.max(0.5, Math.min(16, Number(ram_gb) || 1)),
        bandwidth_mbps: Math.max(0, Math.min(100, Number(bandwidth_mbps) || 0)),
    };
}

function determineTier(cpu_cores: number, ram_gb: number, bandwidth_mbps: number): string {
    if (ram_gb >= 16 || bandwidth_mbps >= 50) return 'platinum';
    if (cpu_cores >= 8 || ram_gb >= 8 || bandwidth_mbps >= 10) return 'gold';
    if (cpu_cores >= 4 || ram_gb >= 3) return 'silver';
    return 'bronze';
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
    if (existing?.wallet_address && wallet_address && existing.wallet_address !== wallet_address) {
        return res.status(403).json({ error: 'This mobile session is already linked to a different wallet' });
    }

    // Cap concurrent sessions per Telegram user — without this, one user could
    // spin up unlimited device_ids to farm rewards many times over.
    if (!existing) {
        const userSessions = await kvKeys(`mobile_node:${tg_user_id}:`);
        if (userSessions.length >= MAX_SESSIONS_PER_USER) {
            return res.status(429).json({
                error: 'too_many_sessions',
                message: `Max ${MAX_SESSIONS_PER_USER} active mobile node sessions per account.`,
            });
        }
    }

    const clamped = clampDeviceSpecs(cpu_cores, ram_gb, bandwidth_mbps);
    const tier = determineTier(clamped.cpu_cores, clamped.ram_gb, clamped.bandwidth_mbps);
    const rate = 0;
    const accumulatedGstd = 0; // No presence-based token credits.

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
