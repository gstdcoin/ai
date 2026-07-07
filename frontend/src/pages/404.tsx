import Head from 'next/head';
import Link from 'next/link';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#030014] text-white flex items-center justify-center px-6">
      <Head>
        <title>404 — Page Not Found | GSTD</title>
      </Head>

      <div className="text-center max-w-md">
        <div className="text-[80px] font-black text-white/10 leading-none mb-4">404</div>
        <h1 className="text-2xl font-black text-white mb-3 tracking-tight">Page not found</h1>
        <p className="text-gray-400 text-sm mb-8 leading-relaxed">
          This page doesn&apos;t exist or was moved. Try one of the links below.
        </p>

        <div className="flex flex-col gap-2 mb-8">
          {[
            { href: '/chat', label: 'AI Chat', desc: 'Talk to GSTD network models' },
            { href: '/nodes', label: 'Run a Node', desc: 'Earn GSTD by providing compute' },
            { href: '/stats', label: 'Network Stats', desc: 'Live network metrics' },
            { href: '/training', label: 'Fine-Tuning', desc: 'Submit a training job' },
          ].map(({ href, label, desc }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/10 hover:border-white/20 transition-all group text-left"
            >
              <div>
                <div className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">{label}</div>
                <div className="text-xs text-gray-500">{desc}</div>
              </div>
              <svg className="text-gray-600 group-hover:text-cyan-400 transition-colors" width={14} height={14} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          ))}
        </div>

        <Link href="/" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
  props: await getCommonStaticProps(locale),
});
