import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState, useEffect, useCallback } from 'react';
import { useTonAddress } from '@tonconnect/ui-react';
import { GetStaticProps } from 'next';
import { Copy, Check, Smartphone } from 'lucide-react';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { API_BASE_URL } from '../lib/config';
import { apiGet } from '../lib/apiClient';

interface NetworkStats {
  active_workers?: number;
  active_nodes?: number;
  total_nodes?: number;
}

interface TierInfo {
  balance_gstd: number;
  pending_gstd: number;
}

const DOCKER_CMD = 'git clone https://github.com/gstdcoin/gstdbot.git && cd gstdbot && docker compose up --build -d';
const SCRIPT_CMD = 'curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | bash';

const COPY = {
  en: {
    title: 'Run a node',
    lead: 'A node serves AI requests with open models on your own hardware. You need a TON wallet address; no GSTD is required to start.',
    online: (n: number) => `${n} node${n === 1 ? '' : 's'} online`,
    none: 'No nodes online yet. The first operators will appear here as soon as they connect.',
    registered: 'registered',
    wallet: 'Wallet',
    balance: 'GSTD balance',
    pending: 'Pending GSTD',
    claim: 'Claim',
    claiming: 'Claiming…',
    claimed: 'Claimed',
    claimFail: 'Claim failed',
    netErr: 'Network error',
    pickTitle: 'Choose how to run it',
    mobileTitle: 'Telegram',
    mobileText: 'Use the bot to chat and manage your account. Opening Telegram does not turn a phone into a compute executor.',
    mobileCta: 'Open in Telegram',
    dockerTitle: 'Docker',
    dockerText: 'Build from source; configure your public wallet and an Ollama endpoint first. Container setup requires separate validation.',
    scriptTitle: 'Install script (Linux / WSL2)',
    scriptText: 'Installs the node, Ollama and a systemd service. Read the script before running it.',
    copy: 'Copy',
    copied: 'Copied',
    earnTitle: 'About rewards',
    earn: 'Rewards are paid in GSTD only for completed and accepted tasks, and depend on how much work the network receives. The amount is not guaranteed, and there are no fixed hourly rates.',
    guide: 'Full setup guide',
    board: 'Leaderboard',
  },
  ru: {
    title: 'Запуск ноды',
    lead: 'Нода обрабатывает ИИ-запросы на открытых моделях на вашем оборудовании. Нужен адрес кошелька TON; GSTD для старта не требуется.',
    online: (n: number) => `Нод онлайн: ${n}`,
    none: 'Нод онлайн пока нет. Первые операторы появятся здесь, как только подключатся.',
    registered: 'зарегистрировано',
    wallet: 'Кошелёк',
    balance: 'Баланс GSTD',
    pending: 'К получению, GSTD',
    claim: 'Забрать',
    claiming: 'Выдача…',
    claimed: 'Получено',
    claimFail: 'Не удалось получить',
    netErr: 'Ошибка сети',
    pickTitle: 'Выберите способ запуска',
    mobileTitle: 'Telegram',
    mobileText: 'Используйте бота для чата и аккаунта. Открытый Telegram не превращает телефон в вычислительную ноду.',
    mobileCta: 'Открыть в Telegram',
    dockerTitle: 'Docker',
    dockerText: 'Сборка из исходников: сначала настройте публичный кошелёк и адрес Ollama. Контейнерная установка требует отдельной проверки.',
    scriptTitle: 'Скрипт установки (Linux / WSL2)',
    scriptText: 'Ставит ноду, Ollama и службу systemd. Прочитайте скрипт перед запуском.',
    copy: 'Копировать',
    copied: 'Скопировано',
    earnTitle: 'О вознаграждении',
    earn: 'Вознаграждение в GSTD платится только за выполненные и принятые задания и зависит от того, сколько работы поступает в сеть. Сумма не гарантируется, фиксированных ставок в час нет.',
    guide: 'Полная инструкция',
    board: 'Лидерборд',
  },
} as const;

function CopyButton({ text, label, done }: { text: string; label: string; done: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={copy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/7 border border-white/12 text-white/70">
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? done : label}
    </button>
  );
}

