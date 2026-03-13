import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import {
  ArrowRightLeft, ChevronDown, Shield, Zap, Clock, CheckCircle2,
  AlertCircle, Loader2, ArrowRight, RefreshCw, BookOpen, Users,
  ExternalLink, Copy, Check
} from 'lucide-react';

import { API_BASE_URL } from '../lib/config';

// ─── Types ─────────────────────────────────────────────────
interface BridgeOrder {
  id: string;
  source_chain: string;
  dest_chain: string;
  amount: number;
  status: string;
  wallet?: string;
  created_at: string;
  expires_at: string;
}

interface MyOrder extends BridgeOrder {
  source_address: string;
  dest_address: string;
  matched_order_id?: string;
  counterparty_wallet?: string;
  send_gstd_to?: string;
  receive_gstd_from?: string;
  deposit_tx_hash?: string;
}

interface BridgeStats {
  open_orders: number;
  matched_orders: number;
  completed_swaps: number;
  total_volume_gstd: number;
  routes: Array<{ route: string; open_orders: number; volume_gstd: number }>;
}

const CHAINS = [
  { id: 'TON', name: 'TON', icon: '💎', network: 'The Open Network' },
  { id: 'Solana', name: 'Solana', icon: '◎', network: 'Solana Mainnet' },
  { id: 'XRPL', name: 'XRPL', icon: '✕', network: 'XRP Ledger' },
];

