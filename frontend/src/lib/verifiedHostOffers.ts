import { getCloudflareContext } from '@opennextjs/cloudflare';
import { canonicalModelId } from './modelId';
import { endpointVerified } from './nodeEndpointStatus';
import { isNodeOnline, nodeAcceptingWork, parseNodeRecords, type NodeStatusRecord } from './node-status';
import { nodeKeyRedisKey } from './nodeAuth';
import { kvMGet } from './kv';
import { splitNano, units } from './money';
import { currentMarketPrice, offerKey, priceNodeOffer, usdUnits, type NodeOffer } from './workEconomics';

const maxHosts = 32;
const maxOffers = 128;
const maxReviewAgeMs = 30 * 86400_000;
type GpuReview = { node_id: string; public_key: string; endpoint: string; gpu: string; vram_mib: number; checked_at: number };
type RegistryNode = NodeStatusRecord & { capabilities?: unknown; endpoint_verified_key?: string };
export type OfferFilters = { gpu?: string; minVramMib?: number; model?: string };

export function parseGpuReviews(raw: string | undefined, now: number): GpuReview[] {
    if (!raw) return [];
    const values: unknown = JSON.parse(raw);
    if (!Array.isArray(values) || values.length > maxHosts) throw new Error('invalid_host_gpu_reviews');
    const ids = new Set<string>();
    return values.flatMap((value: GpuReview) => {
        if (!value || typeof value.node_id !== 'string' || !/^[a-zA-Z0-9_.-]{4,64}$/.test(value.node_id)
            || typeof value.public_key !== 'string' || !/^[a-f0-9]{64}$/.test(value.public_key)
            || typeof value.endpoint !== 'string' || !value.endpoint.startsWith('https://')
            || typeof value.gpu !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9 ._()+/-]{0,79}$/.test(value.gpu)
            || !Number.isSafeInteger(value.vram_mib) || value.vram_mib < 1 || value.vram_mib > 2097152
            || !Number.isSafeInteger(value.checked_at) || value.checked_at > now) throw new Error('invalid_host_gpu_reviews');
        if (ids.has(value.node_id)) throw new Error('duplicate_host_gpu_review');
        ids.add(value.node_id);
        return now - value.checked_at < maxReviewAgeMs ? [value] : [];
    });
}

function reviewsBinding(): string | undefined {
    try {
        const value = (getCloudflareContext().env as Record<string, unknown>).GSTD_VERIFIED_HOST_GPUS;
        if (typeof value === 'string') return value;
    } catch { /* Local environment. */ }
    return process.env.GSTD_VERIFIED_HOST_GPUS;
}

function decode<T>(raw: string | null): T | null {
    if (!raw) return null;
    try { return JSON.parse(raw) as T; } catch { return null; }
}

export async function verifiedHostOffers(filters: OfferFilters, now = Date.now()) {
    const reviews = parseGpuReviews(reviewsBinding(), now).filter(review =>
        (!filters.gpu || review.gpu.toLowerCase().includes(filters.gpu))
        && review.vram_mib >= (filters.minVramMib ?? 0),
    );
    if (!reviews.length) return [];
    const records = await kvMGet(reviews.flatMap(review => [
        'node:' + review.node_id, nodeKeyRedisKey(review.node_id), 'node_payout:' + review.node_id,
    ]));
    const candidates = reviews.flatMap((review, index) => {
        const [node] = parseNodeRecords<RegistryNode>([records[index * 3]]);
        const key = records[index * 3 + 1];
        const payout = decode<{ address?: string; revision?: number }>(records[index * 3 + 2]);
        if (!node || node.node_id !== review.node_id || key !== review.public_key
            || node.endpoint_verified_key !== key || !endpointVerified(node, review.endpoint, now)
            || !isNodeOnline(node, now) || !nodeAcceptingWork(node, now)
            || typeof payout?.address !== 'string' || !Number.isSafeInteger(payout.revision) || payout.revision! < 1
            || !Array.isArray(node.capabilities)) return [];
        const models = [...new Set(node.capabilities
            .filter((value: unknown): value is string => typeof value === 'string'
                && /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value))
            .map(canonicalModelId))].filter(model => !filters.model || model === canonicalModelId(filters.model));
        return models.map(model => ({ review, payout: payout.address, model }));
    }).slice(0, maxOffers);
    if (!candidates.length) return [];
    const raw = await kvMGet(candidates.map(({ review, model }) => offerKey(review.node_id, model)));
    const active = candidates.flatMap((candidate, index) => {
        const offer = decode<NodeOffer>(raw[index]);
        if (!offer || offer.active !== true || offer.nodeId !== candidate.review.node_id || offer.wallet !== candidate.payout
            || typeof offer.model !== 'string' || canonicalModelId(offer.model) !== candidate.model
            || !/^[0-9]{1,10}$/.test(offer.netUsdMicro)
            || !Number.isSafeInteger(offer.maxTokens) || offer.maxTokens < 1 || offer.maxTokens > 16384
            || !Number.isSafeInteger(offer.maxInputBytes) || offer.maxInputBytes < 1 || offer.maxInputBytes > 262144) return [];
        return [{ review: candidate.review, offer }];
    });
    if (!active.length) return [];
    const market = await currentMarketPrice();
    return active.flatMap(({ review, offer }) => {
        try {
            const { amount, grossUsdMicro } = priceNodeOffer(offer.netUsdMicro, market.price);
            const split = splitNano(amount);
            return [{
                node_id: review.node_id, model: offer.model, gpu: review.gpu, vram_mib: review.vram_mib,
                hardware_checked_at: review.checked_at, hardware_evidence: 'operator_review' as const,
                max_tokens: offer.maxTokens, max_input_bytes: offer.maxInputBytes,
                price_gstd: units(amount), price_usd: usdUnits(grossUsdMicro), market_observed_at: market.observedAt,
                executor_gstd: units(split.executor), protocol_gstd: units(split.protocol), reserve_gstd: units(split.reserve),
            }];
        } catch { return []; }
    });
}
