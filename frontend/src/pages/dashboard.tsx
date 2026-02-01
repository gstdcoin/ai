import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Dashboard from '../components/dashboard/Dashboard';
import { useWalletStore } from '../store/walletStore';

export default function DashboardPage() {
    const router = useRouter();
    const { isConnected } = useWalletStore();
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        // Allow time for wallet restoration
        const timer = setTimeout(() => {
            setIsChecking(false);
        }, 1000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (!isChecking && !isConnected) {
            router.push('/');
        }
    }, [isChecking, isConnected, router]);

    // Loading state
    if (isChecking) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
            </div>
        );
    }

    // Not connected - redirecting
    if (!isConnected) {
        return (
            <div className="min-h-screen bg-[#030014] flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50"></div>
            </div>
        );
    }

    return <Dashboard />;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
    return {
        props: {
            ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
        },
    };
};
