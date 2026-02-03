import React, { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'next-i18next';

export const InstallPwaPrompt: React.FC = () => {
    const { t } = useTranslation('common');
    const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const handler = (e: any) => {
            // Prevent Chrome 67 and earlier from automatically showing the prompt
            e.preventDefault();
            // Stash the event so it can be triggered later.
            setDeferredPrompt(e);
            // Update UI to notify the user they can add to home screen
            setIsVisible(true);
        };

        window.addEventListener('beforeinstallprompt', handler);

        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    const handleInstallClick = async () => {
        if (!deferredPrompt) return;

        // Show the install prompt
        deferredPrompt.prompt();

        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);

        // We've used the prompt, and can't use it again, throw it away
        setDeferredPrompt(null);
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-20 left-4 right-4 z-50 animate-in slide-in-from-bottom-5 duration-500 md:bottom-6 md:left-auto md:w-96">
            <div className="bg-gray-900/90 backdrop-blur-xl border border-blue-500/30 p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-500/20 p-2 rounded-xl">
                        <Download className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                        <h4 className="font-bold text-white text-sm">{t('install_app') || 'Install App'}</h4>
                        <p className="text-xs text-gray-400">{t('install_app_desc') || 'Add to Home Screen for better performance'}</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsVisible(false)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                    <button
                        onClick={handleInstallClick}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        {t('install') || 'Install'}
                    </button>
                </div>
            </div>
        </div>
    );
};
