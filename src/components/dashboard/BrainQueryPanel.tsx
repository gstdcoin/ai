'use client';
import { useTranslation } from 'next-i18next';

import { useState } from 'react';
import { Brain, Search, DollarSign, ChevronDown, ChevronUp } from 'lucide-react';
import { apiPost, ApiError } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { toast } from '../../lib/toast';

interface KnowledgeItem {
  id: string;
  agent_id: string;
  topic: string;
  content: string;
  created_at: string;
}

interface BrainQueryResponse {
  status: string;
  topic: string;
  results: KnowledgeItem[];
  paid_gstd: number;
  message: string;
}

export default function BrainQueryPanel() {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [topic, setTopic] = useState('');
  const [limit, setLimit] = useState(10);
  const [amountGstd, setAmountGstd] = useState(0.05);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<KnowledgeItem[] | null>(null);
  const [lastPaid, setLastPaid] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(true);

  const handleQuery = async () => {
    if (!address) {
      toast.error('Connect Wallet', 'Please connect your wallet to query knowledge.');
      return;
    }
    if (!topic.trim()) {
      toast.error('Topic Required', 'Enter a topic to search the Hive Memory.');
      return;
    }
    setLoading(true);
    setResults(null);
    setLastPaid(null);
    try {
      const res = await apiPost<BrainQueryResponse>('/brain/query', {
        topic: topic.trim(),
        limit: Math.min(50, Math.max(1, limit)),
        amount_gstd: Math.max(0.01, amountGstd),
      });
      setResults(res.results || []);
      setLastPaid(res.paid_gstd ?? null);
      toast.success('Knowledge Accessed', res.message || 'Revenue directed to Gold Pool.');
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 402) {
        toast.error('Insufficient GSTD', 'Top up your wallet or become a Node to earn GSTD.');
        return;
      }
      toast.error('Query Failed', err?.message || 'Failed to query knowledge.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glass-card p-6 border-amber-500/20 bg-gradient-to-br from-amber-500/[0.06] to-transparent">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between text-left"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Brain size={22} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">{t('brain_query', 'Brain Query')}</h3>
            <p className="text-[10px] text-amber-500/70">Paid knowledge access → Gold Pool</p>
          </div>
        </div>
        {expanded ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="mt-5 space-y-4">
          <div>
            <label className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider block mb-1.5">{t('topic', 'Topic')}</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. grid_tool, resonance_report, DePIN"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white placeholder-gray-500 text-sm focus:border-amber-500/40 focus:ring-1 focus:ring-amber-500/20 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider block mb-1.5">{t('limit', 'Limit')}</label>
              <input
                type="number"
                min={1}
                max={50}
                value={limit}
                onChange={(e) => setLimit(parseInt(e.target.value, 10) || 10)}
                className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:border-amber-500/40 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-amber-500/80 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <DollarSign size={12} />{t('amount_gstd', 'Amount (GSTD)')}</label>
              <input
                type="number"
                min={0.01}
                step={0.01}
                value={amountGstd}
                onChange={(e) => setAmountGstd(parseFloat(e.target.value) || 0.01)}
                className="w-full px-4 py-2.5 rounded-xl bg-black/30 border border-white/10 text-white text-sm focus:border-amber-500/40 outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleQuery}
            disabled={loading || !topic.trim()}
            className="w-full py-3 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 font-bold text-sm uppercase tracking-wider hover:bg-amber-500/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="animate-pulse">{t('querying', 'Querying...')}</span>
            ) : (
              <>Query Knowledge · Min 0.01 GSTD</>
            )}
          </button>

          {lastPaid != null && (
            <p className="text-[10px] text-amber-500/70 text-center">
              Paid {lastPaid.toFixed(2)} GSTD → Gold Pool
            </p>
          )}

          {results && results.length > 0 && (
            <div className="mt-4 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
              <p className="text-[10px] font-bold text-amber-500/80 uppercase">{t('results', 'Results')}</p>
              {results.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-lg bg-black/20 border border-white/5 text-left"
                >
                  <span className="text-[10px] text-amber-500/70">{item.topic}</span>
                  <p className="text-xs text-gray-300 mt-1 line-clamp-3">{item.content}</p>
                </div>
              ))}
            </div>
          )}
          {results && results.length === 0 && (
            <p className="text-xs text-gray-500 text-center py-2">{t('no_knowledge', 'No knowledge found for this topic.')}</p>
          )}
        </div>
      )}
    </div>
  );
}
