/**
 * GET /api/v1/nodes/network-info
 * Onboarding endpoint — returns how to join the GSTD decentralized network.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvKeys } from '../../../../lib/kv';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const [allNodeKeys, mobileNodeKeys, totalMintedRaw, totalStakedRaw] = await Promise.all([
            kvKeys('node:'),
            kvKeys('mobile_node:'),
            kvGet('stats:total_minted'),
            kvGet('stats:total_staked'),
        ]);

        const activeServerNodes = allNodeKeys.filter((k: string) => !k.slice(5).includes(':')).length;
        const activeMobileNodes = mobileNodeKeys.length;

        return res.status(200).json({
            network: {
                name: 'GSTD Decentralized Node Network',
                version: '3.0',
                status: activeServerNodes + activeMobileNodes > 0 ? 'live' : 'bootstrapping',
                active_server_nodes: activeServerNodes,
                active_mobile_nodes: activeMobileNodes,
                total_nodes: activeServerNodes + activeMobileNodes,
                total_minted_gstd: parseFloat(totalMintedRaw || '0'),
                total_staked_gstd: parseFloat(totalStakedRaw || '0'),
            },
            node_types: [
                {
                    type: 'server',
                    name: 'Full Node',
                    description: 'Linux/Mac/Windows server — provides AI inference, storage, and P2P routing',
                    min_requirements: { ram_gb: 4, storage_gb: 20, bandwidth_mbps: 10 },
                    earn_per_hour: '2–10 GSTD',
                    setup: 'docker run -d -p 8080:8080 -e GSTD_WALLET_ADDRESS=YOUR_WALLET ghcr.io/gstdcoin/gstd-node:latest',
                    docs_url: 'https://github.com/gstdcoin/gstdbot',
                },
                {
                    type: 'mobile',
                    name: 'Mobile Node',
                    description: 'Android/iOS via Telegram Mini App — lightweight relay and caching',
                    tiers: [
                        { tier: 'Bronze', earn_per_hour: 0.5, requirements: 'Any phone' },
                        { tier: 'Silver', earn_per_hour: 1.0, requirements: '4+ CPU cores or 3+ GB RAM' },
                        { tier: 'Gold',   earn_per_hour: 2.0, requirements: '8+ cores or 8+ GB RAM or 10Mbps' },
                        { tier: 'Platinum', earn_per_hour: 5.0, requirements: '16+ GB RAM or 50Mbps bandwidth' },
                    ],
                    setup: 'Open @gstdaibot on Telegram → Launch Node',
                    docs_url: 'https://t.me/gstdaibot',
                },
            ],
            services: [
                { name: 'AI Inference',        description: 'Run open-source models (Llama, Mistral, Qwen)', status: 'live' },
                { name: 'Decentralized Storage', description: 'IPFS-based file storage with GSTD payments', status: 'live' },
                { name: 'P2P Traffic Relay',   description: 'Route network traffic for rewards', status: 'beta' },
                { name: 'Federated Training',  description: 'Fine-tune LoRA adapters via QLoRA on distributed nodes — live at /training', status: 'live' },
                { name: 'GPU Compute',         description: 'Sell GPU time for rendering and ML training', status: 'coming_soon' },
                { name: 'Blockchain Hosting',  description: 'Host blockchain nodes and validators', status: 'coming_soon' },
            ],
            sovereignty: {
                description: 'GSTD is a fully decentralized network — no central authority controls it.',
                no_groq: true,
                no_openai: true,
                no_aws: true,
                all_inference_on_network: true,
                token: 'GSTD on TON blockchain',
            },
            quick_start: {
                telegram: 'https://t.me/gstdaibot',
                docker: 'docker run -d -p 8080:8080 -e GSTD_WALLET_ADDRESS=<your-wallet> ghcr.io/gstdcoin/gstd-node:latest',
                github: 'https://github.com/gstdcoin/gstdbot',
            },
        });
    } catch (err: any) {
        console.error('[nodes/network-info]', err.message);
        return res.status(500).json({ error: 'Internal error' });
    }
}
