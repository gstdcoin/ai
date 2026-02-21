/**
 * Symbiotic Management: Visual Resonance
 * Unified status design system for Dashboard, Telegram Web App, Agent Node.
 * Single source of truth for loading states, animations, and color indicators.
 */

export type NodeStatus = 'active' | 'syncing' | 'cooling' | 'idle' | 'offline' | 'error';

export type PowerProfile = 'eco' | 'balance' | 'max';

export const STATUS_COLORS: Record<NodeStatus, { bg: string; text: string; border: string; pulse?: boolean }> = {
  active: {
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    border: 'border-emerald-500/30',
    pulse: true,
  },
  syncing: {
    bg: 'bg-cyan-500/20',
    text: 'text-cyan-400',
    border: 'border-cyan-500/30',
    pulse: true,
  },
  cooling: {
    bg: 'bg-amber-500/20',
    text: 'text-amber-400',
    border: 'border-amber-500/30',
    pulse: false,
  },
  idle: {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    border: 'border-gray-500/30',
    pulse: false,
  },
  offline: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-500',
    border: 'border-gray-500/20',
    pulse: false,
  },
  error: {
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    border: 'border-red-500/30',
    pulse: true,
  },
};

export const POWER_PROFILE_LABELS: Record<PowerProfile, string> = {
  eco: 'Eco',
  balance: 'Balance',
  max: 'Max',
};

export const POWER_PROFILE_HINTS: Record<PowerProfile, string> = {
  eco: 'Battery-friendly, minimal wear',
  balance: 'Balanced performance & longevity',
  max: 'Maximum throughput',
};

/** Shared loading spinner class */
export const LOADING_SPINNER = 'animate-spin rounded-full border-2 border-t-transparent';

/** Fade-in animation for transitions */
export const FADE_IN = 'animate-in fade-in duration-300';
