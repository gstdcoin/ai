import Head from 'next/head';
import { useState, useEffect, useRef } from 'react';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { API_BASE_URL } from '../lib/config';
import {
    Brain, Zap, CheckCircle, Clock, AlertCircle, Download,
    ChevronDown, Loader2, ExternalLink, Cpu, Globe,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Model {
    id: string;
    label: string;
    description: string;
    costPerEpoch: number;
    vramGb: number;
    icon: string;
    tier: 'small' | 'medium' | 'large';
}

interface JobStatus {
    job_id: string;
    model: string;
    domain: string;
    status: 'pending' | 'training' | 'aggregating' | 'done' | 'failed';
    shards_done: number;
    shards_total: number;
    progress_pct: number;
    avg_metacognitive_score: number | null;
    lora_url?: string;
    cost_gstd: number;
    created_at: string;
}

// ── Static data ───────────────────────────────────────────────────────────────

const MODELS: Model[] = [
    { id: 'llama3.2:1b',  label: 'Llama 3.2 · 1B',  description: 'Ultra-fast. Best for simple Q&A, classification.',    costPerEpoch: 0.4, vramGb: 2,  icon: '⚡', tier: 'small' },
    { id: 'gemma2:2b',    label: 'Gemma 2 · 2B',     description: 'Google Gemma. Excellent reasoning at 2B scale.',       costPerEpoch: 0.4, vramGb: 2,  icon: '💎', tier: 'small' },
    { id: 'llama3.2:3b',  label: 'Llama 3.2 · 3B',  description: 'Balanced. Great for most fine-tuning tasks.',          costPerEpoch: 0.8, vramGb: 3,  icon: '🦙', tier: 'medium' },
    { id: 'phi3:mini',    label: 'Phi-3 Mini',        description: 'Microsoft. Strong at code and structured output.',     costPerEpoch: 0.8, vramGb: 3,  icon: '🔷', tier: 'medium' },
    { id: 'qwen2.5:3b',   label: 'Qwen 2.5 · 3B',   description: 'Alibaba. Excellent multilingual + code.',             costPerEpoch: 0.8, vramGb: 3,  icon: '🐉', tier: 'medium' },
    { id: 'llama3.1:8b',  label: 'Llama 3.1 · 8B',  description: 'Production-grade. Highest quality fine-tunes.',       costPerEpoch: 2.0, vramGb: 8,  icon: '🚀', tier: 'large' },
    { id: 'qwen2.5:7b',   label: 'Qwen 2.5 · 7B',   description: 'Strong multilingual 7B. Great for Asian languages.',  costPerEpoch: 2.0, vramGb: 8,  icon: '🌏', tier: 'large' },
    { id: 'mistral:7b',   label: 'Mistral 7B',        description: 'European open model. Efficient and high quality.',    costPerEpoch: 2.0, vramGb: 8,  icon: '🌀', tier: 'large' },
];

const DOMAINS = [
    { id: 'general',  label: 'General',    icon: '🌐' },
    { id: 'code',     label: 'Code',       icon: '💻' },
    { id: 'medical',  label: 'Medical',    icon: '🏥' },
    { id: 'legal',    label: 'Legal',      icon: '⚖️' },
    { id: 'finance',  label: 'Finance',    icon: '📈' },
    { id: 'science',  label: 'Science',    icon: '🔬' },
];

// ── Colour helpers ────────────────────────────────────────────────────────────

function statusColor(s: string) {
    if (s === 'done')      return '#4ade80';
    if (s === 'failed')    return '#f87171';
    if (s === 'training')  return '#a78bfa';
    if (s === 'pending')   return '#facc15';
    return '#94a3b8';
}

function tierBorder(tier: string) {
    if (tier === 'large')  return 'rgba(167,139,250,0.5)';
    if (tier === 'medium') return 'rgba(99,102,241,0.4)';
    return 'rgba(255,255,255,0.15)';
}

function tierGlow(tier: string) {
    if (tier === 'large')  return '0 0 20px rgba(139,92,246,0.18)';
    if (tier === 'medium') return '0 0 14px rgba(99,102,241,0.12)';
    return 'none';
}

// ── Model Card ────────────────────────────────────────────────────────────────

function ModelCard({ model, selected, onClick }: { model: Model; selected: boolean; onClick(): void }) {
    return (
        <button
            onClick={onClick}
            style={{
                background:   selected ? 'rgba(139,92,246,0.18)' : 'rgba(255,255,255,0.03)',
                border:       `1px solid ${selected ? 'rgba(139,92,246,0.6)' : tierBorder(model.tier)}`,
                borderRadius: 12,
                boxShadow:    selected ? '0 0 24px rgba(139,92,246,0.3)' : tierGlow(model.tier),
                padding:      '14px 16px',
                cursor:       'pointer',
                textAlign:    'left',
                transition:   'all 0.2s',
                width:        '100%',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20 }}>{model.icon}</span>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{model.label}</span>
                {selected && <CheckCircle size={14} color="#a78bfa" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
            </div>
            <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, margin: 0, lineHeight: 1.4 }}>
                {model.description}
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 11, color: '#a78bfa', background: 'rgba(139,92,246,0.12)', borderRadius: 6, padding: '2px 8px' }}>
                    {model.costPerEpoch} GSTD/epoch
                </span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.05)', borderRadius: 6, padding: '2px 8px' }}>
                    {model.vramGb}GB VRAM
                </span>
            </div>
        </button>
    );
}

