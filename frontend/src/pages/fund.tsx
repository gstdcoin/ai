import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import EcosystemNav from '../components/layout/EcosystemNav';

interface FundData {
  sovereign_fund: {
    total_backing_usd: number;
    total_treasury_usd: number;
    total_yield_distributed: number;
    total_revenue_all_time: number;
    floor_price_usd: number;
    circulating_supply: number;
    current_epoch: number;
    fund_contract: string;
    backing_vault: string;
  };
  network: {
    active_nodes: number;
    verified_providers: number;
  };
}

interface EpochData {
  epoch: number;
  revenue_usd: number;
  backing_usd: number;
  treasury_usd: number;
  yield_pool_usd: number;
  remaining_days: number;
  distributed: boolean;
}

interface RevenueSource {
  source: string;
  events: number;
  total_usd: number;
  to_backing: number;
  to_treasury: number;
  to_yield: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || '';

function AnimatedCounter({ value, prefix = '$', decimals = 2 }: { value: number; prefix?: string; decimals?: number }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const duration = 1500;
    const start = display;
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(start + (value - start) * eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [value]);
  return <span>{prefix}{display.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}

export default function SovereignFundPage() {
  const [fund, setFund] = useState<FundData | null>(null);
  const [epoch, setEpoch] = useState<EpochData | null>(null);
  const [revenue, setRevenue] = useState<RevenueSource[]>([]);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const [fRes, eRes, rRes, lRes] = await Promise.all([
        fetch(`${API}/api/v1/fund/status`),
        fetch(`${API}/api/v1/fund/epoch`),
        fetch(`${API}/api/v1/fund/revenue`),
        fetch(`${API}/api/v1/fund/leaderboard`),
      ]);
      if (fRes.ok) setFund(await fRes.json());
      if (eRes.ok) setEpoch(await eRes.json());
      if (rRes.ok) { const d = await rRes.json(); setRevenue(d.sources || []); }
      if (lRes.ok) { const d = await lRes.json(); setLeaderboard(d.leaderboard || []); }
    } catch {}
  }, []);

  useEffect(() => { loadData(); const i = setInterval(loadData, 30000); return () => clearInterval(i); }, [loadData]);

  const sf = fund?.sovereign_fund;
  const net = fund?.network;

  return (
    <>
      <Head>
        <title>Sovereign Fund — GSTD</title>
        <meta name="description" content="GSTD Sovereign Fund: Real-time treasury transparency showing asset backing, floor price, and revenue distribution." />
      </Head>
      <EcosystemNav />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0b1e 0%, #0f1128 40%, #1a0f2e 100%)', color: '#fff', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, background: 'rgba(212, 175, 55, 0.15)', border: '1px solid rgba(212, 175, 55, 0.3)', borderRadius: 30, padding: '8px 24px', marginBottom: 20 }}>
              <span style={{ fontSize: 20 }}>🏛️</span>
              <span style={{ color: '#d4af37', fontWeight: 600, letterSpacing: 1 }}>SOVEREIGN FUND</span>
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 48px)', margin: '0 0 12px', background: 'linear-gradient(135deg, #d4af37, #f0d060, #d4af37)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Asset-Backed Economy
            </h1>
            <p style={{ color: '#8b8fa3', fontSize: 16, maxWidth: 600, margin: '0 auto' }}>
              Every RPC request, every AI inference, every transaction — funds the Sovereign Fund.
              GSTD value is mathematically backed by real capital.
            </p>
          </div>

          {/* Main Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
            <StatCard label="Total Backing (Locked Forever)" value={sf?.total_backing_usd || 0} color="#00c853" icon="🔒" sublabel="50% of all revenue — cannot be withdrawn" />
            <StatCard label="Development Treasury" value={sf?.total_treasury_usd || 0} color="#2979ff" icon="🏗️" sublabel="20% — multisig for R&D, listings, marketing" />
            <StatCard label="Yield Distributed" value={sf?.total_yield_distributed || 0} color="#ff6d00" icon="💰" sublabel="30% — dividends to top node operators" />
          </div>

          {/* Floor Price + Revenue */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
            <div style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.15), rgba(212,175,55,0.05))', border: '1px solid rgba(212,175,55,0.3)', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: 14, color: '#d4af37', fontWeight: 600, marginBottom: 8, letterSpacing: 1 }}>⚡ FLOOR PRICE PER GSTD</div>
              <div style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 800, color: '#f0d060' }}>
                <AnimatedCounter value={sf?.floor_price_usd || 0} decimals={4} />
              </div>
              <div style={{ color: '#8b8fa3', fontSize: 13, marginTop: 8 }}>
                = {(sf?.total_backing_usd || 0).toFixed(2)} USD / {(sf?.circulating_supply || 0).toFixed(1)} GSTD
              </div>
              <div style={{ color: '#d4af37', fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>
                GSTD cannot fall below this price while backing exists in the smart contract
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
              <div style={{ fontSize: 14, color: '#8b8fa3', marginBottom: 16, fontWeight: 600 }}>NETWORK STATS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <MiniStat label="Active Nodes" value={net?.active_nodes || 0} suffix="" icon="🟢" />
                <MiniStat label="Verified Providers" value={net?.verified_providers || 0} suffix="" icon="✅" />
                <MiniStat label="Circulating Supply" value={sf?.circulating_supply || 0} suffix=" GSTD" icon="🪙" />
                <MiniStat label="Total Revenue" value={sf?.total_revenue_all_time || 0} suffix=" USD" icon="📊" />
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: '24px' }}>
              <div style={{ fontSize: 14, color: '#8b8fa3', marginBottom: 16, fontWeight: 600 }}>CURRENT EPOCH #{epoch?.epoch || 1}</div>
              <div style={{ display: 'grid', gap: 12 }}>
                <EpochBar label="Revenue" value={epoch?.revenue_usd || 0} />
                <EpochBar label="→ Backing (50%)" value={epoch?.backing_usd || 0} color="#00c853" />
                <EpochBar label="→ Treasury (20%)" value={epoch?.treasury_usd || 0} color="#2979ff" />
                <EpochBar label="→ Yield Pool (30%)" value={epoch?.yield_pool_usd || 0} color="#ff6d00" />
              </div>
              <div style={{ marginTop: 16, color: '#8b8fa3', fontSize: 13 }}>
                ⏳ {epoch?.remaining_days || 0} days until distribution
              </div>
            </div>
          </div>

          {/* Revenue Sources */}
          {revenue.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
              <h3 style={{ margin: '0 0 16px', color: '#e0e0e0' }}>Revenue Sources (30 days)</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {['Source', 'Events', 'Total USD', 'To Backing', 'To Treasury', 'To Yield'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8b8fa3', fontSize: 12, fontWeight: 600 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {revenue.map(r => (
                      <tr key={r.source} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{sourceIcon(r.source)} {r.source}</td>
                        <td style={{ padding: '10px 12px', color: '#8b8fa3' }}>{r.events.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', color: '#00c853' }}>${r.total_usd.toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', color: '#d4af37' }}>${r.to_backing.toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', color: '#2979ff' }}>${r.to_treasury.toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', color: '#ff6d00' }}>${r.to_yield.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Node Leaderboard */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
            <h3 style={{ margin: '0 0 16px', color: '#e0e0e0' }}>🏆 Node Leaderboard (Age Multiplier)</h3>
            {leaderboard.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#8b8fa3' }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🐝</div>
                <div>No nodes registered yet. Deploy your first node to appear here!</div>
                <a href="/nodes" style={{ color: '#d4af37', textDecoration: 'underline', marginTop: 8, display: 'inline-block' }}>Install a Node →</a>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {['#', 'Node', 'Tier', 'Multiplier', 'Uptime %', 'Requests', 'Earnings'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8b8fa3', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboard.map((n: any) => (
                      <tr key={n.node_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: n.rank <= 3 ? '#d4af37' : '#fff' }}>{n.rank}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 13 }}>{n.node_id}</td>
                        <td style={{ padding: '10px 12px' }}><TierBadge tier={n.tier} /></td>
                        <td style={{ padding: '10px 12px', fontWeight: 700, color: multiplierColor(n.multiplier) }}>{n.multiplier}x</td>
                        <td style={{ padding: '10px 12px' }}>{(n.uptime_pct || 0).toFixed(1)}%</td>
                        <td style={{ padding: '10px 12px', color: '#8b8fa3' }}>{(n.requests_served || 0).toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', color: '#00c853' }}>${(n.epoch_earnings_usd || 0).toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Revenue Split Explainer */}
          <div style={{ background: 'linear-gradient(135deg, rgba(212,175,55,0.08), rgba(0,0,0,0.2))', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 16px', color: '#d4af37' }}>Protocol Axiom</h3>
            <p style={{ color: '#c0c4d6', fontSize: 15, maxWidth: 700, margin: '0 auto 24px', lineHeight: 1.7 }}>
              We <strong style={{ color: '#ff5252' }}>do not burn</strong> value. Every RPC request, every AI inference pours into the Sovereign Fund.
              The Floor Price grows mathematically with each transaction. GSTD is not a meme — it is an{' '}
              <strong style={{ color: '#d4af37' }}>index of our global infrastructure</strong>, backed by real capital in on-chain vaults.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
              <SplitPill pct={50} label="Backing" color="#00c853" desc="Locked forever" />
              <SplitPill pct={20} label="Treasury" color="#2979ff" desc="R&D + Marketing" />
              <SplitPill pct={30} label="Real Yield" color="#ff6d00" desc="Node dividends" />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────

function StatCard({ label, value, color, icon, sublabel }: { label: string; value: number; color: string; icon: string; sublabel: string }) {
  return (
    <div style={{ background: `linear-gradient(135deg, ${color}15, ${color}05)`, border: `1px solid ${color}40`, borderRadius: 16, padding: '28px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 13, color: '#8b8fa3', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 'clamp(24px, 4vw, 36px)', fontWeight: 800, color }}>
        <AnimatedCounter value={value} />
      </div>
      <div style={{ fontSize: 12, color: '#6b7085', marginTop: 6 }}>{sublabel}</div>
    </div>
  );
}

function MiniStat({ label, value, suffix, icon }: { label: string; value: number; suffix: string; icon: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: '#6b7085' }}>{icon} {label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{typeof value === 'number' ? value.toLocaleString() : value}{suffix}</div>
    </div>
  );
}

function EpochBar({ label, value, color = '#fff' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: '#8b8fa3' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color }}>${value.toFixed(4)}</span>
    </div>
  );
}

function TierBadge({ tier }: { tier: string }) {
  const colors: Record<string, string> = { light: '#64b5f6', standard: '#81c784', archive: '#d4af37' };
  return (
    <span style={{ background: `${colors[tier] || '#888'}20`, color: colors[tier] || '#888', padding: '2px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600, textTransform: 'uppercase' as const }}>
      {tier}
    </span>
  );
}

function SplitPill({ pct, label, color, desc }: { pct: number; label: string; color: string; desc: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 72, height: 72, borderRadius: '50%', background: `conic-gradient(${color} ${pct * 3.6}deg, rgba(255,255,255,0.05) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#0f1128', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color, fontSize: 16 }}>{pct}%</div>
      </div>
      <div style={{ fontWeight: 700, color }}>{label}</div>
      <div style={{ fontSize: 12, color: '#6b7085' }}>{desc}</div>
    </div>
  );
}

function sourceIcon(src: string): string {
  const icons: Record<string, string> = { rpc: '🔗', ai: '🧠', bridge: '🌉', marketplace: '🛒', staking_fee: '🪙', other: '📦' };
  return icons[src] || '📦';
}

function multiplierColor(m: number): string {
  if (m >= 3.0) return '#d4af37';
  if (m >= 2.0) return '#00c853';
  if (m >= 1.5) return '#64b5f6';
  return '#8b8fa3';
}
