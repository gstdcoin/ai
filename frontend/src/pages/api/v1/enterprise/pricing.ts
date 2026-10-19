/**
 * GET /api/v1/enterprise/pricing
 * Public pricing endpoint — compare GSTD vs AWS/Azure/OpenAI.
 * No auth required — used for marketing/onboarding.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');

    const { monthly_tokens = '10000000' } = req.query;
    const tokens = Math.max(1_000_000, Math.min(10_000_000_000, Number(monthly_tokens)));

    const gstdPer1M = 0.10;

    function cost(per1M: number) {
        return parseFloat(((tokens / 1_000_000) * per1M).toFixed(2));
    }

    const competitors = [
        {
            provider:    'OpenAI GPT-4o',
            per_1m_usd:  5.00,
            cost_usd:    cost(5.00),
            notes:       'Input tokens only; output ~3× more',
        },
        {
            provider:    'OpenAI GPT-4 Turbo',
            per_1m_usd:  10.00,
            cost_usd:    cost(10.00),
            notes:       'Input tokens; widely used in enterprise',
        },
        {
            provider:    'AWS Bedrock (Claude 3.5 Sonnet)',
            per_1m_usd:  3.00,
            cost_usd:    cost(3.00),
            notes:       'Input tokens; Claude via Amazon',
        },
        {
            provider:    'AWS Bedrock (Llama 3)',
            per_1m_usd:  0.65,
            cost_usd:    cost(0.65),
            notes:       'Open-source model, cheapest on Bedrock',
        },
        {
            provider:    'Azure OpenAI GPT-4o',
            per_1m_usd:  5.00,
            cost_usd:    cost(5.00),
            notes:       'Enterprise Azure pricing',
        },
        {
            provider:    'Google Vertex AI (Gemini Pro)',
            per_1m_usd:  3.50,
            cost_usd:    cost(3.50),
            notes:       'Gemini 1.5 Pro input',
        },
        {
            provider:    'Anthropic Claude 3.5 Sonnet (direct)',
            per_1m_usd:  3.00,
            cost_usd:    cost(3.00),
            notes:       'Direct API, no cloud markup',
        },
    ];

    const gstdCost = cost(gstdPer1M);

    const comparison = competitors.map(c => ({
        ...c,
        savings_vs_gstd_usd: parseFloat((c.cost_usd - gstdCost).toFixed(2)),
        savings_vs_gstd_pct: parseFloat(((1 - gstdPer1M / c.per_1m_usd) * 100).toFixed(1)),
        multiplier:          parseFloat((c.per_1m_usd / gstdPer1M).toFixed(1)),
    }));

    return res.status(200).json({
        gstd: {
            per_1m_tokens_usd:  gstdPer1M,
            total_cost_usd:     gstdCost,
            monthly_tokens:     tokens,
            model:              'llama3.1:8b (default) or any node-available model',
            infrastructure:     'Decentralized node network — no data center lock-in',
            why_cheaper: [
                'No AWS/Azure/GCP infrastructure markup',
                'Node operators earn rewards in GSTD — not billed hourly at cloud rates',
                'Open-source models — no per-token licensing fees',
                'P2P routing — eliminates load balancer / API gateway costs',
                'Token supply designed for accessibility, not speculation',
            ],
        },
        competitors: comparison.sort((a, b) => b.per_1m_usd - a.per_1m_usd),
        enterprise_tiers: [
            {
                name:    'Starter',
                tier:    'starter',
                price:   'Free to $9/mo',
                tokens:  '10M tokens/month',
                rpm:     10,
                features: ['API key access', 'OpenAI-compatible endpoint', 'Basic usage analytics'],
            },
            {
                name:    'Professional',
                tier:    'professional',
                price:   '$89/mo',
                tokens:  '100M tokens/month',
                rpm:     60,
                features: ['Everything in Starter', 'Model routing preferences', 'Priority node selection', 'SLA 99.5%'],
            },
            {
                name:    'Enterprise',
                tier:    'enterprise',
                price:   'Custom',
                tokens:  '1B+ tokens/month',
                rpm:     500,
                features: [
                    'Everything in Professional',
                    'Dedicated node pools',
                    'Private model deployment',
                    'Custom fine-tuned models',
                    'Dedicated support',
                    'SLA 99.9%',
                    'On-prem deployment option',
                ],
            },
        ],
        onboarding: {
            step_1: 'POST /api/v1/enterprise/keys to create an API key',
            step_2: 'Use endpoint: https://app.gstdtoken.com/api/v1/chat/completions',
            step_3: 'Authorization: Bearer gstd_your_api_key',
            step_4: 'Same format as OpenAI API — drop-in replacement',
            openai_compatible: true,
            sdk_example: `
// Drop-in OpenAI replacement
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: 'gstd_your_api_key',
  baseURL: 'https://app.gstdtoken.com/api/v1',
});

const response = await client.chat.completions.create({
  model: 'llama3.1:8b',  // or any GSTD node model
  messages: [{ role: 'user', content: 'Hello!' }],
});
            `.trim(),
        },
        timestamp: Date.now(),
    });
}
