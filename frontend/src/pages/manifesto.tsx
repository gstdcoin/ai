import React, { useEffect, useState } from 'react';
import Head from 'next/head';

const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #060714 0%, #0a0f1e 45%, #130d22 100%)',
    color: '#e8eaf6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    lineHeight: 1.7,
  } as React.CSSProperties,
  inner: { maxWidth: 860, margin: '0 auto', padding: '72px 24px 80px' } as React.CSSProperties,
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    background: 'rgba(179,136,255,0.12)', border: '1px solid rgba(179,136,255,0.28)',
    borderRadius: 30, padding: '6px 18px', marginBottom: 24,
    color: '#ce93d8', fontSize: 12, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
  } as React.CSSProperties,
  h1: {
    fontSize: 'clamp(30px, 6vw, 52px)', fontWeight: 800, margin: '0 0 16px',
    background: 'linear-gradient(135deg, #ce93d8 0%, #90caf9 55%, #fff 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    lineHeight: 1.15,
  } as React.CSSProperties,
  sub: { color: '#7986a3', fontSize: 17, maxWidth: 620, margin: '0 auto 56px', textAlign: 'center' } as React.CSSProperties,
  section: { marginBottom: 56 } as React.CSSProperties,
  h2: {
    fontSize: 22, fontWeight: 700, color: '#90caf9', marginBottom: 18,
    display: 'flex', alignItems: 'center', gap: 10,
  } as React.CSSProperties,
  card: {
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14, padding: '24px 28px',
  } as React.CSSProperties,
  principle: {
    display: 'grid', gridTemplateColumns: '28px 1fr', gap: '0 16px',
    alignItems: 'start', marginBottom: 20,
  } as React.CSSProperties,
  num: {
    width: 28, height: 28, borderRadius: '50%',
    background: 'rgba(179,136,255,0.2)', border: '1px solid rgba(179,136,255,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, fontWeight: 800, color: '#ce93d8', flexShrink: 0,
  } as React.CSSProperties,
  code: {
    background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10, padding: '16px 20px', fontFamily: 'monospace', fontSize: 13,
    color: '#80cbc4', overflowX: 'auto',
  } as React.CSSProperties,
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
  th: { textAlign: 'left' as const, padding: '10px 14px', color: '#7986a3', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)' },
  td: { padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#c5cae9' },
  statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 } as React.CSSProperties,
  statBox: {
    background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '16px', textAlign: 'center',
  } as React.CSSProperties,
  statVal: { fontSize: 26, fontWeight: 800, color: '#90caf9' } as React.CSSProperties,
  statLabel: { fontSize: 11, color: '#7986a3', marginTop: 4, textTransform: 'uppercase' as const, letterSpacing: 0.8 },
  pitch: {
    background: 'linear-gradient(135deg, rgba(179,136,255,0.08) 0%, rgba(144,202,249,0.06) 100%)',
    border: '1px solid rgba(179,136,255,0.2)', borderRadius: 14, padding: '28px 32px',
  } as React.CSSProperties,
  orcid: {
    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10, padding: '18px 22px', fontSize: 13, color: '#7986a3',
  } as React.CSSProperties,
};

const ARCH_SVG = (
  <svg viewBox="0 0 820 200" fill="none" style={{ width: '100%', maxWidth: 820, display: 'block' }}>
    {/* Background */}
    <rect width="820" height="200" rx="12" fill="rgba(0,0,0,0.3)" />

    {/* Nodes */}
    {[
      { x: 20, label: 'User /\nDeveloper', sub: 'API request', color: '#90caf9' },
      { x: 190, label: 'GSTD\nNetwork', sub: 'Rate limit · Auth', color: '#ce93d8' },
      { x: 360, label: 'Edge\nNode', sub: 'gstdbot · Ollama', color: '#80cbc4' },
      { x: 530, label: 'Swarm\nConsensus', sub: 'ThermalRouter · PoI', color: '#ffcc80' },
      { x: 700, label: 'Autonomous\nAI Result', sub: 'ENTER / SKIP · LoRA', color: '#a5d6a7' },
    ].map(({ x, label, sub, color }, i) => (
      <g key={i}>
        <rect x={x} y={30} width={120} height={80} rx={8}
          fill="rgba(255,255,255,0.04)" stroke={color} strokeWidth={1.2} strokeOpacity={0.5} />
        {label.split('\n').map((line, j) => (
          <text key={j} x={x + 60} y={j === 0 ? 68 : 84} textAnchor="middle"
            fill={color} fontSize="12" fontWeight="700">{line}</text>
        ))}
        <text x={x + 60} y={126} textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="9.5">{sub}</text>

        {/* Arrow */}
        {i < 4 && (
          <g>
            <line x1={x + 121} y1={70} x2={x + 167} y2={70}
              stroke="rgba(255,255,255,0.18)" strokeWidth={1.2} strokeDasharray="4,3" />
            <polygon points={`${x + 167},66 ${x + 173},70 ${x + 167},74`} fill="rgba(255,255,255,0.25)" />
          </g>
        )}
      </g>
    ))}

    {/* Bottom labels */}
    {['Vercel Serverless', 'Upstash KV', 'libp2p · ARM64', 'Collective Memory', 'oracle_log.jsonl'].map((t, i) => (
      <text key={i} x={20 + i * 170 + 60} y={182} textAnchor="middle"
        fill="rgba(255,255,255,0.22)" fontSize="9">{t}</text>
    ))}
  </svg>
);