// ─── Components ────────────────────────────────────────────
function ChainSelect({ value, onChange, label, exclude }: {
  value: string; onChange: (v: string) => void; label: string; exclude?: string;
}) {
  const [open, setOpen] = useState(false);
  const cur = CHAINS.find(c => c.id === value);
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <button onClick={() => setOpen(!open)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px', borderRadius: 12, background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)', color: 'white', cursor: 'pointer',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>{cur?.icon}</span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>{cur?.name}</span>
        </span>
        <ChevronDown size={14} style={{ opacity: 0.4 }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 50,
          background: 'rgba(8,8,26,0.98)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, overflow: 'hidden',
        }}>
          {CHAINS.filter(c => c.id !== exclude).map(ch => (
            <button key={ch.id} onClick={() => { onChange(ch.id); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                background: value === ch.id ? 'rgba(139,92,246,0.1)' : 'transparent',
                border: 'none', color: 'white', cursor: 'pointer', fontSize: 14,
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
              onMouseLeave={e => e.currentTarget.style.background = value === ch.id ? 'rgba(139,92,246,0.1)' : 'transparent'}
            >
              <span style={{ fontSize: 18 }}>{ch.icon}</span> {ch.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
      style={{ background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', padding: 2 }}>
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    open: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa' },
    matched: { bg: 'rgba(249,115,22,0.1)', text: '#fb923c' },
    deposited: { bg: 'rgba(234,179,8,0.1)', text: '#facc15' },
    confirming: { bg: 'rgba(139,92,246,0.1)', text: '#a78bfa' },
    completed: { bg: 'rgba(16,185,129,0.1)', text: '#34d399' },
    expired: { bg: 'rgba(107,114,128,0.1)', text: '#9ca3af' },
    cancelled: { bg: 'rgba(107,114,128,0.1)', text: '#9ca3af' },
  };
  const c = colors[status] || colors.open;
  return (
    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6, background: c.bg, color: c.text, textTransform: 'uppercase' }}>
      {status}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════
// BRIDGE PAGE
// ═══════════════════════════════════════════════════════════
export default function BridgePage() {
  const { t } = useTranslation('common');
  const [tab, setTab] = useState<'swap' | 'orders' | 'my'>('swap');
  const [stats, setStats] = useState<BridgeStats | null>(null);
  const [orders, setOrders] = useState<BridgeOrder[]>([]);
  const [myOrders, setMyOrders] = useState<MyOrder[]>([]);

  // Form state
  const [sourceChain, setSourceChain] = useState('TON');
  const [destChain, setDestChain] = useState('Solana');
  const [amount, setAmount] = useState('');
  const [sourceAddress, setSourceAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/stats`);
        if (res.ok) setStats(await res.json());
      } catch { /* */ }
    };
    fetchStats();
    const iv = setInterval(fetchStats, 15000);
    return () => clearInterval(iv);
  }, []);

  // Fetch open orders
  useEffect(() => {
    if (tab !== 'orders') return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/orders?status=open`);
        if (res.ok) { const d = await res.json(); setOrders(d.orders || []); }
      } catch { /* */ }
    })();
  }, [tab]);

  // Fetch my orders
  useEffect(() => {
    if (tab !== 'my' || !walletAddress) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/my-orders?wallet=${walletAddress}`);
        if (res.ok) { const d = await res.json(); setMyOrders(d.orders || []); }
      } catch { /* */ }
    })();
  }, [tab, walletAddress]);

  const handleSwapChains = () => {
    const tmp = sourceChain;
    setSourceChain(destChain);
    setDestChain(tmp);
    const tmpAddr = sourceAddress;
    setSourceAddress(destAddress);
    setDestAddress(tmpAddr);
  };

  const handleSubmitOrder = async () => {
    if (!amount || parseFloat(amount) <= 0) { setError('Enter amount'); return; }
    if (!sourceAddress) { setError('Enter your source chain address'); return; }
    if (!destAddress) { setError('Enter your destination address'); return; }
    if (!walletAddress) { setError('Enter your main wallet address'); return; }

    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_wallet: walletAddress,
          source_chain: sourceChain,
          dest_chain: destChain,
          amount: parseFloat(amount),
          source_address: sourceAddress,
          dest_address: destAddress,
        }),
      });
      const data = await res.json();
      if (res.ok) { setResult(data); } else { setError(data.error || 'Failed'); }
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  };

  const handleConfirmDeposit = async (orderId: string) => {
    const txHash = prompt('Enter your deposit TX hash:');
    if (!txHash) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order/${orderId}/deposit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tx_hash: txHash }),
      });
      if (res.ok) { alert('Deposit confirmed!'); setTab('my'); }
    } catch { /* */ }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received_tx_hash: 'confirmed-by-user' }),
      });
      if (res.ok) { alert('Bridge complete! 🎉'); setTab('my'); }
    } catch { /* */ }
  };

  const srcChain = CHAINS.find(c => c.id === sourceChain);
  const dstChain = CHAINS.find(c => c.id === destChain);

  return (
    <>
      <Head>
        <title>P2P Bridge — GSTD</title>
        <meta name="description" content="Peer-to-peer cross-chain GSTD bridge. Swap tokens between TON, Solana, and XRPL directly with other users." />
      </Head>


      <div style={{ minHeight: '100vh', background: '#030014', paddingTop: 80, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 20px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px',
              borderRadius: 20, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', marginBottom: 12,
            }}>
              <ArrowRightLeft size={14} style={{ color: '#8b5cf6' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.05em' }}>P2P CROSS-CHAIN BRIDGE</span>
            </div>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'white', marginBottom: 8 }}>
              Bridge GSTD <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Peer-to-Peer</span>
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 440, margin: '0 auto' }}>
              Swap GSTD directly with other users. No middleman, no liquidity pool — your wallet to theirs.
            </p>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 24 }}>
              {[
                { v: stats.open_orders, l: 'Open', c: '#60a5fa' },
                { v: stats.matched_orders, l: 'Matched', c: '#fb923c' },
                { v: stats.completed_swaps, l: 'Done', c: '#34d399' },
                { v: `${stats.total_volume_gstd.toFixed(0)}`, l: 'Volume', c: '#a78bfa' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab Nav */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {([
              { id: 'swap' as const, label: 'New Swap', icon: <ArrowRightLeft size={14} /> },
              { id: 'orders' as const, label: 'Order Book', icon: <BookOpen size={14} /> },
              { id: 'my' as const, label: 'My Orders', icon: <Users size={14} /> },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)} style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === t.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: tab === t.id ? 'white' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: tab === t.id ? 700 : 500, transition: 'all 0.2s',
              }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* ── TAB: New Swap ── */}
          {tab === 'swap' && !result && (
            <div style={{
              borderRadius: 20, padding: 24,
              background: 'linear-gradient(180deg, rgba(139,92,246,0.04) 0%, rgba(3,0,20,0.8) 100%)',
              border: '1px solid rgba(139,92,246,0.1)',
            }}>
              {/* Wallet */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Your Wallet ID</div>
                <input type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="Your TON wallet (for identification)"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 13, outline: 'none' }} />
              </div>

              <ChainSelect value={sourceChain} onChange={setSourceChain} label="I have GSTD on" exclude={destChain} />

              {/* Source Address */}
              <div style={{ marginTop: 10 }}>
                <input type="text" value={sourceAddress} onChange={e => setSourceAddress(e.target.value)}
                  placeholder={`Your ${sourceChain} address (where you hold GSTD)`}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 12, outline: 'none' }} />
              </div>

              {/* Swap */}
              <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
                <button onClick={handleSwapChains} style={{
                  width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa', cursor: 'pointer',
                  transition: 'all 0.3s',
                }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.2)'; e.currentTarget.style.transform = 'rotate(180deg)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.1)'; e.currentTarget.style.transform = 'rotate(0)'; }}
                >
                  <ArrowRightLeft size={14} />
                </button>
              </div>

              <ChainSelect value={destChain} onChange={setDestChain} label="I want GSTD on" exclude={sourceChain} />

              {/* Dest Address */}
              <div style={{ marginTop: 10 }}>
                <input type="text" value={destAddress} onChange={e => setDestAddress(e.target.value)}
                  placeholder={`Your ${destChain} address (where to receive GSTD)`}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'white', fontSize: 12, outline: 'none' }} />
              </div>

              {/* Amount */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>Amount GSTD</div>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 18, fontWeight: 700, outline: 'none' }} />
              </div>

              {/* Info */}
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                  <span>Bridge Fee</span><span style={{ color: '#34d399', fontWeight: 700 }}>0% (P2P)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                  <span>Model</span><span>Peer-to-Peer Matching</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  <span>Expiry</span><span>24 hours</span>
                </div>
              </div>

              {error && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} /> {error}
                </div>
              )}

              <button onClick={handleSubmitOrder} disabled={loading}
                style={{
                  width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, border: 'none',
                  background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white',
                  fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Placing Order...</> : <><ArrowRightLeft size={16} /> Place Bridge Order</>}
              </button>
            </div>
          )}

          {/* Result */}
          {tab === 'swap' && result && (
            <div style={{ borderRadius: 20, padding: 24, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' }}>
              {result.status === 'matched' ? (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', background: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CheckCircle2 size={24} style={{ color: '#34d399' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>Matched! 🎉</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{result.message}</p>
                  <div style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>Send your GSTD to:</div>
                    <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#a78bfa', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {result.match?.send_to_address} <CopyButton text={result.match?.send_to_address || ''} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, marginBottom: 4 }}>You will receive from:</div>
                    <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#34d399', wordBreak: 'break-all' }}>
                      {result.match?.receive_from}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px', background: 'rgba(59,130,246,0.1)', border: '2px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={24} style={{ color: '#60a5fa' }} />
                  </div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>Order Placed</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{result.message}</p>
                </>
              )}
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Order ID: {result.order_id}</div>
              <button onClick={() => { setResult(null); setAmount(''); setSourceAddress(''); setDestAddress(''); }}
                style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> New Order
              </button>
            </div>
          )}

          {/* ── TAB: Order Book ── */}
          {tab === 'orders' && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Open Orders ({orders.length})
              </div>
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <BookOpen size={32} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No open orders yet. Be the first!</p>
                  <button onClick={() => setTab('swap')} style={{
                    marginTop: 12, padding: '8px 16px', borderRadius: 8, background: 'rgba(139,92,246,0.1)',
                    border: '1px solid rgba(139,92,246,0.2)', color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}>Create Order</button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {orders.map(o => (
                    <div key={o.id} style={{
                      padding: '14px 16px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 18 }}>{CHAINS.find(c => c.id === o.source_chain)?.icon}</span>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{o.source_chain}</div>
                        </div>
                        <ArrowRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
                        <div style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 18 }}>{CHAINS.find(c => c.id === o.dest_chain)?.icon}</span>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{o.dest_chain}</div>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{o.amount.toLocaleString()} GSTD</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{o.wallet}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: My Orders ── */}
          {tab === 'my' && (
            <div>
              {!walletAddress ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>Enter your wallet to see orders</p>
                  <input type="text" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="Your wallet address"
                    style={{ width: '80%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 13, outline: 'none', textAlign: 'center' }} />
                </div>
              ) : myOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No orders yet</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myOrders.map(o => (
                    <div key={o.id} style={{
                      padding: '16px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{CHAINS.find(c => c.id === o.source_chain)?.icon}</span>
                          <ArrowRight size={12} style={{ color: 'rgba(255,255,255,0.2)' }} />
                          <span>{CHAINS.find(c => c.id === o.dest_chain)?.icon}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'white', marginLeft: 4 }}>{o.amount} GSTD</span>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>

                      {/* Show match details */}
                      {o.send_gstd_to && (
                        <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(139,92,246,0.05)', border: '1px solid rgba(139,92,246,0.1)', marginBottom: 8, fontSize: 12 }}>
                          <div style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>Send your {o.source_chain} GSTD to:</div>
                          <div style={{ fontFamily: 'monospace', color: '#a78bfa', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4 }}>
                            {o.send_gstd_to} <CopyButton text={o.send_gstd_to} />
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        {o.status === 'matched' && (
                          <button onClick={() => handleConfirmDeposit(o.id)}
                            style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.2)', color: '#fb923c', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            I Sent GSTD ✓
                          </button>
                        )}
                        {(o.status === 'deposited' || o.status === 'confirming') && (
                          <button onClick={() => handleConfirmReceipt(o.id)}
                            style={{ flex: 1, padding: '8px', borderRadius: 8, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#34d399', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
                            I Received GSTD ✓
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div style={{ marginTop: 48, marginBottom: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', textAlign: 'center', marginBottom: 20 }}>How P2P Bridge Works</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { n: '1', t: 'Place Order', d: 'Choose chains, enter amount and addresses', icon: <BookOpen size={16} /> },
                { n: '2', t: 'Get Matched', d: 'System finds a counterparty with opposite needs', icon: <Users size={16} /> },
                { n: '3', t: 'Send GSTD', d: 'Both sides send tokens to each other\'s addresses', icon: <ArrowRightLeft size={16} /> },
                { n: '4', t: 'Confirm', d: 'Both confirm receipt — swap complete!', icon: <CheckCircle2 size={16} /> },
              ].map(s => (
                <div key={s.n} style={{ padding: '16px 14px', borderRadius: 14, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                  <div style={{ color: '#8b5cf6', marginBottom: 8 }}>{s.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'white', marginBottom: 4 }}>{s.t}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.4 }}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <style jsx global>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          input[type="number"]::-webkit-inner-spin-button,
          input[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
          input[type="number"] { -moz-appearance: textfield; }
        `}</style>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
