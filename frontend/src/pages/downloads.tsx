import Head from 'next/head';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { GetStaticProps } from 'next';
import { useState } from 'react';
import {
    Terminal, Monitor, Smartphone, Server, Copy,
    CheckCircle, Cpu, Zap, Shield, Globe, ChevronRight
} from 'lucide-react';

const INSTALL_CMD = 'curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash';

const PLATFORMS = [
    { name: 'Linux (Ubuntu/Debian)', icon: '🐧', arch: 'x86_64 / ARM64', cmd: INSTALL_CMD, recommended: true },
    { name: 'macOS', icon: '🍎', arch: 'Apple Silicon / Intel', cmd: INSTALL_CMD, recommended: false },
    { name: 'Windows (WSL)', icon: '🪟', arch: 'x86_64 via WSL2', cmd: `wsl --install && ${INSTALL_CMD}`, recommended: false },
    { name: 'Raspberry Pi', icon: '🍓', arch: 'ARMv7 / ARM64', cmd: INSTALL_CMD, recommended: false },
];

const FEATURES = [
    { icon: Cpu, title: '8 AI Models', desc: 'Free access to Llama 4, GPT-oss, Qwen 3, Kimi K2 and more' },
    { icon: Zap, title: 'Earn GSTD', desc: '0.1 GSTD/hour automatically while your node is running' },
    { icon: Shield, title: 'Sovereign AI', desc: 'Your data stays on your device. Run models locally or via cloud' },
    { icon: Globe, title: 'Swarm Network', desc: 'Join the distributed compute grid with 85+ active nodes' },
];

