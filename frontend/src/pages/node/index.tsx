import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect } from 'react';

/**
 * Node page — redirects to gstdbot.gstdtoken.com
 * Node management is now built into GSTD Node OS.
 */
export default function NodePage() {
    useEffect(() => {
        window.location.href = 'https://gstdbot.gstdtoken.com';
    }, []);

    return (
        <div style={{
            minHeight: '100vh', background: '#030014',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🖥️</div>
                <p style={{ fontSize: 14 }}>Node management is now in GSTD Node OS</p>
                <p style={{ fontSize: 11, marginTop: 8 }}>
                    <a href="https://gstdbot.gstdtoken.com" style={{ color: 'rgba(139,92,246,0.8)' }}>
                        Install GSTD Node →
                    </a>
                </p>
            </div>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: { ...(await serverSideTranslations(locale ?? 'en', ['common'])) },
});
