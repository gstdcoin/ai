import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import {
  ArrowRightLeft, ChevronDown, Clock, CheckCircle2,
  AlertCircle, Loader2, ArrowRight, RefreshCw, BookOpen, Users,
  Copy, Check, Wallet, LogOut, Link2, Unlink, X
} from 'lucide-react';
import { useMultiChainWallet, ChainId } from '../hooks/useMultiChainWallet';
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

const CHAINS: { id: ChainId; name: string; icon: string; network: string; walletHint: string }[] = [
  { id: 'TON', name: 'TON', icon: '💎', network: 'The Open Network', walletHint: 'Tonkeeper, MyTonWallet' },
  { id: 'Solana', name: 'Solana', icon: '◎', network: 'Solana Mainnet', walletHint: 'Phantom, Solflare' },
  { id: 'XRPL', name: 'XRPL', icon: '✕', network: 'XRP Ledger', walletHint: 'Xaman, GemWallet' },
];

// ─── Helper: shorten address ───────────────────────────────
function shortAddr(addr: string, start = 6, end = 4): string {
  if (!addr || addr.length <= start + end + 3) return addr || '';
  return `${addr.slice(0, start)}...${addr.slice(-end)}`;
}

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

// ─── Chain Wallet Connection Widget ────────────────────────
function ChainWalletWidget({ chain, label, address, onAddressChange }: {
  chain: ChainId;
  label: string;
  address?: string;
  onAddressChange?: (addr: string) => void;
}) {
  const { t } = useTranslation('common');
  const { getChainWallet, connectChain, disconnectChain, getAvailableWallets } = useMultiChainWallet();
  const wallet = getChainWallet(chain);
  const chainInfo = CHAINS.find(c => c.id === chain);
  const availableWallets = getAvailableWallets(chain);

  // For TON: show connect/disconnect only (TonConnect has its own QR modal)
  if (chain === 'TON') {
    if (wallet.connected && wallet.address) {
      return (
        <div style={{
          padding: '12px 14px', borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(6,182,212,0.04))',
          border: '1px solid rgba(16,185,129,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <div style={{
                width: 30, height: 30, borderRadius: 8,
                background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 14,
              }}>💎</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                  {label} · {wallet.walletName}
                </div>
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {shortAddr(wallet.address, 6, 4)}
                  <CopyButton text={wallet.address} />
                </div>
              </div>
            </div>
            <button onClick={() => disconnectChain(chain)} style={{
              display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
              color: '#f87171', fontSize: 9, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}>
              <Unlink size={9} /> {t('bridge_disconnect', 'Disconnect')}
            </button>
          </div>
        </div>
      );
    }

    return (
      <button onClick={() => connectChain(chain)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 16px', borderRadius: 12,
        background: 'rgba(139,92,246,0.06)', border: '1px dashed rgba(139,92,246,0.2)',
        color: '#a78bfa', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
      }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.12)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.06)'; }}
      >
        <Wallet size={14} />
        {t('bridge_connect_wallet', 'Connect Wallet')} ({availableWallets.join(', ')})
      </button>
    );
  }

  // For Solana / XRPL: show wallet-connected state OR manual input + optional connect
  if (wallet.connected && wallet.address) {
    return (
      <div style={{
        padding: '10px 14px', borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(6,182,212,0.04))',
        border: '1px solid rgba(16,185,129,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <div style={{
              width: 26, height: 26, borderRadius: 7,
              background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 12,
            }}>{chainInfo?.icon}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                {wallet.walletName} · {t('bridge_wallet_connected', 'Connected')}
              </div>
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#34d399', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                {shortAddr(wallet.address, 6, 4)}
                <CopyButton text={wallet.address} />
              </div>
            </div>
          </div>
          <button onClick={() => disconnectChain(chain)} style={{
            display: 'flex', alignItems: 'center', gap: 3, padding: '4px 8px', borderRadius: 6,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
            color: '#f87171', fontSize: 9, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
          }}>
            <Unlink size={9} />
          </button>
        </div>
      </div>
    );
  }

  // Not connected — show address input + optional connect button
  return (
    <div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
        <input type="text" value={address || ''} onChange={e => onAddressChange?.(e.target.value)}
          placeholder={t('bridge_address_placeholder', { chain, defaultValue: `Your ${chain} address` })}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
            color: 'white', fontSize: 12, outline: 'none',
          }} />
        <button onClick={() => connectChain(chain)} title={t('bridge_connect_chain', { defaultValue: `Connect ${availableWallets.join('/')}` })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            padding: '0 12px', borderRadius: 10,
            background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)',
            color: '#a78bfa', fontSize: 10, fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.2s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.15)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.08)'; }}
        >
          <Link2 size={11} /> {availableWallets[0]}
        </button>
      </div>
    </div>
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

  // Multi-chain wallet hook
  const multiWallet = useMultiChainWallet();

  // Form state
  const [sourceChain, setSourceChain] = useState<ChainId>('TON');
  const [destChain, setDestChain] = useState<ChainId>('Solana');
  const [amount, setAmount] = useState('');
  const [sourceAddress, setSourceAddress] = useState('');
  const [destAddress, setDestAddress] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  // Get wallet state for each chain
  const sourceWallet = multiWallet.getChainWallet(sourceChain);
  const destWallet = multiWallet.getChainWallet(destChain);
  const tonWallet = multiWallet.getChainWallet('TON');

  // Primary wallet = TON wallet (for order identification)
  const isWalletConnected = tonWallet.connected;

  // Sync TON wallet address as primary identifier
  useEffect(() => {
    if (tonWallet.connected && tonWallet.address) {
      setWalletAddress(tonWallet.address);
    } else {
      setWalletAddress('');
    }
  }, [tonWallet.connected, tonWallet.address]);

  // Auto-fill source address from connected wallet
  useEffect(() => {
    if (sourceWallet.connected && sourceWallet.address) {
      setSourceAddress(sourceWallet.address);
    } else {
      setSourceAddress('');
    }
  }, [sourceWallet.connected, sourceWallet.address, sourceChain]);

  // Auto-fill dest address from connected wallet
  useEffect(() => {
    if (destWallet.connected && destWallet.address) {
      setDestAddress(destWallet.address);
    } else {
      setDestAddress('');
    }
  }, [destWallet.connected, destWallet.address, destChain]);

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/stats`);
        if (res.ok) setStats(await res.json());
      } catch (_e) { /* */ }
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
      } catch (_e) { /* */ }
    })();
  }, [tab]);

  // Fetch my orders
  useEffect(() => {
    if (tab !== 'my' || !walletAddress) return;
    (async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/my-orders?wallet=${walletAddress}`);
        if (res.ok) { const d = await res.json(); setMyOrders(d.orders || []); }
      } catch (_e) { /* */ }
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
    if (!walletAddress) { setError(t('bridge_error_connect_wallet', { defaultValue: 'Please connect your wallet first' })); return; }
    if (!amount || parseFloat(amount) <= 0) { setError(t('bridge_error_enter_amount', { defaultValue: 'Enter amount' })); return; }
    if (!sourceAddress) { setError(t('bridge_error_enter_source', { defaultValue: 'Enter your source chain address' })); return; }
    if (!destAddress) { setError(t('bridge_error_enter_destination', { defaultValue: 'Enter your destination address' })); return; }

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
    } catch (_e) { setError('Network error'); }
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
      const data = await res.json();
      if (res.ok) { alert(data.message || 'Deposit confirmed!'); setTab('my'); }
      else { alert(data.error || 'Verification failed'); }
    } catch (_e) { alert('Network error'); }
  };

  const handleConfirmReceipt = async (orderId: string) => {
    if (!confirm(t('bridge_confirm_receipt_question', { defaultValue: 'Confirm that you received GSTD tokens?' }))) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order/${orderId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ received_tx_hash: 'confirmed-by-user' }),
      });
      if (res.ok) { alert('Bridge complete! 🎉'); setTab('my'); }
    } catch (_e) { /* */ }
  };

  const handleCancelOrder = async (orderId: string) => {
    if (!confirm(t('bridge_cancel_confirm', { defaultValue: 'Cancel this order?' }))) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order/${orderId}/cancel?wallet=${walletAddress}`, {
        method: 'POST',
      });
      if (res.ok) { alert('Order cancelled'); setTab('my'); }
      else { const d = await res.json(); alert(d.error || 'Cannot cancel'); }
    } catch (_e) { /* */ }
  };

  const handleTakeOrder = async (order: BridgeOrder) => {
    if (!walletAddress) { alert(t('bridge_error_connect_wallet', { defaultValue: 'Connect your TON wallet first' })); return; }
    // For take-order: user needs to provide THEIR addresses on both chains
    // Source for taker = order's dest chain, Dest for taker = order's source chain
    const takerSourceChain = order.dest_chain;
    const takerDestChain = order.source_chain;
    const takerSourceWallet = multiWallet.getChainWallet(takerSourceChain as ChainId);
    const takerDestWallet = multiWallet.getChainWallet(takerDestChain as ChainId);

    let takerSourceAddr = takerSourceWallet.connected ? takerSourceWallet.address : '';
    let takerDestAddr = takerDestWallet.connected ? takerDestWallet.address : '';

    if (!takerSourceAddr) {
      takerSourceAddr = prompt(`Enter your ${takerSourceChain} address (where you hold GSTD):`) || '';
      if (!takerSourceAddr) return;
    }
    if (!takerDestAddr) {
      takerDestAddr = prompt(`Enter your ${takerDestChain} address (where you want to receive GSTD):`) || '';
      if (!takerDestAddr) return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/bridge/p2p/order/${order.id}/take`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_wallet: walletAddress,
          source_address: takerSourceAddr,
          dest_address: takerDestAddr,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        alert(`${data.message}\n\n${(data.instructions || []).join('\n')}`);
        setTab('my');
      } else { alert(data.error || 'Failed to take order'); }
    } catch (_e) { alert('Network error'); }
  };


  return (
    <>
      <Head>
        <title>P2P Bridge — GSTD</title>
        <meta name="description" content="Peer-to-peer cross-chain GSTD bridge. Swap tokens between TON, Solana, and XRPL directly with other users." />
      </Head>


      <div style={{ minHeight: '100vh', background: '#030014', paddingTop: 80, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 640, margin: '0 auto', padding: '0 16px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px',
              borderRadius: 20, background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.15)', marginBottom: 12,
            }}>
              <ArrowRightLeft size={14} style={{ color: '#8b5cf6' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', letterSpacing: '0.05em' }}>{t('bridge_badge')}</span>
            </div>
            <h1 style={{ fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'white', marginBottom: 8 }}>
              {t('bridge_title_prefix')} <span style={{ background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{t('bridge_title_highlight')}</span>
            </h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', maxWidth: 440, margin: '0 auto' }}>
              {t('bridge_subtitle')}
            </p>
          </div>

          {/* Stats Bar */}
          {stats && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 24 }}>
              {[
                { v: stats.open_orders, l: t('bridge_open'), c: '#60a5fa' },
                { v: stats.matched_orders, l: t('bridge_matched_label'), c: '#fb923c' },
                { v: stats.completed_swaps, l: t('bridge_done'), c: '#34d399' },
                { v: `${stats.total_volume_gstd.toFixed(0)}`, l: t('bridge_volume'), c: '#a78bfa' },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '10px 4px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tab Nav */}
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {([
              { id: 'swap' as const, label: t('bridge_new_swap'), icon: <ArrowRightLeft size={14} /> },
              { id: 'orders' as const, label: t('bridge_order_book', 'Order Book'), icon: <BookOpen size={14} /> },
              { id: 'my' as const, label: t('bridge_my_orders'), icon: <Users size={14} /> },
            ]).map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)} style={{
                flex: '1 1 30%', minWidth: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: tab === tb.id ? 'rgba(139,92,246,0.15)' : 'transparent',
                color: tab === tb.id ? 'white' : 'rgba(255,255,255,0.4)',
                fontSize: 12, fontWeight: tab === tb.id ? 700 : 500, transition: 'all 0.2s',
              }}>
                {tb.icon} {tb.label}
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
              {/* TON Wallet (primary identifier) */}
              {!isWalletConnected && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>{t('bridge_your_wallet')}</div>
                  <ChainWalletWidget chain="TON" label={t('bridge_wallet_connected', 'Wallet Connected')} />
                </div>
              )}
              {isWalletConnected && (
                <div style={{ marginBottom: 16 }}>
                  <ChainWalletWidget chain="TON" label={t('bridge_your_wallet')} />
                </div>
              )}

              <ChainSelect value={sourceChain} onChange={(v) => setSourceChain(v as ChainId)} label={t('bridge_i_have')} exclude={destChain} />

              {/* Source Chain Wallet + Address */}
              <div style={{ marginTop: 8 }}>
                <ChainWalletWidget chain={sourceChain} label={t('bridge_source_wallet', { defaultValue: `${sourceChain} Wallet` })} address={sourceAddress} onAddressChange={setSourceAddress} />
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

              <ChainSelect value={destChain} onChange={(v) => setDestChain(v as ChainId)} label={t('bridge_i_want')} exclude={sourceChain} />

              {/* Dest Chain Wallet + Address */}
              <div style={{ marginTop: 8 }}>
                <ChainWalletWidget chain={destChain} label={t('bridge_dest_wallet', { defaultValue: `${destChain} Wallet` })} address={destAddress} onAddressChange={setDestAddress} />
              </div>

              {/* Amount */}
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>{t('bridge_amount_gstd')}</div>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00"
                  style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 18, fontWeight: 700, outline: 'none' }} />
              </div>

              {/* Info */}
              <div style={{ marginTop: 14, padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                  <span>{t('bridge_fee')}</span><span style={{ color: '#34d399', fontWeight: 700 }}>0% (Automated)</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                  <span>{t('bridge_model')}</span><span>{t('bridge_model_value')}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  <span>{t('bridge_expiry')}</span><span>{t('bridge_expiry_value')}</span>
                </div>
              </div>

              {error && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', color: '#f87171', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <AlertCircle size={12} /> {error}
                </div>
              )}

              <button onClick={handleSubmitOrder} disabled={loading || !isWalletConnected}
                style={{
                  width: '100%', marginTop: 16, padding: '14px', borderRadius: 14, border: 'none',
                  background: isWalletConnected
                    ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)'
                    : 'rgba(255,255,255,0.06)',
                  color: isWalletConnected ? 'white' : 'rgba(255,255,255,0.3)',
                  fontSize: 14, fontWeight: 700, cursor: isWalletConnected ? 'pointer' : 'not-allowed',
                  opacity: loading ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.3s',
                }}>
                {loading
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {t('bridge_placing')}</>
                  : !isWalletConnected
                    ? <><Wallet size={16} /> {t('bridge_connect_first', 'Connect wallet to place order')}</>
                    : <><ArrowRightLeft size={16} /> {t('bridge_place_order')}</>
                }
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
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>{t('bridge_matched')}</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{result.message}</p>
                  <div style={{ textAlign: 'left', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{t('bridge_send_to')}</div>
                    <div style={{ fontSize: 13, fontFamily: 'monospace', color: '#a78bfa', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 6 }}>
                      {result.match?.send_to_address} <CopyButton text={result.match?.send_to_address || ''} />
                    </div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 8, marginBottom: 4 }}>{t('bridge_receive_from')}</div>
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
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: 'white', marginBottom: 6 }}>{t('bridge_order_placed')}</h3>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>{result.message}</p>
                </>
              )}
              <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>Order ID: {result.order_id}</div>
              <button onClick={() => { setResult(null); setAmount(''); }}
                style={{ padding: '10px 20px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} /> {t('bridge_new_order')}
              </button>
            </div>
          )}



          {/* ── TAB: My Orders ── */}
          {tab === 'my' && (
            <div>
              {!walletAddress ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <Wallet size={32} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>
                    {t('bridge_connect_to_see_orders', 'Connect your wallet to see your orders')}
                  </p>
                  <ChainWalletWidget chain="TON" label={t('bridge_your_wallet')} />
                </div>
              ) : myOrders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{t('bridge_no_my_orders')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {myOrders.map(o => (
                    <div key={o.id} style={{
                      padding: '16px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {/* Header: chains + amount + status */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{CHAINS.find(c => c.id === o.source_chain)?.icon}</span>
                          <ArrowRight size={12} style={{ color: 'rgba(255,255,255,0.2)' }} />
                          <span>{CHAINS.find(c => c.id === o.dest_chain)?.icon}</span>
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'white', marginLeft: 4 }}>{o.amount} GSTD</span>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>

                      {/* ── OPEN: waiting for counterparty ── */}
                      {o.status === 'open' && (
                        <div>
                          <div style={{
                            padding: '12px 14px', borderRadius: 10,
                            background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.12)',
                            marginBottom: 8,
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <Clock size={13} style={{ color: '#60a5fa' }} />
                              <span style={{ fontSize: 12, fontWeight: 600, color: '#60a5fa' }}>
                                {t('bridge_waiting_match', { defaultValue: 'Waiting for counterparty...' })}
                              </span>
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                              {t('bridge_waiting_match_desc', { defaultValue: 'Your order is in the order book. When someone wants to swap in the opposite direction, the system will match you automatically. You can also share the order book link.' })}
                            </div>
                          </div>
                          <button onClick={() => handleCancelOrder(o.id)}
                            style={{
                              width: '100%', padding: '8px', borderRadius: 8,
                              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                              color: '#f87171', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                            <X size={12} /> {t('bridge_cancel_order', { defaultValue: 'Cancel Order' })}
                          </button>
                        </div>
                      )}

                      {/* ── MATCHED: show instructions ── */}
                      {o.status === 'matched' && (
                        <div>
                          {o.send_gstd_to && (
                            <div style={{
                              padding: '12px 14px', borderRadius: 10,
                              background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
                              marginBottom: 8,
                            }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#fb923c', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                ⚡ {t('bridge_step_send', { defaultValue: 'Step 1: Send your GSTD' })}
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>
                                {t('bridge_send_instruction', { amount: o.amount, chain: o.source_chain, defaultValue: `Send ${o.amount} GSTD on ${o.source_chain} to:` })}
                              </div>
                              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#a78bfa', wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: 4, padding: '6px 8px', borderRadius: 6, background: 'rgba(139,92,246,0.08)' }}>
                                {o.send_gstd_to} <CopyButton text={o.send_gstd_to} />
                              </div>
                            </div>
                          )}
                          <button onClick={() => handleConfirmDeposit(o.id)}
                            style={{
                              width: '100%', padding: '10px', borderRadius: 8,
                              background: 'linear-gradient(135deg, rgba(249,115,22,0.1), rgba(234,88,12,0.1))',
                              border: '1px solid rgba(249,115,22,0.2)',
                              color: '#fb923c', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}>
                            <CheckCircle2 size={14} /> {t('bridge_i_sent_gstd', { defaultValue: "I've sent GSTD — Enter TX Hash" })}
                          </button>
                        </div>
                      )}

                      {/* ── DEPOSITED: waiting for counterparty or confirm receipt ── */}
                      {(o.status === 'deposited' || o.status === 'confirming') && (
                        <div>
                          <div style={{
                            padding: '12px 14px', borderRadius: 10,
                            background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
                            marginBottom: 8,
                          }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#34d399', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              ✅ {t('bridge_deposit_confirmed', { defaultValue: 'Your deposit verified on-chain' })}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
                              {t('bridge_waiting_receipt', { defaultValue: 'Counterparty should send GSTD to your dest address. When you receive it, confirm below.' })}
                            </div>
                          </div>
                          <button onClick={() => handleConfirmReceipt(o.id)}
                            style={{
                              width: '100%', padding: '10px', borderRadius: 8,
                              background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(6,182,212,0.1))',
                              border: '1px solid rgba(16,185,129,0.2)',
                              color: '#34d399', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            }}>
                            <CheckCircle2 size={14} /> {t('bridge_i_received_gstd', { defaultValue: "I received GSTD — Confirm" })}
                          </button>
                        </div>
                      )}

                      {/* ── COMPLETED ── */}
                      {o.status === 'completed' && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 10,
                          background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <CheckCircle2 size={14} style={{ color: '#34d399' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>
                            {t('bridge_swap_complete', { defaultValue: 'Bridge swap completed! 🎉' })}
                          </span>
                        </div>
                      )}

                      {/* ── CANCELLED ── */}
                      {o.status === 'cancelled' && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 10,
                          background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <X size={14} style={{ color: '#f87171' }} />
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#f87171' }}>
                            {t('bridge_order_cancelled', { defaultValue: 'Order cancelled' })}
                          </span>
                        </div>
                      )}

                      {/* Order ID */}
                      <div style={{ fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.15)', marginTop: 8 }}>
                        ID: {o.id.slice(0, 8)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── TAB: Order Book ── */}
          {tab === 'orders' && (
            <div>
              {orders.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <BookOpen size={32} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>{t('bridge_no_open_orders', 'No open orders yet. Be the first to create one!')}</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {orders.map(o => (
                    <div key={o.id} style={{
                      padding: '14px 16px', borderRadius: 14,
                      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                      transition: 'all 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 18 }}>{CHAINS.find(c => c.id === o.source_chain)?.icon}</span>
                          <ArrowRight size={14} style={{ color: 'rgba(255,255,255,0.2)' }} />
                          <span style={{ fontSize: 18 }}>{CHAINS.find(c => c.id === o.dest_chain)?.icon}</span>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'white' }}>{o.amount} GSTD</div>
                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{o.source_chain} → {o.dest_chain}</div>
                          </div>
                        </div>
                        <StatusBadge status={o.status} />
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                          {o.wallet} · {new Date(o.created_at).toLocaleDateString()}
                        </div>
                        <button onClick={() => handleTakeOrder(o)} style={{
                          padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                          background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.08))',
                          color: '#a78bfa', fontSize: 11, fontWeight: 700, transition: 'all 0.2s',
                        }}>
                          {t('bridge_take_order', 'Take Order')} →
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* How it works */}
          <div style={{ marginTop: 48, marginBottom: 48 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', textAlign: 'center', marginBottom: 20 }}>{t('bridge_how_works')}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { n: '1', t: t('bridge_step1_title'), d: t('bridge_step1_desc'), icon: <Wallet size={16} /> },
                { n: '2', t: t('bridge_step2_title'), d: t('bridge_step2_desc'), icon: <Users size={16} /> },
                { n: '3', t: t('bridge_step3_title'), d: t('bridge_step3_desc'), icon: <ArrowRightLeft size={16} /> },
                { n: '4', t: t('bridge_step4_title'), d: t('bridge_step4_desc'), icon: <CheckCircle2 size={16} /> },
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
