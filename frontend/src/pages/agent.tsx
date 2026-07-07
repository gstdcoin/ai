import { GetStaticProps } from 'next';
import Head from 'next/head';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useEffect, useState } from 'react';
import AgentNode from '../components/agent/AgentNode';
import { useWalletStore } from '../store/walletStore';
import { TonConnectButton } from '@tonconnect/ui-react';

export default function AgentPage() {
  const { isConnected } = useWalletStore();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setIsChecking(false), 800);
    return () => clearTimeout(timer);
  }, []);

  if (isChecking) {
    return (
      <div className="min-h-screen bg-[#030014] flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-violet-500 opacity-50" />
      </div>
    );
  }

  if (!isConnected) {
    return (
      <div className="min-h-screen bg-[#030014] text-white flex items-center justify-center px-6">
        <Head><title>Agent Node — GSTD</title></Head>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-6">🤖</div>
          <h1 className="text-2xl font-black mb-3 tracking-tight">Connect your wallet</h1>
          <p className="text-gray-400 text-sm mb-8 leading-relaxed">
            Your Agent Node is tied to your TON wallet. Connect to start processing tasks and earning GSTD.
          </p>
          <div className="flex justify-center">
            <TonConnectButton />
          </div>
        </div>
      </div>
    );
  }

  return <AgentNode />;
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
