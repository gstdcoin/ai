import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useState, useEffect } from 'react';
import Head from 'next/head';
import {
  Server, Trophy, Flame, Zap, TrendingUp, Clock, Shield,
  ChevronRight, ExternalLink, Star, Cpu, ArrowRight, Users, Smartphone, MessageCircle
} from 'lucide-react';
import { API_BASE_URL } from '../lib/config';

const TIER_STYLES: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  bronze:   { bg: 'rgba(205,127,50,0.08)', border: 'rgba(205,127,50,0.2)', text: '#CD7F32', glow: '0 0 20px rgba(205,127,50,0.15)' },
  silver:   { bg: 'rgba(192,192,192,0.08)', border: 'rgba(192,192,192,0.2)', text: '#C0C0C0', glow: '0 0 20px rgba(192,192,192,0.15)' },
  gold:     { bg: 'rgba(255,215,0,0.08)', border: 'rgba(255,215,0,0.2)', text: '#FFD700', glow: '0 0 20px rgba(255,215,0,0.15)' },
  platinum: { bg: 'rgba(229,228,226,0.08)', border: 'rgba(229,228,226,0.2)', text: '#E5E4E2', glow: '0 0 20px rgba(229,228,226,0.15)' },
  diamond:  { bg: 'rgba(185,242,255,0.08)', border: 'rgba(185,242,255,0.2)', text: '#B9F2FF', glow: '0 0 25px rgba(185,242,255,0.2)' },
};

const TIER_ICONS: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎', diamond: '👑' };

interface TierDef { name: string; min_hours: number; multiplier: number; base_per_hour: number; }
interface LeaderEntry { rank: number; node: string; tier: string; tier_icon: string; streak_days: number; uptime_hours: number; tasks_completed: number; earned_gstd: number; online: boolean; }
interface NetworkData { total_nodes: number; online_nodes: number; total_tasks: number; total_uptime_h: number; total_rewards_gstd: number; today_rewards_gstd: number; tier_distribution: Array<{ tier: string; count: number }>; }

