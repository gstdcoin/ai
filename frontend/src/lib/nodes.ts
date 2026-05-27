/**
 * GSTD Node Network — shared helpers for resolving and calling
 * nodes in the decentralized GSTD swarm.
 *
 * Multi-node routing (swarmzero pattern):
 *   - getActiveNodes()    — returns all online nodes with resource metadata
 *   - scoreNode()         — datenlord locality scoring: prefer nodes with model hot in RAM
 *   - callNodeChat()      — routes to best-scored node, fallback chain
 *   - callNodeParallel()  — fan-out to N nodes, first valid response wins (Pro/Ultra tier)
 *   - streamNodeChat()    — streaming from best node
 */

import { kvGet, kvKeys, kvMGet } from './kv';

export const NODE_MODEL = 'llama3.2:3b';

export interface ChatMessage {
    role: string;
    content: string;
}

export interface NodeCallOptions {
    maxTokens?:   number;
    temperature?: number;
    timeoutMs?:   number;
    parallel?:    boolean;  // fan-out to multiple nodes (Pro/Ultra tier)
    model?:       string;   // preferred model for locality scoring
}

export interface ActiveNode {
    nodeId:      string;
    url:         string;
    score:       number;
    models:      string[];  // models loaded in Ollama on this node
    ramFreeMb:   number;
    cpuScore:    number;
    lastSeenMs:  number;    // ms since last heartbeat
}

// ── Node discovery ────────────────────────────────────────────────────────────

/**
 * Returns all online nodes, sorted by locality score (best first).
 * Score = (hasModel ? 100 : 0) + (ramFree_GB * 10) + (cpuScore * 0.1)
 * Concept from datenlord: route to nodes where the requested model is already loaded.
 */
export async function getActiveNodes(preferModel?: string): Promise<ActiveNode[]> {
    const model = preferModel || NODE_MODEL;
    const nodes: ActiveNode[] = [];

    try {
        const nodeKeys = await kvKeys('node:');
        if (!nodeKeys.length) return nodes;

        const values = await kvMGet(nodeKeys);
        const now    = Date.now();

        for (const raw of values) {
            if (!raw) continue;
            try {
                const n: any   = JSON.parse(raw);
                const url: string = n.node_url || n.multiaddrs?.[0] || '';
                if (!url.startsWith('http')) continue;

                const lastSeenMs = now - new Date(n.last_seen || 0).getTime();
                if (lastSeenMs > 600_000) continue; // TTL guard — node expired

                const models: string[]  = n.capabilities || n.models || [];
                const ramFreeMb: number = n.ram_free_mb  ?? (n.ram_mb ? n.ram_mb * 0.4 : 0);
                const cpuScore: number  = n.cpu_score    ?? n.cpu_cores * 10;
                const hasModel          = models.some(
                    (m: string) => m.toLowerCase().includes(model.toLowerCase().split(':')[0])
                );
                const score = (hasModel ? 100 : 0) + (ramFreeMb / 1024) * 10 + cpuScore * 0.1;

                nodes.push({ nodeId: n.node_id, url: url.replace(/\/$/, ''), score, models, ramFreeMb, cpuScore, lastSeenMs });
            } catch { continue; }
        }
    } catch { /* KV unavailable */ }

    return nodes.sort((a, b) => b.score - a.score);
}

/**
 * Resolves the single best node URL to use for inference.
 * Resolution order: env var → scored KV nodes → GitHub fallback file.
 */
