/**
 * GET /api/v1/import/verify?url=https://github.com/owner/repo
 * Verifies a GitHub repository exists and is public.
 * Proxied server-side to avoid GitHub rate limits and CSP issues.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

const BLOCKED_HOSTS = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|169\.254\.)/i;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const rawUrl = (req.query.url as string || '').trim();
    if (!rawUrl) return res.status(400).json({ error: 'url query param required' });

    // Only allow github.com URLs
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
    if (parsed.hostname !== 'github.com') return res.status(400).json({ error: 'Only github.com URLs are supported' });
    if (BLOCKED_HOSTS.test(parsed.hostname)) return res.status(400).json({ error: 'URL not allowed' });

    // Extract owner/repo from path
    const parts = parsed.pathname.replace(/^\//, '').split('/');
    if (parts.length < 2 || !parts[0] || !parts[1]) {
        return res.status(400).json({ error: 'URL must point to a GitHub repository (github.com/owner/repo)' });
    }
    const [owner, repo] = parts;

    try {
        const ghRes = await fetch(
            `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
            {
                headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'GSTD-Verify/1.0' },
                signal: AbortSignal.timeout(5000),
            },
        );

        if (ghRes.status === 404) return res.status(404).json({ error: 'Repository not found or is private' });
        if (!ghRes.ok) return res.status(502).json({ error: 'GitHub API error' });

        const ghData = await ghRes.json() as any;

        return res.status(200).json({
            ok:          true,
            name:        ghData.name,
            full_name:   ghData.full_name,
            description: ghData.description || '',
            stars:       ghData.stargazers_count,
            language:    ghData.language || '',
            topics:      ghData.topics || [],
            html_url:    ghData.html_url,
            private:     ghData.private,
        });
    } catch (err: any) {
        if (err.name === 'TimeoutError') return res.status(504).json({ error: 'GitHub API timeout' });
        return res.status(502).json({ error: 'Failed to reach GitHub API' });
    }
}
