import React, { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
    isCalculator?: boolean;
}

export default function Docs({ content, isCalculator }: DocsProps) {
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
            <Header onCreateTask={() => { }} onLogout={() => router.push('/')} isPublic={true} />
            <main className="max-w-4xl mx-auto px-6 py-12">
                {isClient ? (
                    <div className="prose prose-invert prose-lg max-w-none prose-headings:text-transparent prose-headings:bg-clip-text prose-headings:bg-gradient-to-r prose-headings:from-cyan-400 prose-headings:to-violet-400 prose-a:text-cyan-400 hover:prose-a:text-cyan-300 prose-table:border-collapse prose-th:border prose-th:border-white/20 prose-th:p-3 prose-td:border prose-td:border-white/10 prose-td:p-3">
                        {/* If this is the investment page, replace the table with the calculator or show it above */}
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
                        {isCalculator && <ROICalculator />}
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

// ROI Calculator Component
const ROICalculator = () => {
    const [monthlyCost, setMonthlyCost] = useState(1000);
    const [tasks, setTasks] = useState(50000);

    // AWS: Avg $0.02 per task (t3.medium)
    // GSTD: Avg 0.005 per task
    const awsCost = tasks * 0.02;
    const gstdCost = tasks * 0.005;
    const saving = awsCost - gstdCost;
    const savingPercent = (saving / awsCost) * 100;

    return (
        <div className="my-8 p-6 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="text-2xl">🧮</span> Interactive ROI Calculator
            </h3>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm text-gray-400 mb-2">Monthly Tasks</label>
                        <input
                            type="range"
                            min="1000"
                            max="1000000"
                            step="1000"
                            value={tasks}
                            onChange={(e) => setTasks(parseInt(e.target.value))}
                            className="w-full accent-cyan-500 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="text-right font-mono text-cyan-400">{tasks.toLocaleString()} tasks</div>
                    </div>
                </div>

                <div className="space-y-3 bg-black/20 p-4 rounded-xl">
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">AWS Estimated Cost:</span>
                        <span className="text-red-400 font-mono">${awsCost.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-gray-400">GSTD Cost:</span>
                        <span className="text-emerald-400 font-mono text-lg font-bold">${gstdCost.toLocaleString()}</span>
                    </div>
                    <div className="h-px bg-white/10 my-2"></div>
                    <div className="flex justify-between items-center">
                        <span className="text-white font-medium">Your Savings:</span>
                        <span className="text-cyan-400 font-mono text-xl font-bold">
                            ${saving.toLocaleString()} ({savingPercent.toFixed(1)}%)
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export const getStaticProps: GetStaticProps = async ({ locale }) => {
    const filename = locale === 'ru' ? 'INVESTMENT_COMPARISON_RU.md' : 'INVESTMENT_COMPARISON.md';
    const filePath = path.join(process.cwd(), 'public', 'docs', filename);
    const content = fs.readFileSync(filePath, 'utf8');

    return {
        props: {
            content,
            isCalculator: filename.includes('INVESTMENT'),
            ...(await serverSideTranslations(locale ?? 'ru', ['common'])),
        },
    };
};
