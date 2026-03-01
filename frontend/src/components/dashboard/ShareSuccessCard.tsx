'use client';

import { useRef, useState, useEffect } from 'react';
import { Share2, Download, Loader2 } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { useWalletStore } from '../../store/walletStore';
import { toast } from '../../lib/toast';
import html2canvas from 'html2canvas';
import { useTranslation } from 'next-i18next';

interface WorkerStats {
  total_tasks_completed?: number;
  total_earnings_gstd?: number;
}

export default function ShareSuccessCard() {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const cardRef = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState<WorkerStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    apiGet<WorkerStats>('/marketplace/worker/stats', { wallet: address })
      .then(setStats)
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, [address]);

  const exportImage = async () => {
    if (!cardRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(cardRef.current, {
        backgroundColor: '#030014',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png', 1)
      );
      if (!blob) throw new Error('Failed to create image');

      if (navigator.share && navigator.canShare?.({ files: [new File([blob], 'gstd-success.png', { type: 'image/png' })] })) {
        await navigator.share({
          title: t('gstd_depin__my_success', 'GSTD DePIN — My Success'),
          text: `Hashrate: ${stats?.total_tasks_completed ?? 0} tasks • Gold: ${(stats?.total_earnings_gstd ?? 0).toFixed(2)} GSTD`,
          files: [new File([blob], 'gstd-success.png', { type: 'image/png' })],
        });
        toast.success('Shared!', 'Success card shared to Telegram Stories or other apps');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a', 'a');
        a.href = url;
        a.download = 'gstd-success.png';
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Downloaded!', 'Card saved as gstd-success.png');
      }
    } catch (err: any) {
      toast.error('Export failed', err?.message || 'Could not generate image');
    } finally {
      setExporting(false);
    }
  };

  if (!address) return null;

  const tasks = stats?.total_tasks_completed ?? 0;
  const gold = stats?.total_earnings_gstd ?? 0;

  return (
    <div className="space-y-3">
      <button
        onClick={exportImage}
        disabled={loading || exporting}
        className="w-full glass-button-gold min-h-[48px] flex items-center justify-center gap-2 font-black uppercase tracking-widest"
      >
        {exporting ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Share2 className="w-5 h-5" />
        )}
        {exporting ? 'Generating...' : 'Share Success'}
      </button>

      {/* Hidden card for export (styled for Stories: 9:16) */}
      <div
        ref={cardRef}
        className="absolute -left-[9999px] w-[360px] h-[640px] overflow-hidden rounded-2xl"
        style={{
          background: 'linear-gradient(135deg, #030014 0%, #1a0a2e 50%, #0d0d1a 100%)',
          border: '2px solid rgba(251, 191, 36, 0.3)',
        }}
      >
        <div className="p-8 h-full flex flex-col justify-between">
          <div>
            <div className="text-amber-400/80 text-xs font-black uppercase tracking-[0.3em] mb-2">{t('gstd_depin', 'GSTD DePIN')}</div>
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">{t('my_success', 'My Success')}</h2>
          </div>
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div className="text-amber-400/70 text-[10px] font-black uppercase tracking-widest mb-1">{t('hashrate', 'Hashrate')}</div>
              <div className="text-4xl font-black text-white tabular-nums">
                {tasks.toLocaleString()} tasks
              </div>
            </div>
            <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <div className="text-amber-400/70 text-[10px] font-black uppercase tracking-widest mb-1">{t('gold_accumulated', 'Gold Accumulated')}</div>
              <div className="text-4xl font-black text-amber-400 tabular-nums">
                {gold.toFixed(2)} GSTD
              </div>
            </div>
          </div>
          <div className="text-[10px] text-gray-500 font-bold">
            Join the Grid • app.gstdtoken.com
          </div>
        </div>
      </div>
    </div>
  );
}
