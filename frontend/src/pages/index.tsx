import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import WalletConnect from '../components/WalletConnect';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';

export default function Home() {
  const { t } = useTranslation('common');
  const router = useRouter();
  const { isConnected, address, gstdBalance, updateBalance, disconnect } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [loading, setLoading] = useState(false);
  const [initialChecking, setInitialChecking] = useState(true);

  // Сбрасываем проверку при потере соединения
  useEffect(() => {
    if (!isConnected) {
      setInitialChecking(false);
    }
  }, [isConnected]);

  // Триггер проверки баланса при подключении
  useEffect(() => {
    if (isConnected && address) {
      console.log('🔍 Wallet detected, checking GSTD for:', address);
      checkGSTDBalance();
      
      const interval = setInterval(checkGSTDBalance, 20000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address]);

  const checkGSTDBalance = async () => {
    if (!address) return;
    setLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/wallet/gstd-balance?address=${address}`);
      if (!response.ok) throw new Error('Network error');
      
      const data = await response.json();
      console.log('💎 Current GSTD Balance:', data.balance);
      
      // Обновляем глобальное состояние
      updateBalance('0', data.balance || 0);
    } catch (error) {
      console.error('❌ Failed to check balance:', error);
    } finally {
      setLoading(false);
      setInitialChecking(false);
    }
  };

  const handleLogout = async () => {
    console.log('🔌 Disconnecting wallet...');
    try {
      if (tonConnectUI) await tonConnectUI.disconnect();
      disconnect();
      window.location.reload();
    } catch (err) {
      console.error('Logout error:', err);
      disconnect();
    }
  };

  const changeLanguage = () => {
    const newLocale = router.locale === 'ru' ? 'en' : 'ru';
    router.push(router.pathname, router.asPath, { locale: newLocale });
  };

  // 1. Состояние: Кошелек не подключен
  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-4xl w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8 relative">
          <button 
            onClick={changeLanguage}
            className="absolute top-4 right-4 text-sm font-medium text-gray-500 hover:text-primary-600 transition-colors flex items-center gap-1"
          >
            🌐 {router.locale === 'ru' ? 'EN' : 'RU'}
          </button>
          
          {/* Hero Section */}
          <div className="text-center mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">{t('title')}</h1>
            <p className="text-base sm:text-lg text-gray-600 mb-6">{t('subtitle')}</p>
          </div>

          {/* Wallet Connect */}
          <div className="mb-8">
            <WalletConnect />
          </div>

          {/* Informational Sections */}
          <div className="space-y-6 mt-8 pt-6 border-t border-gray-100">
            {/* How it Works */}
            <section className="bg-blue-50 rounded-xl p-4 sm:p-6">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                ⚙️ {t('how_it_works') || 'How it Works'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-2xl mb-2">1️⃣</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('step_1_register') || 'Register Device'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('step_1_register_desc') || 'Connect your device to the network'}</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-2xl mb-2">2️⃣</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('step_2_execute') || 'Execute Tasks'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('step_2_execute_desc') || 'Process computational tasks'}</p>
                </div>
                <div className="bg-white p-4 rounded-lg">
                  <div className="text-2xl mb-2">3️⃣</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('step_3_earn') || 'Earn Compensation'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('step_3_earn_desc') || 'Get paid in TON'}</p>
                </div>
              </div>
            </section>

            {/* Business Use Cases */}
            <section>
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                💼 {t('business_use_cases') || 'Business Use Cases'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-100">
                  <div className="text-2xl mb-2">🤖</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('ai_verification') || 'AI Verification'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('ai_verification_desc') || 'Distributed AI inference'}</p>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-teal-50 p-4 rounded-lg border border-green-100">
                  <div className="text-2xl mb-2">🏛️</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('govtech') || 'GovTech'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('govtech_desc') || 'Government applications'}</p>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-red-50 p-4 rounded-lg border border-orange-100">
                  <div className="text-2xl mb-2">🌐</div>
                  <h3 className="font-semibold text-gray-900 mb-1 text-sm sm:text-base">{t('iot') || 'IoT & Edge'}</h3>
                  <p className="text-xs sm:text-sm text-gray-600">{t('iot_desc') || 'Edge computing'}</p>
                </div>
              </div>
            </section>

            {/* GSTD Utility */}
            <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 sm:p-6 border border-indigo-100">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-3 flex items-center gap-2">
                💎 {t('gstd_utility') || 'GSTD Utility'}
              </h2>
              <p className="text-sm sm:text-base text-gray-700 leading-relaxed">
                <strong>{t('gstd_utility_title') || 'GSTD (Guaranteed Service Time Depth)'}</strong> {t('gstd_utility_desc') || 'is a technical parameter measuring the certainty depth of computational results. Higher GSTD means more validation layers and greater reliability.'}
              </p>
            </section>

            {/* Platform About */}
            <div className="text-center text-xs sm:text-sm text-gray-500 pt-4 border-t border-gray-100">
              {t('platform_about_short')}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Состояние: Идет проверка
  if (initialChecking || (gstdBalance === null && loading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <div className="relative">
          <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-primary-600"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-primary-600 font-bold">GSTD</span>
          </div>
        </div>
        <p className="mt-6 text-gray-600 font-medium text-lg animate-pulse">{t('checking')}</p>
      </div>
    );
  }

  // 3. Состояние: Токенов нет (явный 0)
  if (gstdBalance === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8 relative">
          <button 
            onClick={changeLanguage}
            className="absolute top-4 right-4 text-sm font-medium text-gray-500 hover:text-primary-600 transition-colors flex items-center gap-1"
          >
            🌐 {router.locale === 'ru' ? 'EN' : 'RU'}
          </button>
          <div className="text-center">
            <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-3">{t('no_gstd_token')}</h2>
            <p className="text-gray-600 mb-8 leading-relaxed">{t('gstd_required_desc')}</p>
            
            <div className="space-y-4">
              <a
                href="https://dedust.io" 
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-primary-600 text-white px-6 py-4 rounded-xl hover:bg-primary-700 transition-all font-bold shadow-lg text-center"
              >
                {t('get_gstd')}
              </a>
              
              <button
                onClick={checkGSTDBalance}
                disabled={loading}
                className="block w-full bg-white text-gray-700 px-6 py-4 rounded-xl hover:bg-gray-50 transition-all font-semibold border border-gray-200"
              >
                {loading ? t('checking') : t('check_again')}
              </button>

              <div className="pt-6 border-t border-gray-100 mt-6">
                <button
                  onClick={handleLogout}
                  className="text-sm font-bold text-red-500 hover:text-red-700 uppercase tracking-widest"
                >
                  {t('disconnect_and_exit')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 4. Успех: Открываем Dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      <Dashboard />
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
    },
  };
};
