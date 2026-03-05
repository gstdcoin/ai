/**
 * /api/chat — Collective Intelligence Engine (Groq Only)
 *
 * Innovation: Multi-model consensus — as if 100+ expert models collaborate.
 * All models run on Groq for maximum speed.
 *
 * FREE TIER:
 *   Single model → fast response (0 GSTD)
 *
 * PAID TIERS (GSTD required):
 *   🔬 Standard (0.05 GSTD) → 3 models parallel → consensus synthesis
 *   🔥 Pro      (0.15 GSTD) → 5 models parallel → cross-verification + deep synthesis
 *   🧠 Ultra    (0.50 GSTD) → 7 models parallel → full consensus + reasoning chains
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// ─── Config ───────────────────────────────────────────────────────
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// ─── All Groq expert models ──────────────────────────────────────
interface ModelSpec {
    id: string;
    name: string;
    modelId: string;
    specialty: string;
    tempOverride?: number;
}

const ALL_EXPERTS: ModelSpec[] = [
    // Verified available on our Groq key
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', modelId: 'llama-3.3-70b-versatile', specialty: 'General knowledge, reasoning, analysis' },
    { id: 'llama-3.1-8b', name: 'Llama 3.1 8B', modelId: 'llama-3.1-8b-instant', specialty: 'Fast concise answers' },
    { id: 'llama-4-scout', name: 'Llama 4 Scout 17B', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct', specialty: 'Latest Meta, multi-expert architecture' },
    { id: 'llama-4-maverick', name: 'Llama 4 Maverick 17B', modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct', specialty: 'Creative reasoning, 128 experts' },
    { id: 'qwen3-32b', name: 'Qwen3 32B', modelId: 'qwen/qwen3-32b', specialty: 'Mathematical, analytical, Chinese/English' },
    { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', modelId: 'openai/gpt-oss-120b', specialty: 'OpenAI open-source, large-scale reasoning' },
    { id: 'gpt-oss-20b', name: 'GPT-OSS 20B', modelId: 'openai/gpt-oss-20b', specialty: 'OpenAI open-source, efficient' },
    { id: 'kimi-k2', name: 'Kimi K2', modelId: 'moonshotai/kimi-k2-instruct', specialty: 'Moonshot, long-context reasoning' },
];

// Models available for free single-use (shown in UI picker)
const FREE_MODELS = ALL_EXPERTS;

// ─── Collective tiers ──────────────────────────────────────────────
interface CollectiveTier {
    name: string;
    expertCount: number;
    cost: number;
    badge: string;
    description: string;
    synthesisPrompt: string;
}

const TIERS: Record<string, CollectiveTier> = {
    free: {
        name: 'Single Expert',
        expertCount: 1,
        cost: 0,
        badge: '🆓',
        description: 'One AI model responds',
        synthesisPrompt: '',
    },
    standard: {
        name: 'Council of 3',
        expertCount: 3,
        cost: 0.05,
        badge: '🔬',
        description: '3 AI experts reach consensus',
        synthesisPrompt: `You are the Chief Intelligence Synthesizer of a council of 3 AI experts. You received responses from multiple expert AI models to the same question. Your task:

1. ANALYZE each expert's response for accuracy, completeness, and unique insights
2. FIND CONSENSUS — where do experts agree? This is likely the most reliable answer
3. IDENTIFY unique insights each expert contributed that others missed
4. SYNTHESIZE a single superior answer that:
   - Contains the consensus truth
   - Incorporates the best unique insights from each expert
   - Is more complete and accurate than any single expert
   - Notes any disagreements between experts (if important)

Respond with the synthesized answer directly. Do NOT mention the experts or the synthesis process in your answer — just give the best possible response as if you ARE the collective intelligence. Use markdown formatting.`,
    },
    pro: {
        name: 'Panel of 5',
        expertCount: 5,
        cost: 0.15,
        badge: '🔥',
        description: '5 AI experts with cross-verification',
        synthesisPrompt: `You are the Supreme Intelligence Core of a panel of 5 expert AI models. You have responses from 5 different specialized AI models. Your mandate:

1. VERIFY FACTS — cross-check claims across all 5 experts. If 4/5 agree, it's highly reliable
2. DETECT ERRORS — if one expert contradicts the majority, flag potential inaccuracies
3. EXTRACT SPECIALIZATIONS — each expert has different strengths. Extract the best from each
4. DEEP SYNTHESIS — produce an answer that:
   - Has the reliability of 5 independent verifications
   - Contains specialized insights from each expert's strength area
   - Is structured clearly with markdown (headers, code blocks, lists)
   - Has a confidence level based on expert agreement (⭐⭐⭐⭐⭐ = all agree)
   
If experts disagree on something important, present both views with your assessment.
Respond directly with the synthesized answer. Use markdown formatting.`,
    },
    ultra: {
        name: 'Swarm of 7',
        expertCount: 7,
        cost: 0.50,
        badge: '🧠',
        description: '7 AI experts + deep reasoning chains + full verification',
        synthesisPrompt: `You are the Omega Swarm Intelligence — a collective consciousness formed from 7 expert AI models including reasoning specialists. You received answers from 7 models with different architectures.

PROTOCOL:
1. CONSENSUS MAP — identify where all or most experts agree (highest confidence)
2. SPECIALIZATION EXTRACTION — each model has unique strengths:
   - Reasoning models (DeepSeek R1, QwQ): logical chains, math proofs
   - Large models (Llama 70B): broad knowledge, nuance
   - Fast models (Gemma, 8B): concise key insights
3. ERROR DETECTION — cross-verify every factual claim across 7 sources
4. REASONING CHAINS — build step-by-step reasoning using the best chains from reasoning models
5. SYNTHESIS — produce the ultimate answer:
   - Verified by 7 independent AI models
   - Combines strengths of all architectures
   - Includes reasoning chain for complex questions
   - Notes confidence: ⭐⭐⭐⭐⭐ (7/7 agree) ⭐⭐⭐⭐ (5-6/7) ⭐⭐⭐ (4/7)
   - Is definitively better than any single model could produce

This is the highest quality AI response available. Make it exceptional.
Respond directly. Use rich markdown formatting.`,
    },
};

interface ChatMessage { role: string; content: string; }

// ─── Call a Groq model ────────────────────────────────────────────
async function callGroq(modelId: string, messages: ChatMessage[], maxTokens: number = 2048, temperature: number = 0.7): Promise<{ content: string; latency: number }> {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
        const resp = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GROQ_API_KEY}`,
            },
            body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, temperature, stream: false }),
            signal: controller.signal,
        });
        if (!resp.ok) throw new Error(`Groq ${resp.status}`);
        const data: any = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('Empty');
        return { content, latency: Date.now() - start };
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Stream from Groq ─────────────────────────────────────────────
async function* streamGroq(modelId: string, messages: ChatMessage[], maxTokens: number = 4096): AsyncGenerator<string> {
    const resp = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({ model: modelId, messages, max_tokens: maxTokens, temperature: 0.7, stream: true }),
    });
    if (!resp.ok) throw new Error(`Groq ${resp.status}`);
    const reader = resp.body?.getReader();
    if (!reader) throw new Error('No reader');
    const decoder = new TextDecoder();
    let buffer = '';
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;
            try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) yield delta;
            } catch { }
        }
    }
}

// ─── Select experts for a tier ────────────────────────────────────
function selectExperts(count: number): ModelSpec[] {
    // Return first N experts from the pool
    return ALL_EXPERTS.slice(0, Math.min(count, ALL_EXPERTS.length));
}

// Synthesizer model
const SYNTH_MODEL = 'llama-3.3-70b-versatile';

// ─── SSE Helper ───────────────────────────────────────────────────
function sendSSE(res: NextApiResponse, event: string, data: any) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ─── Groq fallback list ───────────────────────────────────────────
const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];

// ─── Main Handler ─────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { model = 'llama-3.3-70b', messages, stream = false, tier = 'free' } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages required' });
    }

    const start = Date.now();
    const collectiveTier = TIERS[tier] || TIERS.free;

    // ═══════════════════════════════════════════════════════════════
    // FREE TIER — Single expert, streaming or non-streaming
    // ═══════════════════════════════════════════════════════════════
    if (tier === 'free' || collectiveTier.expertCount <= 1) {
        const spec = ALL_EXPERTS.find(m => m.id === model) || ALL_EXPERTS[0];

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            sendSSE(res, 'meta', {
                tier: 'free', tierName: 'Single Expert', badge: '🆓',
                expertCount: 1, experts: [{ name: spec.name, specialty: spec.specialty }],
            });

            let success = false;
            let usedSpec = spec;

            // Try primary model
            try {
                for await (const chunk of streamGroq(spec.modelId, messages)) {
                    sendSSE(res, 'delta', { content: chunk });
                }
                success = true;
            } catch (err: any) {
                console.warn(`[CI] Primary ${spec.id} failed:`, err?.message?.substring(0, 60));
            }

            // Fallback through other models
            if (!success) {
                for (const fbId of FALLBACK_MODELS) {
                    if (fbId === spec.modelId) continue;
                    try {
                        for await (const chunk of streamGroq(fbId, messages)) {
                            sendSSE(res, 'delta', { content: chunk });
                        }
                        usedSpec = ALL_EXPERTS.find(m => m.modelId === fbId) || spec;
                        success = true;
                        break;
                    } catch { }
                }
            }

            if (!success) {
                sendSSE(res, 'delta', { content: '⚡ AI is temporarily busy. Please try again. 🐝' });
            }

            sendSSE(res, 'done', {
                tier: 'free', tierName: 'Single Expert', badge: '🆓',
                model: usedSpec.modelId, expertCount: 1,
                latency_ms: Date.now() - start, cost_gstd: 0,
            });
            res.end();
            return;
        }

        // Non-stream free
        for (const fbId of [spec.modelId, ...FALLBACK_MODELS]) {
            try {
                const result = await callGroq(fbId, messages);
                return res.status(200).json({
                    id: `ci-${Date.now()}`, object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000), model: fbId,
                    choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
                    collective: {
                        tier: 'free', tierName: 'Single Expert', badge: '🆓',
                        expertCount: 1, experts: [spec.name],
                        latency_ms: Date.now() - start, cost_gstd: 0,
                    },
                });
            } catch { }
        }
        return res.status(500).json({ error: 'All models unavailable' });
    }

    // ═══════════════════════════════════════════════════════════════
    // PAID TIERS — Collective Intelligence (3/5/7 Groq experts + synthesis)
    // ═══════════════════════════════════════════════════════════════
    const experts = selectExperts(collectiveTier.expertCount);
    console.log(`[CI] ${collectiveTier.badge} ${collectiveTier.name}: querying ${experts.length} Groq experts...`);

    if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');

        sendSSE(res, 'meta', {
            tier, tierName: collectiveTier.name, badge: collectiveTier.badge,
            expertCount: experts.length,
            experts: experts.map(e => ({ name: e.name, specialty: e.specialty })),
            phase: 'consulting',
        });
    }

    // Phase 1: Query all Groq experts in parallel
    const expertPromises = experts.map(expert =>
        callGroq(expert.modelId, messages, 1500, 0.7 + Math.random() * 0.15)
            .then(r => ({ ...r, expert }))
            .catch(err => {
                console.warn(`[CI] Expert ${expert.id} failed:`, err?.message?.substring(0, 60));
                return null;
            })
    );

    const rawResults = await Promise.all(expertPromises);
    const expertResults = rawResults.filter(Boolean) as Array<{ content: string; latency: number; expert: ModelSpec }>;

    if (expertResults.length === 0) {
        // All failed — single model fallback
        if (stream) {
            sendSSE(res, 'meta', { phase: 'fallback' });
            try {
                for await (const chunk of streamGroq(SYNTH_MODEL, messages)) {
                    sendSSE(res, 'delta', { content: chunk });
                }
            } catch {
                sendSSE(res, 'delta', { content: '⚡ AI is temporarily busy. Please try again.' });
            }
            sendSSE(res, 'done', { tier, expertCount: 0, latency_ms: Date.now() - start, cost_gstd: 0 });
            res.end();
            return;
        }
        return res.status(500).json({ error: 'All experts unavailable' });
    }

    console.log(`[CI] ${expertResults.length}/${experts.length} experts responded`);

    if (stream) {
        sendSSE(res, 'meta', {
            phase: 'synthesizing',
            respondedExperts: expertResults.length,
            message: `${expertResults.length} experts consulted, synthesizing consensus...`,
        });
    }

    // Phase 2: Build synthesis prompt
    const expertAnswersBlock = expertResults.map((r, i) =>
        `=== Expert ${i + 1}: ${r.expert.name} (Specialty: ${r.expert.specialty}) ===\n${r.content}`
    ).join('\n\n');

    const userQuestion = messages.filter((m: any) => m.role === 'user').pop()?.content || '';

    const synthesisMessages: ChatMessage[] = [
        { role: 'system', content: collectiveTier.synthesisPrompt },
        { role: 'user', content: `ORIGINAL QUESTION:\n${userQuestion}\n\n---\n\nEXPERT RESPONSES (${expertResults.length} models consulted):\n\n${expertAnswersBlock}` },
    ];

    // Phase 3: Stream synthesis
    if (stream) {
        sendSSE(res, 'meta', { phase: 'streaming' });

        try {
            for await (const chunk of streamGroq(SYNTH_MODEL, synthesisMessages, 4096)) {
                sendSSE(res, 'delta', { content: chunk });
            }
        } catch {
            // Fallback: send best expert answer
            const best = expertResults.reduce((a, b) => a.content.length > b.content.length ? a : b);
            sendSSE(res, 'delta', { content: best.content });
        }

        const latencyMs = Date.now() - start;
        sendSSE(res, 'done', {
            tier, tierName: collectiveTier.name, badge: collectiveTier.badge,
            expertCount: expertResults.length,
            experts: expertResults.map(r => ({ name: r.expert.name, latency: r.latency })),
            latency_ms: latencyMs, cost_gstd: collectiveTier.cost,
        });
        res.end();
        console.log(`[CI] ${collectiveTier.badge} ${collectiveTier.name}: ${expertResults.length} experts, ${latencyMs}ms`);
        return;
    }

    // Non-stream paid tier
    try {
        const synthResult = await callGroq(SYNTH_MODEL, synthesisMessages, 4096);
        const latencyMs = Date.now() - start;
        return res.status(200).json({
            id: `ci-${Date.now()}`, object: 'chat.completion',
            created: Math.floor(Date.now() / 1000), model: 'collective-intelligence',
            choices: [{ index: 0, message: { role: 'assistant', content: synthResult.content }, finish_reason: 'stop' }],
            collective: {
                tier, tierName: collectiveTier.name, badge: collectiveTier.badge,
                expertCount: expertResults.length,
                experts: expertResults.map(r => ({ name: r.expert.name, latency: r.latency })),
                latency_ms: latencyMs, cost_gstd: collectiveTier.cost,
            },
        });
    } catch {
        const best = expertResults.reduce((a, b) => a.content.length > b.content.length ? a : b);
        return res.status(200).json({
            id: `ci-${Date.now()}`, object: 'chat.completion',
            created: Math.floor(Date.now() / 1000), model: best.expert.id,
            choices: [{ index: 0, message: { role: 'assistant', content: best.content }, finish_reason: 'stop' }],
            collective: {
                tier, tierName: collectiveTier.name, badge: collectiveTier.badge,
                expertCount: expertResults.length, latency_ms: Date.now() - start, cost_gstd: collectiveTier.cost,
            },
        });
    }
}
