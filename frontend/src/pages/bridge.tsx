import Head from 'next/head';
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { ArrowRight, Copy, CheckCircle, ExternalLink, Clock, Shield, Zap, Globe, Info } from 'lucide-react';

// Vault addresses — set via env vars when contracts are deployed
const VAULTS = {
    TON: {
        address: process.env.NEXT_PUBLIC_TON_VAULT || 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO',
        explorer: 'https://tonscan.org/address/',
        label: 'TON',
        color: 'from-blue-500/20 to-blue-600/10',
        border: 'border-blue-500/30',
        dot: 'bg-blue-400',
    },
    Solana: {
        address: process.env.NEXT_PUBLIC_SOL_VAULT || 'AzN7uPhQZgThxsRvhNGHPUPRjdEjScTbqQdf5gt6Fqby',
        explorer: 'https://solscan.io/account/',
        label: 'Solana',
        color: 'from-purple-500/20 to-purple-600/10',
        border: 'border-purple-500/30',
        dot: 'bg-purple-400',
    },
    XRPL: {
        address: process.env.NEXT_PUBLIC_XRP_VAULT || 'ryHSvxUqpcTjoESHbCkMJoqzenjFgPQSf',
        explorer: 'https://xrpscan.com/account/',
        label: 'XRPL',
        color: 'from-cyan-500/20 to-cyan-600/10',
        border: 'border-cyan-500/30',
        dot: 'bg-cyan-400',
    },
} as const;

type ChainKey = keyof typeof VAULTS;

interface BridgeStats {
    validators_online: number;
    transfers_today: number;
    avg_time_secs: number;
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };
    return (
        <button
            onClick={copy}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-400 hover:text-white"
            title="Copy"
        >
            {copied
                ? <CheckCircle size={14} className="text-green-400" />
                : <Copy size={14} />
            }
        </button>
    );
}

