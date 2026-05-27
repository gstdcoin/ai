import { create } from 'zustand';
import { API_BASE_URL } from '../lib/config';

const API_BASE = API_BASE_URL;

// ═══════════════════════════════════════════════════════════════
// GSTD Ecosystem Store — Centralized API cache
// ═══════════════════════════════════════════════════════════════

interface TokenomicsData {
  epoch: number;
  max_supply: number;
  circulating_supply: number;
  total_minted: number;
  total_staked: number;
  burn_rate_pct: number;
  supply_mined_pct: number;
  remaining_supply: number;
}

interface NodeNetworkStats {
  total_nodes: number;
  online_nodes: number;
  total_rewards_distributed: number;
  total_unique_wallets: number;
}

interface StakingInfo {
  global_staked: number;
  global_stakers: number;
  apy_tiers: Record<string, string>;
}

interface QueueStats {
  pending: number;
  completed: number;
  failed: number;
}

export interface EcosystemFeatures {
  telegram_bot: boolean;
  redis: boolean;
  node_network: boolean;
  loans_active: boolean;
  enterprise_api: boolean;
}

interface EcosystemState {
  tokenomics: TokenomicsData | null;
  nodeNetwork: NodeNetworkStats | null;
  stakingInfo: StakingInfo | null;
  queueStats: QueueStats | null;
  features: EcosystemFeatures | null;
  lastRefresh: number;
  isLoading: boolean;
  error: string | null;

  refreshAll: () => Promise<void>;
  refreshTokenomics: () => Promise<void>;
  refreshNodeNetwork: () => Promise<void>;
  refreshStakingInfo: () => Promise<void>;
  refreshQueueStats: () => Promise<void>;
  refreshFeatures: () => Promise<void>;
  startAutoRefresh: () => () => void;
}

// Fetch with 8s timeout; return null on any error (never throws)
async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

// Throttle: minimum gap between full refreshes (60s — matches API Cache-Control)
const REFRESH_THROTTLE_MS  = 60_000;
// Background poll interval (2 min — pages use cached data between polls)
const AUTO_REFRESH_INTERVAL = 120_000;

export const useEcosystemStore = create<EcosystemState>((set, get) => ({
  tokenomics:  null,
  nodeNetwork: null,
  stakingInfo: null,
  queueStats:  null,
  features:    null,
  lastRefresh: 0,
  isLoading:   false,
  error:       null,

  refreshFeatures: async () => {
    const data = await safeFetch<EcosystemFeatures>(`${API_BASE}/api/v1/ecosystem/features`);
    if (data) set({ features: data });
  },

  refreshTokenomics: async () => {
    const data = await safeFetch<TokenomicsData>(`${API_BASE}/api/v1/sovereign/tokenomics`);
    if (data) set({ tokenomics: data });
  },

  refreshNodeNetwork: async () => {
    const data = await safeFetch<NodeNetworkStats>(`${API_BASE}/api/v1/nodes/rewards/network`);
    if (data) set({ nodeNetwork: data });
  },

  refreshStakingInfo: async () => {
    const data = await safeFetch<StakingInfo>(`${API_BASE}/api/v1/sovereign/staking/info`);
    if (data) set({ stakingInfo: data });
  },

  refreshQueueStats: async () => {
    const data = await safeFetch<QueueStats>(`${API_BASE}/api/v1/queue/stats`);
    if (data) set({ queueStats: data });
  },

  refreshAll: async () => {
    const state = get();
    if (Date.now() - state.lastRefresh < REFRESH_THROTTLE_MS) return;

    set({ isLoading: true, error: null });
    try {
      // Fire in parallel; each uses its own cached endpoint
      await Promise.allSettled([
        state.refreshTokenomics(),
        state.refreshNodeNetwork(),
        state.refreshStakingInfo(),
        state.refreshQueueStats(),
        state.refreshFeatures(),
      ]);
      set({ lastRefresh: Date.now(), isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  startAutoRefresh: () => {
    // Defer first fetch 2s so it doesn't block page render
    const initial = setTimeout(() => get().refreshAll(), 2000);

    const interval = setInterval(() => get().refreshAll(), AUTO_REFRESH_INTERVAL);

    return () => { clearTimeout(initial); clearInterval(interval); };
  },
}));
