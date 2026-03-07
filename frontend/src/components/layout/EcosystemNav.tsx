import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { TonConnectButton } from '@tonconnect/ui-react';
import {
    LayoutDashboard, MessageSquare, Activity, Bot,
    ExternalLink, Menu, X, Package, Server
} from 'lucide-react';

interface NavItem {
    key: string;
    href: string;
    icon: React.ReactNode;
    external?: boolean;
}

export default function EcosystemNav() {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [mobileOpen, setMobileOpen] = useState(false);

    // All links must be absolute to work across subdomains (app, monitor, gstdbot)
    const APP_BASE = 'https://app.gstdtoken.com';
    const isOnApp = typeof window !== 'undefined' && window.location.hostname === 'app.gstdtoken.com';

    const navItems: NavItem[] = [
        { key: 'nav_dashboard', href: `${APP_BASE}/dashboard`, icon: <LayoutDashboard size={16} />, external: !isOnApp },
        { key: 'nav_chat', href: `${APP_BASE}/chat`, icon: <MessageSquare size={16} />, external: !isOnApp },
        { key: 'nav_appstore', href: `${APP_BASE}/appstore`, icon: <Package size={16} />, external: !isOnApp },
        { key: 'nav_node', href: `${APP_BASE}/node`, icon: <Server size={16} />, external: !isOnApp },
        { key: 'nav_monitor', href: 'https://monitor.gstdtoken.com', icon: <Activity size={16} />, external: true },
        { key: 'nav_bot', href: 'https://gstdbot.gstdtoken.com', icon: <Bot size={16} />, external: true },
        { key: 'nav_telegram', href: 'https://t.me/GstdAppBot', icon: <ExternalLink size={14} />, external: true },
    ];

    const isActive = (href: string) => {
        const path = router.pathname;
        if (href.includes('/dashboard') && path === '/dashboard') return true;
        if (href.includes('/chat') && path === '/chat') return true;
        if (href.includes('/appstore') && path === '/appstore') return true;
        if (href.includes('/node') && path.startsWith('/node')) return true;
        if (href.includes('monitor.gstdtoken.com') && typeof window !== 'undefined' && window.location.hostname === 'monitor.gstdtoken.com') return true;
        return false;
    };

    const changeLang = () => {
        router.push(router.pathname, router.asPath, { locale: router.locale === 'ru' ? 'en' : 'ru' });
    };

    return (
        <nav style={{
            position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
            background: 'var(--g-color-base-float)', backdropFilter: 'blur(20px)',
            borderBottom: '1px solid var(--g-color-line-generic)',
            padding: '0 16px', height: 56,
        }}>
            <div style={{
                maxWidth: 1200, margin: '0 auto', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between', height: '100%',
            }}>
                {/* Logo */}
                <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src="/logo.png" alt="GSTD" style={{ width: 32, height: 32, borderRadius: '50%' }} />
                    <span style={{
                        fontWeight: 800, fontSize: 18, color: 'var(--g-color-brand)',
                    }}>GSTD</span>
                    <span style={{
                        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
                        background: 'var(--g-color-brand-light)', color: 'var(--g-color-brand)',
                        letterSpacing: 0.5,
                    }}>{t('ecosystem', 'ECOSYSTEM')}</span>
                </Link>

                {/* Desktop nav */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }} className="ecosystem-nav-desktop">
                    {navItems.map((item) => {
                        const active = isActive(item.href);
                        const label = t(item.key, item.key.replace('nav_', ''));
                        return item.external ? (
                            <a key={item.key} href={item.href} target="_blank" rel="noopener noreferrer"
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                                    borderRadius: 8, fontSize: 13, fontWeight: 500, textDecoration: 'none',
                                    color: 'rgba(255,255,255,0.5)', transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                                onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.5)'}
                            >
                                {item.icon} {label}
                            </a>
                        ) : (
                            <Link key={item.key} href={item.href}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
                                    borderRadius: 8, fontSize: 13, fontWeight: active ? 600 : 500,
                                    textDecoration: 'none',
                                    color: active ? 'var(--g-color-brand)' : 'var(--g-color-text-secondary)',
                                    background: active ? 'var(--g-color-brand-light)' : 'transparent',
                                    transition: 'all 0.2s',
                                }}
                            >
                                {item.icon} {label}
                            </Link>
                        );
                    })}
                </div>

                {/* Right side */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {/* Language toggle */}
                    <button onClick={changeLang} style={{
                        background: 'transparent', border: '1px solid var(--g-color-line-generic)',
                        borderRadius: 6, padding: '4px 8px', fontSize: 11, fontWeight: 600,
                        color: 'var(--g-color-text-secondary)', cursor: 'pointer', transition: 'all 0.2s',
                    }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--g-color-brand)'; e.currentTarget.style.borderColor = 'var(--g-color-brand-light)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--g-color-text-secondary)'; e.currentTarget.style.borderColor = 'var(--g-color-line-generic)'; }}
                    >
                        {router.locale === 'ru' ? 'EN' : 'RU'}
                    </button>

                    {/* Wallet */}
                    <TonConnectButton />

                    {/* Mobile menu */}
                    <button onClick={() => setMobileOpen(!mobileOpen)} className="ecosystem-nav-mobile-btn"
                        style={{
                            display: 'none', background: 'transparent', border: 'none',
                            color: 'white', cursor: 'pointer', padding: 4,
                        }}>
                        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
                    </button>
                </div>
            </div>

            {/* Mobile dropdown */}
            {mobileOpen && (
                <div style={{
                    position: 'absolute', top: 56, left: 0, right: 0,
                    background: 'var(--g-color-base-modal)', backdropFilter: 'blur(20px)',
                    borderBottom: '1px solid var(--g-color-line-generic)', padding: '8px 16px',
                }}>
                    {navItems.map((item) => {
                        const label = t(item.key, item.key.replace('nav_', ''));
                        const Component = item.external ? 'a' : Link;
                        const props = item.external
                            ? { href: item.href, target: '_blank', rel: 'noopener noreferrer' }
                            : { href: item.href };
                        return (
                            <Component key={item.key} {...(props as any)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0',
                                    fontSize: 14, color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
                                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                                }}
                                onClick={() => setMobileOpen(false)}
                            >
                                {item.icon} {label}
                            </Component>
                        );
                    })}
                </div>
            )}

            <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 768px) {
          .ecosystem-nav-desktop { display: none !important; }
          .ecosystem-nav-mobile-btn { display: block !important; }
        }
      ` }} />
        </nav>
    );
}
