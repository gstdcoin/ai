import React, { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import EcosystemNav from '../../components/layout/EcosystemNav';

const API = process.env.NEXT_PUBLIC_API_URL || '';

interface ClientProfile {
  client_id: number;
  wallet: string;
  profile: {
    company_name: string;
    tier: string;
    balance_usd: number;
    balance_gstd: number;
    balance_stars: number;
    rate_limit_rps: number;
    total_requests: number;
    total_spent_usd: number;
  };
}

interface ChainInfo {
  id: string;
  name: string;
  status: string;
  node_count: number;
}

interface UsageData {
  period: string;
  chains: { chain: string; requests: number; cost_usd: number; avg_latency_ms: number }[];
  total_requests: number;
  total_cost_usd: number;
}

export default function DevelopersPage() {
  const [view, setView] = useState<'landing' | 'dashboard'>('landing');
  const [walletAddress, setWalletAddress] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [profile, setProfile] = useState<ClientProfile | null>(null);
  const [chains, setChains] = useState<ChainInfo[]>([]);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [pricing, setPricing] = useState<any>(null);
  const [registering, setRegistering] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API}/api/v1/rpc/chains`).then(r => r.json()).then(d => setChains(d.chains || [])).catch(() => {});
    fetch(`${API}/api/v1/rpc/pricing`).then(r => r.json()).then(d => setPricing(d)).catch(() => {});
    const saved = localStorage.getItem('gstd_b2b_wallet');
    const savedKey = localStorage.getItem('gstd_b2b_apikey');
    if (saved) { setWalletAddress(saved); if (savedKey) { setApiKey(savedKey); setView('dashboard'); } }
  }, []);

  const loadProfile = useCallback(async () => {
    if (!apiKey) return;
    const res = await fetch(`${API}/api/v1/b2b/profile`, { headers: { 'X-API-Key': apiKey } });
    if (res.ok) { const d = await res.json(); setProfile(d); }
  }, [apiKey]);

  const loadUsage = useCallback(async () => {
    if (!apiKey) return;
    const res = await fetch(`${API}/api/v1/b2b/usage`, { headers: { 'X-API-Key': apiKey } });
    if (res.ok) setUsage(await res.json());
  }, [apiKey]);

  useEffect(() => {
    if (view === 'dashboard' && apiKey) { loadProfile(); loadUsage(); }
  }, [view, apiKey, loadProfile, loadUsage]);

  const handleRegister = async () => {
    setError('');
    setRegistering(true);
    try {
      const res = await fetch(`${API}/api/v1/b2b/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_name: companyName || 'Developer', email, wallet_address: walletAddress, tier: 'starter' }),
      });
      const data = await res.json();
      if (res.ok) {
        setNewApiKey(data.api_key);
        setApiKey(data.api_key);
        localStorage.setItem('gstd_b2b_wallet', walletAddress);
        localStorage.setItem('gstd_b2b_apikey', data.api_key);
        setView('dashboard');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch { setError('Network error'); }
    setRegistering(false);
  };

  const handleLogin = () => {
    if (apiKey) {
      localStorage.setItem('gstd_b2b_apikey', apiKey);
      localStorage.setItem('gstd_b2b_wallet', walletAddress);
      setView('dashboard');
    }
  };

  if (view === 'dashboard') {
    return <DeveloperDashboard profile={profile} usage={usage} apiKey={apiKey} newApiKey={newApiKey} onRefresh={() => { loadProfile(); loadUsage(); }} />;
  }

  return (
    <>
      <Head>
        <title>Developer Hub — GSTD</title>
        <meta name="description" content="GSTD Developer Hub: Get RPC access to multi-chain infrastructure and AI inference through a single API key." />
      </Head>
      <EcosystemNav />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0b1e 0%, #0f1128 40%, #1a0f2e 100%)', color: '#fff', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>

          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(41, 121, 255, 0.15)', border: '1px solid rgba(41, 121, 255, 0.3)', borderRadius: 30, padding: '6px 20px', marginBottom: 20 }}>
              <span style={{ fontSize: 16 }}>👨‍💻</span>
              <span style={{ color: '#64b5f6', fontWeight: 600, fontSize: 13, letterSpacing: 1 }}>DEVELOPER HUB</span>
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', margin: '0 0 12px', background: 'linear-gradient(135deg, #64b5f6, #fff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              One API Key. All Chains. AI Included.
            </h1>
            <p style={{ color: '#8b8fa3', fontSize: 16, maxWidth: 560, margin: '0 auto' }}>
              Get decentralized RPC access to TON, ETH, SOL, BTC and AI inference — powered by{' '}
              <strong style={{ color: '#d4af37' }}>94 node operators</strong> worldwide.
            </p>
          </div>

          {/* Endpoint Example */}
          <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '20px 24px', marginBottom: 32, fontFamily: 'monospace', fontSize: 14 }}>
            <div style={{ color: '#8b8fa3', marginBottom: 8 }}>{'// Single endpoint for all chains:'}</div>
            <div style={{ color: '#64b5f6' }}>POST <span style={{ color: '#d4af37' }}>https://rpc.gstd.network/v1/</span><span style={{ color: '#00c853' }}>{'{'}<em>chain</em>{'}'}</span></div>
            <div style={{ color: '#8b8fa3', marginTop: 8 }}>{'// Headers: X-API-Key: gstd_b2b_sk_...'}</div>
            <div style={{ color: '#8b8fa3' }}>{'// Supported: ton, eth, sol, btc, bsc, arb'}</div>
          </div>

          {/* Chains */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12, marginBottom: 32 }}>
            {chains.map(ch => (
              <div key={ch.id} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
                <div style={{ fontSize: 24, marginBottom: 4 }}>{chainEmoji(ch.id)}</div>
                <div style={{ fontWeight: 700 }}>{ch.name}</div>
                <div style={{ fontSize: 12, color: ch.status === 'live' ? '#00c853' : '#ff9800' }}>{ch.status === 'live' ? '● Live' : '○ Soon'}</div>
              </div>
            ))}
          </div>

          {/* Pricing */}
          {pricing && (
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
              <h3 style={{ margin: '0 0 16px', color: '#e0e0e0' }}>💎 Pay-as-you-go Pricing</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                {Object.entries(pricing.pricing || {}).map(([type, info]: [string, any]) => (
                  <div key={type} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16 }}>
                    <div style={{ fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' as const, fontSize: 13 }}>{type}</div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#d4af37' }}>
                      ${info.per_request_usd || info.per_1k_tokens_usd || 0}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7085', marginTop: 4 }}>{info.description}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16, fontSize: 13, color: '#8b8fa3' }}>
                💳 Accepts: GSTD, TON, USDT, Telegram Stars
              </div>
            </div>
          )}

          {/* Auth / Register */}
          <div style={{ background: 'linear-gradient(135deg, rgba(41,121,255,0.1), rgba(0,0,0,0.2))', border: '1px solid rgba(41,121,255,0.25)', borderRadius: 16, padding: '32px 24px', textAlign: 'center' }}>
            {!showRegister ? (
              <>
                <h3 style={{ margin: '0 0 16px', color: '#64b5f6' }}>Get Started</h3>
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <input id="developer-api-key-input" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Enter API Key (gstd_b2b_...)" style={inputStyle} />
                  <button id="developer-login-button" onClick={handleLogin} style={{ ...btnStyle, background: '#2979ff', marginTop: 8, width: '100%' }}>Access Dashboard →</button>
                  <div style={{ marginTop: 16, color: '#8b8fa3', fontSize: 14 }}>
                    No account? <button id="developer-register-toggle" onClick={() => setShowRegister(true)} style={{ background: 'none', border: 'none', color: '#d4af37', cursor: 'pointer', textDecoration: 'underline' }}>Register →</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 16px', color: '#64b5f6' }}>Register Developer Account</h3>
                <div style={{ maxWidth: 400, margin: '0 auto' }}>
                  <input id="register-company-input" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="Company / Project Name" style={inputStyle} />
                  <input id="register-email-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (optional)" style={{ ...inputStyle, marginTop: 8 }} />
                  <input id="register-wallet-input" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} placeholder="TON Wallet Address (UQ...)" style={{ ...inputStyle, marginTop: 8 }} />
                  {error && <div style={{ color: '#ff5252', fontSize: 13, marginTop: 8 }}>{error}</div>}
                  <button id="register-submit-button" onClick={handleRegister} disabled={registering || !walletAddress} style={{ ...btnStyle, background: '#00c853', marginTop: 12, width: '100%', opacity: !walletAddress ? 0.5 : 1 }}>
                    {registering ? 'Registering...' : 'Create Account & Get API Key'}
                  </button>
                  <button onClick={() => setShowRegister(false)} style={{ background: 'none', border: 'none', color: '#8b8fa3', cursor: 'pointer', marginTop: 12 }}>← Back to Login</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Developer Dashboard ─────────────────────────────────────

function DeveloperDashboard({ profile, usage, apiKey, newApiKey, onRefresh }: Readonly<{
  profile: ClientProfile | null; usage: UsageData | null; apiKey: string; newApiKey: string;
  onRefresh: () => void;
}>) {
  const p = profile?.profile;
  const [showKey, setShowKey] = useState(!!newApiKey);

  return (
    <>
      <Head>
        <title>Dashboard — GSTD Developer Hub</title>
      </Head>
      <EcosystemNav />
      <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0a0b1e 0%, #0f1128 40%, #1a0f2e 100%)', color: '#fff', padding: '80px 20px 40px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 28 }}>👤 {p?.company_name || 'Developer'}</h1>
              <div style={{ color: '#8b8fa3', fontSize: 14, marginTop: 4 }}>Tier: <strong style={{ color: tierColor(p?.tier || 'starter') }}>{(p?.tier || 'starter').toUpperCase()}</strong> • {p?.rate_limit_rps || 100} req/s</div>
            </div>
            <button onClick={onRefresh} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)' }}>🔄 Refresh</button>
          </div>

          {/* API Key Warning */}
          {newApiKey && (
            <div style={{ background: 'rgba(255,107,0,0.15)', border: '1px solid rgba(255,107,0,0.4)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ fontWeight: 700, color: '#ff6d00', marginBottom: 8 }}>⚠️ Save Your API Key Now!</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, wordBreak: 'break-all' as const, background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 8 }}>
                {showKey ? newApiKey : '•'.repeat(40)}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => setShowKey(!showKey)} style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', fontSize: 13 }}>{showKey ? 'Hide' : 'Show'}</button>
                <button onClick={() => { navigator.clipboard.writeText(newApiKey); }} style={{ ...btnStyle, background: '#2979ff', fontSize: 13 }}>📋 Copy</button>
              </div>
            </div>
          )}

          {/* Balance Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16, marginBottom: 32 }}>
            <BalanceCard label="USD Balance" value={`$${(p?.balance_usd || 0).toFixed(2)}`} color="#00c853" />
            <BalanceCard label="GSTD Balance" value={`${(p?.balance_gstd || 0).toFixed(2)} GSTD`} color="#d4af37" />
            <BalanceCard label="Stars" value={`${p?.balance_stars || 0} ⭐`} color="#7c4dff" />
            <BalanceCard label="Total Spent" value={`$${(p?.total_spent_usd || 0).toFixed(4)}`} color="#ff5252" />
          </div>

          {/* Usage Stats */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24, marginBottom: 32 }}>
            <h3 style={{ margin: '0 0 16px', color: '#e0e0e0' }}>📊 Usage This Month</h3>
            {(!usage?.chains || usage.chains.length === 0) ? (
              <div style={{ textAlign: 'center', padding: 32, color: '#8b8fa3' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📡</div>
                No requests yet. Use your API key to start making RPC calls.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      {['Chain', 'Requests', 'Cost', 'Avg Latency'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: 'left', color: '#8b8fa3', fontSize: 12 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usage.chains.map(ch => (
                      <tr key={ch.chain}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>{chainEmoji(ch.chain)} {ch.chain.toUpperCase()}</td>
                        <td style={{ padding: '10px 12px' }}>{ch.requests.toLocaleString()}</td>
                        <td style={{ padding: '10px 12px', color: '#ff5252' }}>${ch.cost_usd.toFixed(4)}</td>
                        <td style={{ padding: '10px 12px', color: '#8b8fa3' }}>{ch.avg_latency_ms.toFixed(0)}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', padding: '0 12px', color: '#8b8fa3', fontSize: 14 }}>
                  <span>Total: <strong style={{ color: '#fff' }}>{usage.total_requests.toLocaleString()}</strong> requests</span>
                  <span>Cost: <strong style={{ color: '#ff5252' }}>${usage.total_cost_usd.toFixed(4)}</strong></span>
                </div>
              </div>
            )}
          </div>

          {/* Quick Start */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
            <h3 style={{ margin: '0 0 16px', color: '#e0e0e0' }}>🚀 Quick Start</h3>
            <pre style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 16, overflow: 'auto', fontSize: 13, lineHeight: 1.6 }}>
{`curl -X POST https://rpc.gstd.network/v1/eth \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${apiKey?.slice(0, 20) || 'YOUR_API_KEY'}..." \\
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'`}
            </pre>
          </div>
        </div>
      </div>
    </>
  );
}

function BalanceCard({ label, value, color }: Readonly<{ label: string; value: string; color: string }>) {
  return (
    <div style={{ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 12, color: '#8b8fa3', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );
}

function chainEmoji(id: string): string {
  const emojis: Record<string, string> = { ton: '💎', eth: '⟠', sol: '☀️', btc: '₿', bsc: '🟡', arb: '🔵' };
  return emojis[id] || '🔗';
}

function tierColor(tier: string): string {
  const c: Record<string, string> = { starter: '#64b5f6', pro: '#d4af37', enterprise: '#ff6d00' };
  return c[tier] || '#64b5f6';
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 8, color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  padding: '12px 24px', borderRadius: 8, border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
};
