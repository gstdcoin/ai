/**
 * POST /api/v1/chat/completions
 *
 * OpenAI-compatible chat endpoint.
 * Uses Groq API (free tier: 14,400 req/day) for inference.
 * Falls back to a minimal response if no key is configured.
 *
 * Body: { model?, messages, stream? }
 * Response: OpenAI-compatible choices array
 */
import type { NextApiRequest, NextApiResponse } from 'next';

const GROQ_MODELS: Record<string, string> = {
    'gpt-4':                    'llama-3.3-70b-versatile',
    'gpt-4o':                   'llama-3.3-70b-versatile',
    'gpt-3.5-turbo':            'llama-3.1-8b-instant',
    'llama-3.3-70b-versatile':  'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant':     'llama-3.1-8b-instant',
    'mixtral-8x7b-32768':       'mixtral-8x7b-32768',
    'gemma2-9b-it':             'gemma2-9b-it',
};

const DEFAULT_MODEL = 'llama-3.3-70b-versatile';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { messages, model, stream, max_tokens, temperature } = req.body || {};

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages array required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) {
        // Graceful degradation — no key configured
        return res.status(200).json({
            id: 'chatcmpl-nokey',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: DEFAULT_MODEL,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: 'AI inference is not configured yet. Add GROQ_API_KEY to Vercel environment variables (free at console.groq.com).',
                },
                finish_reason: 'stop',
            }],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        });
    }

    // Map model name to Groq equivalent
    const groqModel = GROQ_MODELS[model] || DEFAULT_MODEL;

    try {
        const groqResp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${groqKey}`,
            },
            body: JSON.stringify({
                model:       groqModel,
                messages,
                stream:      stream || false,
                max_tokens:  max_tokens || 2048,
                temperature: temperature ?? 0.7,
            }),
            signal: AbortSignal.timeout(30_000),
        });

        if (!groqResp.ok) {
            const err: any = await groqResp.json().catch(() => ({}));
            return res.status(groqResp.status).json({
                error: err?.error?.message || `Groq API error: ${groqResp.status}`,
            });
        }

        const data = await groqResp.json();

        // Normalize model name back to what the UI expects
        if (data.model) data.model = model || groqModel;

        return res.status(200).json(data);
    } catch (err: any) {
        console.error('[chat/completions]', err.message);
        return res.status(500).json({ error: 'Inference error: ' + err.message });
    }
}
