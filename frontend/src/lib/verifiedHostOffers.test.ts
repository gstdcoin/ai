import { afterEach, describe, expect, it, vi } from 'vitest';
import { kvMGet } from './kv';
import { currentMarketPrice } from './workEconomics';
import { parseGpuReviews, verifiedHostOffers } from './verifiedHostOffers';
import { nodeAcceptingWork, nodeMaintenanceUpdate } from './node-status';

vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: () => ({ env: {} }) }));
vi.mock('./kv', async (importOriginal) => ({ ...await importOriginal<typeof import('./kv')>(), kvMGet: vi.fn() }));
vi.mock('./workEconomics', async (importOriginal) => ({
    ...await importOriginal<typeof import('./workEconomics')>(), currentMarketPrice: vi.fn(),
}));

const now = Date.UTC(2026, 10, 17);
const review = {
    node_id: 'host-123', public_key: 'a'.repeat(64), endpoint: 'https://gpu-node.example.com',
    gpu: 'NVIDIA RTX 4090', vram_mib: 24576, checked_at: now - 1000,
};
const wallet = '0:' + 'b'.repeat(64);
const registry = {
    node_id: review.node_id, node_url: review.endpoint, last_seen: new Date(now - 1000).toISOString(),
    endpoint_verified_at: now - 1000, endpoint_verified_key: review.public_key,
    endpoint_verified_url: review.endpoint, capabilities: ['model:latest'], gpu_vram_mb: 99999,
};
const offer = { nodeId: review.node_id, model: 'model:latest', wallet, netUsdMicro: '85000', maxTokens: 256, maxInputBytes: 1024, active: true };

afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

describe('catalog of reviewed GPU hosts', () => {
    it('uses reviewed hardware and the same full amount as checkout', async () => {
        vi.stubEnv('GSTD_VERIFIED_HOST_GPUS', JSON.stringify([review]));
        vi.mocked(kvMGet).mockResolvedValueOnce([JSON.stringify(registry), review.public_key, JSON.stringify({ address: wallet, revision: 1 })])
            .mockResolvedValueOnce([JSON.stringify(offer)]);
        vi.mocked(currentMarketPrice).mockResolvedValueOnce({ price: '0.5', observedAt: now, source: 'fixture' });
        expect(await verifiedHostOffers({ gpu: '4090', minVramMib: 20000, model: 'model:latest' }, now)).toEqual([
            expect.objectContaining({
                vram_mib: 24576, gpu: review.gpu, price_usd: '0.100000', price_gstd: '0.200000000',
                executor_gstd: '0.170000000', protocol_gstd: '0.020000000', reserve_gstd: '0.010000000',
            }),
        ]);
    });
    it('excludes stale reviews, nodes with an active maintenance window and unpinned identities', async () => {
        expect(parseGpuReviews(JSON.stringify([{ ...review, checked_at: now - 31 * 86400_000 }]), now)).toEqual([]);
        vi.stubEnv('GSTD_VERIFIED_HOST_GPUS', JSON.stringify([review]));
        const payout = JSON.stringify({ address: wallet, revision: 1 });
        vi.mocked(kvMGet).mockResolvedValueOnce([JSON.stringify(registry), 'c'.repeat(64), payout]);
        expect(await verifiedHostOffers({}, now)).toEqual([]);
        const draining = { ...registry, maintenance_window: { starts_at: now, ends_at: now + 5000 } };
        vi.mocked(kvMGet).mockResolvedValueOnce([JSON.stringify(draining), review.public_key, payout]);
        expect(await verifiedHostOffers({}, now)).toEqual([]);
        expect(currentMarketPrice).not.toHaveBeenCalled();
    });
    it('honors exact maintenance boundaries and clearing the schedule', () => {
        const window = { starts_at: now, ends_at: now + 1000 };
        const state = nodeMaintenanceUpdate(window, false, now);
        expect(nodeAcceptingWork(state, now - 1)).toBe(true);
        expect(nodeAcceptingWork(state, now)).toBe(false);
        expect(nodeAcceptingWork(state, now + 1000)).toBe(true);
        expect(nodeAcceptingWork(nodeMaintenanceUpdate(null, true))).toBe(false);
        expect(nodeAcceptingWork(nodeMaintenanceUpdate(null, false))).toBe(true);
    });
});