// ── Progress Block ────────────────────────────────────────────────────────────

function JobProgress({ job }: { job: JobStatus }) {
    const pct = job.progress_pct ?? 0;
    const col = statusColor(job.status);

    return (
        <div style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 16,
            padding: 24,
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                    <div style={{ color: '#fff', fontWeight: 700, fontSize: 16 }}>
                        Training Job
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2, fontFamily: 'monospace' }}>
                        {job.job_id}
                    </div>
                </div>
                <span style={{
                    fontSize: 12, fontWeight: 700, color: col,
                    background: `${col}22`, border: `1px solid ${col}44`,
                    borderRadius: 8, padding: '4px 12px', textTransform: 'uppercase',
                }}>
                    {job.status}
                </span>
            </div>

            {/* Progress bar */}
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
                <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: job.status === 'done'
                        ? 'linear-gradient(90deg, #4ade80, #22d3ee)'
                        : 'linear-gradient(90deg, #8b5cf6, #6366f1)',
                    borderRadius: 4,
                    transition: 'width 0.6s ease',
                }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>
                <span>{job.shards_done} / {job.shards_total} shards</span>
                <span>{pct}%</span>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                {[
                    { label: 'Model',   value: job.model },
                    { label: 'Domain',  value: job.domain },
                    { label: 'Quality', value: job.avg_metacognitive_score != null ? `${(job.avg_metacognitive_score * 100).toFixed(0)}%` : '—' },
                ].map(({ label, value }) => (
                    <div key={label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '10px 12px' }}>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, color: '#fff', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
                    </div>
                ))}
            </div>

            {/* Download */}
            {job.status === 'done' && job.lora_url && (
                <a
                    href={job.lora_url}
                    download
                    style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        marginTop: 16, padding: '12px 20px', borderRadius: 12,
                        background: 'rgba(74,222,128,0.12)',
                        border: '1px solid rgba(74,222,128,0.3)',
                        color: '#4ade80', fontWeight: 700, fontSize: 14,
                        textDecoration: 'none', justifyContent: 'center',
                    }}
                >
                    <Download size={16} />
                    Download LoRA Adapter
                </a>
            )}

            {job.status === 'done' && !job.lora_url && (
                <div style={{ marginTop: 16, padding: '12px 20px', borderRadius: 12, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', color: '#4ade80', fontSize: 13, textAlign: 'center' }}>
                    ✓ Training complete — adapter path logged by the training node
                </div>
            )}

            {job.status === 'pending' && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>
                    <Loader2 size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                    Waiting for an available training node…
                </div>
            )}
            {job.status === 'training' && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, color: '#a78bfa', fontSize: 12 }}>
                    <Loader2 size={13} style={{ animation: 'spin 1.5s linear infinite' }} />
                    A node is training your model — quality gate active (≥0.3)
                </div>
            )}
        </div>
    );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function TrainingPage() {
    const [selectedModel, setSelectedModel] = useState<string>('llama3.2:3b');
    const [selectedDomain, setSelectedDomain] = useState<string>('general');
    const [datasetUrl, setDatasetUrl] = useState('');
    const [epochs, setEpochs] = useState(1);
    const [wallet, setWallet] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [job, setJob] = useState<JobStatus | null>(null);
    const [showAll, setShowAll] = useState(false);
    const [balance, setBalance] = useState<number | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const model = MODELS.find(m => m.id === selectedModel) || MODELS[2];
    const cost  = model.costPerEpoch * epochs;

    // Fetch GSTD credit balance when wallet is set
    useEffect(() => {
        const w = wallet.trim();
        if (!w) { setBalance(null); return; }
        fetch(`${API_BASE_URL}/api/v1/credits/balance?wallet=${encodeURIComponent(w)}`)
            .then(r => r.ok ? r.json() : null)
            .then(d => d ? setBalance(d.balance_gstd) : null)
            .catch(() => null);
    }, [wallet]);

    // Poll job status
    useEffect(() => {
        if (!job || job.status === 'done' || job.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current);
            return;
        }
        pollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/api/v1/training/jobs/${job.job_id}`);
                if (res.ok) {
                    const data = await res.json();
                    setJob(data);
                }
            } catch { /* ignore */ }
        }, 3000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [job?.job_id, job?.status]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!datasetUrl.trim()) { setError('Dataset URL is required (public JSONL file)'); return; }

        setSubmitting(true);
        try {
            const res = await fetch(`${API_BASE_URL}/api/v1/training/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: selectedModel,
                    dataset_url: datasetUrl.trim(),
                    domain: selectedDomain,
                    epochs,
                    wallet: wallet.trim() || undefined,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 402) {
                    setError(`Insufficient GSTD balance. Need ${data.required} GSTD, you have ${(data.available || 0).toFixed(2)} GSTD. Send GSTD to your vault to top up.`);
                    setBalance(data.available || 0);
                } else {
                    setError(data.error || 'Submission failed');
                }
                return;
            }

            // Start tracking
            setJob({
                job_id:                  data.job_id,
                model:                   data.model,
                domain:                  data.domain,
                status:                  'pending',
                shards_done:             0,
                shards_total:            data.shards,
                progress_pct:            0,
                avg_metacognitive_score: null,
                cost_gstd:               data.cost_gstd,
                created_at:              new Date().toISOString(),
            });
        } catch (err: any) {
            setError(err.message || 'Network error');
        } finally {
            setSubmitting(false);
        }
    };

    const displayedModels = showAll ? MODELS : MODELS.slice(0, 6);

    return (
        <>
            <Head>
                <title>AI Fine-Tuning Marketplace — GSTD</title>
                <meta name="description" content="Fine-tune open-source LLMs on the GSTD decentralised computing network. 10–30× cheaper than cloud." />
            </Head>

            <style>{`
                @keyframes spin { to { transform: rotate(360deg); } }
                @keyframes pulse-ring {
                    0%   { transform: scale(1);   opacity: 0.6; }
                    100% { transform: scale(1.4); opacity: 0; }
                }
                * { box-sizing: border-box; }
            `}</style>

            <div style={{
                minHeight: '100vh',
                background: '#030014',
                fontFamily: "'Inter', system-ui, sans-serif",
                color: '#fff',
            }}>
                {/* Hero */}
                <div style={{
                    maxWidth: 900,
                    margin: '0 auto',
                    padding: '64px 20px 0',
                    textAlign: 'center',
                }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        background: 'rgba(139,92,246,0.12)',
                        border: '1px solid rgba(139,92,246,0.3)',
                        borderRadius: 99, padding: '6px 16px',
                        fontSize: 12, color: '#a78bfa', fontWeight: 600,
                        marginBottom: 24,
                    }}>
                        <Zap size={13} /> Powered by GSTD Node Network
                    </div>
                    <h1 style={{
                        fontSize: 'clamp(28px, 5vw, 52px)',
                        fontWeight: 800,
                        lineHeight: 1.1,
                        letterSpacing: '-0.03em',
                        margin: '0 0 16px',
                        background: 'linear-gradient(135deg, #fff 30%, #a78bfa)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                    }}>
                        Fine-Tune Any LLM<br />for Cents, Not Dollars
                    </h1>
                    <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, lineHeight: 1.6, maxWidth: 520, margin: '0 auto 48px' }}>
                        Upload your dataset. Pick a model. Distributed nodes train a LoRA adapter using QLoRA — with a built-in quality gate before any gradient is accepted.
                    </p>

                    {/* Stats row */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginBottom: 64, flexWrap: 'wrap' }}>
                        {[
                            { icon: '💰', label: 'From 0.4 GSTD', sub: 'per epoch' },
                            { icon: '🛡', label: 'Quality gate',   sub: 'MetaCognitive score ≥ 0.3' },
                            { icon: '⚡', label: '10–30× cheaper', sub: 'vs cloud providers' },
                            { icon: '🔓', label: 'You own the',   sub: 'LoRA adapter' },
                        ].map(({ icon, label, sub }) => (
                            <div key={label} style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 22, marginBottom: 4 }}>{icon}</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{sub}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Form + Sidebar */}
                <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 80px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 24, alignItems: 'start' }}>

                    {/* Form column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                        {/* Step 1: Model */}
                        <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Brain size={16} color="#a78bfa" /> Step 1 — Choose a Model
                            </h2>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
                                {displayedModels.map(m => (
                                    <ModelCard key={m.id} model={m} selected={selectedModel === m.id} onClick={() => setSelectedModel(m.id)} />
                                ))}
                            </div>
                            {!showAll && MODELS.length > 6 && (
                                <button onClick={() => setShowAll(true)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#a78bfa', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <ChevronDown size={14} /> Show {MODELS.length - 6} more
                                </button>
                            )}
                        </section>

                        {/* Step 2: Domain */}
                        <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Globe size={16} color="#a78bfa" /> Step 2 — Specialisation Domain
                            </h2>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {DOMAINS.map(d => (
                                    <button key={d.id} onClick={() => setSelectedDomain(d.id)} style={{
                                        padding: '8px 16px', borderRadius: 10, cursor: 'pointer',
                                        background:   selectedDomain === d.id ? 'rgba(139,92,246,0.2)' : 'rgba(255,255,255,0.04)',
                                        border:       `1px solid ${selectedDomain === d.id ? 'rgba(139,92,246,0.6)' : 'rgba(255,255,255,0.1)'}`,
                                        color:        selectedDomain === d.id ? '#c4b5fd' : 'rgba(255,255,255,0.6)',
                                        fontSize:     13, fontWeight: 600, transition: 'all 0.15s',
                                    }}>
                                        {d.icon} {d.label}
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* Step 3: Dataset + Config */}
                        <section style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 24 }}>
                            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Cpu size={16} color="#a78bfa" /> Step 3 — Dataset & Config
                            </h2>

                            <label style={{ display: 'block', marginBottom: 16 }}>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                                    Dataset URL <span style={{ color: '#f87171' }}>*</span>
                                    <span style={{ marginLeft: 8, color: 'rgba(255,255,255,0.3)' }}>Public JSONL file (Alpaca format)</span>
                                </div>
                                <input
                                    type="url"
                                    value={datasetUrl}
                                    onChange={e => setDatasetUrl(e.target.value)}
                                    placeholder="https://your-host.com/dataset.jsonl"
                                    style={{
                                        width: '100%', padding: '12px 14px', borderRadius: 10,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        color: '#fff', fontSize: 14, outline: 'none',
                                    }}
                                />
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 5 }}>
                                    Format: {`{"instruction":"...","input":"...","output":"..."}`} one per line. Min 2 examples.
                                </div>
                            </label>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <label style={{ display: 'block' }}>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Epochs (1–5)</div>
                                    <input
                                        type="number" min={1} max={5} value={epochs}
                                        onChange={e => setEpochs(Math.min(5, Math.max(1, Number(e.target.value))))}
                                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 14, outline: 'none' }}
                                    />
                                </label>
                                <label style={{ display: 'block' }}>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                                        <span>TON Wallet <span style={{ color: 'rgba(248,113,113,0.8)' }}>*required for payment</span></span>
                                        {balance !== null && (
                                            <span style={{ color: balance >= cost ? '#4ade80' : '#f87171' }}>
                                                Balance: {balance.toFixed(2)} GSTD {balance < cost ? `(need ${cost} GSTD)` : ''}
                                            </span>
                                        )}
                                    </div>
                                    <input
                                        type="text" value={wallet}
                                        onChange={e => setWallet(e.target.value)}
                                        placeholder="EQ..."
                                        style={{ width: '100%', padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: `1px solid ${balance !== null && balance < cost ? 'rgba(248,113,113,0.4)' : 'rgba(255,255,255,0.12)'}`, color: '#fff', fontSize: 14, outline: 'none' }}
                                    />
                                </label>
                            </div>
                        </section>

                        {/* Error */}
                        {error && (
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '12px 16px', borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5', fontSize: 13 }}>
                                <AlertCircle size={14} /> {error}
                            </div>
                        )}

                        {/* Submit button */}
                        {!job && (
                            <button
                                onClick={handleSubmit}
                                disabled={submitting}
                                style={{
                                    padding: '16px 28px', borderRadius: 14, border: 'none', cursor: submitting ? 'not-allowed' : 'pointer',
                                    background: submitting ? 'rgba(139,92,246,0.3)' : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
                                    color: '#fff', fontWeight: 700, fontSize: 16,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                                    boxShadow: submitting ? 'none' : '0 4px 24px rgba(139,92,246,0.35)',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {submitting ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</> : <><Zap size={18} /> Start Fine-Tuning · {cost.toFixed(1)} GSTD</>}
                            </button>
                        )}

                        {/* Job status */}
                        {job && <JobProgress job={job} />}

                        {/* New job button */}
                        {job && (job.status === 'done' || job.status === 'failed') && (
                            <button
                                onClick={() => { setJob(null); setDatasetUrl(''); }}
                                style={{ padding: '12px 20px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                            >
                                + Submit Another Job
                            </button>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 24 }}>

                        {/* Cost estimate */}
                        <div style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 16, padding: 20 }}>
                            <div style={{ fontSize: 12, color: '#a78bfa', fontWeight: 600, marginBottom: 12 }}>COST ESTIMATE</div>
                            <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
                                {cost.toFixed(1)} <span style={{ fontSize: 16, color: '#a78bfa' }}>GSTD</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                                {model.label} × {epochs} epoch{epochs > 1 ? 's' : ''}
                            </div>
                            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {[
                                    ['Model cost', `${model.costPerEpoch} GSTD/epoch`],
                                    ['Node reward', '90% of total'],
                                    ['Protocol fee', '10% of total'],
                                    ['Quality gate', 'MetaCog ≥ 0.3'],
                                ].map(([k, v]) => (
                                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                                        <span style={{ color: 'rgba(255,255,255,0.45)' }}>{k}</span>
                                        <span style={{ color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>{v}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* How it works */}
                        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, padding: 20 }}>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 14 }}>HOW IT WORKS</div>
                            {[
                                { icon: '📤', text: 'Your dataset is split into shards' },
                                { icon: '🌐', text: 'Nodes with "finetune" capability pick them up' },
                                { icon: '🧠', text: 'QLoRA + Ollama training runs locally on the node' },
                                { icon: '🛡', text: 'MetaCognitive evaluator scores the result' },
                                { icon: '✅', text: 'Score ≥ 0.3 → gradient accepted, job advances' },
                                { icon: '📦', text: 'You receive the final LoRA adapter' },
                            ].map(({ icon, text }, i) => (
                                <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: 16, flexShrink: 0 }}>{icon}</span>
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{text}</span>
                                </div>
                            ))}
                        </div>

                        {/* Become a node */}
                        <a href="/nodes" style={{ textDecoration: 'none' }}>
                            <div style={{ background: 'rgba(34,211,238,0.06)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 16, padding: 20, cursor: 'pointer', transition: 'all 0.2s' }}>
                                <div style={{ fontSize: 12, color: '#22d3ee', fontWeight: 600, marginBottom: 8 }}>EARN GSTD</div>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Run a Training Node</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                                    Got a spare machine? Connect it to the network and earn GSTD every time you train a shard.
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 12, color: '#22d3ee' }}>
                                    Start earning <ExternalLink size={12} />
                                </div>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: await getCommonStaticProps(locale ?? 'en'),
});