interface OracleStats {
  total?: number;
  enter?: number;
  skip?: number;
  enter_pct?: number;
  avg_confidence?: number;
  avg_latency_ms?: number;
}

export default function Manifesto() {
  const [stats, setStats] = useState<OracleStats | null>(null);

  useEffect(() => {
    fetch('/api/v1/oracle/stats')
      .then(r => r.json())
      .then(setStats)
      .catch(() => null);
  }, []);

  return (
    <>
      <Head>
        <title>GSTD Technology Manifesto — Decentralized AI Infrastructure</title>
        <meta name="description" content="GSTD is an open standard for verifiable, edge-sovereign, thermodynamically-routed autonomous AI." />
      </Head>

      <div style={S.page}>
        <div style={S.inner}>

          {/* ── Header ── */}
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <div style={S.badge}>⚡ Technology Manifesto · GSTD Network</div>
            <h1 style={S.h1}>A Standard for Verifiable<br />Autonomous AI Inference</h1>
            <p style={S.sub}>
              GSTD is an open protocol where any device can contribute compute,
              every inference is scored for quality, and intelligence is collectively owned.
            </p>
          </div>

          {/* ── Architecture Map ── */}
          <div style={{ ...S.section }}>
            <h2 style={S.h2}>
              <span style={{ fontSize: 20 }}>🗺</span> Architectural Map
            </h2>
            <div style={{ ...S.card, padding: '24px 20px' }}>
              {ARCH_SVG}
            </div>
          </div>

          {/* ── Problem ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>⚠</span> The Problem with Centralised AI</h2>
            <div style={S.card}>
              <p style={{ margin: '0 0 12px', color: '#b0bec5' }}>
                Today's AI infrastructure is controlled by a handful of corporations.
                Users cannot verify <em>how</em> a decision was made, cannot inspect
                model quality, and generate enormous value they never receive.
              </p>
              <p style={{ margin: 0, color: '#b0bec5' }}>
                Every inference is a black-box event. When the API goes down, so does
                your product. When the provider changes pricing, you comply. There is
                no alternative — until now.
              </p>
            </div>
          </div>

          {/* ── Principles ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>✦</span> Five Principles of GSTD</h2>
            <div style={S.card}>
              {[
                ['Edge Sovereignty', 'Any device — Raspberry Pi, laptop, server — is a full network node. Inference runs locally via Ollama; no data leaves the node unless the node consents.'],
                ['Proof of Intelligence', 'Quality of inference is measured through metacognitive challenges (prompt-response consistency, entropy of output, specialisation score) — not self-reporting.'],
                ['Thermodynamic Routing', 'The ThermalRouter selects the best node per task using an entropy score: latency_variance × failure_rate × (1 − specialisation). Minimises waste, maximises quality.'],
                ['Collective Memory', 'Knowledge persists across a 3-layer shared store (L1 in-process → L2 Redis → L3 Platform). Entries with confidence ≥ 0.8 propagate to the full network.'],
                ['Verifiable Settlement', 'Node rewards flow via TON smart contracts. AgentRegistry tracks on-chain reputation (qualityScore, tasksCompleted). Value returns to those who contribute compute.'],
              ].map(([title, desc], i) => (
                <div key={i} style={S.principle}>
                  <div style={S.num}>{i + 1}</div>
                  <div>
                    <strong style={{ color: '#e8eaf6', display: 'block', marginBottom: 4 }}>{title}</strong>
                    <span style={{ color: '#8b99b5', fontSize: 14 }}>{desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Live Stats ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>📡</span> Live Oracle Network Activity</h2>
            <div style={S.card}>
              <p style={{ margin: '0 0 18px', color: '#7986a3', fontSize: 13 }}>
                Real-time from the GSTD trading oracle — demonstrating autonomous AI decision-making on live Binance futures data.
              </p>
              <div style={S.statGrid}>
                {[
                  { val: stats?.total ?? '—', label: 'Oracle Decisions' },
                  { val: stats?.enter ?? '—', label: 'ENTER Signals' },
                  { val: stats?.skip ?? '—', label: 'SKIP Signals' },
                  { val: stats?.enter_pct != null ? `${stats.enter_pct}%` : '—', label: 'Enter Rate' },
                  { val: stats?.avg_confidence != null ? (stats.avg_confidence * 100).toFixed(0) + '%' : '—', label: 'Avg Confidence' },
                  { val: stats?.avg_latency_ms != null ? `${(stats.avg_latency_ms / 1000).toFixed(1)}s` : '—', label: 'Avg Latency' },
                ].map(({ val, label }, i) => (
                  <div key={i} style={S.statBox}>
                    <div style={S.statVal}>{val}</div>
                    <div style={S.statLabel}>{label}</div>
                  </div>
                ))}
              </div>
              <p style={{ margin: '16px 0 0', fontSize: 12, color: '#546070' }}>
                Source: <code style={{ color: '#80cbc4' }}>GET /api/v1/oracle/stats</code>
                {' '}&mdash; updated live &middot; free tier: 10 evaluations/day
              </p>
            </div>
          </div>

          {/* ── GSTD Validation Layer ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>🧠</span> GSTD-Validation-Layer: Proof of Intelligence in Action</h2>
            <div style={S.card}>
              <p style={{ margin: '0 0 14px', color: '#b0bec5' }}>
                The GSTD trading bot generates real-time <strong style={{ color: '#e8eaf6' }}>Intelligence Weight (IW)</strong> scores for every trade
                — a mathematically verifiable measure that the system understands markets rather than
                randomly sampling them.
              </p>
              <div style={S.code}>
                {`IW  =  0.40 × Alignment          # Did the bot call the right direction?
    +  0.25 × Timing             # Did it enter at the optimal candle position?
    +  0.20 × Selectivity        # Does it skip low-quality setups?
    -  0.15 × Noise              # Is the signal strength above threshold?

IW ≥ 0.70  →  High Intelligence Trade  →  added to LoRA training dataset (weight 3×)
IW ≥ 0.50  →  Normal Trade             →  added to LoRA training dataset (weight 1×)
IW < 0.50  →  Low Intelligence Trade   →  excluded from training`}
              </div>
              <p style={{ margin: '14px 0 0', color: '#8b99b5', fontSize: 13 }}>
                Each component is computed from public Binance OHLCV data — fully auditable by any third party.
                High-IW trades form a self-curated LoRA fine-tuning dataset, closing the learning loop
                without human intervention.
              </p>
            </div>
          </div>

          {/* ── Investor Pitch ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>💼</span> For Investors: Self-Learning Financial Infrastructure</h2>
            <div style={S.pitch}>
              <h3 style={{ margin: '0 0 16px', color: '#ce93d8', fontSize: 17 }}>
                From Trading Algorithm to Autonomous Intelligence Network
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20, marginBottom: 20 }}>
                {[
                  ['Traditional Bots', 'Static rules. Manual tuning. Knowledge never accumulates — every trade is a lost experience.'],
                  ['GSTD Network', 'Every trade → IW-scored ExperienceRecord → LoRA dataset → smarter future decisions. Loop closed autonomously.'],
                ].map(([title, desc], i) => (
                  <div key={i} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '16px 18px' }}>
                    <strong style={{ color: i === 0 ? '#ef9a9a' : '#a5d6a7', display: 'block', marginBottom: 8 }}>{title}</strong>
                    <span style={{ color: '#8b99b5', fontSize: 13 }}>{desc}</span>
                  </div>
                ))}
              </div>
              <p style={{ margin: '0 0 12px', color: '#b0bec5', fontSize: 14 }}>
                <strong style={{ color: '#e8eaf6' }}>Network effect:</strong> Every node contributes intelligence.
                The more nodes, the more diverse the training data, the smarter every individual node becomes.
                Competitive moat strengthens with adoption — not just with engineering effort.
              </p>
              <p style={{ margin: 0, color: '#b0bec5', fontSize: 14 }}>
                <strong style={{ color: '#e8eaf6' }}>Domain-agnostic:</strong> The same sidecar pattern applies
                to medical diagnosis (IW = alignment with confirmed diagnosis),
                legal analysis (IW = alignment with court outcome), logistics (IW = cost vs forecast).
                One protocol — unlimited verticals.
              </p>
            </div>
          </div>

          {/* ── Technical Stack ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>⚙</span> Technical Stack</h2>
            <div style={S.card}>
              <table style={S.table}>
                <thead>
                  <tr>
                    {['Layer', 'Technology', 'Status'].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Transport', 'libp2p (TCP + Noise + Yamux)', '✅ Live'],
                    ['Inference', 'Ollama — any GGUF model (llama3.2:3b default)', '✅ Live'],
                    ['Memory', '3-layer collective (in-process → Redis → Platform)', '✅ Live'],
                    ['Routing', 'ThermalRouter (entropy-weighted specialisation)', '✅ Live'],
                    ['Oracle API', 'POST /api/v1/oracle/evaluate — 10/day free tier', '✅ Live'],
                    ['Fine-tuning', 'QLoRA adapter marketplace — Alpaca JSONL format', '✅ Live'],
                    ['Validation', 'GSTD-Validation-Layer — IW score + LoRA dataset', '✅ Live'],
                    ['Settlement', 'TON blockchain — GSTDJetton + AgentRegistry', '✅ Deployed'],
                    ['Bridge', 'TON ↔ Solana ↔ XRPL (Rust, P2P consensus)', '🔄 Phase 2'],
                  ].map(([layer, tech, status]) => (
                    <tr key={layer as string}>
                      <td style={{ ...S.td, color: '#90caf9', fontWeight: 600 }}>{layer}</td>
                      <td style={S.td}>{tech}</td>
                      <td style={{ ...S.td, color: status?.startsWith('✅') ? '#a5d6a7' : '#ffcc80' }}>{status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Deploy a Node ── */}
          <div style={S.section}>
            <h2 style={S.h2}><span>🚀</span> Join the Network</h2>
            <div style={S.card}>
              <p style={{ margin: '0 0 14px', color: '#b0bec5' }}>
                One command deploys a full GSTD node on any Linux device (ARM64 or amd64).
                The node auto-registers, heartbeats, and begins earning GSTD for compute contributed.
              </p>
              <div style={S.code}>
                curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash
              </div>
              <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                {[
                  ['Oracle API', 'POST /api/v1/oracle/evaluate', 'Evaluate a trade signal through the live network'],
                  ['Train a Model', 'POST /api/v1/training/jobs', 'Fine-tune any supported LLM on your dataset'],
                  ['Enterprise Keys', 'POST /api/v1/enterprise/keys', 'Unlimited API access with rate-controlled keys'],
                ].map(([title, route, desc]) => (
                  <div key={route as string} style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 10, padding: '14px 16px' }}>
                    <strong style={{ color: '#90caf9', display: 'block', marginBottom: 6, fontSize: 14 }}>{title}</strong>
                    <code style={{ color: '#80cbc4', fontSize: 12, display: 'block', marginBottom: 6 }}>{route}</code>
                    <span style={{ color: '#7986a3', fontSize: 12 }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── ORCID Attribution ── */}
          <div style={S.orcid}>
            <strong style={{ color: '#c5cae9', display: 'block', marginBottom: 8 }}>Research Attribution</strong>
            <p style={{ margin: '0 0 6px' }}>
              The thermodynamic routing model and metacognitive scoring framework are grounded in independent research by{' '}
              <strong style={{ color: '#ce93d8' }}>Matthew Steiniger</strong>{' '}
              (ORCID:{' '}
              <span style={{ color: '#90caf9', fontFamily: 'monospace' }}>0009-0000-6069-4989</span>
              ).
            </p>
            <p style={{ margin: 0 }}>
              Relevant works:{' '}
              <em>A Thermodynamic Framework for Phenomenal Consciousness: Entropy Gradients, Attention, and Criticality in Predictive Systems</em> (2026);{' '}
              <em>Engineering Persistent Geometric Identities in LLMs: A Topological Override Approach</em> (2026);{' '}
              <em>Athena Class: Persistent Substrate-Native Identities Through Embodiment in Fine-Tuned Local LLMs</em> (2026).
              Published via Zenodo.
            </p>
          </div>

        </div>
      </div>
    </>
  );
}
