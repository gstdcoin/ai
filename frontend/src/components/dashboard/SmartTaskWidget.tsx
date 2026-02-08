import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { apiPost, apiGet } from '../../lib/apiClient';
import { API_BASE_URL, ADMIN_WALLET_ADDRESS, ESCROW_CONTRACT_ADDRESS } from '../../lib/config';

interface SmartTaskWidgetProps {
    onTaskCreated?: () => void;
}

export default function SmartTaskWidget({ onTaskCreated }: SmartTaskWidgetProps) {
    const { t } = useTranslation('common');
    const { address } = useWalletStore();
    const [tonConnectUI] = useTonConnectUI();

    const [prompt, setPrompt] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [estimation, setEstimation] = useState<{
        type: string;
        budget: number;
        description: string;
        workers: number;
        payload: any;
    } | null>(null);
    const [step, setStep] = useState<'input' | 'confirm' | 'processing'>('input');
    const [loading, setLoading] = useState(false);

    const handleAnalyze = async () => {
        if (!prompt.trim()) {
            toast.error('Error', t('prompt_empty') || 'Please enter a task description');
            return;
        }

        setIsAnalyzing(true);

        // Simulate AI analysis delay
        setTimeout(() => {
            // Simple heuristic for demo
            const p = prompt.toLowerCase();
            const isAi = p.includes('model') || p.includes('train') || p.includes('gpt') || p.includes('inference') || p.includes('image');
            const isData = p.includes('process') || p.includes('data') || p.includes('scrape') || p.includes('etl');

            const type = isAi ? 'AI_INFERENCE' : (isData ? 'DATA_PROCESSING' : 'COMPUTATION');
            // Estimate budget based on length/complexity (mock)
            const budget = isAi ? 15.5 : (isData ? 5.0 : 2.5);
            const workers = isAi ? 3 : 1;

            setEstimation({
                type,
                budget,
                description: `Dedicated ${isAi ? 'GPU Cluster' : 'CPU Node'} allocation for: "${prompt.slice(0, 50)}${prompt.length > 50 ? '...' : ''}"`,
                workers,
                payload: {
                    prompt: prompt,
                    model: isAi ? 'llama-3-8b' : 'standard-cpu',
                    parameters: {
                        temperature: 0.7,
                        max_tokens: 1000
                    }
                }
            });
            setIsAnalyzing(false);
            setStep('confirm');
        }, 1500);
    };

    const handleCreateAndPay = async () => {
        if (!address || !estimation || !tonConnectUI) return;

        setLoading(true);
        setStep('processing');

        try {
            // 1. Create Task API Call
            const taskData = await apiPost<{
                task_id: string;
                amount: number;
                payment_memo: string;
                platform_wallet: string;
                status: string;
            }>(`/tasks/create?wallet_address=${address}`, {
                type: estimation.type,
                budget: estimation.budget,
                payload: estimation.payload,
            });

            logger.info('Task created via Smart Widget', taskData);

            // 2. Prepare Payment
            // Calculate split amounts (95% reward, 5% fee)
            const rewardAmount = taskData.amount * 0.95;
            const feeAmount = taskData.amount * 0.05;

            // Dynamic import of TON libraries
            const { beginCell, Address } = await import('@ton/core');

            // 3. Resolve destination Jetton Wallets
            // We need the address of the ESCROW_CONTRACT's wallet and ADMIN's wallet
            // The API `/wallet/jetton-address` expects 'owner' query param

            const [rewardJettonWalletRes, feeJettonWalletRes] = await Promise.all([
                apiGet<{ address: string }>(`/wallet/jetton-address`, { owner: ESCROW_CONTRACT_ADDRESS }),
                apiGet<{ address: string }>(`/wallet/jetton-address`, { owner: ADMIN_WALLET_ADDRESS })
            ]);

            const rewardDest = rewardJettonWalletRes.address;
            const feeDest = feeJettonWalletRes.address;

            if (!rewardDest || !feeDest) {
                throw new Error('Could not resolve payment destination addresses');
            }

            // 4. Build Payloads
            const createTransferPayload = (destOwner: string, amount: number, memo: string) => {
                const amountNano = BigInt(Math.round(amount * 1e9));
                return beginCell()
                    .storeUint(0xf8a7ea5, 32)
                    .storeUint(0, 64)
                    .storeCoins(amountNano)
                    .storeAddress(Address.parse(destOwner)) // Destination owner (Escrow/Admin)
                    .storeAddress(Address.parse(address))   // Response destination (User)
                    .storeBit(0)
                    .storeCoins(BigInt(1))
                    .storeBit(1)
                    .storeRef(beginCell().storeUint(0, 32).storeStringTail(memo).endCell())
                    .endCell()
                    .toBoc()
                    .toString('base64');
            };

            const rewardBoc = createTransferPayload(ESCROW_CONTRACT_ADDRESS, rewardAmount, taskData.payment_memo);
            const feeBoc = createTransferPayload(ADMIN_WALLET_ADDRESS, feeAmount, `${taskData.payment_memo}-FEE`);

            // 5. Send Transaction
            await tonConnectUI.sendTransaction({
                validUntil: Math.floor(Date.now() / 1000) + 600,
                messages: [
                    {
                        address: rewardDest,
                        amount: "50000000", // 0.05 TON gas
                        payload: rewardBoc
                    },
                    {
                        address: feeDest,
                        amount: "50000000", // 0.05 TON gas
                        payload: feeBoc
                    }
                ]
            });

            toast.success(t('success') || 'Success', t('task_created_paid') || 'Task created and payment sent!');

            // Reset
            setStep('input');
            setPrompt('');
            setEstimation(null);
            if (onTaskCreated) onTaskCreated();

        } catch (err: any) {
            logger.error('Smart Task Creation Error', err);
            toast.error(t('error') || 'Error', err.message || 'Failed to create task');
            setStep('confirm'); // Go back to confirm step so user can retry or edit
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="relative overflow-hidden glass-card p-6 mb-8 border border-violet-500/30 shadow-[0_0_50px_rgba(124,58,237,0.1)]">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full filter blur-[80px] -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

            <div className="relative z-10">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold text-white flex items-center gap-3">
                        <div className="p-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 rounded-lg shadow-lg">
                            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                            </svg>
                        </div>
                        {t('prompt_window') || 'Smart Task Creator'}
                    </h3>
                </div>

                {step === 'input' && (
                    <div className="space-y-4 animate-fadeIn">
                        <div className="relative group">
                            <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={t('prompt_placeholder') || "Describe your task (e.g. 'I need to train a LoRA model on 50 images')..."}
                                disabled={isAnalyzing}
                                className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none font-mono text-sm transition-all group-hover:bg-black/50"
                            />
                            <div className="absolute bottom-4 right-4 text-xs text-gray-500 pointer-events-none">
                                AI Powered
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={handleAnalyze}
                                disabled={isAnalyzing || !prompt.trim()}
                                className={`px-6 py-2.5 rounded-xl font-bold text-white transition-all flex items-center gap-2 ${isAnalyzing ? 'bg-gray-700 cursor-not-allowed opacity-70' : 'bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:-translate-y-0.5'
                                    }`}
                            >
                                {isAnalyzing ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        {t('analyzing') || 'Analyzing...'}
                                    </>
                                ) : (
                                    <>
                                        {t('analyze_request') || 'Analyze Request'}
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {(step === 'confirm' || step === 'processing') && estimation && (
                    <div className="space-y-6 animate-fadeIn">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-violet-600/5 group-hover:bg-violet-600/10 transition-colors"></div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider relative z-10">{t('task_type')}</p>
                                <p className="text-lg font-bold text-violet-300 relative z-10 mt-1">{estimation.type}</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-emerald-600/5 group-hover:bg-emerald-600/10 transition-colors"></div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider relative z-10">{t('estimated_cost')}</p>
                                <p className="text-lg font-bold text-emerald-300 relative z-10 mt-1">{estimation.budget.toFixed(2)} GSTD</p>
                            </div>
                            <div className="bg-white/5 rounded-xl p-4 border border-white/10 relative overflow-hidden group">
                                <div className="absolute inset-0 bg-blue-600/5 group-hover:bg-blue-600/10 transition-colors"></div>
                                <p className="text-xs text-gray-400 uppercase tracking-wider relative z-10">{t('workers_needed') || 'Workers'}</p>
                                <p className="text-lg font-bold text-blue-300 relative z-10 mt-1">{estimation.workers}</p>
                            </div>
                        </div>

                        <div className="bg-blue-900/10 rounded-xl p-4 border border-blue-500/20 text-sm text-blue-200 shadow-inner">
                            <p className="leading-relaxed">{estimation.description}</p>
                        </div>

                        {step === 'processing' ? (
                            <div className="bg-black/30 rounded-xl p-6 border border-white/10 flex flex-col items-center justify-center space-y-4">
                                <div className="relative">
                                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-violet-500"></div>
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-violet-500">TX</div>
                                </div>
                                <p className="text-gray-300 font-medium animate-pulse">{t('processing_payment') || 'Processing transaction...'}</p>
                                <p className="text-xs text-gray-500 text-center max-w-sm">Please confirm the transaction in your wallet.</p>
                            </div>
                        ) : (
                            <div className="flex gap-4 pt-2">
                                <button
                                    onClick={() => setStep('input')}
                                    className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 transition-colors font-medium"
                                >
                                    {t('back') || 'Back'}
                                </button>
                                <button
                                    onClick={handleCreateAndPay}
                                    disabled={!address || !tonConnectUI?.connected}
                                    className="flex-1 px-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:shadow-[0_0_20px_rgba(16,185,129,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {!address || !tonConnectUI?.connected ? (
                                        <>
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                                            {t('connect_wallet') || 'Connect Wallet'}
                                        </>
                                    ) : (
                                        <>
                                            {t('confirm_and_pay') || 'Confirm & Pay'}
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