export async function resolveNodeUrl(preferModel?: string): Promise<string> {
    // Env override (e.g. in CI or for testing)
    const envUrl = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');
    if (envUrl) return envUrl;

    // Best scored active node from KV
    const active = await getActiveNodes(preferModel);
    if (active.length > 0) return active[0].url;

    // Fallback: GitHub file (single Pi node publishing its tunnel URL)
    try {
        const ghResp = await fetch(
            `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
            { signal: AbortSignal.timeout(4000) }
        );
        if (ghResp.ok) {
            const url = (await ghResp.text()).trim().replace(/\/$/, '');
            if (url.startsWith('http')) return url;
        }
    } catch { /* GitHub unavailable */ }

    return '';
}

// ── Inference calls ───────────────────────────────────────────────────────────

/**
 * Calls the best available GSTD node and returns the full response text.
 * Falls back to the next node in the scored list if the first fails.
 */
export async function callNodeChat(
    messages: ChatMessage[],
    opts: NodeCallOptions = {}
): Promise<{ content: string; latency: number; nodeId?: string }> {
    const { maxTokens = 512, temperature = 0.7, timeoutMs = 30_000, model } = opts;
    const start   = Date.now();
    const nodes   = await getActiveNodes(model);
    const envUrl  = (process.env.GSTD_NODE_URL || '').replace(/\/$/, '');

    // Candidate URLs: env override first, then scored nodes, then GitHub fallback
    const candidates: string[] = [];
    if (envUrl) candidates.push(envUrl);
    candidates.push(...nodes.map((n) => n.url));

    // GitHub fallback only if no KV nodes
    if (candidates.length === 0) {
        try {
            const ghResp = await fetch(
                `https://raw.githubusercontent.com/gstdcoin/ai/main/node-url.txt?t=${Math.floor(Date.now() / 30000)}`,
                { signal: AbortSignal.timeout(4000) }
            );
            if (ghResp.ok) {
                const url = (await ghResp.text()).trim().replace(/\/$/, '');
                if (url.startsWith('http')) candidates.push(url);
            }
        } catch {}
    }

    if (candidates.length === 0) throw new Error('No GSTD node available');

    // Try candidates in order (best score first)
    let lastErr = '';
    for (const url of candidates.slice(0, 3)) {
        try {
            const resp = await fetch(`${url}/v1/chat/completions`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model:      model || NODE_MODEL,
                    messages,
                    max_tokens: maxTokens,
                    temperature,
                    stream:     false,
                }),
                signal: AbortSignal.timeout(timeoutMs),
            });
            if (!resp.ok) { lastErr = `Node ${resp.status}`; continue; }
            const data: any = await resp.json();
            if (data._gstd?.tier === 'fallback') { lastErr = 'Node busy'; continue; }
            const content = data.choices?.[0]?.message?.content || '';
            if (!content) { lastErr = 'Empty response'; continue; }
            const matchedNode = nodes.find((n) => n.url === url);
            return { content, latency: Date.now() - start, nodeId: matchedNode?.nodeId };
        } catch (e: any) { lastErr = e.message; continue; }
    }

    throw new Error(lastErr || 'All nodes failed');
}

/**
 * Fan-out: sends the same query to up to `fanOut` nodes in parallel,
 * returns the first valid response. Used for Pro/Ultra tier redundancy.
 * Implements the swarmzero parallel routing pattern.
 */
export async function callNodeParallel(
    messages:  ChatMessage[],
    opts:      NodeCallOptions = {},
    fanOut:    number = 3,
): Promise<{ content: string; latency: number; nodeId?: string }> {
    const { maxTokens = 512, temperature = 0.7, timeoutMs = 20_000, model } = opts;
    const start = Date.now();
    const nodes = await getActiveNodes(model);
    const targets = nodes.slice(0, fanOut);

    if (targets.length === 0) return callNodeChat(messages, opts);

    // Race: first node to return a valid response wins
    const attempts = targets.map(async (node) => {
        const resp = await fetch(`${node.url}/v1/chat/completions`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model:      model || NODE_MODEL,
                messages,
                max_tokens: maxTokens,
                temperature,
                stream:     false,
            }),
            signal: AbortSignal.timeout(timeoutMs),
        });
        if (!resp.ok) throw new Error(`Node ${resp.status}`);
        const data: any = await resp.json();
        const content = data.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('Empty');
        return { content, latency: Date.now() - start, nodeId: node.nodeId };
    });

    // Promise.any: resolves on first success, rejects only if all fail
    try {
        return await (Promise as any).any(attempts);
    } catch {
        return callNodeChat(messages, opts); // last-resort sequential fallback
    }
}

/**
 * Streams a GSTD node response as an async generator of text chunks.
 */
export async function* streamNodeChat(
    messages: ChatMessage[],
    opts: NodeCallOptions = {}
): AsyncGenerator<string> {
    const { maxTokens = 2048, temperature = 0.7, timeoutMs = 55_000, model } = opts;
    const nodeUrl = await resolveNodeUrl(model);
    if (!nodeUrl) throw new Error('No GSTD node available');

    const resp = await fetch(`${nodeUrl}/v1/chat/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model:      model || NODE_MODEL,
            messages,
            max_tokens: maxTokens,
            temperature,
            stream:     true,
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
