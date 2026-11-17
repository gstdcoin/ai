import type { NextApiRequest, NextApiResponse } from 'next';
import { verifiedHostOffers } from '../../../../lib/verifiedHostOffers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'method_not_allowed' });
    }
    const { gpu, min_vram_mib, model } = req.query;
    if ((gpu !== undefined && (typeof gpu !== 'string' || !/^[A-Za-z0-9 ._()+/-]{1,80}$/.test(gpu)))
        || (model !== undefined && (typeof model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(model)))
        || (min_vram_mib !== undefined && (typeof min_vram_mib !== 'string'
            || !/^\d{1,7}$/.test(min_vram_mib) || Number(min_vram_mib) > 2097152))) {
        return res.status(400).json({ error: 'invalid_catalog_filters' });
    }
    try {
        const offers = await verifiedHostOffers({
            gpu: typeof gpu === 'string' ? gpu.trim().toLowerCase() : undefined,
            model: typeof model === 'string' ? model : undefined,
            minVramMib: min_vram_mib === undefined ? undefined : Number(min_vram_mib),
        });
        res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15');
        return res.status(200).json({ billing_unit: 'inference_request', settlement: 'gstd_ledger', offers });
    } catch {
        return res.status(503).json({ error: 'host_catalog_unavailable' });
    }
}
