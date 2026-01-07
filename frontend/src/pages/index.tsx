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
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-gray-900 mb-4">
                {t('landing_title') || 'GSTD Platform'}
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
                  <h3 className="font-bold text-gray-900 mb-2 text-center">{t('step_1_register') || 'Подключите кошелёк'}</h3>
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
                💎 {t('gstd_token_info') || 'GSTD — Утилити токен'}
              </h2>
              <div className="space-y-3 text-gray-700">
                <p className="leading-relaxed">
                  <strong>GSTD (Guaranteed Service Time Depth)</strong> — это утилити токен, полностью соответствующий всем регуляторным требованиям:
                </p>
                <ul className="list-disc list-inside space-y-2 ml-4">
                  <li>✅ Соответствует требованиям <strong>MiCA (EU)</strong> для utility токенов</li>
                  <li>✅ Соответствует требованиям <strong>SEC (US)</strong> для utility токенов</li>
                  <li>✅ Используется для оплаты вычислительных услуг на платформе</li>
                  <li>✅ Обеспечение формируется из работы платформы</li>
                </ul>
                <p className="mt-4 leading-relaxed">
                  <strong>Обеспечение токена:</strong> Формируется из работы платформы через пул GSTD/XAUt в сети TON. 
                  Админ самостоятельно пополняет пул, обеспечивая стабильность токена.
                </p>
              </div>
            </section>

            {/* For Customers & Executors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">👔 {t('for_customers') || 'Для заказчиков'}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>✅ Легко создавайте задачи через веб-интерфейс</li>
                  <li>✅ Автоматизируйте через REST API</li>
                  <li>✅ Подробная документация для интеграции</li>
                  <li>✅ Прозрачное ценообразование</li>
                </ul>
                <p className="mt-4 text-xs text-gray-600">
                  {t('api_docs_note') || 'Подробная документация API доступна в разделе "Инструкции" после входа'}
                </p>
              </div>
              <div className="bg-green-50 rounded-xl p-6 border border-green-100">
                <h3 className="text-xl font-bold text-gray-900 mb-4">⚙️ {t('for_executors') || 'Для исполнителей'}</h3>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>✅ Регистрируйте устройства для выполнения задач</li>
                  <li>✅ Получайте задачи автоматически</li>
                  <li>✅ Выводите вознаграждение в TON</li>
                  <li>✅ Стройте репутацию для приоритетных задач</li>
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
