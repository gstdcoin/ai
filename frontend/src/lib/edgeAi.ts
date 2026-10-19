/**
 * Cloudflare Workers AI fallback (free tier). Used only when no GSTD node is online,
 * so users get an answer instead of an error. Responses are labelled as edge-served.
 */
export const EDGE_MODEL = '@cf/meta/llama-3.1-8b-instruct';

export async function edgeChat(
    messages: { role: string; content: string }[],
    maxTokens = 500,
): Promise<string> {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const env: any = getCloudflareContext().env;
    if (!env?.AI?.run) throw new Error('Edge AI not configured');
    const out = await env.AI.run(EDGE_MODEL, { messages, max_tokens: maxTokens });
    return String(out?.response || '').trim();
}
