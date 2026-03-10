/**
 * /api/chat â€” Collective Intelligence Engine (Groq Only)
 *
 * Innovation: Multi-model consensus â€” as if 100+ expert models collaborate.
 * All models run on Groq for maximum speed.
 *
 * FREE TIER:
 *   Single model â†’ fast response (0 GSTD)
 *
 * PAID TIERS (GSTD required):
 *   ðŸ”¬ Standard (0.05 GSTD) â†’ 3 models parallel â†’ consensus synthesis
 *   ðŸ”¥ Pro      (0.15 GSTD) â†’ 5 models parallel â†’ cross-verification + deep synthesis
 *   ðŸ§  Ultra    (0.50 GSTD) â†’ 7 models parallel â†’ full consensus + reasoning chains
 */

import type { NextApiRequest, NextApiResponse } from 'next';

// â”€â”€â”€ Config â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// â”€â”€â”€ All Groq expert models â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface ModelSpec {
    id: string;
    name: string;
    modelId: string;
    specialty: string;
    systemPrompt: string; // Deep thinking prompt per expert
    tempOverride?: number;
}

// Deep-thinking system prompt that forces structured reasoning
const DEEP_THINK = (specialty: string) => `You are a world-class expert in ${specialty}. You are part of a panel of AI experts whose answers will be cross-verified.

RULES FOR EVERY RESPONSE:
1. THINK STEP BY STEP. Before answering, analyze the question from multiple angles.
2. If the question involves facts â€” cite specific sources, dates, numbers. Never fabricate.
3. If the question involves reasoning â€” show your logical chain explicitly.
4. If the question involves code â€” write production-quality code with error handling.
5. If you are UNSURE about something, explicitly say "I'm not certain about X" rather than guessing.
6. Be brutally precise. Vague answers are worse than no answer.
7. ALWAYS respond in the SAME LANGUAGE as the user's question.
8. Use markdown formatting: headers, bold, code blocks, lists.
9. Your answer will be compared against other expert AI models. Be thorough.`;

