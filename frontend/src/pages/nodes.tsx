import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { API_BASE_URL } from '../lib/config';
import {
  Server, Copy, Check, ExternalLink, Smartphone, Terminal,
  Trophy, Zap, Clock, RefreshCw, ChevronRight, AlertCircle,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

interface NetworkStats {
  total_nodes: number;
  active_nodes: number;
  epoch_reward_rate: number;
}

interface TierInfo {
  balance_gstd: number;
  pending_gstd: number;
  current_tier: { name: string; emoji: string };
  active_nodes: number;
}

interface LeaderEntry {
  rank: number;
  node_id: string;
  name: string;
  wallet: string;
  gstd_earned: number;
  uptime_hours?: number;
  is_online: boolean;
  tier?: string;
}

// ── Earning tiers (static) ────────────────────────────────────────────────────

const TIERS = [
  { icon: '⚡', name: 'Spark',     rate: 0.5,  daily: 12,  req: 'Any device (×0–0.75)', color: '#888888' },
  { icon: '🔥', name: 'Flame',     rate: 1.0,  daily: 24,  req: 'Pi 4 / basic laptop (×0.75–1.5)', color: '#ff6b35' },
  { icon: '⛈️', name: 'Storm',     rate: 2.5,  daily: 60,  req: '16GB RAM server (×1.5–2.5)', color: '#4ecdc4' },
  { icon: '🏔️', name: 'Titan',     rate: 4.0,  daily: 96,  req: '32GB RAM + GPU (×2.5–4.0)', color: '#ffd700' },
  { icon: '👑', name: 'Sovereign', rate: 8.0,  daily: 192, req: 'High-end server (×4.0+)', color: '#e040fb' },
];

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
      style={{
        background: copied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.07)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(255,255,255,0.12)'}`,
        color: copied ? '#4ade80' : 'rgba(255,255,255,0.6)',
        cursor: 'pointer',
        flexShrink: 0,
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {label || (copied ? 'Copied' : 'Copy')}
    </button>
  );
}

