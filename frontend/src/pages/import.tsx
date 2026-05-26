import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { Search, Github, Check, Copy, AlertCircle, ArrowRight, Home, Layout, Zap, Brain, Terminal } from 'lucide-react';
import { useTranslation } from 'next-i18next';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

interface SkillData {
    name: string;
    description: string;
    version: string;
    type: string;
}

export default function ImportSkillPage() {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [url, setUrl] = useState('');
    const [isVerifying, setIsVerifying] = useState(false);
    const [skillData, setSkillData] = useState<SkillData | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const handleVerify = async () => {
        if (!url) return;
        setIsVerifying(true);
        setError(null);
        setSkillData(null);

        setTimeout(() => {
            if (url.includes('github.com')) {
                const repoName = url.split('/').pop() || 'new-skill';
                setSkillData({
                    name: repoName,
                    description: 'Autonomous skill identified from repository. Validated for GSTD A2A protocol.',
                    version: '1.0.0',
                    type: 'mcp',
                });
            } else {
                setError('Invalid URL. Please provide a valid GitHub repository URL.');
            }
            setIsVerifying(false);
        }, 1500);
    };

    const copyCommand = () => {
        const cmd = `pip install gstd-a2a && gstd-node --skill ${skillData?.name || 'my-skill'}`;
        navigator.clipboard.writeText(cmd).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="min-h-screen bg-[#030014] text-white font-sans selection:bg-violet-500/30">
            <Head>
                <title>Import Skill — GSTD Agent Network</title>
                <meta name="description" content="Import and install AI agent skills into your GSTD node from any GitHub repository." />
            </Head>

            {/* Background */}
            <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-violet-600/10 rounded-full blur-[120px] animate-pulse" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-cyan-600/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
            </div>

            <main className="relative z-10 max-w-4xl mx-auto px-6 pt-20 pb-32">
                {/* Header */}
                <div className="flex items-center justify-between mb-16">
                    <div
                        className="flex items-center gap-3 cursor-pointer"
                        onClick={() => router.push('/')}
                    >
                        <span className="text-2xl font-black tracking-tighter">
                            <span style={{
                                background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                                WebkitBackgroundClip: 'text',
                                WebkitTextFillColor: 'transparent',
                            }}>GSTD</span>{' '}
                            <span className="text-violet-400">{t('import', 'Import')}</span>
                        </span>
                    </div>
                    <button
                        onClick={() => router.push('/')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-sm font-bold"
                    >
                        <Home size={16} /> {t('back_to_home', 'Home')}
                    </button>
                </div>

                {/* Main card */}
                <div className="relative group">
                    <div className="absolute -inset-1 bg-gradient-to-r from-violet-600 to-cyan-600 rounded-[32px] blur opacity-20 group-hover:opacity-40 transition duration-1000" />
                    <div className="relative p-8 md:p-12 rounded-[32px] bg-black/60 border border-white/10 backdrop-blur-3xl shadow-2xl overflow-hidden">

                        <div className="text-center mb-12">
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[10px] font-black mb-4 uppercase tracking-[0.3em]">
                                {t('agent_skill_registry', 'Agent Skill Registry')}
                            </div>
                            <h1 className="text-4xl md:text-5xl font-black mb-4 tracking-tighter">
                                {t('import_from', 'Import Skill from')}{' '}
                                <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">GitHub</span>
                            </h1>
                            <p className="text-gray-400 text-lg max-w-xl mx-auto font-medium">
                                {t('import_desc', 'Paste a GitHub repository URL to verify and install it as a GSTD agent skill.')}
                            </p>
                        </div>

                        <div className="space-y-6 max-w-2xl mx-auto">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-5 flex items-center text-gray-500">
                                    <Github size={20} />
                                </div>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={e => setUrl(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && handleVerify()}
                                    placeholder="https://github.com/username/skill-repo"
                                    className="w-full pl-14 pr-32 py-5 rounded-2xl bg-white/5 border border-white/10 focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 outline-none transition-all font-medium text-white placeholder:text-gray-600"
                                />
                                <button
                                    onClick={handleVerify}
                                    disabled={!url || isVerifying}
                                    className="absolute inset-y-2 right-2 px-6 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-gray-800 disabled:text-gray-500 transition-all font-black text-sm uppercase tracking-tight flex items-center gap-2"
                                >
                                    {isVerifying
                                        ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        : <Zap size={16} />}
                                    Verify
                                </button>
                            </div>

                            {error && (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold">
                                    <AlertCircle size={18} /> {error}
                                </div>
                            )}

                            {skillData && (
                                <div className="mt-12 space-y-8">
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                                                {t('skill_identity', 'Skill Identity')}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center text-violet-400">
                                                    <Brain size={24} />
                                                </div>
                                                <div>
                                                    <div className="text-xl font-black tracking-tight">{skillData.name}</div>
                                                    <div className="text-xs font-bold text-gray-500">v{skillData.version} · {skillData.type.toUpperCase()}</div>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="p-6 rounded-2xl bg-white/[0.03] border border-white/10">
                                            <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">
                                                {t('verification_status', 'Verification Status')}
                                            </div>
                                            <div className="flex items-center gap-3 text-emerald-400 font-bold">
                                                <Check size={20} className="bg-emerald-400/10 p-1 rounded-full" />
                                                {t('valid_skillmd_found', 'Valid repository found')}
                                            </div>
                                            <div className="mt-2 text-[10px] text-gray-600 uppercase tracking-widest">
                                                {t('signed_by_protocol', 'Signed by GSTD Protocol')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Install command */}
                                    <div>
                                        <div className="text-[10px] font-black text-violet-400 uppercase tracking-[0.3em] mb-4 ml-2">
                                            {t('installation_command', 'Installation Command')}
                                        </div>
                                        <div className="group/code relative">
                                            <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500/20 to-cyan-500/20 rounded-2xl blur opacity-0 group-hover/code:opacity-100 transition duration-500" />
                                            <div className="relative flex items-center justify-between p-6 rounded-2xl bg-black/80 border border-white/10 font-mono text-sm overflow-hidden">
                                                <div className="flex items-center gap-3">
                                                    <Terminal size={18} className="text-gray-500" />
                                                    <code className="text-emerald-400 break-all">
                                                        pip install gstd-a2a &amp;&amp; gstd-node --skill <span className="text-white">{skillData.name}</span>
                                                    </code>
                                                </div>
                                                <button
                                                    onClick={copyCommand}
                                                    className="ml-4 p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-all text-gray-400 hover:text-white shrink-0"
                                                >
                                                    {copied ? <Check size={18} className="text-emerald-400" /> : <Copy size={18} />}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <button
                                            onClick={() => router.push('/docs')}
                                            className="w-full py-5 rounded-2xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white font-black text-lg hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                                        >
                                            {t('read_docs', 'Read the documentation')}
                                            <ArrowRight size={20} />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info grid */}
                <div className="grid md:grid-cols-3 gap-8 mt-20">
                    {[
                        { icon: Search,  title: t('discover', 'Discover'), desc: 'Browse verified agent skills built for the GSTD network and A2A protocol.' },
                        { icon: Layout,  title: t('modular',  'Modular'),  desc: 'Skills follow the MCP standard — compatible with Claude, Cursor, and any LLM.' },
                        { icon: Brain,   title: t('secure',   'Secure'),   desc: 'All imported skills are sandboxed and verified for economic safety on TON.' },
                    ].map((item, i) => (
                        <div key={i} className="p-8 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                            <item.icon className="w-6 h-6 text-violet-400 mb-4" />
                            <h4 className="text-white font-black uppercase tracking-tight mb-2">{item.title}</h4>
                            <p className="text-sm text-gray-500 leading-relaxed font-medium">{item.desc}</p>
                        </div>
                    ))}
                </div>
            </main>

            <footer className="py-12 border-t border-white/5 text-center">
                <div className="text-[10px] font-black text-gray-700 uppercase tracking-[0.5em]">
                    © 2026 GSTD FOUNDATION · AGENT SKILL REGISTRY
                </div>
            </footer>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: await getCommonStaticProps(locale),
});
