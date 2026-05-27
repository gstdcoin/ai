/**
 * GET /api/v1/mobile/node/status?tg_user_id=...&device_id=...
 * Returns current mobile node session stats.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { tg_user_id, device_id } = req.query as Record<string, string>;
    if (!tg_user_id || !device_id) {
        return res.status(400).json({ error: 'tg_user_id and device_id required' });
    }

    const sessionKey = `mobile_node:${tg_user_id}:${device_id}`;
    const raw = await kvGet(sessionKey);

    if (!raw) {
        return res.status(404).json({ error: 'No active session', active: false });
    }

    const session = JSON.parse(raw);
    const nowTs = Date.now();
    const lastHeartbeatAge = Math.round((nowTs - (session.last_heartbeat_ts || nowTs)) / 1000);
    const isStale = lastHeartbeatAge > 360; // 6 min TTL

    // Calculate live accumulated earnings
    let liveGstd = session.accumulated_gstd || 0;
    if (session.last_heartbeat_ts && !isStale) {
        const elapsedHours = (nowTs - session.last_heartbeat_ts) / 3_600_000;
        liveGstd += elapsedHours * (session.rate_per_hour || 0.5);
    }

    return res.status(200).json({
        active: !isStale,
        tier: session.tier,
        tier_label: (session.tier || 'bronze').charAt(0).toUpperCase() + (session.tier || 'bronze').slice(1),
        rate_per_hour: session.rate_per_hour,
        accumulated_gstd: Math.round(liveGstd * 10000) / 10000,
        uptime_minutes: isStale ? session.uptime_minutes : Math.round((nowTs - new Date(session.started_at).getTime()) / 60000),
        tasks_completed: session.tasks_completed || 0,
        status: isStale ? 'offline' : session.status,
        last_heartbeat_age_s: lastHeartbeatAge,
        wallet_address: session.wallet_address || '',
        started_at: session.started_at,
        battery_pct: session.battery_pct,
        network_type: session.network_type,
    });
}