// ── Rank Badge ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span style={{ fontSize: 20 }}>🥇</span>;
  if (rank === 2) return <span style={{ fontSize: 20 }}>🥈</span>;
  if (rank === 3) return <span style={{ fontSize: 20 }}>🥉</span>;
  return (
    <span className="font-mono font-bold text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
      #{rank}
    </span>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function NodesPage() {
  const walletAddress = useTonAddress();

  const [network, setNetwork]       = useState<NetworkStats | null>(null);
  const [tier, setTier]             = useState<TierInfo | null>(null);
  const [leaders, setLeaders]       = useState<LeaderEntry[]>([]);
  const [loadingNet, setLoadingNet] = useState(true);
  const [loadingBoard, setLoadingBoard] = useState(true);
  const [claiming, setClaiming]     = useState(false);
  const [claimMsg, setClaimMsg]     = useState('');

  // Fetch network stats
  const fetchNetwork = useCallback(async () => {
    setLoadingNet(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes/rewards/network`);
      if (res.ok) setNetwork(await res.json());
    } catch { /* silent */ }
    setLoadingNet(false);
  }, []);

  // Fetch wallet tier info
  const fetchTier = useCallback(async () => {
    if (!walletAddress) { setTier(null); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/access/tier?wallet=${encodeURIComponent(walletAddress)}`);
      if (res.ok) setTier(await res.json());
    } catch { /* silent */ }
  }, [walletAddress]);

  // Fetch leaderboard
  const fetchLeaderboard = useCallback(async () => {
    setLoadingBoard(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/nodes/rewards/leaderboard?period=all`);
      if (res.ok) {
        const data = await res.json();
        setLeaders((data.leaderboard || data.entries || []).slice(0, 20));
      }
    } catch { /* silent */ }
    setLoadingBoard(false);
  }, []);

  useEffect(() => {
    fetchNetwork();
    fetchLeaderboard();
    const iv = setInterval(() => { fetchNetwork(); fetchLeaderboard(); }, 30000);
    return () => clearInterval(iv);
  }, [fetchNetwork, fetchLeaderboard]);

  useEffect(() => { fetchTier(); }, [fetchTier]);

  const claimRewards = async () => {
    if (!walletAddress || !tier?.pending_gstd) return;
    setClaiming(true);
    setClaimMsg('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/telegram/bot/claim_reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClaimMsg(`✅ Claimed ${data.claimed_net?.toFixed(4) || ''} GSTD`);
        fetchTier();
      } else {
        setClaimMsg(`❌ ${data.error || 'Claim failed'}`);
      }
    } catch { setClaimMsg('❌ Network error'); }
    setClaiming(false);
  };

  const activeCount = network?.active_nodes ?? 0;

  return (
    <>
      <Head>
        <title>Run a Node — Earn GSTD | GSTD Network</title>
        <meta name="description" content="Run a GSTD node on any device. Earn GSTD tokens for serving AI queries. Bronze to Platinum tiers." />
      </Head>

      <div className="min-h-screen" style={{ background: '#030014', color: 'white', paddingTop: 80 }}>
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 16px 80px' }}>

          {/* ── Network Banner ────────────────────────────────────────── */}
          {activeCount > 0 && (
            <div style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.10), rgba(6,182,212,0.06))',
              border: '1px solid rgba(139,92,246,0.20)',
              borderRadius: 12, padding: '10px 16px',
              display: 'flex', alignItems: 'center', gap: 10,
              marginBottom: 32, fontSize: 13,
            }}>
              <span style={{ fontSize: 18 }}>🌐</span>
              <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                <strong style={{ color: '#a78bfa' }}>{activeCount} node{activeCount !== 1 ? 's' : ''} online</strong> — join the network, earn GSTD from every AI inference request routed to your node.
              </span>
            </div>
          )}

          {/* ── Hero ──────────────────────────────────────────────────── */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 12px', borderRadius: 20, marginBottom: 16,
              background: 'rgba(139,92,246,0.12)',
              border: '1px solid rgba(139,92,246,0.25)',
              fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: '#a78bfa',
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%',
                background: activeCount > 0 ? '#4ade80' : '#6b7280',
                boxShadow: activeCount > 0 ? '0 0 8px #4ade80' : 'none',
                animation: activeCount > 0 ? 'pulse-dot 2s infinite' : 'none',
                display: 'inline-block',
              }} />
              {loadingNet ? 'Connecting…' : `${activeCount} node${activeCount !== 1 ? 's' : ''} online`}
            </div>

            <h1 style={{
              fontSize: 'clamp(36px, 7vw, 64px)', fontWeight: 900,
              lineHeight: 1.05, letterSpacing: '-0.03em', marginBottom: 16,
              background: 'linear-gradient(135deg, #ffffff 30%, #a78bfa 70%, #22d3ee)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}>
              Run a node.<br />Earn GSTD.
            </h1>
            <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto 28px' }}>
              Share your device's compute. Earn GSTD every hour automatically.
              No tokens needed to start — just a TON wallet.
            </p>

            {/* Live stats row */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap' }}>
              {[
                { label: 'Nodes online', value: loadingNet ? '…' : String(activeCount), color: '#4ade80' },
                { label: 'Max rate', value: '5 GSTD/h', color: '#22d3ee' },
                { label: 'Min to start', value: '0 GSTD', color: '#a78bfa' },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 26, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── My Node Status (wallet connected) ─────────────────────── */}
          {walletAddress && (
            <div style={{
              background: 'rgba(139,92,246,0.08)',
              border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 16, padding: 20, marginBottom: 32,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                    My Wallet
                  </div>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    {walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}
                  </div>
                </div>

                {tier && (
                  <>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#22d3ee' }}>
                        {tier.balance_gstd.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>GSTD Balance</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color: tier.pending_gstd > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>
                        {tier.pending_gstd.toFixed(4)}
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>Pending GSTD</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 18, lineHeight: 1 }}>{tier.current_tier.emoji}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{tier.current_tier.name}</div>
                    </div>
                  </>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                  {tier && tier.pending_gstd > 0.0001 && (
                    <button
                      onClick={claimRewards}
                      disabled={claiming}
                      style={{
                        padding: '8px 18px', borderRadius: 10,
                        background: claiming ? 'rgba(251,191,36,0.15)' : 'rgba(251,191,36,0.2)',
                        color: '#fbbf24', fontWeight: 800, fontSize: 13,
                        cursor: claiming ? 'not-allowed' : 'pointer',
                        border: '1px solid rgba(251,191,36,0.35)',
                        transition: 'all 0.2s',
                      }}
                    >
                      {claiming ? 'Claiming…' : '🎁 Claim Rewards'}
                    </button>
                  )}
                  {claimMsg && (
                    <span style={{ fontSize: 12, color: claimMsg.startsWith('✅') ? '#4ade80' : '#f87171' }}>
                      {claimMsg}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Install Options ────────────────────────────────────────── */}
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Start earning in minutes</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
              Pick your device — no GSTD required to start.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>

              {/* Mobile */}
              <div style={{
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>📱</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Mobile Node</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Any phone • 0.5–2 GSTD/h</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  Open the Telegram bot and tap Launch Node. No setup needed.
                </p>
                <a
                  href="https://t.me/gstdtoken_bot?start=node"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 16px', borderRadius: 10, textDecoration: 'none',
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    color: '#4ade80', fontWeight: 700, fontSize: 14, transition: 'all 0.2s',
                  }}
                >
                  <Smartphone size={15} /> Launch in Telegram
                </a>
              </div>

              {/* Docker */}
              <div style={{
                background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)',
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>🐳</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Docker</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Desktop • 1.5–5 GSTD/h</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  Replace <code style={{ color: '#22d3ee', fontSize: 12 }}>YOUR_WALLET</code> with your TON address.
                </p>
                <div style={{
                  background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '10px 12px',
                  fontFamily: 'monospace', fontSize: 11.5, color: '#67e8f9',
                  wordBreak: 'break-all', lineHeight: 1.6, marginBottom: 10, position: 'relative',
                }}>
                  docker run -d -p 8080:8080 \<br />
                  &nbsp;&nbsp;-e GSTD_WALLET_ADDRESS=YOUR_WALLET \<br />
                  &nbsp;&nbsp;ghcr.io/gstdcoin/gstd-node:latest
                </div>
                <CopyButton
                  text="docker run -d -p 8080:8080 -e GSTD_WALLET_ADDRESS=YOUR_WALLET ghcr.io/gstdcoin/gstd-node:latest"
                  label="Copy command"
                />
              </div>

              {/* Script */}
              <div style={{
                background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
                borderRadius: 16, padding: 20,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>💻</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>Auto-install Script</div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Linux / macOS • all tiers</div>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  Detects your hardware and configures the optimal node tier automatically.
                </p>
                <div style={{
                  background: 'rgba(0,0,0,0.4)', borderRadius: 8, padding: '10px 12px',
                  fontFamily: 'monospace', fontSize: 11.5, color: '#c4b5fd',
                  wordBreak: 'break-all', lineHeight: 1.6, marginBottom: 10,
                }}>
                  curl -fsSL https://raw.githubusercontent.com/<br />
                  gstdcoin/gstdbot/main/install.sh | bash
                </div>
                <CopyButton
                  text="curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash"
                  label="Copy command"
                />
              </div>

            </div>

            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a
                href="https://github.com/gstdcoin/gstdbot"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <ExternalLink size={12} /> Full documentation on GitHub
              </a>
            </div>
          </div>

          {/* ── Earning Tiers Table ────────────────────────────────────── */}
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Earning rates</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
              Rates are guaranteed minimums. Higher-spec nodes earn more from task bonuses.
            </p>

            <div style={{
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, overflow: 'hidden',
            }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr',
                padding: '10px 16px',
                background: 'rgba(255,255,255,0.03)',
                fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span>Tier</span>
                <span style={{ textAlign: 'right' }}>Rate</span>
                <span style={{ textAlign: 'right' }}>Daily</span>
                <span style={{ textAlign: 'right' }}>Requirement</span>
              </div>

              {TIERS.map((tier, i) => (
                <div
                  key={tier.name}
                  style={{
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 2fr',
                    padding: '13px 16px', alignItems: 'center',
                    borderBottom: i < TIERS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>{tier.icon}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: tier.color }}>{tier.name}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 800, fontSize: 15, color: tier.color }}>
                    {tier.rate}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                    {tier.daily} GSTD
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                    {tier.req}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>
              All rates are in GSTD/hour · actual earnings depend on network demand
            </div>
          </div>

          {/* ── Leaderboard ────────────────────────────────────────────── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 2 }}>🏆 Node Leaderboard</h2>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>All-time GSTD earned per node</p>
              </div>
              <button
                onClick={fetchLeaderboard}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '7px 12px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'transparent', color: 'rgba(255,255,255,0.4)',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.25)'; }}
                onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                <RefreshCw size={13} className={loadingBoard ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingBoard ? (
              <div style={{ textAlign: 'center', padding: '48px 0', color: 'rgba(255,255,255,0.2)' }}>
                <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>
                  Syncing swarm…
                </div>
              </div>
            ) : leaders.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '48px 0',
                border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 14,
              }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🌱</div>
                <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>No nodes yet</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>
                  Be the first — install above and claim your spot on the board.
                </div>
              </div>
            ) : (
              <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '48px 1fr auto auto auto',
                  padding: '10px 16px', gap: 8, alignItems: 'center',
                  background: 'rgba(255,255,255,0.03)',
                  fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <span>#</span>
                  <span>Node</span>
                  <span style={{ textAlign: 'right', minWidth: 70 }}>GSTD</span>
                  <span style={{ textAlign: 'right', minWidth: 60 }}>Uptime</span>
                  <span style={{ textAlign: 'center', minWidth: 50 }}>Status</span>
                </div>

                {leaders.map((entry, i) => (
                  <div
                    key={entry.node_id || i}
                    style={{
                      display: 'grid', gridTemplateColumns: '48px 1fr auto auto auto',
                      padding: '12px 16px', gap: 8, alignItems: 'center',
                      borderBottom: i < leaders.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                      <RankBadge rank={entry.rank || i + 1} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: 'rgba(255,255,255,0.85)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name || entry.node_id}
                      </div>
                      {entry.wallet && (
                        <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                          {entry.wallet.slice(0, 8)}…
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 70 }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: entry.rank <= 3 ? '#fbbf24' : 'white' }}>
                        {(entry.gstd_earned || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </div>
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)' }}>GSTD</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: 60 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
                        {entry.uptime_hours != null ? `${Math.round(entry.uptime_hours)}h` : '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'center', minWidth: 50 }}>
                      {entry.is_online ? (
                        <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>● Online</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>○ Off</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Bottom CTA ────────────────────────────────────────────── */}
          {!walletAddress && (
            <div style={{
              marginTop: 48, textAlign: 'center',
              padding: '32px 24px',
              background: 'rgba(139,92,246,0.06)',
              border: '1px solid rgba(139,92,246,0.15)',
              borderRadius: 16,
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>🔗</div>
              <div style={{ fontWeight: 800, fontSize: 17, marginBottom: 6 }}>Connect your TON wallet to see your node stats</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>
                Track earnings, claim rewards, and see your tier — all from the web.
              </div>
            </div>
          )}

        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @media (max-width: 600px) {
          .leaderboard-row { grid-template-columns: 40px 1fr auto auto !important; }
          .leaderboard-row .uptime { display: none; }
        }
      `}</style>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale ?? 'en'),
});
