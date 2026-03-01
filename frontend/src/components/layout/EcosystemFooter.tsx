import React from 'react';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';

export default function EcosystemFooter() {
    const { t } = useTranslation('common');

    const links = [
        { label: t('footer_dashboard', 'Dashboard'), href: '/dashboard' },
        { label: t('footer_chat', 'Chat'), href: 'https://chat.gstdtoken.com/chat', external: true },
        { label: t('footer_monitor', 'Monitor'), href: 'https://monitor.gstdtoken.com', external: true },
        { label: t('footer_bot', 'GSTD Bot'), href: 'https://gstdbot.gstdtoken.com', external: true },
        { label: t('footer_telegram', 'Telegram'), href: 'https://t.me/GstdAppBot', external: true },
        { label: t('footer_github', 'GitHub'), href: 'https://github.com/gstdcoin', external: true },
        { label: t('api', 'API'), href: 'https://gstdbot.gstdtoken.com/v1/models', external: true },
    ];

    return (
        <footer style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            padding: '32px 24px', textAlign: 'center',
            background: 'rgba(3, 0, 20, 0.5)',
        }}>
            <div style={{ maxWidth: 1200, margin: '0 auto' }}>
                {/* Links */}
                <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
                    {links.map((link) => link.external ? (
                        <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer"
                            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 13, transition: 'color 0.2s' }}
                            onMouseEnter={(e) => e.currentTarget.style.color = 'white'}
                            onMouseLeave={(e) => e.currentTarget.style.color = 'rgba(255,255,255,0.4)'}
                        >{link.label}</a>
                    ) : (
                        <Link key={link.href} href={link.href}
                            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 13, transition: 'color 0.2s' }}
                        >{link.label}</Link>
                    ))}
                </div>

                {/* Copyright */}
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.15)' }}>
                    © 2026 GSTD — {t('footer_tagline', 'Sovereign Decentralized Computing')}
                </div>
            </div>
        </footer>
    );
}
