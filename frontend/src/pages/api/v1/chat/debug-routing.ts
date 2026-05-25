import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvGet } from '../../../../lib/kv';

const NODE_TTL_GRACE = 10 * 60_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const model = (req.query.model as string) || 'llama3.2:3b';
    const now = Date.now();

    const keys = await kvKeys('node:');
    const raws = keys.length ? await kvMGet(keys) : [];
    const specific = await kvGet('node:gstd-pi-bootstrap');

    const analysis = raws.map((raw, i) => {
        if (!raw) return { key: keys[i], skip_reason: 'null_value' };
        try {
            const n = JSON.parse(raw);
            const age = now - new Date(n.last_seen).getTime();
            const caps: string[] = n.capabilities || [];
            const expired = age > NODE_TTL_GRACE;
            const noCaps = caps.length === 0;
            const exactMatch = caps.includes(model) || caps.some((c: string) =>
                c.replace(/[^a-z0-9]/gi,'').toLowerCase() === model.replace(/[^a-z0-9]/gi,'').toLowerCase());
            const hasAI = caps.length > 0;
            const skip = expired || noCaps || (!exactMatch && !hasAI);
            return { key: keys[i], node_id: n.node_id, caps, age_ms: age, expired, noCaps, exactMatch, hasAI, skip, would_route: !skip };
        } catch(e: any) {
            return { key: keys[i], skip_reason: 'parse_error: ' + e.message };
        }
    });

    return res.status(200).json({
        model, now, keys, analysis,
        specific_bootstrap_caps: specific ? JSON.parse(specific).capabilities : null,
        would_find_node: analysis.some((a: any) => a.would_route)
    });
}
