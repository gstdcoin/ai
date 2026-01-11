import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import WalletConnect from '../components/WalletConnect';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { useWalletStore } from '../store/walletStore';
import { logger } from '../lib/logger';

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

  // УБРАНО: Проверка баланса GSTD при входе
  // Проверка баланса теперь только при создании задания
  useEffect(() => {
    if (isConnected && address) {
      setInitialChecking(false);
      // Не проверяем баланс при входе - только при создании задания
      updateBalance('0', 0);
    } else {
      setInitialChecking(false);
    }
  }, [isConnected, address]);

  const handleLogout = async () => {
    const { logger } = require('../lib/logger');
    logger.debug('Disconnecting wallet');
    try {
      if (tonConnectUI) await tonConnectUI.disconnect();
      disconnect();
      window.location.reload();
    } catch (err) {
      logger.error('Logout error', err);
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
      <div className="min-h-screen bg-sea-50 flex items-center justify-center p-4">
        <div className="max-w-6xl w-full">
          {/* Language Switcher */}
          <div className="flex justify-end mb-4">
            <button 
              onClick={changeLanguage}
              className="text-sm font-medium text-gray-600 hover:text-primary-600 transition-colors flex items-center gap-1 px-3 py-1 rounded-lg hover:bg-white/50"
            >
              🌐 {router.locale === 'ru' ? 'EN' : 'RU'}
            </button>
          </div>

          {/* Main Card - Matching Dashboard Style */}
          <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8 lg:p-10">
            {/* Hero Section */}
            <div className="text-center mb-10">
              {/* Logo */}
              <div className="flex justify-center mb-6">
                <div className="relative">
                  <img 
                    src="/logo.svg" 
                    alt="GSTD Logo" 
                    className="w-24 h-24 sm:w-32 sm:h-32 mx-auto animate-pulse-slow drop-shadow-2xl"
                    style={{
                      filter: 'drop-shadow(0 0 20px rgba(255, 215, 0, 0.5))',
                      animation: 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite'
                    }}
                  />
                </div>
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4 flex items-center justify-center gap-3">
                <span className="bg-gradient-to-r from-gold-600 via-gold-500 to-gold-400 bg-clip-text text-transparent">
                  GSTD
                </span>
                <span className="text-gray-800">Platform</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed mb-2">
                {t('landing_subtitle') || 'Децентрализованная платформа распределённых вычислений на блокчейне TON'}
              </p>
              <p className="text-base text-gray-500 max-w-2xl mx-auto">
                {t('landing_desc') || 'Создавайте задачи для AI-инференса, валидации и обработки данных. Выполняйте вычисления и получайте вознаграждение в TON.'}
              </p>
            </div>

            {/* Wallet Connect */}
            <div className="mb-10 max-w-md mx-auto">
              <WalletConnect />
            </div>

            {/* Key Features - Matching Dashboard Cards Style */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
              <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-6 border border-blue-100">
                <div className="text-3xl mb-3">⚡</div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{t('feature_speed') || 'Быстро'}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t('feature_speed_desc') || 'Задачи выполняются в среднем за 5 секунд благодаря умному распределению по сети'}
                </p>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-100">
                <div className="text-3xl mb-3">🔒</div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{t('feature_security') || 'Безопасно'}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t('feature_security_desc') || 'Данные зашифрованы ключом AES-256. Даже сервер не может прочитать ваши данные'}
                </p>
              </div>
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                <div className="text-3xl mb-3">💎</div>
                <h3 className="font-bold text-gray-900 mb-2 text-lg">{t('feature_gstd') || 'GSTD токен'}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  {t('feature_gstd_desc') || 'GSTD — утилити токен, полностью соответствующий регуляторным требованиям MiCA (EU) и SEC (US)'}
                </p>
              </div>
            </div>

            {/* How it Works */}
            <section className="mb-10">
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 text-center">
                {t('how_it_works') || 'Как это работает'}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <div className="text-4xl mb-4 text-center">1️⃣</div>
                  <h3 className="font-bold text-gray-900 mb-2 text-center">{t('connect_wallet') || 'Подключите кошелёк'}</h3>
                  <p className="text-sm text-gray-600 text-center leading-relaxed">
                    {t('step_1_register_desc') || 'Подключите TON кошелёк с GSTD токенами для участия в платформе'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <div className="text-4xl mb-4 text-center">2️⃣</div>
                  <h3 className="font-bold text-gray-900 mb-2 text-center">{t('step_2_create') || 'Создавайте задачи'}</h3>
                  <p className="text-sm text-gray-600 text-center leading-relaxed">
                    {t('step_2_create_desc') || 'Создавайте задачи для AI-инференса, валидации или обработки данных. Можно автоматизировать через API'}
                  </p>
                </div>
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <div className="text-4xl mb-4 text-center">3️⃣</div>
                  <h3 className="font-bold text-gray-900 mb-2 text-center">{t('step_3_earn') || 'Получайте результаты'}</h3>
                  <p className="text-sm text-gray-600 text-center leading-relaxed">
                    {t('step_3_earn_desc') || 'Исполнители выполняют задачи, вы получаете результаты. Исполнители получают вознаграждение в TON'}
                  </p>
                </div>
              </div>
            </section>

            {/* GSTD Token Info */}
            <section className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-6 sm:p-8 mb-10 border border-indigo-100">
              <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                💎 {t('gstd_token_info') || 'GSTD — Utility Token'}
              </h2>
              <div className="space-y-3 text-gray-700">
                <p className="leading-relaxed">
                  <strong>{t('gstd_token_regulatory') || 'GSTD (Guaranteed Service Time Depth) is a utility token fully compliant with all regulatory requirements:'}</strong>
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>✅ {t('gstd_mica_compliant') || 'Compliant with MiCA (EU) requirements for utility tokens'}</li>
                  <li>✅ {t('gstd_sec_compliant') || 'Compliant with SEC (US) requirements for utility tokens'}</li>
                  <li>✅ {t('gstd_platform_payment') || 'Used to pay for computational services on the platform'}</li>
                  <li>✅ {t('gstd_backing_from_work') || 'Backing is formed from platform work'}</li>
                </ul>
                <p className="mt-4 leading-relaxed">
                  <strong>{t('gstd_token_backing') || 'Token Backing:'}</strong> {t('gstd_backing_description') || 'Formed from platform work through the GSTD/XAUt pool on the TON network. The admin independently replenishes the pool, ensuring token stability.'}
                </p>
              </div>
            </section>

            {/* For Customers & Executors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">👔 {t('for_customers') || 'For Customers'}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>✅ {t('for_customers_easy') || 'Easily create tasks through the web interface'}</li>
                  <li>✅ {t('for_customers_api') || 'Automate via REST API'}</li>
                  <li>✅ {t('for_customers_docs') || 'Detailed documentation for integration'}</li>
                  <li>✅ {t('for_customers_pricing') || 'Transparent pricing'}</li>
                </ul>
                <p className="mt-4 text-xs text-gray-600">
                  {t('api_docs_note') || 'Подробная документация API доступна в разделе "Инструкции" после входа'}
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">⚙️ {t('for_executors') || 'For Executors'}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>✅ {t('for_executors_register') || 'Register devices to execute tasks'}</li>
                  <li>✅ {t('for_executors_auto') || 'Receive tasks automatically'}</li>
                  <li>✅ {t('for_executors_withdraw') || 'Withdraw rewards in TON'}</li>
                  <li>✅ {t('for_executors_reputation') || 'Build reputation for priority tasks'}</li>
                </ul>
                <p className="mt-4 text-xs text-gray-600">
                  {t('executor_note') || 'Все транзакции подписываете вы сами через TonConnect'}
                </p>
              </div>
            </div>

            {/* Platform About */}
            <div className="text-center text-sm text-gray-500 pt-6 border-t border-gray-200">
              <p className="mb-2">{t('platform_about_short')}</p>
              <p className="text-xs">
                {t('platform_tech') || 'DePIN сеть на блокчейне TON • WebAssembly • AES-256-GCM • Ed25519'}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Состояние: Идет проверка (только если еще не завершена и загрузка активна)
  // УБРАНО: больше не блокируем вход при проверке баланса
  // if (initialChecking || (gstdBalance === null && loading)) {
  //   return (
  //     <div className="min-h-screen flex flex-col items-center justify-center bg-white">
  //       <div className="relative">
  //         <div className="animate-spin rounded-full h-24 w-24 border-t-4 border-b-4 border-primary-600"></div>
  //         <div className="absolute inset-0 flex items-center justify-center">
  //           <span className="text-primary-600 font-bold">GSTD</span>
  //         </div>
  //       </div>
  //       <p className="mt-6 text-gray-600 font-medium text-lg animate-pulse">{t('checking')}</p>
  //     </div>
  //   );
  // }

  // 3. Состояние: Токенов нет (явный 0) - УБРАНО: больше не блокируем вход
  // Пользователь может войти без GSTD токенов
  // if (gstdBalance === 0) {
  //   return (
  //     ...
  //   );
  // }

  // 4. Успех: Открываем Dashboard (вход разрешен всегда после подключения кошелька)
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
