/**
 * GSTD Node Network — shared helpers for resolving and calling
 * nodes in the decentralized GSTD swarm.
 */

import { kvGet, kvKeys, kvMGet } from './kv';

export const NODE_MODEL = 'llama3.2:3b';

export interface ChatMessage {
    role: string;
    content: string;
}

export interface NodeCallOptions {
    maxTokens?: number;
    temperature?: number;
    timeoutMs?: number;
}

/**
 * Resolves the URL of a GSTD node to use for inference.
 * Resolution order: env var → GitHub file → KV store.
 */
export async function resolveNodeUrl(): Promise<string> {
    let nodeUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');

    if (!nodeUrl) {
        try {
            const ghResp = await fetch(
                `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (ghResp.ok) {
                const url = (await ghResp.text()).trim();
                if (url.startsWith('http')) nodeUrl = url;
            }
        } catch { /* GitHub unavailable */ }
    }

    if (!nodeUrl) {
        try {
            const nodeUrlKeys = await kvKeys('node_url:');
            if (nodeUrlKeys.length > 0) {
                const firstUrl = await kvGet(nodeUrlKeys[0]);
                if (firstUrl?.startsWith('http')) nodeUrl = firstUrl;
            }
            if (!nodeUrl) {
                const nodeKeys = await kvKeys('node:');
                if (nodeKeys.length > 0) {
                    const values = await kvMGet(nodeKeys);
                    for (const raw of values) {
                        if (!raw) continue;
                        try {
                            const node: any = JSON.parse(raw);
                            const url = node.node_url || node.multiaddrs?.[0];
                            if (url?.startsWith('http')) { nodeUrl = url; break; }
                        } catch { continue; }
                    }
                }
            }
        } catch { /* KV unavailable */ }
    }

    return nodeUrl.replace(/\/$/, '');
}

/**
 * Calls a GSTD node and returns the full response text.
 */
export async function callNodeChat(
    messages: ChatMessage[],
    opts: NodeCallOptions = {}
): Promise<{ content: string; latency: number }> {
    const { maxTokens = 512, temperature = 0.7, timeoutMs = 30_000 } = opts;
    const start = Date.now();
    const nodeUrl = await resolveNodeUrl();
    if (!nodeUrl) throw new Error('No GSTD node available');

    const resp = await fetch(`${nodeUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: NODE_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) throw new Error(`Node ${resp.status}`);
    const data: any = await resp.json();
    if (data._gstd?.tier === 'fallback') throw new Error('Node busy');
    const content = data.choices?.[0]?.message?.content || '';
    if (!content) throw new Error('Empty node response');
    return { content, latency: Date.now() - start };
}

/**
 * Streams a GSTD node response as an async generator of text chunks.
 */
export async function* streamNodeChat(
    messages: ChatMessage[],
    opts: NodeCallOptions = {}
): AsyncGenerator<string> {
    const { maxTokens = 2048, temperature = 0.7, timeoutMs = 55_000 } = opts;
    const nodeUrl = await resolveNodeUrl();
    if (!nodeUrl) throw new Error('No GSTD node available');

    const resp = await fetch(`${nodeUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: NODE_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream: true,
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!resp.ok) throw new Error(`Node ${resp.status}`);
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
            const chunk = line.slice(6).trim();
            if (chunk === '[DONE]') return;
            try {
                const parsed = JSON.parse(chunk);
                const delta = parsed.choices?.[0]?.delta?.content;
                if (delta) yield delta;
            } catch { continue; }
        }
    }
}
