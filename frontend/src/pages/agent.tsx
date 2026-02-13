import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AgentNode from '../components/agent/AgentNode';
import { useWalletStore } from '../store/walletStore';

export default function AgentPage() {
  const router = useRouter();
  const { isConnected } = useWalletStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsChecking(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Shadow Audit: deep linking — redirect to dashboard when wallet not connected
  useEffect(() => {
    if (!isChecking && !isConnected) {
      router.push('/dashboard');
    }
  }, [isChecking, isConnected, router]);

  if (isChecking || !isConnected) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500 opacity-50" />
      </div>
    );
  }

  return <AgentNode />;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
    },
  };
};