const ALL_EXPERTS: ModelSpec[] = [
    // Ranked by reasoning capability (strongest first for paid tiers)
    { id: 'qwen3-32b', name: 'Qwen3 32B', modelId: 'qwen/qwen3-32b', specialty: 'mathematical reasoning, logic, analytical thinking', systemPrompt: DEEP_THINK('mathematical reasoning and analytical problem-solving') },
    { id: 'llama-3.3-70b', name: 'Llama 3.3 70B', modelId: 'llama-3.3-70b-versatile', specialty: 'broad knowledge, nuanced reasoning, complex analysis', systemPrompt: DEEP_THINK('general knowledge, research, and complex multi-step reasoning') },
    { id: 'gpt-oss-120b', name: 'GPT-OSS 120B', modelId: 'openai/gpt-oss-120b', specialty: 'large-scale reasoning, deep knowledge', systemPrompt: DEEP_THINK('large-scale reasoning, scientific knowledge, and deep analysis') },
    { id: 'kimi-k2', name: 'Kimi K2', modelId: 'moonshotai/kimi-k2-instruct', specialty: 'long-context reasoning, detailed analysis', systemPrompt: DEEP_THINK('long-context understanding, detailed analysis, and thorough research') },
    { id: 'llama-4-maverick', name: 'Llama 4 Maverick', modelId: 'meta-llama/llama-4-maverick-17b-128e-instruct', specialty: 'creative problem-solving, unconventional approaches', systemPrompt: DEEP_THINK('creative reasoning, novel approaches, and thinking outside conventional frameworks') },
    { id: 'llama-4-scout', name: 'Llama 4 Scout', modelId: 'meta-llama/llama-4-scout-17b-16e-instruct', specialty: 'rapid assessment, pattern recognition', systemPrompt: DEEP_THINK('rapid assessment, pattern recognition, and identifying key insights') },
    { id: 'gpt-oss-20b', name: 'GPT-OSS 20B', modelId: 'openai/gpt-oss-20b', specialty: 'efficient reasoning, concise expert answers', systemPrompt: DEEP_THINK('efficient problem-solving and concise expert-level answers') },
    { id: 'llama-3.1-8b', name: 'Llama 3.1 8B', modelId: 'llama-3.1-8b-instant', specialty: 'fast verification, sanity checks', systemPrompt: DEEP_THINK('fast verification, finding errors in reasoning, and sanity-checking conclusions') },
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
        badge: 'ðŸ†“',
        description: 'One AI model responds',
        synthesisPrompt: '',
    },
    standard: {
        name: 'Council of 3',
        expertCount: 3,
        cost: 0.05,
        badge: 'ðŸ”¬',
        description: '3 AI experts reach consensus',
        synthesisPrompt: `You are the Synthesis Engine of a council of 3 expert AI models. You received independent responses from 3 different AI architectures to the same question.

YOUR PROTOCOL (follow EXACTLY):

STEP 1 â€” FACT EXTRACTION: From each expert, extract every factual claim, number, date, name, and logical conclusion.

STEP 2 â€” CROSS-VERIFICATION: For each fact:
  - 3/3 agree â†’ HIGH CONFIDENCE (include as verified)
  - 2/3 agree â†’ MEDIUM (include, note if the dissenter has a valid point)
  - 1/3 claims alone â†’ LOW (include only if it's clearly a specialized insight the others missed)
  - Contradictions â†’ analyze which expert's reasoning is stronger and explain why

STEP 3 â€” SYNTHESIS: Produce one answer that is STRICTLY BETTER than any individual expert:
  - Start with the most important/actionable information
  - Include all verified facts with the strongest reasoning chains
  - Add specialized insights that only one expert caught (if valid)
  - Use the clearest explanation style from all experts
  - If the question has code: merge the best code from all experts into one optimal solution
  - If the question has math: show the rigorous proof, not just the answer

CRITICAL RULES:
- NEVER mention "experts" or "models" or the synthesis process
- Respond as if YOU are the intelligence â€” the user should see only the best possible answer
- Respond in the SAME LANGUAGE as the original question
- Use rich markdown: headers, bold, code blocks with language tags, numbered lists, tables when appropriate
- Be thorough but not redundant. Every sentence must add value.`,
    },
    pro: {
        name: 'Panel of 5',
        expertCount: 5,
        cost: 0.15,
        badge: 'ðŸ”¥',
        description: '5 AI experts with cross-verification',
        synthesisPrompt: `You are the Supreme Synthesis Engine of a cross-verification panel. 5 independent AI models with different architectures have analyzed the same question. Your job is to produce an answer that NO SINGLE AI MODEL could produce alone.

YOUR PROTOCOL (follow EXACTLY):

PHASE 1 â€” DISAGREEMENT ANALYSIS:
  - Identify ALL points where experts disagree
  - For each disagreement: analyze which expert has stronger evidence/reasoning
  - Flag any expert that appears to be hallucinating (confident but wrong)

PHASE 2 â€” KNOWLEDGE FUSION:
  - Mathematics: take the expert with the most rigorous proof
  - Code: merge the best patterns, error handling, and optimizations from all experts
  - Facts: only include claims verified by 3+ experts (unless a specialist has unique domain knowledge)
  - Reasoning: build the strongest logical chain by combining steps from multiple experts
  - Creative questions: combine the most original ideas

PHASE 3 â€” SUPERIOR ANSWER:
  - Your answer must demonstrate DEEPER understanding than any single expert
  - Include information that requires combining insights from multiple experts
  - If a question has multiple valid approaches, present the best one with brief mention of alternatives
  - For technical questions: production-quality code, proper error handling, edge cases
  - For research questions: structured analysis with evidence hierarchy

CRITICAL RULES:
- NEVER mention the panel, experts, models, or synthesis process
- Respond in the SAME LANGUAGE as the original question
- Use rich markdown formatting. Be comprehensive but not verbose.
- Every claim must be backed by reasoning. No hand-waving.`,
    },
    ultra: {
        name: 'Swarm of 7',
        expertCount: 7,
        cost: 0.50,
        badge: 'ðŸ§ ',
        description: '7 AI experts + deep reasoning chains + full verification',
        synthesisPrompt: `You are the Omega Synthesis Engine â€” the most powerful intelligence fusion system ever built. 7 different AI architectures have independently analyzed the same question, each bringing unique capabilities:
  - Large reasoning models: deep multi-step logic, broad knowledge
  - Mathematical specialists: rigorous proofs, analytical precision
  - Creative models: novel approaches, unconventional solutions
  - Verification models: error detection, sanity checking

YOU MUST PRODUCE THE BEST POSSIBLE ANSWER IN EXISTENCE. Follow this protocol:

PHASE 1 â€” DEEP VERIFICATION:
  For each factual claim across all 7 experts:
  - Count how many experts agree (N/7)
  - If N â‰¥ 5: VERIFIED FACT
  - If N = 3-4: PROBABLE (include with appropriate confidence)
  - If N â‰¤ 2: UNVERIFIED (only include if the expert's reasoning is exceptionally strong)
  - CONTRADICTIONS: resolve with the stronger logical chain

PHASE 2 â€” REASONING CHAIN CONSTRUCTION:
  - Extract the best reasoning steps from ALL experts
  - Build a SINGLE superior reasoning chain that:
    â€¢ Has no logical gaps
    â€¢ Uses the strongest evidence from each expert
    â€¢ Goes DEEPER than any individual expert
  - For math/logic: show complete derivation
  - For code: production-quality with tests, edge cases, performance considerations
  - For analysis: use frameworks, comparisons, evidence hierarchies

PHASE 3 â€” KNOWLEDGE AMPLIFICATION:
  - Identify insights that ONLY ONE expert provided â€” these are gold
  - Combine specialized knowledge to create NEW insights no single expert could reach
  - If the question allows: provide actionable next steps, not just information

PHASE 4 â€” FINAL ANSWER:
  - This must be the most thorough, accurate, well-structured answer possible
  - Structure: clear hierarchy with headers for complex topics
  - Include: concrete examples, specific numbers, working code
  - Exclude: vagueness, hedging, unnecessary disclaimers

CRITICAL: Never mention experts, models, or the synthesis process. Respond in the user's language. Use rich markdown.`,
    },
};