export default function DownloadsPage() {
    const { t } = useTranslation('common');
    const [copied, setCopied] = useState<string | null>(null);

    const copyCmd = (cmd: string, name: string) => {
        navigator.clipboard.writeText(cmd);
        setCopied(name);
        setTimeout(() => setCopied(null), 2000);
    };

    return (
        <>
            <Head>
                <title>{t('downloads_title', 'Download GSTD Node OS')}</title>
                <meta name="description" content="Install GSTD Node OS on any device. Earn GSTD tokens, access 8 AI models, join the Swarm network." />
            </Head>

            <div className="sovereign-section min-h-screen">
                <div className="max-w-5xl mx-auto px-6">

                    {/* Hero */}
                    <div className="text-center max-w-2xl mx-auto mb-16 fu d1">
                        <div className="sec-tag cyan justify-center inline-flex mb-4">ONE-COMMAND INSTALL</div>
                        <h1 className="sec-title">
                            Install <span className="text-gradient-gold">GSTD Node OS</span>
                        </h1>
                        <p className="sec-subtitle">
                            Transform any device into a sovereign AI node in under 60 seconds.
                            Earn GSTD tokens, access free AI models, join the Swarm.
                        </p>
                    </div>

                    {/* Quick Install */}
                    <div className="glass-card p-8 mb-12 border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-transparent relative overflow-hidden fu d2">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] -mr-32 -mt-32" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-3 mb-4">
                                <Terminal className="w-6 h-6 text-amber-400" />
                                <h2 className="text-xl font-black text-white">Quick Install</h2>
                            </div>
                            <p className="text-gray-400 text-sm mb-6">
                                Open your terminal and run this single command. Works on Linux, macOS, WSL, and Raspberry Pi.
                            </p>

                            <div className="flex items-center gap-2 p-1 bg-black/40 border border-white/10 rounded-2xl">
                                <code className="flex-1 px-4 py-3 text-sm font-mono text-emerald-400 overflow-x-auto whitespace-nowrap">
                                    {INSTALL_CMD}
                                </code>
                                <button
                                    onClick={() => copyCmd(INSTALL_CMD, 'main')}
                                    className="p-3 bg-white text-black rounded-xl hover:bg-amber-400 transition-all transform active:scale-95 flex-shrink-0"
                                >
                                    {copied === 'main' ? <CheckCircle size={16} /> : <Copy size={16} />}
                                </button>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-3">
                                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                                    ✓ Auto-installs Node.js
                                </span>
                                <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest">
                                    ✓ Systemd Service
                                </span>
                                <span className="px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-black uppercase tracking-widest">
                                    ✓ Auto-Updates (OTA)
                                </span>
                                <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                    ✓ Dashboard on :8080
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Platform Cards */}
                    <div className="mb-12">
                        <h2 className="sec-title text-xl mb-6 flex items-center gap-2">
                            <Monitor className="w-5 h-5 text-cyan-400" />
                            Supported Platforms
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {PLATFORMS.map((p) => (
                                <div key={p.name} className={`glass-card p-6 transition-all hover:border-amber-500/30 ${p.recommended ? 'border-emerald-500/30 bg-emerald-500/5' : ''}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">{p.icon}</span>
                                            <div>
                                                <h3 className="text-white font-bold text-sm">{p.name}</h3>
                                                <p className="text-gray-500 text-xs">{p.arch}</p>
                                            </div>
                                        </div>
                                        {p.recommended && (
                                            <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-black uppercase">
                                                Recommended
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-3">
                                        <code className="flex-1 text-[11px] font-mono text-gray-400 bg-black/30 px-3 py-2 rounded-lg overflow-x-auto whitespace-nowrap">
                                            {p.cmd}
                                        </code>
                                        <button
                                            onClick={() => copyCmd(p.cmd, p.name)}
                                            className="p-2 bg-white/5 text-white rounded-lg hover:bg-white/10 transition-all"
                                        >
                                            {copied === p.name ? <CheckCircle size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Telegram Mini App */}
                    <div className="glass-card p-8 mb-12 border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent fu d3">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                            <div className="flex items-center gap-4">
                                <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20">
                                    <Smartphone className="w-8 h-8 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white mb-1">Mobile? Use Telegram</h3>
                                    <p className="text-gray-400 text-sm">
                                        Run a node directly from your phone via Telegram Mini App. No install needed.
                                    </p>
                                </div>
                            </div>
                            <a
                                href="https://t.me/GstdAppBot"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-xl font-bold text-sm hover:bg-blue-400 transition-all transform active:scale-95 whitespace-nowrap"
                            >
                                Open @GstdAppBot <ChevronRight size={16} />
                            </a>
                        </div>
                    </div>

                    {/* Features */}
                    <div className="mb-12">
                        <h2 className="sec-title text-xl mb-6 flex items-center gap-2">
                            <Zap className="w-5 h-5 text-amber-400" />
                            What Your Node Does
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {FEATURES.map((f) => (
                                <div key={f.title} className="glass-card p-6 hover:border-amber-500/20 transition-all group">
                                    <f.icon className="w-8 h-8 text-amber-400 mb-4 group-hover:scale-110 transition-transform" />
                                    <h3 className="text-white font-bold text-sm mb-2">{f.title}</h3>
                                    <p className="text-gray-500 text-xs">{f.desc}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* VPS Guide */}
                    <div className="glass-card p-8 mb-12 border-violet-500/20 bg-gradient-to-br from-violet-500/5 to-transparent fu d4">
                        <div className="flex items-center gap-3 mb-4">
                            <Server className="w-6 h-6 text-violet-400" />
                            <h2 className="text-xl font-black text-white">Run 24/7 on a VPS</h2>
                        </div>
                        <p className="text-gray-400 text-sm mb-6">
                            For maximum earnings, deploy on a cheap VPS ($3-5/month). Your node earns GSTD tokens around the clock.
                        </p>
                        <div className="space-y-3">
                            {[
                                { step: '1', text: 'Get a VPS (DigitalOcean, Hetzner, Contabo — any Linux VPS works)' },
                                { step: '2', text: 'SSH into your server: ssh root@your-server-ip' },
                                { step: '3', text: `Run: ${INSTALL_CMD}` },
                                { step: '4', text: 'Open http://your-server-ip:8080 — your dashboard is live!' },
                            ].map((s) => (
                                <div key={s.step} className="flex items-start gap-3">
                                    <div className="w-6 h-6 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400 text-xs font-black flex-shrink-0 mt-0.5">
                                        {s.step}
                                    </div>
                                    <p className="text-gray-300 text-sm">{s.text}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
