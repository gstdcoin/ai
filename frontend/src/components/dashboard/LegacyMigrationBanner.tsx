'use client';

import { useState, useEffect } from 'react';
import { useWalletStore } from '../../store/walletStore';
import { apiGet } from '../../lib/apiClient';
import { AlertTriangle } from 'lucide-react';

interface LegacyCheckResponse {
  has_legacy: boolean;
  legacy_count: number;
}

export default function LegacyMigrationBanner() {
  const { address } = useWalletStore();
  const [hasLegacy, setHasLegacy] = useState(false);
  const [legacyCount, setLegacyCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!address) {
      setHasLegacy(false);
      setLoading(false);
      return;
    }
    apiGet<LegacyCheckResponse>('/registry/legacy-check', { wallet_address: address })
      .then((r) => {
        setHasLegacy(r.has_legacy ?? false);
        setLegacyCount(r.legacy_count ?? 0);
      })
      .catch(() => setHasLegacy(false))
      .finally(() => setLoading(false));
  }, [address]);

  if (loading || !hasLegacy) return null;

  const handleClick = () => {
    window.dispatchEvent(new CustomEvent('dashboard-tab-change', { detail: 'devices' }));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      className="mb-4 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/15 transition-colors cursor-pointer"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className="flex-shrink-0 w-5 h-5 text-amber-400 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-200">
            Обнаружены устаревшие ноды. Нажмите здесь, чтобы обновить их до Unified Identity и сохранить доступ к выплатам.
          </p>
          {legacyCount > 0 && (
            <p className="text-xs text-amber-300/80 mt-1">
              {legacyCount} {legacyCount === 1 ? 'устройство' : 'устройства'} требуют миграции
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
