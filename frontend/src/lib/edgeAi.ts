import { kvGet, kvSet, kvConsumeQuota } from './kv';

/**
 * Cloudflare Workers AI fallback (free tier). Used only when no GSTD node is online,
 * so users get an answer instead of an error. Protected by a global daily budget
 * (EDGE_AI_DAILY_CAP) and a short cache of identical first questions, so the free
 * quota is not burned by a burst of users.
 */
export const EDGE_MODEL = '@cf/meta/llama-3.1-8b-instruct';
const DAILY_CAP = Math.max(1, Number(process.env.EDGE_AI_DAILY_CAP) || 400);
const CACHE_TTL_SEC = 3600;

async function sha(text: string): Promise<string> {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function edgeChat(
    messages: { role: string; content: string }[],
    maxTokens = 500,
): Promise<string> {
    // Cache only context-free questions (system + a single user message).
    const cacheable = messages.filter((m) => m.role !== 'system').length === 1;
    const last = messages[messages.length - 1]?.content || '';
    const cacheKey = cacheable ? `edge_ai_cache:${await sha(last.trim().toLowerCase())}` : '';
    if (cacheKey) {
        const hit = await kvGet(cacheKey).catch(() => null);
        if (hit) return hit;
    }

    const day = new Date().toISOString().slice(0, 10);
    const budget = await kvConsumeQuota(`edge_ai_budget:${day}`, DAILY_CAP, 90_000);
    if (!budget.allowed) throw new Error('Edge AI daily budget exhausted');

    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const env: any = getCloudflareContext().env;
    if (!env?.AI?.run) throw new Error('Edge AI not configured');
    const out = await env.AI.run(EDGE_MODEL, { messages, max_tokens: maxTokens });
    const text = String(out?.response || '').trim();
    if (text && cacheKey) await kvSet(cacheKey, text, CACHE_TTL_SEC).catch(() => {});
    return text;
}