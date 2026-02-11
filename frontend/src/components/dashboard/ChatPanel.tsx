import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Send, Bot, User, Loader2, Sparkles, Copy, Check, RotateCcw, Zap, Shield } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { useWalletStore } from '../../store/walletStore';
import { API_BASE_URL } from '../../lib/config';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  model?: string;
  tokens?: { prompt: number; completion: number };
  cost?: number;
  // Speculative decoding fields
  speculativeContent?: string; // Draft from small model (shown dimmed)
  isStreaming?: boolean;
  verifiedUpTo?: number; // Characters verified by large model
}

export default function ChatPanel() {
  const { t } = useTranslation('common');
  const { gstdBalance } = useWalletStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('qwen2.5-coder:7b');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speculativeEnabled, setSpeculativeEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const models = [
    { id: 'qwen2.5-coder:7b', name: t('chat_model_fast') || 'Fast', tier: 'Tier 1', desc: t('chat_model_fast_desc') || 'Quick responses', cost: 0.01 },
    { id: 'llama3.1:8b', name: t('chat_model_creative') || 'Creative', tier: 'Tier 1', desc: t('chat_model_general') || 'General purpose', cost: 0.01 },
    { id: 'qwen2.5-coder:32b', name: t('chat_model_professional') || 'Professional', tier: 'Tier 2', desc: t('chat_model_advanced') || 'Advanced reasoning', cost: 0.05 },
    { id: 'llama3.3:70b', name: t('chat_model_ultra') || 'Ultra', tier: 'Tier 3', desc: t('chat_model_powerful') || 'Most powerful', cost: 0.1 },
  ];

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const assistantId = (Date.now() + 1).toString();
    const assistantMsg: Message = {
      id: assistantId,
      role: 'assistant',
      content: '',
      speculativeContent: '',
      isStreaming: true,
      verifiedUpTo: 0,
      timestamp: new Date(),
      model: selectedModel,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setIsLoading(true);

    const apiMessages = [...messages, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('session_token');

      // Use speculative decoding mode: backend sends draft tokens first, then verified
      const res = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          ...(token ? { 'X-Session-Token': token } : {}),
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: apiMessages,
          stream: true,
          speculative: speculativeEnabled,
        }),
        signal: controller.signal,
      });

      if (res.status === 402) {
        // Zero-Balance-Gate: insufficient balance
        const gate = await res.json().catch(() => ({}));
        const deficit = gate.deficit || 0;
        const workRequired = gate.work_required || 1;

        setMessages(prev => prev.map(m =>
          m.id === assistantId ? {
            ...m,
            isStreaming: false,
            content: `**${t('zbg_title') || 'Insufficient Balance'}**\n\n` +
              `${t('zbg_message') || 'Your GSTD balance is empty. Switch to **Worker mode** to earn tokens by contributing compute power.'}\n\n` +
              `- ${t('zbg_deficit') || 'Deficit'}: **${deficit.toFixed(4)} GSTD**\n` +
              `- ${t('zbg_work') || 'Tasks needed'}: **~${workRequired}** (~${workRequired * 15}s)\n\n` +
              `*${t('zbg_hint') || 'Go to Overview tab and tap "Ignite" to start mining. Your device will earn GSTD in the background.'}*`,
          } : m
        ));
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Network error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Handle SSE streaming
      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let fullContent = '';
      let speculativeBuffer = '';
      let verifiedLength = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const finishReason = parsed.choices?.[0]?.finish_reason;
            const isSpeculative = parsed.speculative === true;

            if (delta?.content) {
              if (isSpeculative) {
                // Draft token from small model - show dimmed
                speculativeBuffer += delta.content;
              } else {
                // Verified token from large model - solidify
                fullContent += delta.content;
                verifiedLength = fullContent.length;
                // Clear speculative buffer that was confirmed
                speculativeBuffer = '';
              }

              setMessages(prev => prev.map(m =>
                m.id === assistantId ? {
                  ...m,
                  content: fullContent,
                  speculativeContent: speculativeBuffer,
                  verifiedUpTo: verifiedLength,
                } : m
              ));
            }

            if (finishReason === 'stop') {
              const usage = parsed.usage;
              const cost = models.find(m => m.id === selectedModel)?.cost || 0.01;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? {
                  ...m,
                  content: fullContent,
                  speculativeContent: '',
                  isStreaming: false,
                  verifiedUpTo: fullContent.length,
                  tokens: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : undefined,
                  cost,
                } : m
              ));
            }
          } catch { /* skip malformed SSE chunks */ }
        }
      }

      // Finalize
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, isStreaming: false, speculativeContent: '' } : m
      ));
    } catch (err: any) {
      if (err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false, content: m.content + '\n\n*[Generation stopped]*' } : m
        ));
      } else {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? {
            ...m,
            isStreaming: false,
            content: `**Error:** ${err.message}\n\n${t('chat_error_hint') || 'Please check your GSTD balance and try again.'}`,
          } : m
        ));
      }
    } finally {
      setIsLoading(false);
      abortRef.current = null;
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => { setMessages([]); };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] max-w-4xl mx-auto">
      {/* Top Bar: Model + Settings */}
      <div className="flex items-center gap-3 mb-4 px-2 flex-wrap">
        <select
          value={selectedModel}
          onChange={(e) => setSelectedModel(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white font-medium focus:outline-none focus:border-violet-500/50 appearance-none cursor-pointer"
        >
          {models.map(m => (
            <option key={m.id} value={m.id} className="bg-[#0a0a1a] text-white">
              {m.name} ({m.tier}) — {m.cost} GSTD
            </option>
          ))}
        </select>

        {/* Speculative Decoding Toggle */}
        <button
          onClick={() => setSpeculativeEnabled(!speculativeEnabled)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
            speculativeEnabled
              ? 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400'
              : 'bg-white/5 border-white/10 text-gray-500'
          }`}
          title={t('chat_speculative_tooltip') || 'Speculative Decoding: small model drafts instantly, large model verifies'}
        >
          <Zap size={12} />
          {t('chat_speculative') || 'Speculative'}
        </button>

        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">
          {t('chat_balance') || 'Balance'}: <span className="text-cyan-400">{gstdBalance?.toFixed(2) || '0.00'} GSTD</span>
        </div>

        {messages.length > 0 && (
          <button onClick={clearChat} className="ml-auto p-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors" title={t('chat_clear') || 'Clear'}>
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {/* Speculative Decoding Info Banner */}
      {speculativeEnabled && messages.length === 0 && (
        <div className="mx-2 mb-4 p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/10 flex items-start gap-3">
          <Zap size={16} className="text-cyan-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-cyan-300 font-bold mb-1">{t('chat_speculative_title') || 'Speculative Decoding Active'}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {t('chat_speculative_desc') || 'A small draft model (1B) generates tokens instantly while the full model verifies them. Speculative tokens appear dimmed until confirmed. This reduces perceived latency by 3-5x.'}
            </p>
          </div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1 px-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600/20 to-cyan-500/20 border border-white/10 flex items-center justify-center mb-6">
              <Sparkles className="w-10 h-10 text-violet-400" />
            </div>
            <h2 className="text-2xl font-black text-white mb-3 tracking-tight">
              {t('chat_welcome_title') || 'Sovereign Intelligence'}
            </h2>
            <p className="text-gray-400 max-w-md mb-8 text-sm">
              {t('chat_welcome_desc') || 'Powered by decentralized LLMs. No censorship. No data collection.'}
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
              {[
                { text: t('chat_suggestion_1') || 'Write a smart contract in FunC', icon: '📝' },
                { text: t('chat_suggestion_2') || 'Explain blockchain consensus', icon: '🔗' },
                { text: t('chat_suggestion_3') || 'Build a REST API in Go', icon: '⚡' },
                { text: t('chat_suggestion_4') || 'Analyze my tokenomics model', icon: '📊' },
              ].map((s, i) => (
                <button key={i} onClick={() => { setInput(s.text); inputRef.current?.focus(); }}
                  className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 hover:border-violet-500/30 hover:bg-white/[0.05] transition-all text-left group">
                  <span className="text-lg mb-2 block">{s.icon}</span>
                  <span className="text-sm text-gray-300 group-hover:text-white transition-colors font-medium">{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 py-4 px-4 rounded-2xl ${msg.role === 'user' ? 'bg-white/[0.02]' : ''}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
              msg.role === 'user' ? 'bg-violet-600/20 text-violet-400' : 'bg-cyan-500/20 text-cyan-400'
            }`}>
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/40 [&_pre]:border [&_pre]:border-white/10 [&_pre]:rounded-xl [&_code]:text-violet-300 [&_a]:text-cyan-400">
                {/* Verified content */}
                <ReactMarkdown>{msg.content}</ReactMarkdown>

                {/* Speculative (unverified) content - shown dimmed */}
                {msg.speculativeContent && (
                  <span className="text-gray-500/60 italic animate-pulse">
                    {msg.speculativeContent}
                  </span>
                )}

                {/* Streaming cursor */}
                {msg.isStreaming && (
                  <span className="inline-block w-2 h-4 bg-cyan-400 animate-pulse ml-0.5 rounded-sm" />
                )}
              </div>

              {/* Message footer with metadata */}
              {msg.role === 'assistant' && !msg.isStreaming && msg.content && (
                <div className="flex items-center gap-3 mt-3 pt-2 border-t border-white/5 flex-wrap">
                  <button onClick={() => handleCopy(msg.id, msg.content)}
                    className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-white font-bold uppercase tracking-wider transition-colors">
                    {copiedId === msg.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedId === msg.id ? (t('copied') || 'Copied') : (t('copy') || 'Copy')}
                  </button>
                  {msg.model && (
                    <span className="text-[10px] text-gray-600 font-mono">
                      {models.find(m => m.id === msg.model)?.name || 'GSTD Neural Core'}
                    </span>
                  )}
                  {msg.tokens && (
                    <span className="text-[10px] text-gray-600">
                      {msg.tokens.prompt + msg.tokens.completion} tok
                    </span>
                  )}
                  {msg.cost && (
                    <span className="text-[10px] text-amber-500/60 font-bold">-{msg.cost} GSTD</span>
                  )}
                  {speculativeEnabled && (
                    <span className="flex items-center gap-1 text-[10px] text-cyan-500/40">
                      <Zap size={10} /> Speculative
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {isLoading && messages[messages.length - 1]?.content === '' && !messages[messages.length - 1]?.speculativeContent && (
          <div className="flex gap-3 py-4 px-4">
            <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center">
              <Loader2 size={16} className="text-cyan-400 animate-spin" />
            </div>
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 rounded-full bg-cyan-500/50 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <span className="text-xs font-medium">{t('chat_thinking') || 'Processing on the Grid...'}</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="mt-4 px-2">
        <div className="relative flex items-end gap-2 p-3 rounded-2xl bg-white/[0.03] border border-white/10 focus-within:border-violet-500/30 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat_placeholder') || 'Ask anything... (Shift+Enter for new line)'}
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-gray-500 resize-none outline-none text-sm font-medium max-h-32 min-h-[24px]"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          {isLoading ? (
            <button onClick={stopGeneration} className="flex-shrink-0 p-2.5 rounded-xl bg-red-600/80 hover:bg-red-500 text-white transition-all active:scale-95">
              <div className="w-4 h-4 rounded-sm bg-white" />
            </button>
          ) : (
            <button onClick={sendMessage} disabled={!input.trim()}
              className="flex-shrink-0 p-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white transition-all active:scale-95">
              <Send size={16} />
            </button>
          )}
        </div>
        <p className="text-[10px] text-gray-600 text-center mt-2 font-medium">
          {t('chat_disclaimer') || 'Powered by Sovereign AI • Decentralized LLM network • No data stored'}
        </p>
      </div>
    </div>
  );
}
