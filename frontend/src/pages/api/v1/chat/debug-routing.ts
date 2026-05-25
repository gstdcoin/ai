import type { NextApiRequest, NextApiResponse } from 'next';
import { kvKeys, kvMGet, kvGet } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const keys = await kvKeys('node:');
    const raws = keys.length ? await kvMGet(keys) : [];
    const specific = await kvGet('node:gstd-pi-bootstrap');
    
    const nodes = raws.map((raw, i) => {
        if (!raw) return { key: keys[i], status: 'null_value' };
        try {
            const n = JSON.parse(raw);
            return { key: keys[i], node_id: n.node_id, caps: n.capabilities, last_seen: n.last_seen };
        } catch {
            return { key: keys[i], status: 'parse_error', raw: raw?.slice(0, 50) };
        }
    });
    
    return res.status(200).json({ keys, nodes, specific_bootstrap: specific ? JSON.parse(specific).capabilities : null });
}
