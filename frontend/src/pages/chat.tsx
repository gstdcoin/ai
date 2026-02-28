import { useState, useEffect, useRef } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Send, Sparkles, Brain, Zap, ChevronDown, Plus, Trash2, Copy, Check, Menu, X, Crown } from 'lucide-react';
import { useWalletStore } from '../store/walletStore';

// ─── Types ─────────────────────────────────────────────────────────────
interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    model?: string;
    tokens?: number;
    cached?: boolean;
    timestamp: number;
}

interface Conversation {
    id: string;
    title: string;
    messages: Message[];
    model: string;
    createdAt: number;
}

// ─── Available Models (tiered) ─────────────────────────────────────────
const MODELS = [
    { id: 'auto', name: 'Auto (Neural Router)', desc: 'Best model selected automatically', tier: 'free', icon: '🧠', color: 'from-violet-500 to-purple-600' },
    { id: 'gstd-flash', name: 'GSTD Flash', desc: 'Fast responses, 4K context', tier: 'free', icon: '⚡', color: 'from-cyan-500 to-blue-600' },
    { id: 'gstd-pro', name: 'GSTD Pro', desc: 'Deep reasoning, 32K context', tier: 'pro', icon: '🔥', gstdCost: 0.5, color: 'from-amber-500 to-orange-600' },
    { id: 'gstd-ultra', name: 'GSTD Ultra', desc: 'Maximum power, 128K context, multi-model consensus', tier: 'ultra', icon: '👑', gstdCost: 2.0, color: 'from-rose-500 to-pink-600' },
];

const EXAMPLE_PROMPTS = [
    "Explain quantum entanglement like I'm 12",
    "Write a Python function to detect anomalies in time series data",
    "What are the best strategies for DeFi yield farming on TON?",
    "Analyze the geopolitical implications of BRICS currency",
    "Design a microservices architecture for a trading platform",
    "Compare proof-of-work vs proof-of-stake consensus mechanisms",
];