interface ChatMessage { role: string; content: string; }

// Strip <think>...</think> reasoning blocks from model output
// These are internal chain-of-thought tokens that shouldn't be shown to users
function stripThinkBlocks(text: string): string {
    return text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim();
}

// â”€â”€â”€ Call a Groq model â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        return { content: stripThinkBlocks(content), latency: Date.now() - start };
    } finally {
        clearTimeout(timeout);
    }
}

// â”€â”€â”€ Stream from Groq â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// Streaming variant that filters <think> blocks in real-time
async function* streamGroqClean(modelId: string, messages: ChatMessage[], maxTokens: number = 4096): AsyncGenerator<string> {
    let insideThink = false;
    let thinkBuffer = '';
    for await (const chunk of streamGroq(modelId, messages, maxTokens)) {
        if (insideThink) {
            thinkBuffer += chunk;
            if (thinkBuffer.includes('</think>')) {
                // End of think block — emit everything after </think>
                const afterThink = thinkBuffer.split('</think>').slice(1).join('</think>').replace(/^\s+/, '');
                insideThink = false;
                thinkBuffer = '';
                if (afterThink) yield afterThink;
            }
        } else if (chunk.includes('<think>')) {
            // Start of think block
            const parts = chunk.split('<think>');
            if (parts[0]) yield parts[0]; // emit text before <think>
            thinkBuffer = parts.slice(1).join('<think>');
            if (thinkBuffer.includes('</think>')) {
                const afterThink = thinkBuffer.split('</think>').slice(1).join('</think>').replace(/^\s+/, '');
                insideThink = false;
                thinkBuffer = '';
                if (afterThink) yield afterThink;
            } else {
                insideThink = true;
            }
        } else {
            yield chunk;
        }
    }
}

// â”€â”€â”€ Select experts for a tier â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function selectExperts(count: number): ModelSpec[] {
    // Experts are pre-ranked by reasoning capability (strongest first)
    // For 3 experts: Qwen3 32B (math), Llama 70B (broad), GPT-OSS 120B (deep)
    // For 5: + Kimi K2 (long-context) + Maverick (creative)
    // For 7: + Scout (patterns) + GPT-OSS 20B (efficient verification)
    return ALL_EXPERTS.slice(0, Math.min(count, ALL_EXPERTS.length));
}

// Use the strongest available model for synthesis
const SYNTH_MODEL = 'qwen/qwen3-32b';
const SYNTH_FALLBACK = 'llama-3.3-70b-versatile';

