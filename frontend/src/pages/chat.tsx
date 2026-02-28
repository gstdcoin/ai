import { useState, useEffect, useRef, useCallback } from 'react';
import Head from 'next/head';
import { Send, Plus, Trash2, Copy, Check, Menu, X, ChevronDown, Shield, Bot } from 'lucide-react';
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

// ─── Models ──────────────────────────────────────────────────────
const MODELS = [
    { id: 'auto', name: 'Auto', desc: 'Sovereign neural router', tier: 'sovereign' },
    { id: 'gstd-flash', name: 'Flash', desc: 'Fast · qwen2.5-coder', tier: 'sovereign' },
    { id: 'gstd-pro', name: 'Pro', desc: 'Balanced · llama3.1', tier: 'sovereign' },
    { id: 'gstd-ultra', name: 'Ultra', desc: 'Deep · deepseek-r1', tier: 'sovereign' },
    { id: 'cocoon-auto', name: 'Cocoon TEE', desc: 'Confidential GPU compute', tier: 'tee' },
];

// ─── Chat Page ───────────────────────────────────────────────────
export default function ChatPage() {
    const { isConnected, gstdBalance, address } = useWalletStore();
    const [conversations, setConversations] = useState<Conversation[]>([]);
    const [activeConvId, setActiveConvId] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isStreaming, setIsStreaming] = useState(false);
    const [selectedModel, setSelectedModel] = useState('auto');
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showSidebar, setShowSidebar] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [sessionCost, setSessionCost] = useState(0);

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
            title: firstMessage?.slice(0, 50) || 'New chat',
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
                ? 'https://chat.gstdtoken.com' : '';

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
                }),
            });

            if (!response.ok) throw new Error(`Error ${response.status}`);

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let fullContent = '';

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    for (const line of chunk.split('\n')) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta?.content || '';
                                fullContent += delta;
                                setConversations(prev => prev.map(c =>
                                    c.id === convId ? { ...c, messages: c.messages.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m) } : c
                                ));
                            } catch { }
                        }
                    }
                }
            }

            if (!fullContent) {
                try {
                    const json = await response.json();
                    fullContent = json.choices?.[0]?.message?.content || 'No response.';
                    setConversations(prev => prev.map(c =>
                        c.id === convId ? { ...c, messages: c.messages.map(m => m.id === aiMsgId ? { ...m, content: fullContent } : m) } : c
                    ));
                } catch { }
            }
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

    // ─── Render ──────────────────────────────────────────────────
    return (
        <div className="h-screen flex bg-[#0a0a12] text-white overflow-hidden" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
            <Head>
                <title>GSTD Chat</title>
                <meta name="description" content="Sovereign decentralized AI chat" />
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
            </Head>

            {/* Mobile overlay */}
            {showSidebar && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setShowSidebar(false)} />}

            {/* ─── Sidebar ─────────────────────────────────────────── */}
            <aside className={`
                ${showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                fixed lg:relative z-50 lg:z-auto w-60 h-full
                transition-transform duration-200 ease-out
                bg-[#0e0e18] border-r border-white/5 flex flex-col
            `}>
                <div className="p-3">
                    <button
                        onClick={() => { setActiveConvId(null); setInput(''); setShowSidebar(false); }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 hover:bg-white/5 transition text-sm text-gray-400"
                    >
                        <Plus size={15} /> New chat
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-2 space-y-px">
                    {conversations.map(conv => (
                        <div
                            key={conv.id}
                            onClick={() => { setActiveConvId(conv.id); setShowSidebar(false); }}
                            className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition text-[13px] ${activeConvId === conv.id
                                    ? 'bg-white/8 text-white'
                                    : 'text-gray-500 hover:bg-white/4 hover:text-gray-300'
                                }`}
                        >
                            <span className="truncate flex-1">{conv.title}</span>
                            <button
                                onClick={(e) => { e.stopPropagation(); deleteConversation(conv.id); }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-red-400 transition"
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Balance */}
                <div className="p-3 border-t border-white/5">
                    {isConnected ? (
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">Balance</span>
                            <span className="text-white font-medium">{(gstdBalance || 0).toFixed(2)} GSTD</span>
                        </div>
                    ) : (
                        <a href="/?source=chat" className="block text-center text-xs text-violet-400 hover:text-violet-300 transition">
                            Connect wallet →
                        </a>
                    )}
                </div>
            </aside>

            {/* ─── Main ────────────────────────────────────────────── */}
            <main className="flex-1 flex flex-col min-w-0">

                {/* Header — ultra minimal */}
                <header className="h-11 flex items-center justify-between px-3 border-b border-white/5 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setShowSidebar(!showSidebar)} className="p-1.5 rounded-lg hover:bg-white/5 transition lg:hidden">
                            {showSidebar ? <X size={16} /> : <Menu size={16} />}
                        </button>

                        {/* Model picker */}
                        <div className="relative">
                            <button
                                onClick={() => setShowModelPicker(!showModelPicker)}
                                className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/5 transition text-[13px] font-medium text-gray-300"
                            >
                                {currentModel.name}
                                {currentModel.tier === 'tee' && <Shield size={11} className="text-emerald-400" />}
                                <ChevronDown size={12} className={`text-gray-600 transition ${showModelPicker ? 'rotate-180' : ''}`} />
                            </button>

                            {showModelPicker && (
                                <>
                                    <div className="fixed inset-0 z-40" onClick={() => setShowModelPicker(false)} />
                                    <div className="absolute top-full left-0 mt-1 w-56 bg-[#14141e] border border-white/8 rounded-xl shadow-2xl z-50 py-1">
                                        {MODELS.map(m => (
                                            <button
                                                key={m.id}
                                                onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                                                className={`w-full flex items-center gap-3 px-3 py-2 transition text-left text-[13px] ${selectedModel === m.id ? 'bg-white/8 text-white' : 'text-gray-400 hover:bg-white/4'
                                                    }`}
                                            >
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-medium">{m.name}</span>
                                                        {m.tier === 'tee' && (
                                                            <span className="text-[9px] px-1 rounded bg-emerald-500/15 text-emerald-400 font-bold">TEE</span>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] text-gray-600">{m.desc}</div>
                                                </div>
                                                {selectedModel === m.id && <Check size={14} className="text-violet-400" />}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-600 hidden sm:block">Sovereign AI</span>
                    </div>
                </header>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto">
                    {!activeConv || activeConv.messages.length === 0 ? (
                        /* ─── Empty state ──────────────────────────────── */
                        <div className="flex flex-col items-center justify-center h-full px-4">
                            <div className="text-center max-w-md">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-violet-500/20 flex items-center justify-center mx-auto mb-5">
                                    <Bot size={22} className="text-violet-400" />
                                </div>
                                <h1 className="text-lg font-semibold mb-1.5 text-gray-200">How can I help?</h1>
                                <p className="text-xs text-gray-600 mb-6">Powered by the GSTD Swarm</p>

                                <div className="grid grid-cols-2 gap-2">
                                    {[
                                        "Explain quantum computing",
                                        "Write a Python web scraper",
                                        "Compare PoW vs PoS",
                                        "Design a REST API",
                                    ].map((prompt, i) => (
                                        <button
                                            key={i}
                                            onClick={() => { handleInputChange(prompt); inputRef.current?.focus(); }}
                                            className="text-left px-3 py-2.5 rounded-lg border border-white/6 hover:border-violet-500/20 hover:bg-white/3 transition text-[12px] text-gray-500 hover:text-gray-300"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    ) : (
                        /* ─── Messages ─────────────────────────────────── */
                        <div className="max-w-2xl mx-auto py-6 px-4 space-y-5">
                            {activeConv.messages.map(msg => (
                                <div key={msg.id} className={`group ${msg.role === 'user' ? 'flex justify-end' : ''}`}>
                                    {msg.role === 'assistant' ? (
                                        <div className="space-y-1">
                                            <div className="text-[13px] leading-relaxed text-gray-200 whitespace-pre-wrap break-words">
                                                {msg.content || (
                                                    <span className="text-gray-600 flex items-center gap-2">
                                                        <span className="flex gap-0.5">
                                                            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                                                            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                                                            <span className="w-1 h-1 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                                                        </span>
                                                    </span>
                                                )}
                                            </div>
                                            {msg.content && (
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                                                    <button onClick={() => copyMessage(msg.id, msg.content)} className="text-gray-600 hover:text-gray-400 transition">
                                                        {copiedId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                                    </button>
                                                    {msg.model && (
                                                        <span className="text-[10px] text-gray-700">{MODELS.find(m => m.id === msg.model)?.name || msg.model}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="max-w-[80%] bg-violet-600/10 border border-violet-500/10 rounded-2xl rounded-br-sm px-4 py-2.5">
                                            <div className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.content}</div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                    )}
                </div>

                {/* ─── Input ────────────────────────────────────────── */}
                <div className="border-t border-white/5 p-3">
                    <div className="max-w-2xl mx-auto">
                        <div className="flex items-end gap-2 bg-white/[0.025] border border-white/8 rounded-xl p-2 focus-within:border-violet-500/25 transition">
                            <textarea
                                ref={inputRef}
                                value={input}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                                placeholder="Message GSTD…"
                                rows={1}
                                className="flex-1 bg-transparent outline-none resize-none text-[13px] text-gray-200 placeholder:text-gray-600 max-h-40"
                                style={{ minHeight: '22px' }}
                            />
                            <button
                                onClick={handleSend}
                                disabled={!input.trim() || isStreaming}
                                className={`p-1.5 rounded-lg transition ${input.trim() && !isStreaming
                                        ? 'text-white bg-violet-600 hover:bg-violet-500'
                                        : 'text-gray-700 cursor-not-allowed'
                                    }`}
                            >
                                <Send size={15} />
                            </button>
                        </div>
                        <p className="text-[10px] text-gray-700 text-center mt-1.5">
                            GSTD Sovereign AI · Decentralized · Private · Uncensored
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
