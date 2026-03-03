import { useTranslation } from 'next-i18next';
import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Send, Plus, Trash2, Copy, Check, Menu, X, ChevronDown, Shield, Bot, Wallet, ExternalLink, Sparkles } from 'lucide-react';
import { useWalletStore } from '../store/walletStore';

// ─── Types ───────────────────────────────────────────────────────
interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    timestamp: number;
}

interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    model: string;
    createdAt: number;
}

// ─── Chat Page ───────────────────────────────────────────────────
export default function ChatPage() {
    const { t } = useTranslation('common');

    const MODELS = [
        { id: 'mix-free', name: '🆓 Free', desc: t('smartmix_free', 'Single fast model'), tier: 'free', cost: 0 },
        { id: 'mix-standard', name: '⚡ Standard', desc: t('smartmix_standard', 'Smart routing · 0.01 GSTD'), tier: 'standard', cost: 0.01 },
        { id: 'mix-pro', name: '🔥 Pro', desc: t('smartmix_pro', 'Dual-model synthesis · 0.05 GSTD'), tier: 'pro', cost: 0.05 },
        { id: 'mix-ultra', name: '🧠 Ultra', desc: t('smartmix_ultra', 'Triple consensus · 0.15 GSTD'), tier: 'ultra', cost: 0.15 },
    ];
    const { isConnected, gstdBalance, address } = useWalletStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [selectedModel, setSelectedModel] = useState('mix-free');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    const activeConv = conversations.find(c => c.id === activeConvId) || null;
    const currentModel = MODELS.find(m => m.id === selectedModel) || MODELS[0];

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConv?.messages]);

    // Auto-resize textarea
    const handleInputChange = useCallback((val: string) => {
        setInput(val);
        if (inputRef.current) {
            inputRef.current.style.height = 'auto';
            inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
        }
    }, []);

    const createConversation = (firstMessage?: string) => {
        const id = 'conv_' + Date.now();
        const conv: Conversation = {
            id,
            title: firstMessage?.slice(0, 50) || t('new_chat', 'New chat'),
            messages: [],
            model: selectedModel,
            createdAt: Date.now(),
        };
        setConversations(prev => [conv, ...prev]);
        setActiveConvId(id);
        return id;
    };

    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;
        const userMessage = input.trim();
        setInput('');
        if (inputRef.current) inputRef.current.style.height = 'auto';

        let convId = activeConvId;
        if (!convId) convId = createConversation(userMessage);

        const userMsg: Message = {
            id: 'msg_' + Date.now(),
            role: 'user',
            content: userMessage,
            timestamp: Date.now(),
        };

        setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? userMessage.slice(0, 50) : c.title } : c
        ));

        setIsStreaming(true);
        const aiMsgId = 'msg_' + Date.now() + '_ai';
        const aiMsg: Message = { id: aiMsgId, role: 'assistant', content: '', model: selectedModel, timestamp: Date.now() };

        setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, messages: [...c.messages, aiMsg] } : c
        ));

        try {
            const conv = conversations.find(c => c.id === convId);
            const apiMessages = [
                { role: 'system', content: 'You are GSTD — a sovereign decentralized AI. Respond in the user\'s language. Be helpful, concise, and direct.' },
                ...(conv?.messages || []).map(m => ({ role: m.role, content: m.content })),
                { role: 'user' as const, content: userMessage }
            ];

            const apiBase = typeof window !== 'undefined' && window.location.hostname.includes('gstdtoken.com')
                ? 'https://app.gstdtoken.com' : '';

            const mixTier = selectedModel.replace('mix-', '') || 'free';

            const response = await fetch(`${apiBase}/api/v1/chat/smartmix`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(address ? { 'X-Wallet-Address': address, 'X-GSTD-Target-Wallet': address } : {}),
                    ...(localStorage.getItem('session_token') ? { 'X-Session-Token': localStorage.getItem('session_token')! } : {}),
                },
                body: JSON.stringify({
                    model: selectedModel,
                    messages: apiMessages,
                    mix_tier: mixTier,
                    stream: false,
                }),
            });

            if (!response.ok) throw new Error(`Error ${response.status}`);

            const json = await response.json();
            const fullContent = json.choices?.[0]?.message?.content || 'No response received.';

            // Build SmartMix footer
            const sm = json.smart_mix;
            const smFooter = sm ? `\n\n---\n🔬 ${sm.tier?.toUpperCase()} · ${sm.strategy} · ${sm.models_used?.length || 1} models · ${sm.latency_ms}ms${sm.cost_gstd > 0 ? ` · ${sm.cost_gstd} GSTD` : ' · Free'}` : '';

            setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, messages: c.messages.map(m => m.id === aiMsgId ? { ...m, content: fullContent + smFooter } : m) } : c
            ));
        } catch (err: any) {
            setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, messages: c.messages.map(m => m.id === aiMsgId ? { ...m, content: `Error: ${err?.message || 'Network error'}. Try again.` } : m) } : c
            ));
        } finally {
            setIsStreaming(false);
        }
    };

    const copyMessage = (id: string, content: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    const deleteConversation = (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConvId === id) setActiveConvId(null);
    };

    const formatTime = (ts: number) => {
        return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    // ─── Render ──────────────────────────────────────────────────
    return (
        <div className="h-screen flex bg-[#030014] text-white overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <Head>
                <title>GSTD Chat — Sovereign AI</title>
                <meta name="description" content="Sovereign decentralized AI chat powered by the GSTD Swarm" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            {/* Mobile overlay */}
            {showSidebar && <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden" onClick={() => setShowSidebar(false)} />}

            {/* ─── Sidebar ─────────────────────────────────────────── */}
            <aside className={`
                ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                fixed lg:relative z-50 lg:z-auto w-72 lg:w-64 h-full
                transition-transform duration-300 ease-out
                bg-[#08081a]/95 backdrop-blur-xl border-r border-white/[0.06] flex flex-col
            `}>
                {/* Sidebar header */}
                <div className="p-4 border-b border-white/[0.06]">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center">
                                <Sparkles size={14} className="text-white" />
                            </div>
                            <span className="text-sm font-bold text-white">{t('gstd_chat', 'GSTD Chat')}</span>
                        </div>
                        <button onClick={() => setShowSidebar(false)} className="p-1.5 rounded-lg hover:bg-white/5 transition lg:hidden">
                            <X size={16} className="text-gray-400" />
                        </button>
                    </div>
                    <button
                        onClick={() => { setActiveConvId(null); setInput(''); setShowSidebar(false); }}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 hover:border-white/15 transition-all text-sm text-gray-300 font-medium"
                    >
                        <Plus size={16} />{t('new_chat', 'New chat')}</button>
                </div>

                {/* Conversation list */}
                <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1 chat-scrollbar">
                    {conversations.length === 0 && (
                        <div className="text-center pt-8">
                            <div className="text-gray-600 text-xs">{t('no_conversations', 'No conversations yet')}</div>
                        </div>
                    )}
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            onClick={() => { setActiveConvId(conv.id); setShowSidebar(false); }}
                            className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-[13px] ${activeConvId === conv.id
                                ? 'bg-violet-500/10 text-white border border-violet-500/20'
                                : 'text-gray-400 hover:bg-white/[0.04] hover:text-gray-200 border border-transparent'
                                }`}
                        >
                            <span className="truncate flex-1">{conv.title}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-white/10 hover:text-red-400 transition-all"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Wallet status */}
                <div className="p-4 border-t border-white/[0.06]">
                    {isConnected ? (
                        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                            <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                                <Wallet size={14} className="text-emerald-400" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">{t('balance', 'Balance')}</div>
                                <div className="text-sm text-white font-bold truncate">{(gstdBalance || 0).toFixed(2)} <span className="text-gray-500 font-normal text-xs">GSTD</span></div>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                        </div>
                    ) : (
                        <a href="/?source=chat" className="flex items-center justify-center gap-2 p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-sm text-violet-400 hover:bg-violet-500/15 transition-all font-medium">
                            <Wallet size={14} /> Connect wallet
                            <ExternalLink size={12} />
                        </a>
                    )}
                </div>
            </aside>

            {/* ─── Main ────────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">

                {/* Header */}
                <header className="h-14 flex items-center justify-between px-4 border-b border-white/[0.06] flex-shrink-0 bg-[#030014]/80 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-lg hover:bg-white/5 transition lg:hidden">
                            {showSidebar ? <X size={18} /> : <Menu size={18} />}
                        </button>

                        {/* Model picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowModelPicker(!showModelPicker)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-xl hover:bg-white/5 transition text-sm font-medium text-gray-200 border border-transparent hover:border-white/10"
                            >
                                <div className="w-5 h-5 rounded-md bg-violet-500/20 flex items-center justify-center">
                                    <Bot size={12} className="text-violet-400" />
                                </div>
                                {currentModel.name}
                                {currentModel.tier === 'tee' && <Shield size={12} className="text-emerald-400" />}
                                <ChevronDown size={13} className={`text-gray-500 transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                            </button>

                            {showModelPicker && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-[#0e0e1c] border border-white/10 rounded-xl shadow-2xl z-50 py-1.5 overflow-hidden">
                                        <div className="px-3 py-2 border-b border-white/[0.06]">
                                            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{t('select_model', 'Select model')}</span>
                                        </div>
                                        {MODELS.map(m => (
                                            <button
                                                key={m.id}
                                                onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                                                className={`w-full flex items-center gap-3 px-3 py-2.5 transition text-left text-[13px] ${selectedModel === m.id ? 'bg-violet-500/10 text-white' : 'text-gray-400 hover:bg-white/[0.04]'
                                                    }`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedModel === m.id ? 'bg-violet-500/20' : 'bg-white/5'}`}>
                                                    <Bot size={13} className={selectedModel === m.id ? 'text-violet-400' : 'text-gray-500'} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium">{m.name}</span>
                                                        {m.cost > 0 && (
                                                            <span className="text-[9px] px-1.5 rounded bg-violet-500/15 text-violet-400 font-bold">{m.cost} GSTD</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-gray-600 truncate">{m.desc}</div>
                                                </div>
                                                {selectedModel === m.id && <Check size={15} className="text-violet-400 flex-shrink-0" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {isConnected && (
                            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                <span className="text-xs text-gray-400 font-medium">{(gstdBalance || 0).toFixed(2)} GSTD</span>
                            </div>
                        )}
                        <span className="text-[11px] text-gray-600 hidden sm:block font-medium">{t('sovereign_ai', 'Sovereign AI')}</span>
                    </div>
                </header>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto chat-scrollbar">
                    {!activeConv || activeConv.messages.length === 0 ? (
                        /* ─── Empty state ──────────────────────────────── */
                        <div className="flex flex-col items-center justify-center h-full px-4">
                            <div className="text-center max-w-lg">
                                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-violet-500/15 flex items-center justify-center mx-auto mb-6 shadow-[0_0_40px_rgba(139,92,246,0.1)]">
                                    <Bot size={28} className="text-violet-400" />
                                </div>
                                <h1 className="text-2xl font-bold mb-2 text-white">{t('how_can_help', 'How can I help?')}</h1>
                                <p className="text-sm text-gray-500 mb-8">Powered by the GSTD Sovereign Swarm — Private, Decentralized, Uncensored</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md mx-auto">
                                    {[
                                        { text: "Explain quantum computing", icon: "🧮" },
                                        { text: "Write a Python web scraper", icon: "🐍" },
                                        { text: "Compare PoW vs PoS", icon: "⛓️" },
                                        { text: "Design a REST API", icon: "🏗️" },
                                    ].map((prompt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { handleInputChange(prompt.text); inputRef.current?.focus(); }}
                                            className="group text-left px-4 py-3.5 rounded-xl border border-white/[0.06] hover:border-violet-500/20 hover:bg-violet-500/[0.04] transition-all text-[13px] text-gray-400 hover:text-gray-200 flex items-center gap-3"
                                        >
                                            <span className="text-lg">{prompt.icon}</span>
                                            <span>{prompt.text}</span>
                                        </button>
                                    ))}
                                </div>

                                {!isConnected && (
                                    <div className="mt-8 p-4 rounded-xl border border-amber-500/20 bg-amber-500/[0.04]">
                                        <p className="text-xs text-amber-400/80">
                                            <Wallet size={12} className="inline mr-1.5 -mt-0.5" />
                                            Connect your wallet for session tracking and GSTD token features
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* ─── Messages ─────────────────────────────────── */
                        <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 space-y-1">
                            {activeConv.messages.map((msg, idx) => (
                                <div key={msg.id} className={`group py-4 ${idx > 0 ? '' : ''}`}>
                                    {msg.role === 'assistant' ? (
                                        <div className="flex gap-3">
                                            <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                                                <Bot size={14} className="text-violet-400" />
                                            </div>
                                            <div className="flex-1 min-w-0 space-y-2">
                                                <div className="text-[13px] sm:text-sm leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
                                                    {msg.content || (
                                                        <span className="text-gray-600 flex items-center gap-2 py-1">
                                                            <span className="flex gap-1">
                                                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                                <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                            </span>
                                                            <span className="text-xs">{t('thinking', 'Thinking...')}</span>
                                                        </span>
                                                    )}
                                                </div>
                                                {msg.content && (
                                                    <div className="flex items-center gap-3 pt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button onClick={() => copyMessage(msg.id, msg.content)} className="flex items-center gap-1.5 text-gray-600 hover:text-gray-300 transition text-xs">
                                                            {copiedId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                            <span>{copiedId === msg.id ? t('copied', 'Copied') : t('copy', 'Copy')}</span>
                                                        </button>
                                                        {msg.model && (
                                                            <span className="text-[10px] text-gray-700 px-2 py-0.5 rounded-full bg-white/[0.03] border border-white/[0.04]">
                                                                {MODELS.find(m => m.id === msg.model)?.name || msg.model}
                                                            </span>
                                                        )}
                                                        <span className="text-[10px] text-gray-700">{formatTime(msg.timestamp)}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex justify-end">
                                            <div className="max-w-[85%] sm:max-w-[75%]">
                                                <div className="bg-violet-600/10 border border-violet-500/10 rounded-2xl rounded-br-md px-4 py-3">
                                                    <div className="text-[13px] sm:text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                                                </div>
                                                <div className="text-right mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <span className="text-[10px] text-gray-700">{formatTime(msg.timestamp)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* ─── Input ────────────────────────────────────────── */}
                <div className="border-t border-white/[0.06] p-3 sm:p-4 bg-[#030014]/80 backdrop-blur-sm">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-end gap-2 bg-white/[0.025] border border-white/[0.08] rounded-2xl p-2.5 sm:p-3 focus-within:border-violet-500/25 transition-all shadow-[0_-4px_30px_rgba(0,0,0,0.3)]">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={(e) => { if (e.key === t('enter', 'Enter') && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder={t('message_placeholder', 'Message GSTD…')}
                                rows={1}
                                className="flex-1 bg-transparent outline-none resize-none text-[13px] sm:text-sm text-gray-200 placeholder:text-gray-600 max-h-40 py-1"
                                style={{ minHeight: '24px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isStreaming}
                                className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${input.trim() && !isStreaming
                                    ? 'text-white bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-500/20'
                                    : 'text-gray-700 cursor-not-allowed bg-white/[0.03]'
                                    }`}
                            >
                                <Send size={16} />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-700 text-center mt-2">
                            GSTD Sovereign AI · Decentralized · Private · Uncensored
                        </p>
                    </div>
                </div>
            </main>

            <style jsx global>{`
                .chat-scrollbar::-webkit-scrollbar { width: 4px; }
                .chat-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .chat-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 4px; }
                .chat-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.12); }
            `}</style>
        </div>
    );
}

import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: {
        ...(await serverSideTranslations(locale || 'en', ['common'])),
    },
});