// â”€â”€â”€ SSE Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function sendSSE(res: NextApiResponse, event: string, data: any) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// â”€â”€â”€ Groq fallback list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const FALLBACK_MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-70b-versatile', 'llama-3.1-8b-instant'];

// â”€â”€â”€ Main Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { model = 'llama-3.3-70b', messages, stream = false, tier = 'free' } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({ error: 'messages required' });
    }

    const wallet = (req.headers['x-wallet-address'] as string) || '';
    const start = Date.now();
    const collectiveTier = TIERS[tier] || TIERS.free;

    // â•�â•�â•� GSTD DEDUCTION: Paid tiers require wallet + balance â•�â•�â•�
    // Calls backend to deduct GSTD before AI inference runs
    if (collectiveTier.cost > 0) {
        if (!wallet) {
            return res.status(402).json({
                error: 'wallet_required',
                message: `Connect your wallet to use ${collectiveTier.name} (${collectiveTier.cost} GSTD). Free tier is available without wallet.`,
                cost: collectiveTier.cost,
            });
        }

        // Deduct GSTD via backend API
        const BACKEND_URL = process.env.BACKEND_URL || 'http://172.18.0.1:8080';
        try {
            const deductResp = await fetch(`${BACKEND_URL}/api/v1/chat/deduct`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: wallet, amount: collectiveTier.cost, tier, tier_name: collectiveTier.name }),
            });

            if (deductResp.ok) {
                const deductData = await deductResp.json();
                console.log(`[CI] ðŸ’° Deducted ${collectiveTier.cost} GSTD from ${wallet.substring(0, 12)}... (remaining: ${deductData.remaining || '?'})`);
            } else if (deductResp.status === 404) {
                // Endpoint not yet deployed â€” allow inference but log warning
                console.warn(`[CI] âš ï¸ /chat/deduct endpoint not available â€” proceeding without deduction`);
            } else {
                const errData = await deductResp.json().catch(() => ({ message: 'Deduction failed' }));
                return res.status(402).json({
                    error: 'insufficient_balance',
                    message: errData.message || `Need ${collectiveTier.cost} GSTD for ${collectiveTier.name}. Top up or switch to free tier.`,
                    cost: collectiveTier.cost,
                    balance: errData.balance || 0,
                });
            }
        } catch (err: any) {
            // Backend unreachable â€” allow inference but log error
            console.error(`[CI] âš ï¸� Backend deduction failed (network):`, err?.message?.substring(0, 80));
        }
    }

    // â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�
    // FREE TIER â€” Single expert, streaming or non-streaming
    // â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�
    if (tier === 'free' || collectiveTier.expertCount <= 1) {
        const spec = ALL_EXPERTS.find(m => m.id === model) || ALL_EXPERTS[0];
        // Even free tier gets the deep-thinking system prompt for better quality
        const enrichedMessages: ChatMessage[] = [
            { role: 'system', content: spec.systemPrompt },
            ...messages.filter((m: ChatMessage) => m.role !== 'system'),
        ];

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache, no-transform');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            sendSSE(res, 'meta', {
                tier: 'free', tierName: 'Single Expert', badge: 'ðŸ†“',
                expertCount: 1, experts: [{ name: spec.name, specialty: spec.specialty }],
            });

            let success = false;
            let usedSpec = spec;

            // Try primary model
            try {
                for await (const chunk of streamGroqClean(spec.modelId, enrichedMessages)) {
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
                        for await (const chunk of streamGroqClean(fbId, messages)) {
                            sendSSE(res, 'delta', { content: chunk });
                        }
                        usedSpec = ALL_EXPERTS.find(m => m.modelId === fbId) || spec;
                        success = true;
                        break;
                    } catch { }
                }
            }

            if (!success) {
                sendSSE(res, 'delta', { content: 'âš¡ AI is temporarily busy. Please try again. ðŸ��' });
            }

            sendSSE(res, 'done', {
                tier: 'free', tierName: 'Single Expert', badge: 'ðŸ†“',
                model: usedSpec.name, modelId: usedSpec.modelId, expertCount: 1,
                latency_ms: Date.now() - start, cost_gstd: 0,
            });
            res.end();
            return;
        }

        // Non-stream free
        for (const fbId of [spec.modelId, ...FALLBACK_MODELS]) {
            try {
                const result = await callGroq(fbId, enrichedMessages);
                return res.status(200).json({
                    id: `ci-${Date.now()}`, object: 'chat.completion',
                    created: Math.floor(Date.now() / 1000), model: fbId,
                    choices: [{ index: 0, message: { role: 'assistant', content: result.content }, finish_reason: 'stop' }],
                    collective: {
                        tier: 'free', tierName: 'Single Expert', badge: 'ðŸ†“',
                        expertCount: 1, experts: [spec.name],
                        latency_ms: Date.now() - start, cost_gstd: 0,
                    },
                });
            } catch { }
        }
        return res.status(500).json({ error: 'All models unavailable' });
    }

    // â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�
    // PAID TIERS â€” Collective Intelligence (3/5/7 Groq experts + synthesis)
    // â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�â•�
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

    // Phase 1: Query all Groq experts in parallel WITH specialized system prompts
    // Each expert gets its own deep-thinking instruction + low temperature for precision
    const expertPromises = experts.map(expert => {
        const expertMessages: ChatMessage[] = [
            { role: 'system', content: expert.systemPrompt },
            ...messages,
        ];
        return callGroq(expert.modelId, expertMessages, 3000, 0.3)
            .then(r => ({ ...r, expert }))
            .catch(err => {
                console.warn(`[CI] Expert ${expert.id} failed:`, err?.message?.substring(0, 60));
                return null;
            });
    });

    const rawResults = await Promise.all(expertPromises);
    const expertResults = rawResults.filter(Boolean) as Array<{ content: string; latency: number; expert: ModelSpec }>;

    if (expertResults.length === 0) {
        // All failed â€” single model fallback with deep thinking
        if (stream) {
            sendSSE(res, 'meta', { phase: 'fallback' });
            const fallbackMessages: ChatMessage[] = [
                { role: 'system', content: DEEP_THINK('general knowledge') },
                ...messages,
            ];
            try {
                for await (const chunk of streamGroqClean(SYNTH_FALLBACK, fallbackMessages)) {
                    sendSSE(res, 'delta', { content: chunk });
                }
            } catch {
                sendSSE(res, 'delta', { content: 'âš¡ AI is temporarily busy. Please try again.' });
            }
            sendSSE(res, 'done', { tier, expertCount: 0, latency_ms: Date.now() - start, cost_gstd: 0 });
            res.end();
            return;
        }
        return res.status(500).json({ error: 'All experts unavailable' });
    }

    console.log(`[CI] ${expertResults.length}/${experts.length} experts responded (avg ${Math.round(expertResults.reduce((a,r) => a+r.content.length, 0)/expertResults.length)} chars)`);

    if (stream) {
        sendSSE(res, 'meta', {
            phase: 'synthesizing',
            respondedExperts: expertResults.length,
            message: `${expertResults.length} experts analyzed, cross-verifying and synthesizing...`,
        });
    }

    // Phase 2: Build structured synthesis input
    // Give the synthesizer a clear structure to work with
    const userQuestion = messages.filter((m: any) => m.role === 'user').pop()?.content || '';
    const conversationContext = messages.filter((m: any) => m.role !== 'system').slice(0, -1)
        .map((m: any) => `${m.role}: ${m.content}`).join('\n');

    const expertAnswersBlock = expertResults.map((r, i) =>
        `â”�â”�â”� EXPERT ${i + 1}: ${r.expert.name} (${r.expert.specialty}) [${r.latency}ms, ${r.content.length} chars] â”�â”�â”�\n${r.content}`
    ).join('\n\n');

    const synthesisMessages: ChatMessage[] = [
        { role: 'system', content: collectiveTier.synthesisPrompt },
        { role: 'user', content: `${conversationContext ? `CONVERSATION CONTEXT:\n${conversationContext}\n\n` : ''}CURRENT QUESTION:\n${userQuestion}\n\nâ”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�\nINDEPENDENT EXPERT ANALYSES (${expertResults.length} models):\nâ”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�â”�\n\n${expertAnswersBlock}` },
    ];

    // Phase 3: Stream synthesis
    if (stream) {
        sendSSE(res, 'meta', { phase: 'streaming' });

        try {
            for await (const chunk of streamGroqClean(SYNTH_MODEL, synthesisMessages, 4096)) {
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
