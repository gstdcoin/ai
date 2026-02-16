import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { Send, Bot, User, Loader2, Sparkles, Copy, Check, RotateCcw, Zap, Shield, Crown, Share2 } from 'lucide-react';
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
  powStats?: { swarm_devices: number; workers_gstd: number }; // Public Proof-of-Work
  speculativeContent?: string;
  isStreaming?: boolean;
  verifiedUpTo?: number;
}

interface ChatPanelProps {
  compact?: boolean; // When true, fills parent (e.g. Agent Node layout)
  initialMode?: 'standard' | 'ultra'; // From bot: mode=ultra opens with Ultra selected
}

export default function ChatPanel({ compact, initialMode }: ChatPanelProps = {}) {
  const { t } = useTranslation('common');
  const { gstdBalance, address } = useWalletStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState(
    initialMode === 'ultra' ? 'llama3.3:70b' : 'qwen2.5-coder:7b'
  );
  const [compareMode, setCompareMode] = useState(false);
  const [compareModelA, setCompareModelA] = useState('qwen2.5-coder:7b');
  const [compareModelB, setCompareModelB] = useState('llama3.1:8b');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [speculativeEnabled, setSpeculativeEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const models = [
    { id: 'qwen2.5-coder:7b', name: t('chat_model_fast') || 'Fast', tier: 'Tier 1', desc: t('chat_model_fast_desc') || 'Quick responses', cost: 0.01, ultra: false },
    { id: 'llama3.1:8b', name: t('chat_model_creative') || 'Creative', tier: 'Tier 1', desc: t('chat_model_general') || 'General purpose', cost: 0.01, ultra: false },
    { id: 'qwen2.5-coder:32b', name: t('chat_model_professional') || 'Professional', tier: 'Tier 2', desc: t('chat_model_advanced') || 'Advanced reasoning', cost: 0.05, ultra: true },
    { id: 'llama3.3:70b', name: t('chat_model_ultra') || 'Ultra', tier: 'Tier 3', desc: t('chat_model_powerful') || 'Most powerful', cost: 0.1, ultra: true },
  ];

  const isUltraModel = (modelId: string) => models.find(m => m.id === modelId)?.ultra ?? (modelId.includes('70b') || modelId.includes('deepseek-r1'));

  const [ultraStatus, setUltraStatus] = useState<{
    mode: string;
    ultra_available: boolean;
    staked_gstd: number;
    balance_gstd: number;
    session_cost: number;
    message: string;
    staking_discount?: boolean;
    cost_per_model?: Record<string, number>;
  } | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('session_token');
    const headers: Record<string, string> = token ? { 'X-Session-Token': token } : {};
    if (address) headers['X-GSTD-Target-Wallet'] = address;
    fetch(`${API_BASE_URL}/api/v1/chat/ultra-status`, { headers })
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setUltraStatus(data))
      .catch(() => {});
  }, [gstdBalance, address]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleCopy = (id: string, content: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Viral Sharing: generate share link with PoW text
  const handleShare = (msg: Message) => {
    const devices = msg.powStats?.swarm_devices ?? 1500;
    const shareText = typeof window !== 'undefined'
      ? `${msg.content.slice(0, 200)}${msg.content.length > 200 ? '...' : ''}\n\n— Этот ответ был рассчитан ${devices} смартфонами в сети GSTD. Присоединяйся и зарабатывай золото! ${window.location.origin}/dashboard?tab=chat`
      : `Этот ответ был рассчитан ${devices} смартфонами в сети GSTD. Присоединяйся и зарабатывай золото!`;
    const url = typeof window !== 'undefined' ? `${window.location.origin}/dashboard?tab=chat` : 'https://app.gstdtoken.com/dashboard';
    if (navigator.share && typeof window !== 'undefined') {
      navigator.share({
        title: 'GSTD Swarm',
        text: shareText,
        url,
      }).catch(() => navigator.clipboard.writeText(shareText));
    } else {
      navigator.clipboard.writeText(shareText);
      setCopiedId(msg.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const stopGeneration = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setIsLoading(false);
  };

  const sendToModel = async (model: string, apiMessages: { role: string; content: string }[], signal?: AbortController['signal']): Promise<{ content: string; cost?: number; powStats?: { swarm_devices: number; workers_gstd: number } }> => {
    const token = localStorage.getItem('session_token');
    const res = await fetch(`${API_BASE_URL}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(token ? { 'X-Session-Token': token } : {}),
        ...(address ? { 'X-GSTD-Target-Wallet': address } : {}),
      },
      body: JSON.stringify({ model, messages: apiMessages, stream: false }),
      signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content ?? '';
    const pow = json.gstd_pow;
    const cost = pow?.fee_deducted ?? models.find(m => m.id === model)?.cost ?? 0.01;
    return {
      content,
      cost,
      powStats: pow ? { swarm_devices: pow.swarm_devices ?? 0, workers_gstd: pow.workers_gstd ?? cost * 0.85 } : undefined,
    };
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    const apiMessages = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    if (compareMode) {
      // Model Comparison Mode: send to both models in parallel
      const idA = (Date.now() + 1).toString();
      const idB = (Date.now() + 2).toString();
      const msgA: Message = { id: idA, role: 'assistant', content: '', isStreaming: true, timestamp: new Date(), model: compareModelA };
      const msgB: Message = { id: idB, role: 'assistant', content: '', isStreaming: true, timestamp: new Date(), model: compareModelB };
      setMessages(prev => [...prev, userMsg, msgA, msgB]);
      setInput('');
      setIsLoading(true);
      try {
        const [resultA, resultB] = await Promise.all([
          sendToModel(compareModelA, apiMessages),
          sendToModel(compareModelB, apiMessages),
        ]);
        setMessages(prev => prev.map(m => {
          if (m.id === idA) return { ...m, content: resultA.content, cost: resultA.cost, powStats: resultA.powStats, isStreaming: false };
          if (m.id === idB) return { ...m, content: resultB.content, cost: resultB.cost, powStats: resultB.powStats, isStreaming: false };
          return m;
        }));
      } catch (err: any) {
        setMessages(prev => prev.map(m =>
          m.id === idA || m.id === idB ? { ...m, content: `**Error:** ${err.message}`, isStreaming: false } : m
        ));
      } finally {
        setIsLoading(false);
      }
      return;
    }

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

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = localStorage.getItem('session_token');

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
        const gate = await res.json().catch(() => ({}));
        const isWalletRequired = gate.error === 'wallet_required';
        const isUltraGate = gate.requires_ultra === true || gate.error === 'ultra_gate_required';

        if (isWalletRequired) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? {
              ...m,
              isStreaming: false,
              content: `**${t('chat_wallet_required') || 'Connect Wallet'}**\n\n` +
                `${t('chat_wallet_required_desc') || 'Connect your wallet to use chat. GSTD is deducted per request.'}`,
            } : m
          ));
        } else if (isUltraGate) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? {
              ...m,
              isStreaming: false,
              content: `**${t('ultra_gate_title') || 'Ultra Access Required'}**\n\n` +
                `${t('ultra_gate_message') || 'Ultra models require 100 GSTD staked or 1 GSTD per session.'}\n\n` +
                `- ${t('zbg_deficit') || 'Deficit'}: **${(gate.deficit ?? 1).toFixed(2)} GSTD**\n` +
                `- Staked: **${(gate.staked_gstd ?? 0).toFixed(2)} GSTD** • Balance: **${(gate.balance_gstd ?? 0).toFixed(2)} GSTD**\n\n` +
                `*Connect wallet, stake 100 GSTD, or add 1 GSTD for one Ultra session.*`,
            } : m
          ));
        } else {
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
        }
        setIsLoading(false);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Network error' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      // Consumer Adoption: handle non-streaming JSON response (backend returns gstd_pow)
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json') && !contentType.includes('stream')) {
        const json = await res.json();
        const content = json.choices?.[0]?.message?.content ?? '';
        const pow = json.gstd_pow;
        const cost = pow?.fee_deducted ?? models.find(m => m.id === selectedModel)?.cost ?? 0.01;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? {
            ...m,
            content,
            speculativeContent: '',
            isStreaming: false,
            verifiedUpTo: content.length,
            tokens: json.usage ? { prompt: json.usage.prompt_tokens ?? 0, completion: json.usage.completion_tokens ?? 0 } : undefined,
            cost,
            powStats: pow ? { swarm_devices: pow.swarm_devices ?? 0, workers_gstd: pow.workers_gstd ?? cost * 0.85 } : undefined,
          } : m
        ));
        setIsLoading(false);
        return;
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
              const pow = parsed.gstd_pow;
              const cost = pow?.fee_deducted ?? models.find(m => m.id === selectedModel)?.cost ?? 0.01;
              setMessages(prev => prev.map(m =>
                m.id === assistantId ? {
                  ...m,
                  content: fullContent,
                  speculativeContent: '',
                  isStreaming: false,
                  verifiedUpTo: fullContent.length,
                  tokens: usage ? { prompt: usage.prompt_tokens, completion: usage.completion_tokens } : undefined,
                  cost,
                  powStats: pow ? { swarm_devices: pow.swarm_devices ?? 0, workers_gstd: pow.workers_gstd ?? cost * 0.85 } : undefined,
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
    <div className={`flex flex-col max-w-4xl mx-auto ${compact ? 'h-full min-h-0' : 'h-[calc(100vh-140px)]'}`}>
      {/* Top Bar: Model + Settings */}
      <div className="flex items-center gap-3 mb-4 px-2 flex-wrap">
        <div className="flex items-center gap-2">
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
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border ${
            isUltraModel(selectedModel)
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              : 'bg-white/5 border-white/10 text-gray-400'
          }`}>
            {isUltraModel(selectedModel) ? <Crown size={12} /> : null}
            {isUltraModel(selectedModel) ? (t('chat_mode_ultra') || 'Ultra') : (t('chat_mode_standard') || 'Standard')}
          </span>
        </div>

        {/* Model Comparison Mode */}
        <button
          onClick={() => setCompareMode(!compareMode)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider border transition-all ${
            compareMode ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-gray-500'
          }`}
          title={t('chat_compare_mode') || 'Compare two models side-by-side'}
        >
          {t('chat_compare_mode') || 'Compare'}
        </button>
        {compareMode && (
          <div className="flex items-center gap-2">
            <select value={compareModelA} onChange={(e) => setCompareModelA(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <span className="text-gray-500 text-xs">vs</span>
            <select value={compareModelB} onChange={(e) => setCompareModelB(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-xs text-white">
              {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        )}
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

      {/* Ultra Upgrade Prompt: User selected Ultra but lacks access */}
      {isUltraModel(selectedModel) && ultraStatus && !ultraStatus.ultra_available && (
        <div className="mx-2 mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-3">
          <Crown size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-xs text-amber-300 font-bold mb-1">{t('chat_ultra_upgrade_prompt') || 'Upgrade to Ultra for expert responses'}</p>
            <p className="text-[10px] text-gray-400 leading-relaxed">
              {t('chat_ultra_upgrade_desc') || 'Ultra models (70B, DeepSeek-R1) require 100 GSTD staked or 1 GSTD per session.'}
            </p>
            <p className="text-[10px] text-amber-400/80 mt-1">
              {ultraStatus.message}
            </p>
          </div>
        </div>
      )}

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

        {messages.map((msg, idx) => {
          const prevMsg = messages[idx - 1];
          const nextMsg = messages[idx + 1];
          // Skip second of comparison pair (rendered with first)
          if (msg.role === 'assistant' && prevMsg?.role === 'assistant') return null;
          // Model Comparison: render two consecutive assistant messages side-by-side
          const isComparisonPair = msg.role === 'assistant' && nextMsg?.role === 'assistant';
          if (isComparisonPair) {
            return (
              <div key={msg.id + '-' + nextMsg.id} className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                <div className="flex gap-3 p-4 rounded-2xl bg-cyan-500/5 border border-cyan-500/10">
                  <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-cyan-500/20 flex items-center justify-center"><Bot size={16} className="text-cyan-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-cyan-500/80 font-bold mb-2">{models.find(m => m.id === msg.model)?.name || msg.model}</div>
                    <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/40 [&_code]:text-violet-300"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                    <div className="flex gap-2 mt-2 text-[10px] text-gray-500">
                      {msg.cost != null && (msg.cost > 0 ? <span className="text-amber-500/60">−{msg.cost} GSTD</span> : <span className="text-emerald-500/60">Free</span>)}
                      {msg.powStats && <span>🐝 {msg.powStats.swarm_devices} devices</span>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleCopy(msg.id, msg.content)} className="text-[10px] text-gray-500 hover:text-white">Copy</button>
                      <button onClick={() => handleShare(msg)} className="text-[10px] text-gray-500 hover:text-cyan-400 flex items-center gap-1"><Share2 size={10} /> Share</button>
                    </div>
                  </div>
                </div>
                <div className="flex gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/10">
                  <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center"><Bot size={16} className="text-amber-400" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-amber-500/80 font-bold mb-2">{models.find(m => m.id === nextMsg.model)?.name || nextMsg.model}</div>
                    <div className="prose prose-invert prose-sm max-w-none [&_pre]:bg-black/40 [&_code]:text-violet-300"><ReactMarkdown>{nextMsg.content}</ReactMarkdown></div>
                    <div className="flex gap-2 mt-2 text-[10px] text-gray-500">
                      {nextMsg.cost != null && (nextMsg.cost > 0 ? <span className="text-amber-500/60">−{nextMsg.cost} GSTD</span> : <span className="text-emerald-500/60">Free</span>)}
                      {nextMsg.powStats && <span>🐝 {nextMsg.powStats.swarm_devices} devices</span>}
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => handleCopy(nextMsg.id, nextMsg.content)} className="text-[10px] text-gray-500 hover:text-white">Copy</button>
                      <button onClick={() => handleShare(nextMsg)} className="text-[10px] text-gray-500 hover:text-cyan-400 flex items-center gap-1"><Share2 size={10} /> Share</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (msg.role === 'assistant' && nextMsg?.role === 'assistant' && msg.model === nextMsg.model) return null; // skip second of pair
          return (
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
                  <button onClick={() => handleShare(msg)}
                    className="flex items-center gap-1.5 text-[10px] text-gray-500 hover:text-cyan-400 font-bold uppercase tracking-wider transition-colors"
                    title={t('chat_share_answer') || 'Поделиться ответом'}>
                    <Share2 size={12} />
                    {t('chat_share_answer') || 'Поделиться'}
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
                  {msg.cost != null && (
                    <span className={`text-[10px] font-bold ${msg.cost > 0 ? 'text-amber-500/60' : 'text-emerald-500/60'}`}>
                      {msg.cost > 0 ? `-${msg.cost} GSTD` : 'Free'}
                    </span>
                  )}
                  {msg.powStats && msg.powStats.swarm_devices > 0 && (
                    <span className="text-[10px] text-cyan-500/60" title={t('chat_pow_tooltip') || 'Your request was processed by the Swarm'}>
                      🐝 {msg.powStats.swarm_devices} devices • {msg.powStats.workers_gstd.toFixed(2)} GSTD → workers
                    </span>
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
          );
        })}

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
        {/* Easy-Onboarding: Cost Indicator before sending */}
        <p className="text-[10px] text-center mt-2 font-medium">
          <span className="text-gray-500">{t('chat_disclaimer') || 'Powered by Sovereign AI • Decentralized LLM network • No data stored'}</span>
          {' • '}
          <span className="text-amber-500/80">
            {t('chat_cost_indicator') || 'Cost'}:{' '}
            {(ultraStatus?.cost_per_model?.[selectedModel] ?? models.find(m => m.id === selectedModel)?.cost ?? 0.01).toFixed(2)} GSTD
            {ultraStatus?.staking_discount && (
              <span className="text-emerald-500/80 ml-1">(−10%)</span>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}
