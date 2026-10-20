import type { NextApiRequest, NextApiResponse } from 'next';
import { getGithubEcosystemDataset } from '../../../../lib/openIntelligence';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const requestedLimit = Number(req.query.limit);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 30;
    if (limit < 1 || limit > 180) {
        return res.status(400).json({ error: 'limit must be between 1 and 180' });
    }
    const requestedRepo = req.query.repo;
    if (
        requestedRepo !== undefined
        && (typeof requestedRepo !== 'string'
            || !['ai', 'gstdbot', 'A2A', 'web'].includes(requestedRepo))
    ) {
        return res.status(400).json({ error: 'repo must be one of ai, gstdbot, A2A, web' });
    }

    try {
        const dataset = await getGithubEcosystemDataset(limit);
        if (typeof requestedRepo === 'string') {
            dataset.repositories = dataset.repositories.filter(entry => entry.repository === requestedRepo);
        }
        res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
        return res.status(200).json(dataset);
    } catch (error) {
        console.error('[open-intelligence/ecosystem]', error);
        return res.status(500).json({ error: 'Could not read the published dataset' });
    }
}
