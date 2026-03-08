import React from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { LogOut } from 'lucide-react';
import { useRouter } from 'next/router';
import LanguageSwitcher from './LanguageSwitcher';
import { wsClient } from '../../lib/websocket';

interface HeaderProps {
  onLogout: () => void;
  isPublic?: boolean;
}

const NAV_ITEMS = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'chat', href: '/chat', label: 'Chat' },
];

export default React.memo(function Header({ onLogout, isPublic = false }: HeaderProps) {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { address, tonBalance, gstdBalance } = useWalletStore();
  const [isWsConnected, setIsWsConnected] = React.useState(false);

  React.useEffect(() => {
    const checkConn = () => {
      setIsWsConnected(wsClient.isConnected());
    };
    checkConn();
    const interval = setInterval(checkConn, 2000);
    return () => clearInterval(interval);
  }, []);

  const isActive = (href: string) => {
    if (href === '/dashboard') return router.pathname === '/dashboard' || router.pathname === '/';
    return router.pathname.startsWith(href);
  };

  if (isPublic) {
    return (
      <header
        className="sticky top-0 z-30"
        style={{
          background: 'var(--g-color-base-float)',
          borderBottom: '1px solid var(--g-color-line-generic)',
        }}
      >
        <div className="flex items-center justify-between px-4 sm:px-6" style={{ height: 56 }}>
          <a href="/" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
            <img src="/logo.png" alt="GSTD" className="w-9 h-9 rounded-full" />
            <span className="text-lg font-bold" style={{ color: 'var(--g-color-brand)' }}>
              GSTD
              <span className="text-sm font-normal ml-2" style={{ color: 'var(--g-color-text-hint)' }}>
                {t('documentation', 'Documentation')}
              </span>
            </span>
          </a>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <a
              href="/"
              className="g-btn g-btn--outline g-btn--s"
            >
              {t('back_to_platform', 'Back to Platform')}
            </a>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header
      className="sticky top-0 z-40"
      style={{
        background: 'var(--g-color-base-float)',
        borderBottom: '1px solid var(--g-color-line-generic)',
      }}
    >
      <div className="px-3 sm:px-5" style={{ height: 56, display: 'flex', alignItems: 'center' }}>
        <div className="flex items-center justify-between w-full gap-2 sm:gap-4">
          {/* Logo + Brand */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            <div className="relative flex-shrink-0">
              <img
                src="/logo.png"
                alt="GSTD"
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full"
                style={{ boxShadow: 'var(--g-shadow-s)' }}
              />
              <div
                className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
                style={{
                  background: isWsConnected ? 'var(--g-color-positive)' : 'var(--g-color-danger)',
                  border: '2px solid var(--g-color-base-float)',
                  boxShadow: isWsConnected ? '0 0 6px var(--g-color-positive)' : 'none',
                }}
              />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span
                  className="text-base font-extrabold tracking-tight uppercase"
                  style={{ color: 'var(--g-color-brand)' }}
                >
                  GSTD
                </span>
                <span
                  className="text-xs font-medium uppercase"
                  style={{ color: 'var(--g-color-text-hint)', letterSpacing: '1px' }}
                >
                  Ecosystem
                </span>
              </div>
              {address && (
                <p
                  className="font-mono"
                  style={{ fontSize: 10, color: 'var(--g-color-text-hint)', letterSpacing: '0.5px' }}
                >
                  {address.slice(0, 6)}…{address.slice(-4)}
                </p>
              )}
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1" role="navigation">
            {NAV_ITEMS.map((item) => (
              <a
                key={item.key}
                href={item.href}
                className={`g-btn g-btn--flat g-btn--s ${isActive(item.href) ? 'active' : ''}`}
                style={isActive(item.href) ? {
                  color: 'var(--g-color-text-primary)',
                  background: 'var(--g-color-base-float-heavy)',
                  borderColor: 'var(--g-color-line-accent)',
                  borderWidth: 1,
                  borderStyle: 'solid',
                } : {}}
              >
                {t(item.key, item.label)}
              </a>
            ))}
            <a
              href="https://monitor.gstdtoken.com"
              target="_blank"
              rel="noopener noreferrer"
              className="g-btn g-btn--flat g-btn--s"
            >
              Monitor ↗
            </a>
          </nav>

          {/* Right side: Balances + Actions */}
          <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
            {/* Balances */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <span
                  className="block font-bold uppercase"
                  style={{ fontSize: 9, color: 'var(--g-color-text-hint)', letterSpacing: '1px', marginBottom: 1 }}
                >
                  TON
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--g-color-text-primary)' }}>
                  {tonBalance || '0.00'}
                </span>
              </div>
              <div className="text-right">
                <span
                  className="block font-bold uppercase"
                  style={{ fontSize: 9, color: 'var(--g-color-brand)', letterSpacing: '1px', marginBottom: 1 }}
                >
                  GSTD
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--g-color-brand)' }}>
                  {gstdBalance?.toFixed(2) || '0.00'}
                </span>
              </div>
            </div>

            {/* Network Metrics (desktop only) */}
            <div
              className="hidden lg:flex items-center gap-4 px-3 py-1.5"
              style={{
                borderRadius: 'var(--g-border-radius-l)',
                background: 'var(--g-color-base-hover)',
                border: '1px solid var(--g-color-line-generic)',
              }}
            >
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 9, color: 'var(--g-color-text-hint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {t('grid', 'Grid')}
                </span>
                <span className="font-mono font-bold" style={{ fontSize: 10, color: 'var(--g-color-warning)' }} id="network-temperature">
                  0 T
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: 9, color: 'var(--g-color-text-hint)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
                  {t('load', 'Load')}
                </span>
                <span className="font-mono font-bold" style={{ fontSize: 10, color: 'var(--g-color-info)' }} id="computational-pressure">
                  0 P
                </span>
              </div>
            </div>

            {/* Language + Logout */}
            <LanguageSwitcher />
            <button
              onClick={onLogout}
              className="g-btn g-btn--flat g-btn--icon g-btn--s"
              style={{ width: 32, height: 32, color: 'var(--g-color-text-hint)' }}
              title={t('logout', 'Logout')}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
});
