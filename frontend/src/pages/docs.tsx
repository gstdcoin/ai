import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { GetStaticProps } from 'next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import fs from 'fs';
import path from 'path';
import Header from '../components/layout/Header';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import Head from 'next/head';

interface DocsProps {
    content: string;
}

export default function Docs({ content }: DocsProps) {
    const { t } = useTranslation('common');
    const router = useRouter();
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    return (
        <div className="min-h-screen bg-[#030014] text-white">
            <Head>
                <title>GSTD Platform - Documentation</title>
            </Head>
            <Header onCreateTask={() => { }} onLogout={() => router.push('/')} />
            <main className="max-w-4xl mx-auto px-6 py-12">
                {isClient ? (
                    <div className="prose prose-invert prose-lg max-w-none prose-headings:text-transparent prose-headings:bg-clip-text prose-headings:bg-gradient-to-r prose-headings:from-cyan-400 prose-headings:to-violet-400 prose-a:text-cyan-400 hover:prose-a:text-cyan-300">
                        <ReactMarkdown>{content}</ReactMarkdown>
                    </div>
                ) : (
                    <div className="animate-pulse space-y-4">
                        <div className="h-8 bg-white/10 rounded w-1/3"></div>
                        <div className="h-4 bg-white/10 rounded w-full"></div>
                        <div className="h-4 bg-white/10 rounded w-5/6"></div>
                    </div>
                )}
            </main>
        </div>
    );
}

export const getStaticProps: GetStaticProps = async ({ locale }) => {
    const filePath = path.join(process.cwd(), 'public', 'docs', 'INVESTMENT_COMPARISON.md');
    const content = fs.readFileSync(filePath, 'utf8');

    return {
        props: {
            content,
            ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
        },
    };
};
