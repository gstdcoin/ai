import Head from 'next/head';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import { GetStaticProps } from 'next';
import ReferralPanel from '../components/referrals/ReferralPanel';

export default function ReferralsPage() {
    const { t } = useTranslation('common');

    return (
        <>
            <Head>
                <title>{t('referrals_title', 'Referral Program — GSTD')}</title>
                <meta name="description" content={t('referrals_desc', 'Earn GSTD by inviting others to the network. 3-level multi-tier referral rewards.')} />
            </Head>

            <div className="sovereign-section min-h-screen">
                <div className="max-w-4xl mx-auto px-6">
                    <ReferralPanel />
                </div>
            </div>
        </>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
