import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
    Home, MessageSquare, Activity, Cpu,
    ExternalLink, Menu, X, ArrowRightLeft, Server, Trophy, Repeat, Landmark,
    Users, Briefcase, Brain, ChevronDown,
} from 'lucide-react';

interface NavItem {
    key: string;
    href: string;
    icon: React.ReactNode;
    external?: boolean;
    short?: string;
}

const PRIMARY_KEYS = [
    'nav_home', 'nav_chat', 'nav_bridge', 'nav_swap', 'nav_staking',
    'nav_nodes', 'nav_stats', 'nav_leaderboard',
] as const;

const MORE_KEYS = [
    'nav_operator', 'nav_referrals', 'nav_monitor', 'nav_predictions',
    'nav_fund', 'nav_developers', 'nav_telegram',
] as const;

type SectionDef = { titleKey: string; keys: readonly string[] };

const MOBILE_SECTIONS: SectionDef[] = [
    { titleKey: 'nav_section_core', keys: ['nav_home', 'nav_chat', 'nav_bridge', 'nav_swap', 'nav_staking'] },
    { titleKey: 'nav_section_network', keys: ['nav_nodes', 'nav_stats', 'nav_leaderboard', 'nav_operator', 'nav_referrals'] },
    { titleKey: 'nav_section_explore', keys: ['nav_monitor', 'nav_predictions', 'nav_fund', 'nav_developers', 'nav_telegram'] },
];

