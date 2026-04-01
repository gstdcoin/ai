import Link from 'next/link';
import { GetStaticProps } from 'next';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

export default function TermsPage() {
  const { t } = useTranslation('common');
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '88px 24px 48px', color: 'rgba(255,255,255,0.88)' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 16, background: 'linear-gradient(135deg, #ffd700, #ffa500)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
        {t('terms_title', 'Terms of Service')}
      </h1>
      <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 28 }}>
        {t('terms_updated', 'Last updated')}: 2026-04-01
      </p>
      <div style={{ lineHeight: 1.7, fontSize: 15, color: 'rgba(255,255,255,0.72)' }}>
        <p style={{ marginBottom: 16 }}>
          {t(
            'terms_intro',
            'These terms govern your use of the GSTD web application, APIs, and related services. By accessing the platform you agree to comply with applicable laws and these terms.'
          )}
        </p>
        <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12, color: '#fff' }}>{t('terms_risk', 'Risk disclaimer')}</h2>
        <p style={{ marginBottom: 16 }}>
          {t(
            'terms_risk_body',
            'Digital assets and blockchain networks involve significant risk, including loss of funds. Nothing on this site is financial, legal, or investment advice.'
          )}
        </p>
        <h2 style={{ fontSize: 18, marginTop: 28, marginBottom: 12, color: '#fff' }}>{t('terms_liability', 'Limitation of liability')}</h2>
        <p style={{ marginBottom: 16 }}>
          {t(
            'terms_liability_body',
            'The platform is provided “as is”. To the maximum extent permitted by law, operators and contributors disclaim warranties and liability arising from use of the service.'
          )}
        </p>
        <p style={{ marginTop: 32, fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
          {t('terms_contact', 'For questions, contact the team via official Telegram channels listed in the footer.')}
        </p>
      </div>
      <p style={{ marginTop: 32 }}>
        <Link href="/" style={{ color: '#ffd700', textDecoration: 'none' }}>{t('terms_back', '← Back to home')}</Link>
      </p>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
