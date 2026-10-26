import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

export default function PrivacyPage() {
  const { t } = useTranslation('common');
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '88px 24px 48px', color: 'rgba(255,255,255,0.88)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16, background: 'linear-gradient(135deg, #ffd700, #ffa500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {t('privacy_title', 'Privacy Policy')}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 28 }}>
        {t('privacy_updated', 'Last updated')}: 2026-10-26
      </p>
      <section style={{border:'1px solid #444',padding:16,marginBottom:24,lineHeight:1.7}}>
        <h2>Контроль данных / Data controls</h2>
        <p>Локальная нода по умолчанию обрабатывает запрос локально. Передача в сеть требует явного выбора privacy: network. / Node-local requests stay local unless network routing is selected.</p>
        <p>Платформа маршрутизирует запрос выбранному оператору; этот оператор обрабатывает текст. Полная сквозная конфиденциальность от исполнителя не заявляется. / The selected executor processes your text; privacy from that executor is not guaranteed.</p>
        <p>Ответ платного запроса сохраняется для повтора до 10 минут. Удаление раньше: DELETE /api/v1/finance/responses?id=payment_id с вашей сессией. В финансовой истории остаются суммы и хеши, а не текст ответа. / Paid response retries expire after ten minutes and can be deleted sooner.</p>
        <p>Контекст Telegram хранится до часа; /new очищает его раньше. Telegram обрабатывается также Telegram. Корпоративный ИИ-резерв выключен до вашей команды /cloud on; /cloud off отзывает согласие. / Telegram itself handles bot messages; corporate AI fallback is opt-in.</p>
      </section>
      <div style={{ lineHeight: 1.7, fontSize: 15, color: 'rgba(255,255,255,0.72)' }}>
        <p style={{ marginBottom: 16 }}>
          {t(
            'privacy_intro',
            'This policy describes how we handle information when you use GSTD services, including the web app and APIs.'
          )}
        </p>
        <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12, color: '#fff' }}>{t('privacy_data', 'Data we process')}</h2>
        <p style={{ marginBottom: 16 }}>
          {t(
            'privacy_data_body',
            'We may process wallet addresses, session tokens, and technical logs required to operate nodes, rewards, and security controls. Third-party providers (e.g. RPC, AI inference) may receive data you send to those features.'
          )}
        </p>
        <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12, color: '#fff' }}>{t('privacy_cookies', 'Cookies & local storage')}</h2>
        <p style={{ marginBottom: 16 }}>
          {t(
            'privacy_cookies_body',
            'The app may use browser storage for sessions, preferences, and PWA functionality. You can clear site data in your browser settings.'
          )}
        </p>
        <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12, color: '#fff' }}>{t('privacy_rights', 'Your choices')}</h2>
        <p style={{ marginBottom: 16 }}>
          {t(
            'privacy_rights_body',
            'Where applicable, you may request access or deletion of personal data by contacting us through official channels. Some blockchain data is public by design and cannot be erased on-chain.'
          )}
        </p>
      </div>
      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: '#ffd700', textDecoration: 'none' }}>{t('privacy_back', '← Back to home')}</Link>
      </p>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
