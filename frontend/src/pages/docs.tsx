import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { GetStaticProps } from 'next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import Header from '../components/layout/Header';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Head from 'next/head';

export default function Docs() {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);
    const [content, setContent] = useState('');
    const [loading, setLoading] = useState(true);
    const { type = 'technical' } = router.query;

    useEffect(() => {
        setIsClient(true);
    }, []);

    useEffect(() => {
        if (!isClient) return;
        const locale = router.locale || 'en';
        let filename = '';
        if (type === 'technical') {
            filename = locale === 'ru' ? 'TECHNICAL_DOCS_RU.md' : 'TECHNICAL_DOCS.md';
        } else if (type === 'agents') {
            filename = locale === 'ru' ? 'AGENTS_DOCS_RU.md' : 'AGENTS_DOCS.md';
        } else if (type === 'unified') {
            filename = locale === 'ru' ? 'UNIFIED_ORGANISM_RU.md' : 'UNIFIED_ORGANISM.md';
        } else {
            filename = locale === 'ru' ? 'INVESTMENT_COMPARISON_RU.md' : 'INVESTMENT_COMPARISON.md';
        }
        setLoading(true);
        fetch(`/docs/${filename}`)
            .then(r => r.ok ? r.text() : '# Documentation\n\n*Content not found.*')
            .then(text => { setContent(text); setLoading(false); })
            .catch(() => { setContent('# Documentation\n\n*Content not found.*'); setLoading(false); });
    }, [type, isClient, router.locale]);

    const switchDoc = (newType: string) => {
        router.push(`/docs?type=${newType}`);
    };

    return (
        <div className="min-h-screen bg-[#030014] text-white">
            <Head>
                <title>GSTD Platform - Documentation</title>
            </Head>
            <Header onLogout={() => router.push('/')} isPublic={true} />

            <div className="max-w-4xl mx-auto px-6 pt-12">
                <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/10 w-fit mb-8">
                    <button
                        onClick={() => switchDoc('technical')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${type === 'technical' ? 'bg-violet-500 text-white shadow-lg shadow-violet-500/20' : 'text-gray-400 hover:text-white'}`}
                    >
                        {router.locale === 'ru' ? 'Технологии' : 'Technical'}
                    </button>
                    <button
                        onClick={() => switchDoc('agents')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${type === 'agents' ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'text-gray-400 hover:text-white'}`}
                    >
                        {router.locale === 'ru' ? 'Агенты (A2A)' : 'Agents (A2A)'}
                    </button>
                    <button
                        onClick={() => switchDoc('unified')}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${type === 'unified' ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20' : 'text-gray-400 hover:text-white'}`}
                    >
                        {router.locale === 'ru' ? 'Единый организм' : 'Unified Organism'}
                    </button>
                </div>
            </div>

            <main className="max-w-4xl mx-auto px-6 pb-24">
                {loading ? (
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-white/10 rounded w-1/3"></div>
                        <div className="h-4 bg-white/10 rounded w-full"></div>
                        <div className="h-4 bg-white/10 rounded w-5/6"></div>
                    </div>
                ) : (
                    <div className="prose prose-invert prose-lg max-w-none prose-headings:text-transparent prose-headings:bg-clip-text prose-headings:bg-gradient-to-r prose-headings:from-cyan-400 prose-headings:to-violet-400 prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:p-3 prose-td:border prose-td:border-white/10 prose-td:p-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                    </div>
                )}
            </main>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => ({
    props: await getCommonStaticProps(locale),
});

