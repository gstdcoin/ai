import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect } from 'react';
import { useRouter } from 'next/router';

/**
 * Dashboard page — redirects to /chat
 * The Dashboard is now built into GSTD Node OS (gstdbot).
 * Each node operator accesses their dashboard at http://localhost:8080
 */
export default function DashboardPage() {
    const router = useRouter();

    useEffect(() => {
        router.replace('/chat');
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh',
            background: '#030014',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.5)' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🐝</div>
                <p style={{ fontSize: 14 }}>Redirecting to Chat...</p>
                <p style={{ fontSize: 11, marginTop: 8, color: 'rgba(255,255,255,0.3)' }}>
                    Dashboard is now in your GSTD Node OS
                </p>
            </div>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
    return {
        props: {
            ...(await serverSideTranslations(locale ?? 'en', ['common'])),
        },
    };
};
