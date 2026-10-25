import type { NextApiRequest, NextApiResponse } from 'next';
import { harvestGithubEcosystem } from '../../../lib/openIntelligence';
import { isValidOpenIntelligenceCronRequest } from '../../../lib/openIntelligenceAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method not allowed' });
    }
    if (!isValidOpenIntelligenceCronRequest(req)) {
        return res.status(401).json({ error: 'Unauthorized scheduled invocation' });
    }

    try {
        const result = await harvestGithubEcosystem();
        if (!result.acquired) {
            return res.status(409).json({ ...result, error: 'A collection run is already in progress' });
        }
        if (!result.ok) {
            return res.status(502).json({ ...result, error: 'All configured GitHub sources failed' });
        }
        const failed = result.sources.filter(source =>
            source.status === 'error' || source.status === 'skipped_after_attempt',
        );
        return res.status(failed.length > 0 ? 207 : 200).json({
            ...result,
            complete: failed.length === 0,
        });
    } catch (error) {
        console.error('[open-intelligence/harvest]', error);
        return res.status(500).json({ error: 'Data collection failed' });
    }
}