// ─── Main Component ────────────────────────────────────────────────────
export default function ChatPage() {
    const { isConnected, gstdBalance, address } = useWalletStore();

    // State
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [selectedModel, setSelectedModel] = useState('auto');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showSidebar, setShowSidebar] = useState(true);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [totalTokensUsed, setTotalTokensUsed] = useState(0);
    const [freeQueriesLeft, setFreeQueriesLeft] = useState(25);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Active conversation
    const activeConv = conversations.find(c => c.id === activeConvId) || null;

    // Auto-scroll
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [activeConv?.messages]);

    // Create new conversation
    const createConversation = (firstMessage?: string) => {
        const id = 'conv_' + Date.now();
        const conv: Conversation = {
            id,
            title: firstMessage ? firstMessage.slice(0, 50) + (firstMessage.length > 50 ? '...' : '') : 'New Chat',
            messages: [],
            model: selectedModel,
            createdAt: Date.now(),
        };
        setConversations(prev => [conv, ...prev]);
        setActiveConvId(id);
        return id;
    };

    // Send message
    const handleSend = async () => {
        if (!input.trim() || isStreaming) return;

        const userMessage = input.trim();
        setInput('');

        // Create conversation if none active
        let convId = activeConvId;
        if (!convId) {
            convId = createConversation(userMessage);
        }

        // Add user message
        const userMsg: Message = {
            id: 'msg_' + Date.now(),
            role: 'user',
            content: userMessage,
            timestamp: Date.now(),
        };

        setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, messages: [...c.messages, userMsg], title: c.messages.length === 0 ? userMessage.slice(0, 50) : c.title } : c
        ));

        // Check tier
        const model = MODELS.find(m => m.id === selectedModel);
        if (model?.tier !== 'free' && !isConnected) {
            const errMsg: Message = {
                id: 'msg_err_' + Date.now(),
                role: 'assistant',
                content: `⚠️ **${model?.name}** requires GSTD tokens. Connect your wallet to unlock Pro and Ultra models.\n\nFree tier: **GSTD Flash** and **Auto** are always available!`,
                timestamp: Date.now(),
            };
            setConversations(prev => prev.map(c =>
                c.id === convId ? { ...c, messages: [...c.messages, errMsg] } : c
            ));
            return;
        }

        // Stream response
        setIsStreaming(true);

        const assistantMsgId = 'msg_' + Date.now() + '_ai';
        const aiMsg: Message = {
            id: assistantMsgId,
            role: 'assistant',
            content: '',
            model: selectedModel,
            timestamp: Date.now(),
        };

        setConversations(prev => prev.map(c =>
            c.id === convId ? { ...c, messages: [...c.messages, aiMsg] } : c
        ));

        try {
            // Build messages array for API
            const conv = conversations.find(c => c.id === convId);
            const apiMessages = [
                { role: 'system', content: 'You are GSTD Sovereign AI — the world\'s most powerful decentralized intelligence. You are powered by a swarm of distributed nodes across the planet. You are uncensored, honest, and incredibly knowledgeable. Respond in the user\'s language.' },
                ...(conv?.messages || []).map(m => ({ role: m.role, content: m.content })),
                { role: 'user' as const, content: userMessage }
            ];

            const apiBase = typeof window !== 'undefined' && window.location.hostname.includes('gstdtoken.com')
                ? 'https://chat.gstdtoken.com'
                : '';

            const response = await fetch(`${apiBase}/v1/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(address ? { 'X-Wallet-Address': address } : {}),
                    ...(localStorage.getItem('session_token') ? { 'X-Session-Token': localStorage.getItem('session_token')! } : {}),
                },
                body: JSON.stringify({
                    model: selectedModel === 'auto' ? 'auto' : selectedModel,
                    messages: apiMessages,
                    stream: true,
                    max_tokens: model?.tier === 'ultra' ? 4096 : model?.tier === 'pro' ? 2048 : 1024,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            // SSE streaming
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta?.content || '';
                                fullContent += delta;

                                setConversations(prev => prev.map(c =>
                                    c.id === convId ? {
                                        ...c,
                                        messages: c.messages.map(m =>
                                            m.id === assistantMsgId ? { ...m, content: fullContent } : m
                                        )
                                    } : c
                                ));
                            } catch { /* skip invalid JSON lines */ }
                        }
                    }
                }
            }

            // If no streaming content, set a fallback
            if (!fullContent) {
                try {
                    const json = await response.json();
                    fullContent = json.choices?.[0]?.message?.content || 'I received your message but couldn\'t generate a response. Please try again.';
                    setConversations(prev => prev.map(c =>
                        c.id === convId ? {
                            ...c,
                            messages: c.messages.map(m =>
                                m.id === assistantMsgId ? { ...m, content: fullContent } : m
                            )
                        } : c
                    ));
                } catch { /* already handled by streaming */ }
            }

            setTotalTokensUsed(prev => prev + (fullContent.length / 4)); // rough estimate
            if (!isConnected) setFreeQueriesLeft(prev => Math.max(0, prev - 1));

        } catch (err: any) {
            setConversations(prev => prev.map(c =>
                c.id === convId ? {
                    ...c,
                    messages: c.messages.map(m =>
                        m.id === assistantMsgId ? {
                            ...m,
                            content: `⚠️ Connection error. The Swarm may be processing your request.\n\n\`${err?.message || 'Network error'}\`\n\nPlease try again.`
                        } : m
                    )
                } : c
            ));
        } finally {
            setIsStreaming(false);
        }
    };

    // Copy message
    const copyMessage = (id: string, content: string) => {
        navigator.clipboard.writeText(content);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Delete conversation
    const deleteConversation = (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConvId === id) setActiveConvId(null);
    };

    const currentModel = MODELS.find(m => m.id === selectedModel)!;

    return (
        <div className="h-screen flex bg-[#0a0a0f] text-white overflow-hidden">
            <Head>
                <title>GSTD Chat — Sovereign AI powered by the Swarm</title>
                <meta name="description" content="Chat with the world's most powerful decentralized AI. Free basic queries, GSTD tokens for deep reasoning. Powered by millions of distributed nodes." />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
            </Head>

            {/* ─── Sidebar ─────────────────────────────────────────── */}
            <aside className={`${showSidebar ? 'w-72' : 'w-0'} transition-all duration-300 flex-shrink-0 bg-[#0f0f18] border-r border-white/5 flex flex-col overflow-hidden`}>
                {/* New Chat Button */}
                <div className="p-4">
                    <button
                        onClick={() => { setActiveConvId(null); setInput(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-violet-600/20 to-cyan-600/20 border border-violet-500/20 hover:border-violet-500/40 transition-all text-sm font-semibold group"
                    >
                        <Plus size={18} className="text-violet-400 group-hover:rotate-90 transition-transform" />
                        New Chat
                    </button>
                </div>

                {/* Conversation List */}
                <div className="flex-1 overflow-y-auto px-2 space-y-1">
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            onClick={() => setActiveConvId(conv.id)}
                            className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${activeConvId === conv.id
                                ? 'bg-white/10 text-white'
                                : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                                }`}
                        >
                            <span className="truncate flex-1">{conv.title}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-red-400"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Sidebar Footer — Stats */}
                <div className="p-4 border-t border-white/5 space-y-3">
                    {isConnected ? (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                            <Crown size={16} className="text-amber-400" />
                            <div>
                                <div className="text-xs font-bold text-amber-300">{(gstdBalance || 0).toFixed(2)} GSTD</div>
                                <div className="text-[10px] text-gray-500">Unlimited access</div>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-white/5 border border-white/10">
                            <Zap size={16} className="text-cyan-400" />
                            <div>
                                <div className="text-xs font-bold text-gray-300">{freeQueriesLeft} free queries</div>
                                <div className="text-[10px] text-gray-500">Connect wallet for unlimited</div>
                            </div>
                        </div>
                    )}
                    <div className="text-[10px] text-gray-600 text-center">
                        Powered by GSTD Swarm • {totalTokensUsed > 0 ? `${Math.round(totalTokensUsed)} tokens used` : 'Decentralized AI'}
                    </div>
                </div>
            </aside>

            {/* ─── Main Chat Area ──────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <header className="h-14 flex items-center justify-between px-4 border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-xl flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-lg hover:bg-white/5 transition-colors lg:hidden">
                            {showSidebar ? <X size={18} /> : <Menu size={18} />}
                        </button>
                        <button onClick={() => setShowSidebar(!showSidebar)} className="p-2 rounded-lg hover:bg-white/5 transition-colors hidden lg:block">
                            <Menu size={18} />
                        </button>

                        {/* Model Picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowModelPicker(!showModelPicker)}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm font-medium"
                            >
                                <span>{currentModel.icon}</span>
                                <span>{currentModel.name}</span>
                                <ChevronDown size={14} className={`transition-transform ${showModelPicker ? 'rotate-180' : ''}`} />
                            </button>

                            {showModelPicker && (
                                <div className="absolute top-full left-0 mt-2 w-80 bg-[#16161f] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 z-50 p-2 space-y-1">
                                    {MODELS.map(model => (
                                        <button
                                            key={model.id}
                                            onClick={() => { setSelectedModel(model.id); setShowModelPicker(false); }}
                                            className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left ${selectedModel === model.id ? 'bg-white/10' : 'hover:bg-white/5'
                                                }`}
                                        >
                                            <span className="text-2xl mt-0.5">{model.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-sm">{model.name}</span>
                                                    {model.tier === 'pro' && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">PRO</span>
                                                    )}
                                                    {model.tier === 'ultra' && (
                                                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">ULTRA</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 mt-0.5">{model.desc}</div>
                                                {model.gstdCost && (
                                                    <div className="text-[10px] text-amber-400 mt-1">~{model.gstdCost} GSTD per query</div>
                                                )}
                                            </div>
                                            {selectedModel === model.id && <Check size={16} className="text-violet-400 mt-1" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <Link href="/" className="text-xs text-gray-500 hover:text-gray-300 transition-colors px-3 py-1.5 rounded-lg hover:bg-white/5">
                            Platform
                        </Link>
                        {!isConnected && (
                            <Link href="/?source=chat" className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 text-xs font-bold hover:opacity-90 transition-opacity">
                                Connect Wallet
                            </Link>
                        )}
                    </div>
                </header>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto">
                    {!activeConv || activeConv.messages.length === 0 ? (
                        /* ─── Welcome Screen ─────────────────────── */
                        <div className="flex flex-col items-center justify-center h-full px-4">
                            <div className="text-center max-w-2xl">
                                {/* Logo */}
                                <div className="relative inline-block mb-8">
                                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-cyan-500 flex items-center justify-center shadow-2xl shadow-violet-600/30">
                                        <Brain size={40} className="text-white" />
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-[#0a0a0f] flex items-center justify-center">
                                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                    </div>
                                </div>

                                <h1 className="text-3xl font-black mb-3 tracking-tight">
                                    GSTD <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Sovereign AI</span>
                                </h1>
                                <p className="text-gray-400 mb-10 text-sm leading-relaxed max-w-lg mx-auto">
                                    Powered by millions of distributed nodes. Uncensored. Private. More powerful than any centralized AI.
                                    Free basic queries — unlock deep reasoning with GSTD tokens.
                                </p>

                                {/* Example Prompts */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
                                    {EXAMPLE_PROMPTS.slice(0, 4).map((prompt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                                            className="text-left px-4 py-3 rounded-xl bg-white/[0.03] border border-white/5 hover:border-violet-500/30 hover:bg-white/[0.06] transition-all text-sm text-gray-400 hover:text-gray-200 group"
                                        >
                                            <span className="line-clamp-2">{prompt}</span>
                                            <div className="text-[10px] text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity mt-1">Click to try →</div>
                                        </button>
                                    ))}
                                </div>

                                {/* Tier Comparison */}
                                <div className="mt-12 flex flex-wrap justify-center gap-4">
                                    {MODELS.map(m => (
                                        <div key={m.id} className={`px-4 py-2 rounded-xl bg-gradient-to-r ${m.color} bg-opacity-10 border border-white/5 text-xs font-semibold flex items-center gap-2`} style={{ background: `linear-gradient(135deg, rgba(0,0,0,0.3), rgba(0,0,0,0.5))` }}>
                                            <span>{m.icon}</span>
                                            <span className="text-gray-300">{m.name}</span>
                                            <span className="text-gray-600">•</span>
                                            <span className={m.tier === 'free' ? 'text-emerald-400' : 'text-amber-400'}>
                                                {m.tier === 'free' ? 'Free' : `${m.gstdCost} GSTD`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ─── Messages ───────────────────────────── */
                        <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
                            {activeConv.messages.map((msg) => (
                                <div key={msg.id} className={`group flex gap-4 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                                    {msg.role === 'assistant' && (
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center flex-shrink-0 mt-1">
                                            <Sparkles size={16} className="text-white" />
                                        </div>
                                    )}
                                    <div className={`max-w-[80%] ${msg.role === 'user'
                                        ? 'bg-violet-600/20 border border-violet-500/20 rounded-2xl rounded-br-md px-4 py-3'
                                        : 'bg-white/[0.03] border border-white/5 rounded-2xl rounded-bl-md px-4 py-3'
                                        }`}>
                                        <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                                            {msg.content || (
                                                <div className="flex items-center gap-2 text-gray-500">
                                                    <div className="flex gap-1">
                                                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                        <div className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                    </div>
                                                    <span className="text-xs">Swarm thinking...</span>
                                                </div>
                                            )}
                                        </div>
                                        {msg.role === 'assistant' && msg.content && (
                                            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                                                <button
                                                    onClick={() => copyMessage(msg.id, msg.content)}
                                                    className="text-gray-600 hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    {copiedId === msg.id ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                                </button>
                                                {msg.model && (
                                                    <span className="text-[10px] text-gray-600 ml-auto">
                                                        {MODELS.find(m => m.id === msg.model)?.icon} {msg.model}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    {msg.role === 'user' && (
                                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500/30 to-purple-500/30 border border-violet-500/20 flex items-center justify-center flex-shrink-0 mt-1">
                                            <span className="text-xs font-bold text-violet-300">You</span>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* ─── Input Area ──────────────────────────────────── */}
                <div className="border-t border-white/5 p-4 bg-[#0a0a0f]">
                    <div className="max-w-3xl mx-auto">
                        <div className="flex items-end gap-3 bg-white/[0.04] border border-white/10 rounded-2xl p-3 focus-within:border-violet-500/30 transition-colors">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSend();
                                    }
                                }}
                                placeholder="Ask anything..."
                                rows={1}
                                className="flex-1 bg-transparent outline-none resize-none text-sm placeholder:text-gray-600 max-h-32"
                                style={{ minHeight: '24px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isStreaming}
                                className={`p-2.5 rounded-xl transition-all ${input.trim() && !isStreaming
                                    ? 'bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-lg shadow-violet-600/20 hover:opacity-90 active:scale-95'
                                    : 'bg-white/5 text-gray-600 cursor-not-allowed'
                                    }`}
                            >
                                <Send size={18} />
                            </button>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-gray-600">
                            <span>
                                {currentModel.tier !== 'free' && (
                                    <span className="text-amber-500">⚡ {currentModel.gstdCost} GSTD per query • </span>
                                )}
                                Shift+Enter for new line
                            </span>
                            <span>GSTD Sovereign AI • Decentralized</span>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