export default function EcosystemNav() {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);
    const [moreOpen, setMoreOpen] = useState(false);
    const moreRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const close = () => {
            setMobileOpen(false);
            setMoreOpen(false);
        };
        router.events.on('routeChangeComplete', close);
        return () => {
            router.events.off('routeChangeComplete', close);
        };
    }, [router.events]);

    useEffect(() => {
        const onDoc = (e: MouseEvent) => {
            if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMoreOpen(false);
        };
        document.addEventListener('mousedown', onDoc);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDoc);
            document.removeEventListener('keydown', onKey);
        };
    }, []);

    const APP_BASE = 'https://app.gstdtoken.com';
    const isOnApp = typeof window !== 'undefined' && window.location.hostname === 'app.gstdtoken.com';

    const allItems: NavItem[] = [
        { key: 'nav_home', href: isOnApp ? '/' : APP_BASE, icon: <Home size={15} />, external: !isOnApp },
        { key: 'nav_chat', href: `${APP_BASE}/chat`, icon: <MessageSquare size={15} />, external: !isOnApp, short: 'Chat' },
        { key: 'nav_operator', href: `${APP_BASE}/operator`, icon: <Cpu size={15} />, external: !isOnApp, short: 'Operator' },
        { key: 'nav_bridge', href: `${APP_BASE}/bridge`, icon: <ArrowRightLeft size={15} />, external: !isOnApp, short: 'Bridge' },
        { key: 'nav_swap', href: `${APP_BASE}/swap`, icon: <Repeat size={15} />, external: !isOnApp, short: 'Swap' },
        { key: 'nav_staking', href: `${APP_BASE}/staking`, icon: <Landmark size={15} />, external: !isOnApp, short: 'Staking' },
        { key: 'nav_nodes', href: `${APP_BASE}/nodes`, icon: <Server size={15} />, external: !isOnApp, short: 'Nodes' },
        { key: 'nav_referrals', href: `${APP_BASE}/referrals`, icon: <Users size={15} />, external: !isOnApp, short: 'Referrals' },
        { key: 'nav_leaderboard', href: `${APP_BASE}/leaderboard`, icon: <Trophy size={15} />, external: !isOnApp, short: 'Leaders' },
        { key: 'nav_stats', href: `${APP_BASE}/stats`, icon: <Activity size={15} />, external: !isOnApp, short: 'Stats' },
        { key: 'nav_monitor', short: 'Simulations', href: `${APP_BASE}/monitor`, icon: <Briefcase size={15} />, external: !isOnApp },
        { key: 'nav_predictions', short: 'Signals', href: `${APP_BASE}/predictions`, icon: <Brain size={15} />, external: !isOnApp },
        { key: 'nav_fund', short: 'Fund', href: `${APP_BASE}/fund`, icon: <Landmark size={15} />, external: !isOnApp },
        { key: 'nav_developers', short: 'Developers', href: `${APP_BASE}/developers`, icon: <Server size={15} />, external: !isOnApp },
        { key: 'nav_telegram', href: 'https://t.me/GstdAppBot', icon: <ExternalLink size={13} />, external: true, short: 'TG' },
    ];

    const byKey = Object.fromEntries(allItems.map((i) => [i.key, i])) as Record<string, NavItem>;
    const primaryItems = PRIMARY_KEYS.map((k) => byKey[k]).filter(Boolean);
    const moreItems = MORE_KEYS.map((k) => byKey[k]).filter(Boolean);

    const isActive = (href: string) => {
        const path = router.pathname;
        if (href === '/' || href === APP_BASE) return path === '/';
        const segments = ['/chat', '/bridge', '/swap', '/staking', '/nodes', '/leaderboard', '/stats', '/monitor', '/predictions', '/operator', '/referrals', '/fund', '/developers', '/hive', '/downloads', '/about', '/docs'];
        for (const seg of segments) {
            if (href.includes(seg) && (path === seg || path.startsWith(seg + '/'))) return true;
        }
        return false;
    };

    const changeLang = () => {
        router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
    };

    const getLabel = (item: NavItem) => {
        const fallback = item.key.replace('nav_', '');
        return item.short || t(item.key, fallback.charAt(0).toUpperCase() + fallback.slice(1));
    };

    const renderNavLink = (item: NavItem, opts?: { compact?: boolean }) => {
        const active = isActive(item.href);
        const label = getLabel(item);
        const baseStyle: React.CSSProperties = {
            display: 'flex',
            alignItems: 'center',
            gap: opts?.compact ? 6 : 4,
            padding: opts?.compact ? '10px 12px' : '5px 8px',
            borderRadius: 7,
            fontSize: opts?.compact ? 13 : 12,
            fontWeight: active ? 600 : 500,
            textDecoration: 'none',
            color: active ? '#ffd700' : 'rgba(255,255,255,0.45)',
            background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
            transition: 'all 0.2s',
            whiteSpace: 'nowrap',
        };
        if (item.external) {
            return (
                <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" className="ecosystem-nav-item" style={{ ...baseStyle, color: 'rgba(255,255,255,0.45)', fontWeight: 500 }}>
                    {item.icon} <span className="ecosystem-nav-label">{label}</span>
                </a>
            );
        }
        return (
            <Link key={item.key} href={item.href} className="ecosystem-nav-item" style={baseStyle}>
                {item.icon} <span className="ecosystem-nav-label">{label}</span>
            </Link>
        );
    };

    const moreMenuHasActive = moreItems.some((item) => isActive(item.href));

    return (
        <nav style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
            background: 'rgba(3, 0, 20, 0.85)', backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '0 12px', height: 56,
        }}>
            <div style={{
                maxWidth: 1400, margin: '0 auto', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', height: '100%', gap: '8px',
            }}>
                <Link href="/" style={{ flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src="/logo.png" alt="GSTD" style={{ width: 30, height: 30, borderRadius: '50%' }} />
                    <span style={{
                        fontWeight: 800, fontSize: 17, color: 'white',
                        background: 'linear-gradient(135deg, #ffd700, #ffa500)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>GSTD</span>
                </Link>

                <div style={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'center', minWidth: 0 }} className="ecosystem-nav-desktop">
                    {primaryItems.map((item) => renderNavLink(item))}
                    <div ref={moreRef} style={{ position: 'relative', flexShrink: 0 }}>
                        <button
                            type="button"
                            className="ecosystem-nav-item ecosystem-nav-more-btn"
                            aria-expanded={moreOpen}
                            aria-haspopup="true"
                            onClick={() => setMoreOpen((v) => !v)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                                borderRadius: 7, fontSize: 12, fontWeight: moreMenuHasActive ? 600 : 500,
                                color: moreMenuHasActive ? '#ffd700' : 'rgba(255,255,255,0.45)',
                                background: moreMenuHasActive ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                cursor: 'pointer', whiteSpace: 'nowrap',
                            }}
                        >
                            <ChevronDown size={14} style={{ opacity: 0.85 }} aria-hidden />
                            <span className="ecosystem-nav-label">{t('nav_more', 'More')}</span>
                        </button>
                        {moreOpen && (
                            <div
                                role="menu"
                                style={{
                                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                                    minWidth: 220, maxHeight: 'min(70vh, 420px)', overflowY: 'auto',
                                    background: 'rgba(8, 6, 28, 0.98)', backdropFilter: 'blur(20px)',
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12,
                                    padding: 8, boxShadow: '0 20px 50px rgba(0,0,0,0.55)', zIndex: 1002,
                                }}
                            >
                                {moreItems.map((item) => {
                                    const active = isActive(item.href);
                                    const label = getLabel(item);
                                    const rowStyle: React.CSSProperties = {
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '10px 12px', borderRadius: 8, fontSize: 13,
                                        fontWeight: active ? 600 : 500,
                                        color: active ? '#ffd700' : 'rgba(255,255,255,0.85)',
                                        textDecoration: 'none', width: '100%', boxSizing: 'border-box',
                                        background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
                                    };
                                    if (item.external) {
                                        return (
                                            <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer" role="menuitem" style={rowStyle} onClick={() => setMoreOpen(false)}>
                                                {item.icon}{label}
                                            </a>
                                        );
                                    }
                                    return (
                                        <Link key={item.key} href={item.href} role="menuitem" style={rowStyle} onClick={() => setMoreOpen(false)}>
                                            {item.icon}{label}
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <button onClick={changeLang} className="ecosystem-nav-lang-btn" style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600,
                        color: 'rgba(255,255,255,0.5)', cursor: 'pointer', transition: 'all 0.2s',
                    }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
                    >
                        {router.locale === 'ru' ? 'EN' : 'RU'}
                    </button>

                    <div className="ecosystem-nav-wallet">
                        <TonConnectButton />
                    </div>

                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="ecosystem-nav-mobile-btn"
                        aria-label="Toggle menu"
                        aria-expanded={mobileOpen}
                        style={{
                            display: 'none', background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 8, color: 'white', cursor: 'pointer',
                            padding: 6, lineHeight: 0,
                        }}
                    >
                        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                    </button>
                </div>
            </div>

            {mobileOpen && (
                <>
                    <button
                        type="button"
                        aria-label="Close menu"
                        onClick={() => setMobileOpen(false)}
                        style={{
                            position: 'fixed', inset: 0, top: 56, zIndex: 999,
                            background: 'rgba(0,0,0,0.5)', cursor: 'pointer', border: 'none',
                            width: '100%', height: 'calc(100vh - 56px)',
                        }}
                    />
                    <div
                        className="ecosystem-nav-mobile-panel"
                        style={{
                            position: 'absolute', top: 56, left: 0, right: 0, zIndex: 1000,
                            background: 'rgba(3, 0, 20, 0.98)', backdropFilter: 'blur(24px)',
                            borderBottom: '1px solid rgba(255,255,255,0.08)',
                            padding: '10px 14px', maxHeight: 'calc(100vh - 56px)',
                            overflowY: 'auto',
                            WebkitOverflowScrolling: 'touch',
                            boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                        }}
                    >
                        {MOBILE_SECTIONS.map((section) => (
                            <div key={section.titleKey} style={{ marginBottom: 14 }}>
                                <div style={{
                                    fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
                                    color: 'rgba(255,255,255,0.35)', padding: '6px 4px 8px',
                                }}>
                                    {t(section.titleKey, section.titleKey)}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                                    {section.keys.map((key) => {
                                        const item = byKey[key];
                                        if (!item) return null;
                                        const label = getLabel(item);
                                        const active = isActive(item.href);
                                        const cellStyle: React.CSSProperties = {
                                            display: 'flex', alignItems: 'center', gap: 10,
                                            padding: '12px 12px',
                                            fontSize: 14, fontWeight: active ? 600 : 500,
                                            color: active ? '#ffd700' : 'rgba(255,255,255,0.75)',
                                            textDecoration: 'none',
                                            borderRadius: 10,
                                            background: active ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.04)',
                                            minHeight: 48,
                                        };
                                        if (item.external) {
                                            return (
                                                <a
                                                    key={item.key}
                                                    href={item.href}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={cellStyle}
                                                    onClick={() => setMobileOpen(false)}
                                                >
                                                    {item.icon}{' '}
                                                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                                                </a>
                                            );
                                        }
                                        return (
                                            <Link key={item.key} href={item.href} style={cellStyle} onClick={() => setMobileOpen(false)}>
                                                {item.icon}{' '}
                                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
        .ecosystem-nav-desktop {
            overflow-x: auto;
            white-space: nowrap;
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
        .ecosystem-nav-desktop::-webkit-scrollbar { display: none; }
        .ecosystem-nav-item:hover {
            color: #ffd700 !important;
            background: rgba(255,215,0,0.06) !important;
        }
        .ecosystem-nav-more-btn:hover {
            color: #ffd700 !important;
            border-color: rgba(255,215,0,0.25) !important;
        }
        @media (min-width: 1301px) {
            .ecosystem-nav-label { display: inline; }
            .ecosystem-nav-item { padding: 5px 10px !important; gap: 5px !important; }
        }
        @media (min-width: 901px) and (max-width: 1300px) {
            .ecosystem-nav-label { display: inline; font-size: 11px !important; }
            .ecosystem-nav-item { padding: 5px 6px !important; gap: 3px !important; font-size: 11px !important; }
            .ecosystem-nav-more-btn { padding: 5px 8px !important; font-size: 11px !important; }
        }
        @media (max-width: 900px) {
            .ecosystem-nav-desktop { display: none !important; }
            .ecosystem-nav-mobile-btn { display: flex !important; align-items: center; justify-content: center; }
        }
        @media (max-width: 600px) {
            .ecosystem-nav-wallet { transform: scale(0.85); transform-origin: right center; }
            .ecosystem-nav-lang-btn { display: none !important; }
        }
      `}} />
        </nav>
    );
}
