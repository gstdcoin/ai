import { create } from 'zustand';

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
  user: User | null;
  connect: (address: string) => void;
  disconnect: () => void;
  setAddress: (address: string | null) => void;
  updateBalance: (ton: string, gstd: string | number) => void;
  setUser: (user: User | null) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
      isConnected: false,
      address: null,
      tonBalance: null,
      gstdBalance: null,
      user: null,
  connect: (address: string) => set({ isConnected: true, address }),
  disconnect: () => set({ isConnected: false, address: null, tonBalance: null, gstdBalance: null, user: null }),
  setAddress: (address: string | null) => set({ address, isConnected: !!address }),
  updateBalance: (ton: string, gstd: string | number) => set({ tonBalance: ton, gstdBalance: Number(gstd) }),
  setUser: (user: User | null) => set({ user }),
}));



