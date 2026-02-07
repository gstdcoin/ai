import React, { useState, useEffect } from 'react';

interface EarnMethod {
    name: string;
    reward: string;
    description: string;
    difficulty: string;
    action: () => void;
    icon: string;
}

interface TokenEarnPanelProps {
    walletAddress?: string;
    language?: string;
    onClaimSuccess?: (amount: number, type: string) => void;
}

export const TokenEarnPanel: React.FC<TokenEarnPanelProps> = ({
    walletAddress,
    language = 'en',
    onClaimSuccess
}) => {
    const [loading, setLoading] = useState<string | null>(null);
    const [claimedToday, setClaimedToday] = useState(false);
    const [welcomeClaimed, setWelcomeClaimed] = useState(false);
    const [tasks, setTasks] = useState<any[]>([]);
    const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

    useEffect(() => {
        fetchSimpleTasks();
    }, []);

    const fetchSimpleTasks = async () => {
        try {
            const response = await fetch('/api/v1/tokens/tasks');
            const data = await response.json();
            if (data.success) {
                setTasks(data.tasks || []);
            }
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        }
    };

    const showMessage = (text: string, type: 'success' | 'error') => {
        setMessage({ text, type });
        setTimeout(() => setMessage(null), 3000);
    };

    const claimWelcomeBonus = async () => {
        if (!walletAddress) {
            showMessage('Please connect your wallet first', 'error');
            return;
        }

        setLoading('welcome');
        try {
            const response = await fetch('/api/v1/tokens/welcome', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: walletAddress }),
            });
            const data = await response.json();

            if (data.success) {
                setWelcomeClaimed(true);
                showMessage(`🎁 ${data.claim.amount} GSTD claimed!`, 'success');
                onClaimSuccess?.(data.claim.amount, 'welcome');
            } else {
                showMessage(data.error || 'Already claimed', 'error');
            }
        } catch (error) {
            showMessage('Failed to claim', 'error');
        } finally {
            setLoading(null);
        }
    };

    const claimDailyFaucet = async () => {
        if (!walletAddress) {
            showMessage('Please connect your wallet first', 'error');
            return;
        }

        setLoading('daily');
        try {
            const response = await fetch('/api/v1/tokens/faucet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ wallet_address: walletAddress }),
            });
            const data = await response.json();

            if (data.success) {
                setClaimedToday(true);
                showMessage(`💧 ${data.claim.amount} GSTD claimed!`, 'success');
                onClaimSuccess?.(data.claim.amount, 'daily');
            } else {
                showMessage(data.error || 'Try again later', 'error');
            }
        } catch (error) {
            showMessage('Failed to claim', 'error');
        } finally {
            setLoading(null);
        }
    };

    const completeTask = async (taskId: string) => {
        if (!walletAddress) {
            showMessage('Please connect your wallet first', 'error');
            return;
        }

        setLoading(taskId);
        try {
            const response = await fetch(`/api/v1/tokens/tasks/${taskId}/complete`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    wallet_address: walletAddress,
                    response: { completed: true }
                }),
            });
            const data = await response.json();

            if (data.success) {
                showMessage(`✅ ${data.reward.amount} GSTD earned!`, 'success');
                onClaimSuccess?.(data.reward.amount, 'task');
                // Remove completed task from list
                setTasks(prev => prev.filter(t => t.id !== taskId));
            } else {
                showMessage(data.error || 'Try again', 'error');
            }
        } catch (error) {
            showMessage('Failed to complete task', 'error');
        } finally {
            setLoading(null);
        }
    };

    const getRefLink = () => {
        const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://app.gstdtoken.com';
        return `${baseUrl}?ref=${walletAddress?.slice(0, 10) || 'gstd'}`;
    };

    const copyRefLink = () => {
        navigator.clipboard.writeText(getRefLink());
        showMessage('📋 Referral link copied!', 'success');
    };

    return (
        <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 backdrop-blur-xl rounded-2xl p-6 border border-white/10">
            {/* Message Toast */}
            {message && (
                <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-xl shadow-lg animate-fade-in
          ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white font-medium`}>
                    {message.text}
                </div>
            )}

            <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                🆓 Get GSTD Tokens for FREE
            </h2>

            <div className="space-y-4">
                {/* Welcome Bonus */}
                <div className="bg-white/5 rounded-xl p-4 border border-yellow-500/30 hover:border-yellow-500/50 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🎁</span>
                            <div>
                                <h3 className="text-white font-semibold">Welcome Bonus</h3>
                                <p className="text-gray-400 text-sm">One-time gift for new users</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-yellow-400 font-bold">1.0 GSTD</div>
                            <button
                                onClick={claimWelcomeBonus}
                                disabled={loading === 'welcome' || welcomeClaimed}
                                className={`mt-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${welcomeClaimed
                                        ? 'bg-green-500/20 text-green-400 cursor-not-allowed'
                                        : 'bg-yellow-500 text-black hover:bg-yellow-400'
                                    }`}
                            >
                                {loading === 'welcome' ? '...' : welcomeClaimed ? '✓ Claimed' : 'Claim'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Daily Faucet */}
                <div className="bg-white/5 rounded-xl p-4 border border-blue-500/30 hover:border-blue-500/50 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">💧</span>
                            <div>
                                <h3 className="text-white font-semibold">Daily Faucet</h3>
                                <p className="text-gray-400 text-sm">Claim every 24 hours</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-blue-400 font-bold">0.1 GSTD</div>
                            <button
                                onClick={claimDailyFaucet}
                                disabled={loading === 'daily' || claimedToday}
                                className={`mt-1 px-4 py-2 rounded-lg text-sm font-medium transition-all
                  ${claimedToday
                                        ? 'bg-blue-500/20 text-blue-400 cursor-not-allowed'
                                        : 'bg-blue-500 text-white hover:bg-blue-400'
                                    }`}
                            >
                                {loading === 'daily' ? '...' : claimedToday ? 'Come back tomorrow' : 'Claim'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Simple Tasks */}
                <div className="bg-white/5 rounded-xl p-4 border border-purple-500/30">
                    <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                        ✨ Quick Tasks
                        <span className="text-xs bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-full">
                            {tasks.length} available
                        </span>
                    </h3>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                        {tasks.map((task) => (
                            <div key={task.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                                <div>
                                    <div className="text-white text-sm font-medium">{task.title}</div>
                                    <div className="text-gray-500 text-xs">{task.time_estimate}</div>
                                </div>
                                <button
                                    onClick={() => completeTask(task.id)}
                                    disabled={loading === task.id}
                                    className="px-3 py-1.5 bg-purple-500 text-white text-sm rounded-lg hover:bg-purple-400 transition-colors"
                                >
                                    {loading === task.id ? '...' : `+${task.reward_gstd} GSTD`}
                                </button>
                            </div>
                        ))}
                        {tasks.length === 0 && (
                            <div className="text-gray-500 text-center py-4">
                                No tasks available right now
                            </div>
                        )}
                    </div>
                </div>

                {/* Referral */}
                <div className="bg-white/5 rounded-xl p-4 border border-green-500/30 hover:border-green-500/50 transition-colors">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🎯</span>
                            <div>
                                <h3 className="text-white font-semibold">Invite Friends</h3>
                                <p className="text-gray-400 text-sm">Earn 1 GSTD per friend</p>
                            </div>
                        </div>
                        <button
                            onClick={copyRefLink}
                            className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-400 transition-colors"
                        >
                            Copy Link
                        </button>
                    </div>
                </div>

                {/* Become Worker */}
                <div className="bg-gradient-to-r from-orange-500/20 to-red-500/20 rounded-xl p-4 border border-orange-500/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <span className="text-3xl">🚀</span>
                            <div>
                                <h3 className="text-white font-semibold">Become a Worker</h3>
                                <p className="text-gray-400 text-sm">Earn unlimited GSTD with your device</p>
                            </div>
                        </div>
                        <a
                            href="/dashboard?tab=nodes"
                            className="px-4 py-2 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg text-sm font-medium hover:opacity-90 transition-opacity"
                        >
                            Setup (5 min)
                        </a>
                    </div>
                </div>
            </div>

            {/* Buy Link */}
            <div className="mt-6 pt-6 border-t border-white/10">
                <p className="text-gray-400 text-sm text-center mb-3">
                    Need more tokens? Buy directly:
                </p>
                <div className="flex gap-2 justify-center">
                    <a
                        href="https://app.ston.fi/swap?ft=TON&tt=GSTD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
                    >
                        STON.fi
                    </a>
                    <a
                        href="https://dedust.io/swap/TON/GSTD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm hover:bg-purple-500 transition-colors"
                    >
                        DeDust
                    </a>
                </div>
            </div>
        </div>
    );
};

export default TokenEarnPanel;
