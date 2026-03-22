import { create } from 'zustand';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://api.gstdtoken.com';

// ═══════════════════════════════════════════════════════════════
// GSTD Ecosystem Store — Centralized API cache
// Replaces scattered useState+useEffect in each page
//
// Benefits:
//   - Single source of truth for ecosystem-wide data
//   - Automatic background refresh (30s interval)
//   - All pages share cached data (no duplicate API calls)
//   - Graceful error handling with stale data fallback
// ═══════════════════════════════════════════════════════════════

interface TokenomicsData {
  epoch: number;
  max_supply: number;
  circulating_supply: number;
  total_minted: number;
  total_burned: number;
  total_staked: number;
  burn_rate_pct: number;
  deflation_rate_pct: number;
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
  active_tasks: number;
  pending_tasks: number;
  scheduled_tasks: number;
  retry_tasks: number;
  completed_tasks: number;
}

interface EcosystemState {
  // Data
  tokenomics: TokenomicsData | null;
  nodeNetwork: NodeNetworkStats | null;
  stakingInfo: StakingInfo | null;
  queueStats: QueueStats | null;
  lastRefresh: number;
  isLoading: boolean;
  error: string | null;

  // Actions
  refreshAll: () => Promise<void>;
  refreshTokenomics: () => Promise<void>;
  refreshNodeNetwork: () => Promise<void>;
  refreshStakingInfo: () => Promise<void>;
  refreshQueueStats: () => Promise<void>;
  startAutoRefresh: () => () => void;
}

async function safeFetch<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export const useEcosystemStore = create<EcosystemState>((set, get) => ({
  tokenomics: null,
  nodeNetwork: null,
  stakingInfo: null,
  queueStats: null,
  lastRefresh: 0,
  isLoading: false,
  error: null,

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
    // Throttle: don't refresh more than once per 10 seconds
    if (Date.now() - state.lastRefresh < 10_000) return;

    set({ isLoading: true, error: null });
    try {
      await Promise.all([
        state.refreshTokenomics(),
        state.refreshNodeNetwork(),
        state.refreshStakingInfo(),
        state.refreshQueueStats(),
      ]);
      set({ lastRefresh: Date.now(), isLoading: false });
    } catch (e) {
      set({ error: String(e), isLoading: false });
    }
  },

  startAutoRefresh: () => {
    // Initial fetch
    get().refreshAll();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      get().refreshAll();
    }, 30_000);

    // Return cleanup function
    return () => clearInterval(interval);
  },
}));
