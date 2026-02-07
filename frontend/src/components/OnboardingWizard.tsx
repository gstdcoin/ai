import React, { useState, useEffect } from 'react';

interface OnboardingStep {
    order: number;
    title: string;
    description: string;
    action: string;
    helpText?: string;
    skippable: boolean;
}

interface OnboardingWizardProps {
    userType?: 'human' | 'agent' | 'developer';
    language?: string;
    onComplete?: () => void;
    walletAddress?: string;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
    userType = 'human',
    language = 'en',
    onComplete,
    walletAddress
}) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [completed, setCompleted] = useState(false);
    const [welcomeBonus, setWelcomeBonus] = useState<number | null>(null);

    const translations: Record<string, Record<string, string>> = {
        en: {
            welcome: 'Welcome to GSTD!',
            welcomeDesc: 'The AI network that pays YOU. Get started in 3 easy steps.',
            connectWallet: 'Connect Your Wallet',
            connectWalletDesc: 'Tap to connect. No wallet? We\'ll create one!',
            claimBonus: 'Claim Your Free Tokens!',
            claimBonusDesc: '🎁 You received {amount} GSTD as a welcome gift!',
            tryAI: 'Try Your First AI Request',
            tryAIDesc: 'Ask any question - it\'s that simple!',
            allSet: 'You\'re All Set! 🎉',
            allSetDesc: 'Start earning or using AI services.',
            next: 'Next',
            skip: 'Skip',
            finish: 'Start Earning!',
            loading: 'Loading...',
        },
        ru: {
            welcome: 'Добро пожаловать в GSTD!',
            welcomeDesc: 'AI сеть, которая платит ВАМ. Начните за 3 простых шага.',
            connectWallet: 'Подключите кошелёк',
            connectWalletDesc: 'Нажмите для подключения. Нет кошелька? Мы создадим!',
            claimBonus: 'Получите бесплатные токены!',
            claimBonusDesc: '🎁 Вы получили {amount} GSTD в подарок!',
            tryAI: 'Попробуйте первый AI запрос',
            tryAIDesc: 'Задайте любой вопрос - это просто!',
            allSet: 'Всё готово! 🎉',
            allSetDesc: 'Начните зарабатывать или используйте AI.',
            next: 'Далее',
            skip: 'Пропустить',
            finish: 'Начать зарабатывать!',
            loading: 'Загрузка...',
        },
        zh: {
            welcome: '欢迎来到GSTD!',
            welcomeDesc: '付费给您的AI网络。3步轻松开始。',
            connectWallet: '连接钱包',
            connectWalletDesc: '点击连接。没有钱包？我们来创建！',
            claimBonus: '领取免费代币！',
            claimBonusDesc: '🎁 您获得了 {amount} GSTD 作为欢迎礼物！',
            next: '下一步',
            skip: '跳过',
            finish: '开始赚钱！',
        }
    };

    const t = (key: string, params?: Record<string, string | number>) => {
        let text = translations[language]?.[key] || translations.en[key] || key;
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                text = text.replace(`{${k}}`, String(v));
            });
        }
        return text;
    };

    const steps: OnboardingStep[] = [
        {
            order: 1,
            title: t('welcome'),
            description: t('welcomeDesc'),
            action: 'welcome',
            helpText: 'No technical knowledge required. We\'ll guide you.',
            skippable: false,
        },
        {
            order: 2,
            title: t('connectWallet'),
            description: t('connectWalletDesc'),
            action: 'connect_wallet',
            skippable: false,
        },
        {
            order: 3,
            title: t('claimBonus'),
            description: t('claimBonusDesc', { amount: welcomeBonus || 1.0 }),
            action: 'claim_welcome',
            skippable: false,
        },
        {
            order: 4,
            title: t('tryAI'),
            description: t('tryAIDesc'),
            action: 'first_task',
            skippable: true,
        },
        {
            order: 5,
            title: t('allSet'),
            description: t('allSetDesc'),
            action: 'complete',
            skippable: false,
        },
    ];

    const handleNext = async () => {
        const step = steps[currentStep];
        setLoading(true);

        try {
            // Handle specific actions
            if (step.action === 'claim_welcome' && walletAddress) {
                const response = await fetch('/api/v1/tokens/welcome', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ wallet_address: walletAddress }),
                });
                const data = await response.json();
                if (data.success && data.claim) {
                    setWelcomeBonus(data.claim.amount);
                }
            }

            if (currentStep < steps.length - 1) {
                setCurrentStep(prev => prev + 1);
            } else {
                setCompleted(true);
                onComplete?.();
            }
        } catch (error) {
            console.error('Onboarding error:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSkip = () => {
        if (steps[currentStep].skippable && currentStep < steps.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const currentStepData = steps[currentStep];
    const progress = ((currentStep + 1) / steps.length) * 100;

    if (completed) {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-purple-900/95 to-black/95 flex items-center justify-center z-50">
                <div className="text-center max-w-md px-6">
                    <div className="text-6xl mb-6">🎉</div>
                    <h1 className="text-3xl font-bold text-white mb-4">{t('allSet')}</h1>
                    <p className="text-gray-300 mb-8">{t('allSetDesc')}</p>
                    <button
                        onClick={onComplete}
                        className="px-8 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 text-black font-bold rounded-xl hover:scale-105 transition-transform"
                    >
                        {t('finish')}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-purple-900/95 to-black/95 flex items-center justify-center z-50 p-4">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl max-w-lg w-full p-8 border border-white/20">
                {/* Progress bar */}
                <div className="mb-8">
                    <div className="flex justify-between text-sm text-gray-400 mb-2">
                        <span>Step {currentStep + 1} of {steps.length}</span>
                        <span>{Math.round(progress)}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-500"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>

                {/* Step content */}
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-white mb-4">
                        {currentStepData.title}
                    </h2>
                    <p className="text-gray-300 text-lg">
                        {currentStepData.description}
                    </p>
                    {currentStepData.helpText && (
                        <p className="text-gray-500 text-sm mt-4">
                            💡 {currentStepData.helpText}
                        </p>
                    )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-4">
                    {currentStepData.skippable && (
                        <button
                            onClick={handleSkip}
                            className="flex-1 py-3 text-gray-400 hover:text-white transition-colors"
                        >
                            {t('skip')}
                        </button>
                    )}
                    <button
                        onClick={handleNext}
                        disabled={loading}
                        className={`flex-1 py-4 bg-gradient-to-r from-yellow-400 to-orange-500 
              text-black font-bold rounded-xl hover:scale-105 transition-transform
              disabled:opacity-50 disabled:cursor-not-allowed
              ${!currentStepData.skippable ? 'w-full' : ''}`}
                    >
                        {loading ? t('loading') : (currentStep === steps.length - 1 ? t('finish') : t('next'))}
                    </button>
                </div>

                {/* Step indicators */}
                <div className="flex justify-center gap-2 mt-8">
                    {steps.map((_, index) => (
                        <div
                            key={index}
                            className={`w-2 h-2 rounded-full transition-colors ${index === currentStep
                                    ? 'bg-yellow-400'
                                    : index < currentStep
                                        ? 'bg-green-500'
                                        : 'bg-white/20'
                                }`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;
