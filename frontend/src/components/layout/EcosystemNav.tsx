import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
    Home, MessageSquare, Activity, Cpu,
    ExternalLink, Menu, X, ArrowRightLeft, Server, Trophy, Repeat, Landmark,
    Users, Briefcase, Brain
} from 'lucide-react';

interface NavItem {
    key: string;
    href: string;
    icon: React.ReactNode;
    external?: boolean;
    short?: string;
}

export default function EcosystemNav() {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);

    // Close mobile menu on route change
    useEffect(() => {
        setMobileOpen(false);
    }, [router.pathname]);

    // All links must be absolute to work across subdomains (app, monitor, gstdbot)
    const APP_BASE = 'https://app.gstdtoken.com';
    const isOnApp = typeof window !== 'undefined' && window.location.hostname === 'app.gstdtoken.com';

    const navItems: NavItem[] = [
        // Same i18n pattern as other items — label: nav_home ("Home" / главная лендинга)
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

    return (
        <nav style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
            background: 'rgba(3, 0, 20, 0.85)', backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            padding: '0 12px', height: 56,
        }}>
            <div style={{
                maxWidth: 1400, margin: '0 auto', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', height: '100%', gap: '8px'
            }}>
                {/* Logo */}
                <Link href="/" style={{ flexShrink: 0, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src="/logo.png" alt="GSTD" style={{ width: 30, height: 30, borderRadius: '50%' }} />
                    <span style={{
                        fontWeight: 800, fontSize: 17, color: 'white',
                        background: 'linear-gradient(135deg, #ffd700, #ffa500)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>GSTD</span>
                </Link>

                {/* Desktop nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 1, flex: 1, justifyContent: 'center' }} className="ecosystem-nav-desktop">
                    {navItems.map((item) => {
                        const active = isActive(item.href);
                        const label = getLabel(item);
                        return item.external ? (
                            <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer"
                                className="ecosystem-nav-item"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
                                    borderRadius: 7, fontSize: 12, fontWeight: 500, textDecoration: 'none',
                                    color: 'rgba(255,255,255,0.45)', transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {item.icon} <span className="ecosystem-nav-label">{label}</span>
                            </a>
                        ) : (
                            <Link key={item.key} href={item.href}
                                className="ecosystem-nav-item"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 4, padding: '5px 8px',
                                    borderRadius: 7, fontSize: 12, fontWeight: active ? 600 : 500,
                                    textDecoration: 'none',
                                    color: active ? '#ffd700' : 'rgba(255,255,255,0.45)',
                                    background: active ? 'rgba(255,215,0,0.08)' : 'transparent',
                                    transition: 'all 0.2s',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {item.icon} <span className="ecosystem-nav-label">{label}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {/* Language toggle */}
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

                    {/* Wallet */}
                    <div className="ecosystem-nav-wallet">
                        <TonConnectButton />
                    </div>

                    {/* Mobile menu button */}
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="ecosystem-nav-mobile-btn"
                        aria-label="Toggle menu"
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

            {/* Mobile dropdown */}
            {mobileOpen && (
                <>
                <button 
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMobileOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, top: 56, zIndex: 999,
                        background: 'rgba(0,0,0,0.5)', cursor: 'pointer', border: 'none',
                        width: '100%', height: 'calc(100vh - 56px)'
                    }}
                />
                <div style={{
                    position: 'absolute', top: 56, left: 0, right: 0, zIndex: 1000,
                    background: 'rgba(3, 0, 20, 0.97)', backdropFilter: 'blur(24px)',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                    padding: '8px 16px', maxHeight: 'calc(100vh - 56px)',
                    overflowY: 'auto',
                    boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                }}>
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                        gap: 4,
                    }}>
                        {navItems.map((item) => {
                            const fb = item.key.replace('nav_', '');
                            const label = item.short || t(item.key, fb.charAt(0).toUpperCase() + fb.slice(1));
                            const active = isActive(item.href);
                            const Component = item.external ? 'a' : Link;
                            const props = item.external
                                ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
                                : { href: item.href };
                            return (
                                <Component key={item.key} {...(props as any)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 10,
                                        padding: '12px 14px',
                                        fontSize: 14, fontWeight: active ? 600 : 500,
                                        color: active ? '#ffd700' : 'rgba(255,255,255,0.7)',
                                        textDecoration: 'none',
                                        borderRadius: 10,
                                        background: active ? 'rgba(255,215,0,0.08)' : 'rgba(255,255,255,0.03)',
                                        transition: 'all 0.2s',
                                    }}
                                    onClick={() => setMobileOpen(false)}
                                >
                                    {item.icon} {label}
                                </Component>
                            );
                        })}
                    </div>
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
        .ecosystem-nav-desktop::-webkit-scrollbar {
            display: none;
        }
        .ecosystem-nav-item:hover {
            color: #ffd700 !important;
            background: rgba(255,215,0,0.06) !important;
        }
        /* Wide desktop: show full labels */
        @media (min-width: 1301px) {
            .ecosystem-nav-label { display: inline; }
            .ecosystem-nav-item { padding: 5px 10px !important; gap: 5px !important; }
        }
        /* Medium desktop: show shorter labels, compact spacing */
        @media (min-width: 901px) and (max-width: 1300px) {
            .ecosystem-nav-label { display: inline; font-size: 11px !important; }
            .ecosystem-nav-item { padding: 5px 6px !important; gap: 3px !important; font-size: 11px !important; }
        }
        /* Mobile: hide desktop nav, show hamburger */
        @media (max-width: 900px) {
            .ecosystem-nav-desktop { display: none !important; }
            .ecosystem-nav-mobile-btn { display: flex !important; align-items: center; justify-content: center; }
        }
        /* Small mobile: slightly smaller wallet button */
        @media (max-width: 600px) {
            .ecosystem-nav-wallet { transform: scale(0.85); transform-origin: right center; }
            .ecosystem-nav-lang-btn { display: none !important; }
        }
      `}} />
        </nav>
    );
}
