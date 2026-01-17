import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { ArrowLeft, Terminal, Code, BookOpen, Zap, Shield, Users, Coins } from 'lucide-react';
import { GSTD_CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS, API_BASE_URL } from '../lib/config';

export default function DocsPage() {
    const { t } = useTranslation('common');
    const router = useRouter();

    return (
        <div className="min-h-screen bg-[#030014] text-white">
            {/* Header */}
            <header className="py-5 px-6 lg:px-12 border-b border-white/5 backdrop-blur-xl bg-black/20 sticky top-0 z-50">
                <div className="max-w-6xl mx-auto flex justify-between items-center">
                    <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                        <ArrowLeft className="w-5 h-5" />
                        <img src="/logo.png" alt="GSTD" className="w-8 h-8 rounded-full" />
                        <span className="text-lg font-bold">GSTD Docs</span>
                    </Link>
                </div>
            </header>

            {/* Content */}
            <main className="max-w-4xl mx-auto px-6 py-12">
                {/* Title */}
                <div className="text-center mb-16">
                    <h1 className="text-4xl sm:text-5xl font-bold mb-4 bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
                        {t('docs_title') || 'Documentation'}
                    </h1>
                    <p className="text-gray-400 text-lg">
                        {t('docs_subtitle') || 'Everything you need to integrate with GSTD Platform'}
                    </p>
                </div>

                {/* Quick Links */}
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
                    {[
                        { icon: Terminal, label: 'API Reference', href: '#api' },
                        { icon: Code, label: 'SDK', href: '#sdk' },
                        { icon: BookOpen, label: 'Quick Start', href: '#quickstart' },
                    ].map((item, i) => (
                        <a
                            key={i}
                            href={item.href}
                            className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all"
                        >
                            <item.icon className="w-5 h-5 text-cyan-400" />
                            <span className="font-medium">{item.label}</span>
                        </a>
                    ))}
                </div>

                {/* Quick Start */}
                <section id="quickstart" className="mb-16">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Zap className="w-6 h-6 text-amber-400" />
                        Quick Start
                    </h2>

                    <div className="space-y-6">
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-lg font-bold mb-3 text-cyan-400">For Task Creators</h3>
                            <ol className="space-y-3 text-gray-300">
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                                    <span>Connect your TON wallet via TonConnect</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                                    <span>Create a task via Web UI or API</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                                    <span>Pay task budget in TON</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-sm font-bold flex-shrink-0">4</span>
                                    <span>Receive cryptographically verified results</span>
                                </li>
                            </ol>
                        </div>

                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-lg font-bold mb-3 text-violet-400">For Workers</h3>
                            <ol className="space-y-3 text-gray-300">
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                                    <span>Connect your TON wallet</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                                    <span>Register your device as a computing node</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                                    <span>Tasks are automatically assigned and executed</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-sm font-bold flex-shrink-0">4</span>
                                    <span>Withdraw your earnings in TON</span>
                                </li>
                            </ol>
                        </div>
                    </div>
                </section>

                {/* API Reference */}
                <section id="api" className="mb-16">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Terminal className="w-6 h-6 text-emerald-400" />
                        API Reference
                    </h2>

                    <div className="space-y-6">
                        <div className="p-6 rounded-xl bg-black/40 border border-white/10">
                            <p className="text-sm text-gray-400 mb-2">Base URL</p>
                            <code className="text-cyan-400 font-mono">{API_BASE_URL}/api/v1</code>
                        </div>

                        {/* Create Task */}
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">POST</span>
                                <code className="text-white font-mono">/tasks/create</code>
                            </div>
                            <p className="text-gray-400 mb-4">Create a new computational task</p>
                            <pre className="p-4 rounded-lg bg-black/60 text-sm overflow-x-auto">
                                <code className="text-gray-300">{`{
  "type": "AI_INFERENCE",
  "model": "gpt-4",
  "payload": {
    "prompt": "Your prompt here",
    "max_tokens": 100
  },
  "budget_ton": 0.5,
  "priority": 10
}`}</code>
                            </pre>
                        </div>

                        {/* Get Tasks */}
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-400 text-xs font-bold">GET</span>
                                <code className="text-white font-mono">/tasks</code>
                            </div>
                            <p className="text-gray-400 mb-4">Get tasks for a wallet address</p>
                            <p className="text-sm text-gray-500">Query params: <code className="text-cyan-400">wallet_address</code>, <code className="text-cyan-400">status</code></p>
                        </div>

                        {/* Register Node */}
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <div className="flex items-center gap-2 mb-3">
                                <span className="px-2 py-1 rounded bg-emerald-500/20 text-emerald-400 text-xs font-bold">POST</span>
                                <code className="text-white font-mono">/nodes/register</code>
                            </div>
                            <p className="text-gray-400 mb-4">Register a computing node</p>
                            <pre className="p-4 rounded-lg bg-black/60 text-sm overflow-x-auto">
                                <code className="text-gray-300">{`{
  "wallet_address": "YOUR_WALLET",
  "name": "My GPU Server",
  "cpu_model": "AMD Ryzen 9",
  "ram_gb": 64
}`}</code>
                            </pre>
                        </div>
                    </div>
                </section>

                {/* SDK */}
                <section id="sdk" className="mb-16">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Code className="w-6 h-6 text-violet-400" />
                        SDK Usage
                    </h2>

                    <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                        <h3 className="text-lg font-bold mb-3">TypeScript / JavaScript</h3>
                        <pre className="p-4 rounded-lg bg-black/60 text-sm overflow-x-auto">
                            <code className="text-gray-300">{`import { GSTDClient } from '@gstd/sdk';

const client = new GSTDClient({
  apiUrl: '${API_BASE_URL}/api/v1',
  wallet: tonConnectUI
});

// Create task
const task = await client.createTask({
  type: 'AI_INFERENCE',
  payload: { prompt: 'Hello' },
  budget: 0.5
});

// Watch for results
client.onResult(task.id, (result) => {
  console.log('Task completed:', result);
});`}</code>
                        </pre>
                    </div>
                </section>

                {/* Contracts */}
                <section id="contracts" className="mb-16">
                    <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                        <Shield className="w-6 h-6 text-amber-400" />
                        Smart Contracts
                    </h2>

                    <div className="space-y-4">
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-lg font-bold mb-2">GSTD Token</h3>
                            <p className="text-sm text-gray-400 mb-2">Utility token for platform operations</p>
                            <code className="text-xs text-cyan-400 font-mono break-all">{GSTD_CONTRACT_ADDRESS}</code>
                        </div>
                        <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                            <h3 className="text-lg font-bold mb-2">Escrow Contract</h3>
                            <p className="text-sm text-gray-400 mb-2">Handles task payments and worker rewards</p>
                            <code className="text-xs text-cyan-400 font-mono break-all">{ADMIN_WALLET_ADDRESS}</code>
                        </div>
                    </div>
                </section>

                {/* Footer */}
                <div className="text-center text-gray-500 text-sm pt-8 border-t border-white/5">
                    <p>© 2026 GSTD Platform. All rights reserved.</p>
                </div>
            </main>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
    return {
        props: {
            ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
        },
    };
};
