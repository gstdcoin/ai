import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface User {
  wallet_address?: string;
  address?: string; // Alternative field name from backend
  balance?: number;
  trust_score?: number;
  created_at?: string;
  updated_at?: string;
}

interface WalletState {
  isConnected: boolean;
  address: string | null;
  tonBalance: string | null;
  gstdBalance: number | null;
  pendingEarnings: number | null;
  user: User | null;
  // Worker state persistence for TWA
  workerActive: boolean;
  lastActiveTimestamp: number | null;
  connect: (address: string) => void;
  disconnect: () => void;
  setAddress: (address: string | null) => void;
  updateBalance: (ton: string, gstd: string | number) => void;
  setUser: (user: User | null) => void;
  setWorkerActive: (active: boolean) => void;
}

// Custom storage that works in both browser and Telegram WebApp
const getCustomStorage = () => {
  if (typeof window === 'undefined') {
    // SSR - return noop storage
    return {
      getItem: () => null,
      setItem: () => { },
      removeItem: () => { },
    };
  }

  // Try to use localStorage, fallback to sessionStorage for restricted contexts
  try {
    localStorage.setItem('__test__', 'test');
    localStorage.removeItem('__test__');
    return localStorage;
  } catch {
    return sessionStorage;
  }
};

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      isConnected: false,
      address: null,
      tonBalance: null,
      gstdBalance: null,
      user: null,
      workerActive: false,
      lastActiveTimestamp: null,
      connect: (address: string) => set({
        isConnected: true,
        address,
        lastActiveTimestamp: Date.now()
      }),
      disconnect: () => set({
        isConnected: false,
        address: null,
        tonBalance: null,
        gstdBalance: null,
        user: null,
        workerActive: false,
        lastActiveTimestamp: null
      }),
      setAddress: (address: string | null) => set({
        address,
        isConnected: !!address,
        lastActiveTimestamp: address ? Date.now() : null
      }),
      updateBalance: (ton: string, gstd: string | number, pending?: number) => set({
        tonBalance: ton,
        gstdBalance: Number(gstd),
        pendingEarnings: pending !== undefined ? pending : null
      }),
      setUser: (user: User | null) => set({ user }),
      setWorkerActive: (active: boolean) => set({
        workerActive: active,
        lastActiveTimestamp: active ? Date.now() : null
      }),
    }),
    {
      name: 'gstd-wallet-storage', // Unique name for localStorage key
      storage: createJSONStorage(() => getCustomStorage()),
      // Only persist essential state (not balances which should be fetched fresh)
      partialize: (state) => ({
        isConnected: state.isConnected,
        address: state.address,
        user: state.user,
        workerActive: state.workerActive,
        lastActiveTimestamp: state.lastActiveTimestamp,
      }),
      // Rehydrate check - clear stale data older than 24 hours
      onRehydrateStorage: () => (state) => {
        if (state?.lastActiveTimestamp) {
          const oneDay = 24 * 60 * 60 * 1000;
          if (Date.now() - state.lastActiveTimestamp > oneDay) {
            // Session is stale, reset
            state.disconnect();
          }
        }
      },
    }
  )
);
