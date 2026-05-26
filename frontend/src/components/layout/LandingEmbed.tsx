import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { Bot, Zap, ArrowRight, Sparkles } from 'lucide-react';

function clip(s: string, n: number) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n).trim() + '…';
}

/** Compact landing block on ecosystem pages (not on / or /tma). Uses same-origin paths for Next.js. */
export default function LandingEmbed() {
  const { t } = useTranslation('common');
  const router = useRouter();

  if (router.pathname === '/' || router.pathname === '/tma') return null;

  const hive = clip(t('tap_hive_desc', 'Collective AI.'), 120);
  const node = clip(t('become_node_desc', 'Earn with compute.'), 120);
  const gold = clip(t('gold_backed_desc', 'Gold-backed token.'), 120);

  return (
    <section
      className="landing-embed border-b border-white/[0.07] bg-gradient-to-br from-violet-950/40 via-[#040414] to-cyan-950/30 relative z-[2]"
      aria-label={t('landing_embed_aria', 'GSTD overview')}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-3.5">
        <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-5">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] font-bold tracking-wide text-cyan-400/90 mb-1.5">
              <Sparkles size={12} className="shrink-0" aria-hidden />
              {t('depin_compute_protocol_live', 'DePIN Compute Protocol • Live')}
            </div>
            <h2 className="text-base sm:text-lg font-black tracking-tight text-white leading-snug">
              <span className="block sm:inline">{t('corporation_free', 'Corporation-Free AI.')}</span>{' '}
              <span className="bg-gradient-to-r from-violet-300 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                {t('working_humanity', 'Working for Humanity.')}
              </span>
            </h2>
            <p className="text-xs sm:text-sm text-gray-400 mt-1 line-clamp-2 md:line-clamp-3 max-w-3xl">
              {t('hero_desc', 'GSTD forms a decentralized planetary brain.')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Link
              href="/chat"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-cyan-600 text-white text-xs sm:text-sm font-bold shadow-lg shadow-violet-500/15 hover:opacity-95 transition-opacity"
              style={{ textDecoration: 'none' }}
            >
              <Bot size={16} aria-hidden />
              {t('landing_embed_chat', 'Sovereign AI')}
            </Link>
            <a
              href="https://github.com/gstdcoin/gstdbot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] border border-white/10 text-white text-xs sm:text-sm font-bold hover:bg-white/[0.09] transition-colors"
              style={{ textDecoration: 'none' }}
            >
              <Zap size={16} className="text-emerald-400 shrink-0" aria-hidden />
              {t('landing_embed_node', 'Run a node')}
            </a>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold text-cyan-400/90 hover:text-cyan-300 whitespace-nowrap"
              style={{ textDecoration: 'none' }}
            >
              {t('landing_embed_full', 'Full home page')}
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>
        </div>

        <details className="mt-2 md:hidden group border-t border-white/[0.06] pt-2">
          <summary className="list-none cursor-pointer flex items-center justify-between text-[11px] font-bold text-gray-500 uppercase tracking-wider [&::-webkit-details-marker]:hidden">
            <span>{t('landing_embed_features_toggle', 'Why GSTD')}</span>
            <span className="text-cyan-500/80 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 text-[11px] leading-snug">
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5">
              <div className="font-bold text-violet-300 mb-0.5">{t('tap_hive', 'Tap the Hive Mind')}</div>
              <p className="text-gray-500">{hive}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5">
              <div className="font-bold text-emerald-300 mb-0.5">{t('become_node', 'Become a Neural Node')}</div>
              <p className="text-gray-500">{node}</p>
            </div>
            <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-2.5">
              <div className="font-bold text-amber-300 mb-0.5">{t('goldbacked', 'Gold-Backed')}</div>
              <p className="text-gray-500">{gold}</p>
            </div>
          </div>
        </details>

        <div className="hidden md:grid grid-cols-3 gap-2 mt-3 text-[11px] leading-snug border-t border-white/[0.05] pt-2.5">
          <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 border border-white/[0.05]">
            <span className="font-bold text-violet-300">{t('tap_hive', 'Hive')}</span>
            <span className="text-gray-500"> — {clip(t('tap_hive_desc', ''), 90)}</span>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 border border-white/[0.05]">
            <span className="font-bold text-emerald-300">{t('become_node', 'Nodes')}</span>
            <span className="text-gray-500"> — {clip(t('become_node_desc', ''), 90)}</span>
          </div>
          <div className="rounded-lg bg-white/[0.03] px-2 py-1.5 border border-white/[0.05]">
            <span className="font-bold text-amber-300">{t('goldbacked', 'Gold')}</span>
            <span className="text-gray-500"> — {clip(t('gold_backed_desc', ''), 90)}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
