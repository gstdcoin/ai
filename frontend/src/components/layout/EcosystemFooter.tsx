import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

export default function EcosystemFooter() {
    const { t } = useTranslation('common');

    const links = [
        { label: t('footer_terms', 'Terms'), href: '/terms', external: false },
        { label: t('footer_privacy', 'Privacy'), href: '/privacy', external: false },
        { label: 'Chat', href: '/chat', external: false },
        { label: 'Bridge', href: '/bridge', external: false },
        { label: 'Swap', href: '/swap', external: false },
        { label: 'Staking', href: '/staking', external: false },
        { label: 'Nodes', href: '/nodes', external: false },
        { label: 'Leaderboard', href: '/leaderboard', external: false },
        { label: 'Stats', href: '/stats', external: false },
        { label: 'Fund', href: '/fund', external: false },
        { label: 'Docs', href: '/docs', external: false },
        { label: 'Developers', href: '/developers', external: false },
        { label: 'Bot', href: 'https://gstdbot.gstdtoken.com', external: true },
        { label: t('footer_telegram', 'Telegram'), href: 'https://t.me/GstdAppBot', external: true },
        { label: t('footer_github', 'GitHub'), href: 'https://github.com/gstdcoin', external: true },
        { label: 'API', href: 'https://api.gstdtoken.com/api/v1/health', external: true },
    ];

    const linkStyle: React.CSSProperties = {
        color: 'rgba(255,255,255,0.35)',
        textDecoration: 'none',
        fontSize: 13,
        padding: '4px 8px',
        borderRadius: 6,
        transition: 'all 0.2s',
    };

    return (
        <footer style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '32px 24px', textAlign: 'center',
            background: 'rgba(3, 0, 20, 0.5)',
            position: 'relative', zIndex: 1,
        }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                {/* Logo line */}
                <div style={{ marginBottom: 20 }}>
                    <span style={{
                        fontWeight: 800, fontSize: 18,
                        background: 'linear-gradient(135deg, #ffd700, #ffa500)',
                        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                    }}>GSTD</span>
                    <span style={{
                        marginLeft: 8, fontSize: 10, fontWeight: 700,
                        padding: '2px 6px', borderRadius: 4,
                        background: 'rgba(255,215,0,0.12)', color: '#ffd700',
                        letterSpacing: 0.5,
                    }}>ECOSYSTEM</span>
                </div>

                {/* Links */}
                <div style={{ display: 'flex', gap: 4, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
                    {links.map((link) => link.external ? (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                            style={linkStyle}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'white';
                                e.currentTarget.style.background = 'rgba(255,215,0,0.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                                e.currentTarget.style.background = 'transparent';
                            }}
                        >{link.label}</a>
                    ) : (
                        <Link key={link.href} href={link.href}
                            style={linkStyle}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.color = 'white';
                                (e.currentTarget.style as any).background = 'rgba(255,215,0,0.05)';
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
                                (e.currentTarget.style as any).background = 'transparent';
                            }}
                        >{link.label}</Link>
                    ))}
                </div>

                {/* Divider */}
                <div style={{ height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)', marginBottom: 16 }} />

                {/* Copyright */}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>
                    © 2026 GSTD — {t('footer_tagline', 'Sovereign Decentralized Computing')} 🐝
                </div>
            </div>
        </footer>
    );
}