export default function NodesPage() {
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [program, setProgram] = useState<any>(null);
  const [period, setPeriod] = useState('all');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/network`).then(r => r.json()).then(setNetwork).catch(() => {});
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/program`).then(r => r.json()).then(setProgram).catch(() => {});
    fetch(`${API_BASE_URL}/api/v1/nodes/rewards/leaderboard?period=${period}`).then(r => r.json()).then(d => setLeaders(d.leaderboard || [])).catch(() => {});
  }, [period]);

  const tiers: TierDef[] = program?.tiers || [];

  return (
    <>
      <Head>
        <title>Node Rewards — GSTD</title>
        <meta name="description" content="Run a GSTD node and earn rewards. Desktop and mobile nodes with tier system, streak bonuses, and task multipliers." />
      </Head>

      <div style={{ minHeight: '100vh', background: '#030014', paddingTop: 80, fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>

          {/* Hero */}
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 20, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: 14 }}>
              <Server size={14} style={{ color: '#34d399' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', letterSpacing: '0.05em' }}>NODE REWARDS PROGRAM</span>
            </div>
            <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', fontWeight: 900, color: 'white', marginBottom: 10, lineHeight: 1.1 }}>
              Run a Node. <span style={{ background: 'linear-gradient(135deg, #34d399, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Earn GSTD.</span>
            </h1>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', maxWidth: 500, margin: '0 auto 20px' }}>
              Power the decentralized GSTD network and earn rewards for uptime, task completion, and loyalty streaks.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg, #0088cc, #0066aa)', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'all 0.3s' }}>
                <Smartphone size={16} /> Мобильная нода <ExternalLink size={12} />
              </a>
              <a href="https://gstdbot.gstdtoken.com" target="_blank" rel="noopener"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: 'white', fontSize: 14, fontWeight: 700, textDecoration: 'none', transition: 'all 0.3s' }}>
                <Cpu size={16} /> Desktop Node OS <ExternalLink size={12} />
              </a>
            </div>
          </div>

          {/* ═══════════ Mobile Node CTA ═══════════ */}
          <div style={{
            padding: '28px 24px', borderRadius: 20, marginBottom: 32,
            background: 'linear-gradient(135deg, rgba(0,136,204,0.08), rgba(0,136,204,0.02))',
            border: '1px solid rgba(0,136,204,0.15)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'radial-gradient(circle, rgba(0,136,204,0.1), transparent)', pointerEvents: 'none' }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, #0088cc, #0066aa)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Smartphone size={24} style={{ color: 'white' }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, color: 'white', marginBottom: 6 }}>
                  📱 Мобильная нода — прямо в Telegram
                </h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 14, lineHeight: 1.5 }}>
                  Превратите свой смартфон в ноду GSTD. Откройте бота в Telegram → нажмите «Start Node» → зарабатывайте GSTD.
                  CPU, RAM и сеть вашего телефона вносят вклад в децентрализованный рой.
                </p>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
                  {[
                    { icon: '⚡', text: 'Мгновенный старт' },
                    { icon: '💰', text: 'Заработок 24/7' },
                    { icon: '🔗', text: 'Авто-привязка кошелька' },
                    { icon: '📊', text: 'Реальные ресурсы' },
                  ].map(f => (
                    <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                      <span>{f.icon}</span> {f.text}
                    </div>
                  ))}
                </div>
                <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 20px', borderRadius: 10,
                    background: 'linear-gradient(135deg, #0088cc, #006daa)',
                    color: 'white', fontSize: 13, fontWeight: 700, textDecoration: 'none',
                  }}>
                  <MessageCircle size={16} /> Открыть @GstdAppBot <ArrowRight size={14} />
                </a>
              </div>
            </div>
          </div>

          {/* Network Stats */}
          {network && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10, marginBottom: 32 }}>
              {[
                { v: network.total_nodes, l: 'Total Nodes', c: '#60a5fa', i: <Server size={16} /> },
                { v: network.online_nodes, l: 'Online Now', c: '#34d399', i: <Zap size={16} /> },
                { v: network.total_tasks, l: 'Tasks Done', c: '#a78bfa', i: <Shield size={16} /> },
                { v: `${Math.round(network.total_rewards_gstd)}`, l: 'GSTD Earned', c: '#facc15', i: <TrendingUp size={16} /> },
                { v: `${Math.round(network.total_uptime_h)}h`, l: 'Total Uptime', c: '#fb923c', i: <Clock size={16} /> },
              ].map((s, i) => (
                <div key={i} style={{ textAlign: 'center', padding: '14px 8px', borderRadius: 12, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div style={{ color: s.c, marginBottom: 6 }}>{s.i}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>{s.v}</div>
                  <div style={{ fontSize: 9, fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>{s.l}</div>
                </div>
              ))}
            </div>
          )}

          {/* Tier System */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={20} style={{ color: '#FFD700' }} /> Tier System
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tiers.map((t, i) => {
                const s = TIER_STYLES[t.name] || TIER_STYLES.bronze;
                return (
                  <div key={t.name} style={{
                    display: 'flex', alignItems: 'center', padding: '14px 16px', borderRadius: 14,
                    background: s.bg, border: `1px solid ${s.border}`, boxShadow: s.glow,
                    transition: 'all 0.3s',
                  }}>
                    <span style={{ fontSize: 24, marginRight: 12 }}>{TIER_ICONS[t.name]}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: s.text, textTransform: 'capitalize' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                        {t.min_hours > 0 ? `${t.min_hours}+ hours uptime` : 'Starting tier'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: s.text }}>{t.base_per_hour} <span style={{ fontSize: 10, fontWeight: 500 }}>GSTD/h</span></div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{t.multiplier}x multiplier</div>
                    </div>
                    {i < tiers.length - 1 && <ChevronRight size={14} style={{ color: 'rgba(255,255,255,0.15)', marginLeft: 8 }} />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Streak Bonuses */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Flame size={20} style={{ color: '#f97316' }} /> Streak Bonuses
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
              {(program?.streak_bonuses || []).map((s: any) => (
                <div key={s.days} style={{
                  padding: '16px 14px', borderRadius: 14, textAlign: 'center',
                  background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.1)',
                }}>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#fb923c' }}>{s.days}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginBottom: 6 }}>days online</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#34d399' }}>+{s.bonus_percent}%</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Task Rewards */}
          <div style={{ marginBottom: 40 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Zap size={20} style={{ color: '#a78bfa' }} /> Task Rewards
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {(program?.task_rewards || []).sort((a: any, b: any) => b.reward_gstd - a.reward_gstd).map((t: any) => (
                <div key={t.task} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
                }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>{t.task}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>{t.reward_gstd} <span style={{ fontSize: 9 }}>GSTD</span></span>
                </div>
              ))}
            </div>
          </div>

          {/* Leaderboard */}
          <div style={{ marginBottom: 48 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Star size={20} style={{ color: '#facc15' }} /> Leaderboard
              </h2>
              <div style={{ display: 'flex', gap: 4 }}>
                {['all', '30d', '7d', 'today'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: period === p ? 'rgba(139,92,246,0.15)' : 'transparent',
                    color: period === p ? 'white' : 'rgba(255,255,255,0.35)',
                    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                  }}>{p === 'all' ? 'All time' : p}</button>
                ))}
              </div>
            </div>

            {leaders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', borderRadius: 16, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Users size={32} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)' }}>No nodes yet. Be the first!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {leaders.slice(0, 20).map((l, i) => {
                  const ts = TIER_STYLES[l.tier] || TIER_STYLES.bronze;
                  return (
                    <div key={l.rank} style={{
                      display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 12,
                      background: i < 3 ? ts.bg : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${i < 3 ? ts.border : 'rgba(255,255,255,0.04)'}`,
                    }}>
                      <div style={{ width: 28, fontSize: i < 3 ? 16 : 12, fontWeight: 800, color: i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : i === 2 ? '#CD7F32' : 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : `#${l.rank}`}
                      </div>
                      <span style={{ fontSize: 14, marginRight: 6 }}>{l.tier_icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'white', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {l.node}
                          {l.online && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#34d399', marginLeft: 6 }} />}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
                          {l.uptime_hours}h uptime · {l.streak_days}d streak · {l.tasks_completed} tasks
                        </div>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: ts.text }}>{l.earned_gstd.toFixed(2)} <span style={{ fontSize: 9 }}>GSTD</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CTA — Two options */}
          <div style={{
            textAlign: 'center', padding: '40px 24px', borderRadius: 20, marginBottom: 48,
            background: 'linear-gradient(135deg, rgba(139,92,246,0.06), rgba(16,185,129,0.04))',
            border: '1px solid rgba(139,92,246,0.1)',
          }}>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: 'white', marginBottom: 8 }}>Ready to earn?</h3>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
              Choose how to run your GSTD node — from your phone or desktop.
            </p>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              {/* Mobile Node — Telegram */}
              <a href="https://t.me/GstdAppBot" target="_blank" rel="noopener"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '20px 24px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(0,136,204,0.08)', border: '1px solid rgba(0,136,204,0.2)',
                  flex: '1 1 180px', maxWidth: 240, transition: 'all 0.3s',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #0088cc, #0066aa)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Smartphone size={20} style={{ color: 'white' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#5bbfe0' }}>📱 Мобильная нода</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  Запустите в Telegram<br />Мгновенный старт
                </div>
              </a>

              {/* Desktop Node */}
              <a href="https://gstdbot.gstdtoken.com" target="_blank" rel="noopener"
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  padding: '20px 24px', borderRadius: 14, textDecoration: 'none',
                  background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
                  flex: '1 1 180px', maxWidth: 240, transition: 'all 0.3s',
                }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Server size={20} style={{ color: 'white' }} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#a78bfa' }}>🖥 Desktop Node OS</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                  Установите на сервер<br />Максимальный заработок
                </div>
              </a>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '10px 16px', borderRadius: 10, fontFamily: 'monospace', fontSize: 13, color: '#a78bfa', marginBottom: 8 }}>
              curl -fsSL https://gstdbot.gstdtoken.com/install.sh | bash
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>Desktop installation command</div>
          </div>

        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
      `}</style>
    </>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