export default function BridgePage() {
    const { t } = useTranslation('common');
    const [sourceChain, setSourceChain] = useState<ChainKey>('TON');
    const [targetChain, setTargetChain] = useState<ChainKey>('Solana');
    const [recipient, setRecipient] = useState('');
    const [stats, setStats] = useState<BridgeStats | null>(null);

    const chains = Object.keys(VAULTS) as ChainKey[];
    const vault = VAULTS[sourceChain];
    const memo = recipient
        ? `bridge:${targetChain.toLowerCase()}:${recipient}`
        : `bridge:${targetChain.toLowerCase()}:<your_${targetChain}_address>`;

    useEffect(() => {
        fetch('/api/v1/stats/public')
            .then(r => r.json())
            .then(d => setStats({
                validators_online: d.active_nodes || 0,
                transfers_today:   0,
                avg_time_secs:     0,
            }))
            .catch(() => {});
    }, []);

    const swapChains = () => {
        const prev = sourceChain;
        setSourceChain(targetChain);
        setTargetChain(prev);
        setRecipient('');
    };

    return (
        <div className="min-h-screen bg-[#030014] text-white">
            <Head>
                <title>Bridge — GSTD Cross-Chain</title>
                <meta name="description" content="Bridge GSTD tokens between TON, Solana, and XRPL — trustless, no custodians." />
            </Head>

            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                {/* Phase 2 Notice — bridge not yet live */}
                <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <span className="text-amber-400 text-xl mt-0.5">⚠</span>
                    <div>
                        <p className="text-amber-300 font-semibold text-sm">Bridge in Development — Phase 2</p>
                        <p className="text-amber-200/70 text-xs mt-1">
                            Cross-chain bridge contracts are not yet deployed. The deposit addresses below are read-only previews.
                            Do <strong>not</strong> send funds — transfers will not be processed until Phase 2 launch.
                            Follow <a href="https://t.me/gstdcoin" className="underline">@gstdcoin</a> for the launch announcement.
                        </p>
                    </div>
                </div>

                {/* Header */}
                <div>
                    <h1 className="text-2xl font-bold text-white mb-1">
                        {t('bridge_title', 'Cross-Chain Bridge')}
                    </h1>
                    <p className="text-gray-400 text-sm">
                        {t('bridge_subtitle', 'Transfer GSTD between TON, Solana, and XRPL. Trustless — validators sign every transfer.')}
                    </p>
                </div>

                {/* Stats bar */}
                {stats && (
                    <div className="grid grid-cols-3 gap-3">
                        {[
                            { label: t('validators', 'Validators'), value: stats.validators_online || '—', icon: <Shield size={14} /> },
                            { label: t('status', 'Status'), value: 'Beta', icon: <Zap size={14} /> },
                            { label: t('network', 'Network'), value: 'TON', icon: <Clock size={14} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center">
                                <div className="flex items-center justify-center gap-1 text-gray-500 text-xs mb-1">
                                    {s.icon} {s.label}
                                </div>
                                <div className="text-white font-semibold text-lg">{s.value}</div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Bridge card */}
                <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 space-y-5">

                    {/* Chain selector */}
                    <div className="flex items-center gap-3">
                        <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">
                                {t('from_chain', 'From')}
                            </label>
                            <select
                                value={sourceChain}
                                onChange={e => {
                                    const v = e.target.value as ChainKey;
                                    setSourceChain(v);
                                    if (v === targetChain) setTargetChain(chains.find(c => c !== v)!);
                                }}
                                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                            >
                                {chains.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <button
                            onClick={swapChains}
                            className="mt-5 p-2.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.10] border border-white/[0.08] text-gray-400 hover:text-white transition-all"
                            title="Swap"
                        >
                            <ArrowRight size={16} />
                        </button>

                        <div className="flex-1">
                            <label className="text-xs text-gray-500 mb-1 block">
                                {t('to_chain', 'To')}
                            </label>
                            <select
                                value={targetChain}
                                onChange={e => {
                                    const v = e.target.value as ChainKey;
                                    setTargetChain(v);
                                    if (v === sourceChain) setSourceChain(chains.find(c => c !== v)!);
                                }}
                                className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500"
                            >
                                {chains.filter(c => c !== sourceChain).map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* Recipient */}
                    <div>
                        <label className="text-xs text-gray-500 mb-1 block">
                            {t('recipient_address', 'Recipient address')} ({targetChain})
                        </label>
                        <input
                            type="text"
                            value={recipient}
                            onChange={e => setRecipient(e.target.value)}
                            placeholder={`Your ${targetChain} wallet address`}
                            className="w-full bg-white/[0.05] border border-white/[0.10] rounded-xl px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-violet-500"
                        />
                    </div>

                    {/* Vault + instructions */}
                    <div className={`rounded-xl p-4 bg-gradient-to-br ${vault.color} border ${vault.border} space-y-3`}>
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${vault.dot}`} />
                            <span className="text-xs text-gray-300 font-medium">
                                {t('step1', 'Step 1')} — {t('send_to_vault', 'Send GSTD to this vault on')} {sourceChain}
                            </span>
                        </div>

                        <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                            <code className="flex-1 text-xs text-white font-mono break-all">{vault.address}</code>
                            <CopyButton text={vault.address} />
                            <a
                                href={`${vault.explorer}${vault.address}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
                            >
                                <ExternalLink size={14} />
                            </a>
                        </div>

                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <div className={`w-2 h-2 rounded-full ${vault.dot}`} />
                                <span className="text-xs text-gray-300 font-medium">
                                    {t('step2', 'Step 2')} — {t('add_memo', 'Include this memo / comment')}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 bg-black/30 rounded-lg px-3 py-2">
                                <code className="flex-1 text-xs text-violet-300 font-mono break-all">{memo}</code>
                                <CopyButton text={memo} />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                                {t('memo_hint', 'Paste exactly as the message/memo/comment field when sending.')}
                            </p>
                        </div>
                    </div>

                    {/* Fee notice */}
                    <div className="flex items-start gap-2 text-xs text-gray-500">
                        <Info size={13} className="mt-0.5 shrink-0" />
                        <span>
                            {t('fee_note', '1% flat fee (min 1 GSTD). After 3 confirmations validators reach quorum and release funds on')} {targetChain} {t('in_approx', 'in ~2 minutes')}.
                        </span>
                    </div>
                </div>

                {/* How it works */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                        <Globe size={15} className="text-violet-400" />
                        {t('how_it_works', 'How it works')}
                    </h2>
                    <ol className="space-y-3">
                        {[
                            { n: '1', title: t('lock', 'Lock'), desc: t('lock_desc', 'Send GSTD to the source vault with the bridge memo.') },
                            { n: '2', title: t('detect', 'Detect'), desc: t('detect_desc', 'Each validator independently confirms your deposit on-chain.') },
                            { n: '3', title: t('sign', 'Sign'), desc: t('sign_desc', '67% quorum of validators threshold-sign the release — no single party can act alone.') },
                            { n: '4', title: t('release', 'Release'), desc: t('release_desc', 'GSTD is unlocked from the target vault and sent to your address.') },
                        ].map(step => (
                            <li key={step.n} className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/40 text-violet-300 text-xs font-bold flex items-center justify-center shrink-0">
                                    {step.n}
                                </span>
                                <div>
                                    <span className="text-white text-sm font-medium">{step.title} — </span>
                                    <span className="text-gray-400 text-sm">{step.desc}</span>
                                </div>
                            </li>
                        ))}
                    </ol>
                </div>

                {/* All vaults reference */}
                <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-4">
                        {t('vault_addresses', 'Vault addresses')}
                    </h2>
                    <div className="space-y-3">
                        {chains.map(chain => (
                            <div key={chain} className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${VAULTS[chain].dot} shrink-0`} />
                                <span className="text-gray-400 text-xs w-14 shrink-0">{chain}</span>
                                <code className="flex-1 text-xs text-gray-300 font-mono truncate">
                                    {VAULTS[chain].address}
                                </code>
                                <CopyButton text={VAULTS[chain].address} />
                                <a
                                    href={`${VAULTS[chain].explorer}${VAULTS[chain].address}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-gray-500 hover:text-white transition-colors"
                                >
                                    <ExternalLink size={13} />
                                </a>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Run a validator */}
                <div className="bg-gradient-to-br from-violet-500/10 to-cyan-500/10 border border-violet-500/20 rounded-2xl p-5">
                    <h2 className="text-sm font-semibold text-white mb-2">
                        {t('run_validator', 'Run a bridge validator')}
                    </h2>
                    <p className="text-gray-400 text-xs mb-3">
                        {t('run_validator_desc', 'Earn compute fees by running a node. Install Ollama, register your node, start earning GSTD.')}
                    </p>
                    <a
                        href="https://github.com/gstdcoin/gstd-bridge"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-violet-300 hover:text-violet-200 transition-colors"
                    >
                        <ExternalLink size={13} />
                        github.com/gstdcoin/gstd-bridge
                    </a>
                </div>

            </div>
        </div>
    );
}

export async function getStaticProps({ locale }: { locale: string }) {
    return { props: await getCommonStaticProps(locale) };
}
