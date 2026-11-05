/**
 * GET /api/v1/mobile/node/status?tg_user_id=...&device_id=...
 * Returns current mobile node session stats.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from '../../../../../lib/kv';
import {validateTelegramInitData} from '../../../../../lib/telegramAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control','private, no-store');
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const proof=req.headers['x-telegram-init-data'];
    const owner=typeof proof==='string'?validateTelegramInitData(proof):null;
    if(!owner)return res.status(401).json({error:'Invalid Telegram auth'});
    const {device_id,tg_user_id:asserted}=req.query;
    if(typeof device_id!=='string'||device_id.length<1||device_id.length>128)return res.status(400).json({error:'device_id required (1-128 characters)'});
    if(asserted!==undefined&&(typeof asserted!=='string'||asserted!==String(owner)))return res.status(403).json({error:'Telegram owner mismatch'});
    const tg_user_id=String(owner);

    const sessionKey = `mobile_node:${tg_user_id}:${device_id}`;
    const raw = await kvGet(sessionKey);

    if (!raw) {
        return res.status(404).json({ error: 'No active session', active: false });
    }

    const session = JSON.parse(raw);
    const nowTs = Date.now();
    const lastHeartbeatAge = Math.round((nowTs - (session.last_heartbeat_ts || nowTs)) / 1000);
    const isStale = lastHeartbeatAge > 360; // 6 min TTL

    // Presence is not accepted compute and must never synthesize a reward.
    const liveGstd=0;

    return res.status(200).json({
        active: !isStale,
        tier: session.tier,
        tier_label: (session.tier || 'bronze').charAt(0).toUpperCase() + (session.tier || 'bronze').slice(1),
        rate_per_hour: 0,
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