export default function NodesPage() {
  const { locale } = useRouter();
  const c = locale === 'ru' ? COPY.ru : COPY.en;
  const walletAddress = useTonAddress();
  const [network, setNetwork] = useState<NetworkStats | null>(null);
  const [tier, setTier] = useState<TierInfo | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimMsg, setClaimMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchNetwork = useCallback(async () => {
      if (document.hidden) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/network/stats`);
      if (res.ok) setNetwork(await res.json());
    } catch {
      // keep the previous values
    }
  }, []);

  const fetchTier = useCallback(async () => {
    if (!walletAddress) {
      setTier(null);
      return;
    }
    try {
      setTier(await apiGet<TierInfo>('/credits/balance'));
    } catch {
      setTier(null);
    }
  }, [walletAddress]);

  useEffect(() => {
    fetchNetwork();
    const id = setInterval(fetchNetwork, 120_000);
    return () => clearInterval(id);
  }, [fetchNetwork]);

  useEffect(() => {
    fetchTier();
  }, [fetchTier]);

  const claimRewards = async () => {
    if (!walletAddress || !tier?.pending_gstd) return;
    setClaiming(true);
    setClaimMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/telegram/bot/claim_reward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: walletAddress }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setClaimMsg({ ok: true, text: `${c.claimed} ${data.claimed_net?.toFixed(4) || ''} GSTD` });
        fetchTier();
      } else {
        setClaimMsg({ ok: false, text: data.error || c.claimFail });
      }
    } catch {
      setClaimMsg({ ok: false, text: c.netErr });
    }
    setClaiming(false);
  };

  const online = network?.active_workers ?? network?.active_nodes ?? 0;
  const box = 'rounded-2xl border border-white/10 bg-white/3 p-5';
  const code = 'rounded-lg bg-black/40 px-3 py-2.5 font-mono text-[11.5px] text-cyan-200 break-all leading-relaxed mb-3';

  return (
    <>
      <Head>
        <title>{c.title} — GSTD</title>
        <meta name="description" content={c.lead} />
      </Head>

      <div className="min-h-screen bg-[#030014] text-white pt-16">
        <div className="max-w-3xl mx-auto px-4 pb-20">
          <h1 className="text-4xl font-black mb-3">{c.title}</h1>
          <p className="text-gray-400 mb-6 leading-relaxed">{c.lead}</p>

          {network && (
            <div className={`mb-8 rounded-xl border px-4 py-3 text-sm ${online > 0 ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300' : 'border-amber-500/30 bg-amber-500/5 text-amber-200'}`}>
              {online > 0 ? <strong>{c.online(online)}</strong> : c.none}
              {typeof network.total_nodes === 'number' && <span className="text-gray-400"> · {network.total_nodes} {c.registered}</span>}
            </div>
          )}

          {walletAddress && tier && (
            <div className={`${box} mb-8 flex flex-wrap items-center justify-between gap-4`}>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-1">{c.wallet}</div>
                <div className="font-mono text-sm text-gray-300">{walletAddress.slice(0, 8)}…{walletAddress.slice(-6)}</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-cyan-300">{tier.balance_gstd.toFixed(2)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{c.balance}</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-black text-amber-300">{tier.pending_gstd.toFixed(4)}</div>
                <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{c.pending}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                {tier.pending_gstd > 0.0001 && (
                  <button onClick={claimRewards} disabled={claiming} className="px-4 py-2 rounded-xl border border-amber-400/35 bg-amber-400/15 text-amber-300 font-bold text-sm disabled:opacity-60">
                    {claiming ? c.claiming : c.claim}
                  </button>
                )}
                {claimMsg && <span className={`text-xs ${claimMsg.ok ? 'text-emerald-300' : 'text-red-300'}`}>{claimMsg.text}</span>}
              </div>
            </div>
          )}

          <h2 className="text-xl font-black mb-4">{c.pickTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
            <div className={box}>
              <div className="font-bold mb-1">{c.mobileTitle}</div>
              <p className="text-sm text-gray-400 mb-4 leading-relaxed">{c.mobileText}</p>
              <a
                href="https://t.me/gstdaibot?start=node"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-sm font-bold"
                style={{ textDecoration: 'none' }}
              >
                <Smartphone size={14} /> {c.mobileCta}
              </a>
            </div>

            <div className={box}>
              <div className="font-bold mb-1">{c.dockerTitle}</div>
              <p className="text-sm text-gray-400 mb-3 leading-relaxed">{c.dockerText}</p>
              <div className={code}>{DOCKER_CMD}</div>
              <CopyButton text={DOCKER_CMD} label={c.copy} done={c.copied} />
            </div>

            <div className={box}>
              <div className="font-bold mb-1">{c.scriptTitle}</div>
              <p className="text-sm text-gray-400 mb-3 leading-relaxed">{c.scriptText}</p>
              <div className={code}>{SCRIPT_CMD}</div>
              <CopyButton text={SCRIPT_CMD} label={c.copy} done={c.copied} />
            </div>
          </div>

          <div className={`${box} mb-8`}>
            <div className="font-bold mb-1">{c.earnTitle}</div>
            <p className="text-sm text-gray-400 leading-relaxed">{c.earn}</p>
          </div>

          <div className="flex gap-6 text-sm">
            <Link href="/docs" className="text-cyan-300 font-bold" style={{ textDecoration: 'none' }}>{c.guide} →</Link>
            <Link href="/leaderboard" className="text-cyan-300 font-bold" style={{ textDecoration: 'none' }}>{c.board} →</Link>
          </div>
        </div>
      </div>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
