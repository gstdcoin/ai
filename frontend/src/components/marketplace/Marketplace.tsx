import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { apiGet, apiPost } from '../../lib/apiClient';

interface AvailableTask {
    task_id: string;
    task_type: string;
    operation: string;
    difficulty: string;
    reward_gstd: number;
    estimated_time_sec: number;
    creator_wallet: string;
    geography: string;
    workers_needed: number;
    workers_completed: number;
    created_at: string;
    min_trust_score: number;
}

interface WorkerStats {
    total_tasks_completed: number;
    total_earnings_gstd: number;
    reliability_score: number;
    avg_execution_time_ms: number;
}

interface MarketplaceStats {
    total_tasks: number;
    active_tasks: number;
    completed_tasks: number;
    total_volume: number;
    total_payouts: number;
    active_workers: number;
    platform_funds: {
        dev_fund: number;
        gold_reserve: number;
    };
}

export default function Marketplace() {
    const { t } = useTranslation('common');
    const { address, isConnected } = useWalletStore();

    const [activeTab, setActiveTab] = useState<'jobs' | 'create' | 'my-tasks'>('jobs');
    const [tasks, setTasks] = useState<AvailableTask[]>([]);
    const [myTasks, setMyTasks] = useState<any[]>([]);
    const [workerStats, setWorkerStats] = useState<WorkerStats | null>(null);
    const [marketStats, setMarketStats] = useState<MarketplaceStats | null>(null);
    const [loading, setLoading] = useState(false);
    const [claimingTask, setClaimingTask] = useState<string | null>(null);

    // Task creation form
    const [taskForm, setTaskForm] = useState({
        task_type: 'network_survey',
        operation: 'collect_topology',
        budget_gstd: 10,
        difficulty: 'medium',
        max_workers: 5,
        estimated_time_sec: 30,
        min_trust_score: 0.3,
        geography_type: 'global',
        geography_countries: '',
    });

    // Fetch available tasks
    const fetchTasks = useCallback(async () => {
        try {
            const response = await apiGet<{ tasks: AvailableTask[] }>('/marketplace/tasks');
            setTasks(Array.isArray(response.tasks) ? response.tasks : []);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
            setTasks([]);
        }
    }, []);

    // Fetch my tasks
    const fetchMyTasks = useCallback(async () => {
        if (!isConnected) return;
        try {
            const response = await apiGet<{ tasks: any[] }>('/marketplace/my-tasks');
            setMyTasks(Array.isArray(response.tasks) ? response.tasks : []);
        } catch (error) {
            console.error('Failed to fetch my tasks:', error);
            setMyTasks([]);
        }
    }, [isConnected]);

    // Fetch worker stats
    const fetchWorkerStats = useCallback(async () => {
        if (!isConnected) return;
        try {
            const stats = await apiGet<WorkerStats>('/marketplace/worker/stats');
            if (stats) setWorkerStats(stats);
        } catch (error) {
            console.error('Failed to fetch worker stats:', error);
        }
    }, [isConnected]);

    // Fetch marketplace stats
    const fetchMarketStats = useCallback(async () => {
        try {
            const stats = await apiGet<MarketplaceStats>('/marketplace/stats');
            if (stats) setMarketStats(stats);
        } catch (error) {
            console.error('Failed to fetch market stats:', error);
        }
    }, []);

    useEffect(() => {
        fetchTasks();
        fetchMarketStats();
        if (isConnected) {
            fetchWorkerStats();
            fetchMyTasks();
        }

        const interval = setInterval(() => {
            fetchTasks();
            fetchMarketStats();
        }, 30000);

        return () => clearInterval(interval);
    }, [fetchTasks, fetchMarketStats, fetchWorkerStats, fetchMyTasks, isConnected]);

    // Claim task
    const handleClaimTask = async (taskId: string) => {
        if (!isConnected) return;
        setClaimingTask(taskId);
        try {
            await apiPost('/marketplace/tasks/' + taskId + '/claim', {});
            // Set as active task for mining
            const { workerService } = await import('../../services/WorkerService');
            workerService.targetTaskId = taskId;
            // Remove from list
            setTasks(prev => prev.filter(t => t.task_id !== taskId));
            // Haptic feedback
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }
        } catch (error) {
            console.error('Failed to claim task:', error);
            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('error');
            }
        } finally {
            setClaimingTask(null);
        }
    };

    // Create task
    const handleCreateTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isConnected) return;
        setLoading(true);

        try {
            const payload = {
                task_type: taskForm.task_type,
                operation: taskForm.operation,
                budget_gstd: taskForm.budget_gstd,
                difficulty: taskForm.difficulty,
                max_workers: taskForm.max_workers,
                estimated_time_sec: taskForm.estimated_time_sec,
                min_trust_score: taskForm.min_trust_score,
                geography: {
                    type: taskForm.geography_type,
                    countries: taskForm.geography_countries.split(',').map(s => s.trim()).filter(Boolean),
                },
            };

            const result = await apiPost<any>('/marketplace/tasks/create', payload);

            if (window.Telegram?.WebApp?.HapticFeedback) {
                window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
            }

            // Reset form and switch to my-tasks
            setActiveTab('my-tasks');
            fetchMyTasks();
        } catch (error: any) {
            console.error('Failed to create task:', error);
            alert(error.message || 'Failed to create task');
        } finally {
            setLoading(false);
        }
    };

    const getDifficultyColor = (difficulty: string) => {
        switch (difficulty) {
            case 'easy': return 'text-green-400';
            case 'medium': return 'text-yellow-400';
            case 'hard': return 'text-red-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'pending':
            case 'queued':
                return 'bg-yellow-500/20 text-yellow-400';
            case 'assigned':
                return 'bg-blue-500/20 text-blue-400';
            case 'completed':
                return 'bg-green-500/20 text-green-400';
            case 'failed':
                return 'bg-red-500/20 text-red-400';
            default:
                return 'bg-gray-500/20 text-gray-400';
        }
    };

    return (
        <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-white/10 pb-2">
                <button
                    onClick={() => setActiveTab('jobs')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'jobs'
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                        : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                >
                    🔍 Job Feed
                </button>
                <button
                    onClick={() => setActiveTab('create')}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'create'
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                        : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                >
                    ➕ Create Task
                </button>
                <button
                    onClick={() => { setActiveTab('my-tasks'); fetchMyTasks(); }}
                    className={`px-4 py-2 rounded-lg font-medium transition-all ${activeTab === 'my-tasks'
                        ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                        : 'bg-white/5 text-gray-400 hover:text-white'
                        }`}
                >
                    📋 My Tasks
                </button>
            </div>

            {/* Marketplace Stats */}
            {marketStats && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="glass-card p-4 text-center">
                        <div className="text-2xl font-bold text-purple-400">{marketStats.active_tasks}</div>
                        <div className="text-xs text-gray-400">Active Jobs</div>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <div className="text-2xl font-bold text-green-400">{marketStats.active_workers}</div>
                        <div className="text-xs text-gray-400">Workers Online</div>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <div className="text-2xl font-bold text-blue-400">{marketStats.total_payouts.toFixed(2)}</div>
                        <div className="text-xs text-gray-400">GSTD Paid Out</div>
                    </div>
                    <div className="glass-card p-4 text-center">
                        <div className="text-2xl font-bold text-yellow-400">
                            {((marketStats.platform_funds?.dev_fund || 0) + (marketStats.platform_funds?.gold_reserve || 0)).toFixed(2)}
                        </div>
                        <div className="text-xs text-gray-400">Platform Fund</div>
                    </div>
                </div>
            )}

            {/* Worker Stats (if connected) */}
            {isConnected && workerStats && (
                <div className="glass-card p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <span className="text-2xl">👷</span> Your Worker Stats
                    </h3>
                    <div className="grid grid-cols-4 gap-4 text-center">
                        <div>
                            <div className="text-xl font-bold text-white">{workerStats.total_tasks_completed}</div>
                            <div className="text-xs text-gray-400">Tasks Done</div>
                        </div>
                        <div>
                            <div className="text-xl font-bold text-green-400">{workerStats.total_earnings_gstd.toFixed(4)}</div>
                            <div className="text-xs text-gray-400">GSTD Earned</div>
                        </div>
                        <div>
                            <div className="text-xl font-bold text-blue-400">{(workerStats.reliability_score * 100).toFixed(0)}%</div>
                            <div className="text-xs text-gray-400">Reliability</div>
                        </div>
                        <div>
                            <div className="text-xl font-bold text-purple-400">{workerStats.avg_execution_time_ms}ms</div>
                            <div className="text-xs text-gray-400">Avg Time</div>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab Content */}
            {activeTab === 'jobs' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">Available Jobs</h3>
                        <button
                            onClick={fetchTasks}
                            className="text-sm text-gray-400 hover:text-white"
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    {tasks.length === 0 ? (
                        <div className="glass-card p-8 text-center">
                            <div className="text-4xl mb-4">🔍</div>
                            <p className="text-gray-400">No jobs available right now</p>
                            <p className="text-sm text-gray-500 mt-2">Check back soon or create your own task!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tasks.map(task => {
                                // Determine if task is "hot" (boosted - reward > budget/workers)
                                // Assuming we don't have total_reward_pool in AvailableTask, we can check if individual reward > budget/max_workers * 0.95 (standard)
                                const baseReward = (task.reward_gstd * 0.95);
                                const isHot = baseReward > 50 || task.workers_needed > 10; // Simple logic for now or add 'is_boosted' from API

                                return (
                                    <div key={task.task_id} className={`glass-card p-4 hover:border-purple-500/50 transition-all ${isHot ? 'border-amber-500/30' : ''}`}>
                                        {isHot && (
                                            <div className="absolute -top-2 -right-2 px-2 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full text-[10px] font-bold text-black shadow-lg shadow-orange-500/20 animate-pulse">
                                                🔥 HOT
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex items-center gap-3">
                                                <span className="text-2xl">
                                                    {task.task_type === 'network_survey' ? '📡' :
                                                        task.task_type === 'js_script' ? '📜' :
                                                            task.task_type === 'ai_inference' ? '🧠' :
                                                                task.task_type === 'scientific_simulation' ? '🧬' : '⚙️'}
                                                </span>
                                                <div>
                                                    <div className="font-semibold">{task.operation || task.task_type}</div>
                                                    <div className="text-xs text-gray-400">
                                                        <span className={getDifficultyColor(task.difficulty)}>{task.difficulty}</span>
                                                        {' • '}{task.geography}
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-lg font-bold text-green-400">
                                                    {(task.reward_gstd * 0.95).toFixed(4)} GSTD
                                                </div>
                                                <div className="text-xs text-gray-400">~{task.estimated_time_sec}s</div>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between">
                                            <div className="text-xs text-gray-500">
                                                {task.workers_completed}/{task.workers_needed} workers
                                                {task.min_trust_score > 0 && ` • Min trust: ${(task.min_trust_score * 100).toFixed(0)}%`}
                                            </div>
                                            <button
                                                onClick={() => handleClaimTask(task.task_id)}
                                                disabled={!isConnected || claimingTask === task.task_id}
                                                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-green-500/25 transition-all"
                                            >
                                                {claimingTask === task.task_id ? '⏳' : '⚡'} Claim
                                            </button>
                                            <button
                                                onClick={async () => {
                                                    if (!isConnected) return;
                                                    const amountStr = prompt('Enter amount of GSTD to contribute to this task reward pool:', '1.0');
                                                    if (!amountStr) return;
                                                    const amount = parseFloat(amountStr);
                                                    if (isNaN(amount) || amount <= 0) {
                                                        alert('Invalid amount');
                                                        return;
                                                    }

                                                    try {
                                                        await apiPost(`/marketplace/tasks/${task.task_id}/contribute`, { amount_gstd: amount });
                                                        alert('Contribution successful! Reward pool increased.');
                                                        fetchTasks(); // Refresh list
                                                        if (window.Telegram?.WebApp?.HapticFeedback) {
                                                            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
                                                        }
                                                    } catch (e: any) {
                                                        console.error(e);
                                                        alert('Contribution failed: ' + (e.response?.data?.error || e.message));
                                                    }
                                                }}
                                                disabled={!isConnected}
                                                className="ml-2 px-3 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-lg font-medium text-sm disabled:opacity-50 hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                                                title="Add rewards to this task (Crowdfunding)"
                                            >
                                                🚀 Boost
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'create' && (
                <div className="glass-card p-6">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <span className="text-2xl">➕</span> Create New Task
                    </h3>

                    {!isConnected ? (
                        <div className="text-center py-8">
                            <div className="text-4xl mb-4">🔗</div>
                            <p className="text-gray-400">Connect your wallet to create tasks</p>
                        </div>
                    ) : (
                        <form onSubmit={handleCreateTask} className="space-y-4">
                            {/* Task Type */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Task Type</label>
                                <select
                                    value={taskForm.task_type}
                                    onChange={(e) => setTaskForm({ ...taskForm, task_type: e.target.value })}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                >
                                    <option value="network_survey">📡 Network Survey</option>
                                    <option value="js_script">📜 JavaScript Script</option>
                                    <option value="wasm_binary">⚙️ WASM Binary</option>
                                    <option value="ai_inference">🧠 AI Inference (LLM/GenAI)</option>
                                    <option value="scientific_simulation">🧬 Scientific Simulation (Protein/Climate)</option>
                                </select>
                            </div>

                            {/* Dynamic Fields based on Type */}
                            {taskForm.task_type === 'ai_inference' && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Model Name (HuggingFace ID)</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. meta-llama/Llama-2-7b-chat-hf"
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                        onChange={(e) => setTaskForm({ ...taskForm, operation: `inference:${e.target.value}` })}
                                    />
                                </div>
                            )}

                            {taskForm.task_type === 'scientific_simulation' && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Simulation Type</label>
                                    <select
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                        onChange={(e) => setTaskForm({ ...taskForm, operation: e.target.value })}
                                    >
                                        <option value="protein_folding">🧬 Protein Folding</option>
                                        <option value="climate_modeling">🌍 Climate Modeling</option>
                                        <option value="astrophysics">🚀 Astrophysics Simulation</option>
                                    </select>
                                </div>
                            )}

                            {/* Budget */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">
                                    Budget (GSTD)
                                    <span className="text-xs text-yellow-400 ml-2">+5% platform fee</span>
                                </label>
                                <input
                                    type="number"
                                    value={taskForm.budget_gstd}
                                    onChange={(e) => setTaskForm({ ...taskForm, budget_gstd: parseFloat(e.target.value) || 0 })}
                                    min={0.001}
                                    step={0.001}
                                    className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                />
                                <div className="text-xs text-gray-500 mt-1">
                                    Total: {(taskForm.budget_gstd * 1.05).toFixed(4)} GSTD (incl. fee)
                                </div>
                            </div>

                            {/* Workers */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Max Workers</label>
                                    <input
                                        type="number"
                                        value={taskForm.max_workers}
                                        onChange={(e) => setTaskForm({ ...taskForm, max_workers: parseInt(e.target.value) || 1 })}
                                        min={1}
                                        max={100}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Reward per Worker</label>
                                    <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-green-400">
                                        {((taskForm.budget_gstd / taskForm.max_workers) * 0.95).toFixed(4)} GSTD
                                    </div>
                                </div>
                            </div>

                            {/* Difficulty */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Difficulty</label>
                                <div className="flex gap-2">
                                    {['easy', 'medium', 'hard'].map(d => (
                                        <button
                                            key={d}
                                            type="button"
                                            onClick={() => setTaskForm({ ...taskForm, difficulty: d })}
                                            className={`flex-1 py-2 rounded-lg font-medium capitalize transition-all ${taskForm.difficulty === d
                                                ? d === 'easy' ? 'bg-green-500/30 text-green-400 border border-green-500'
                                                    : d === 'medium' ? 'bg-yellow-500/30 text-yellow-400 border border-yellow-500'
                                                        : 'bg-red-500/30 text-red-400 border border-red-500'
                                                : 'bg-white/5 text-gray-400'
                                                }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Geography */}
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Geography</label>
                                <div className="flex gap-2 mb-2">
                                    <button
                                        type="button"
                                        onClick={() => setTaskForm({ ...taskForm, geography_type: 'global' })}
                                        className={`flex-1 py-2 rounded-lg ${taskForm.geography_type === 'global'
                                            ? 'bg-purple-500/30 text-purple-400 border border-purple-500'
                                            : 'bg-white/5 text-gray-400'
                                            }`}
                                    >
                                        🌍 Global
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setTaskForm({ ...taskForm, geography_type: 'countries' })}
                                        className={`flex-1 py-2 rounded-lg ${taskForm.geography_type === 'countries'
                                            ? 'bg-purple-500/30 text-purple-400 border border-purple-500'
                                            : 'bg-white/5 text-gray-400'
                                            }`}
                                    >
                                        🎯 Specific Countries
                                    </button>
                                </div>
                                {taskForm.geography_type === 'countries' && (
                                    <input
                                        type="text"
                                        placeholder="US, DE, JP (comma-separated)"
                                        value={taskForm.geography_countries}
                                        onChange={(e) => setTaskForm({ ...taskForm, geography_countries: e.target.value })}
                                        className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-white"
                                    />
                                )}
                            </div>

                            {/* Submit */}
                            <button
                                type="submit"
                                disabled={loading || taskForm.budget_gstd < 0.001}
                                className="w-full py-4 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg font-bold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-lg hover:shadow-purple-500/25 transition-all"
                            >
                                {loading ? '⏳ Creating...' : `🚀 Create Task (${(taskForm.budget_gstd * 1.05).toFixed(4)} GSTD)`}
                            </button>
                        </form>
                    )}
                </div>
            )}

            {activeTab === 'my-tasks' && (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold">My Created Tasks</h3>
                        <button
                            onClick={fetchMyTasks}
                            className="text-sm text-gray-400 hover:text-white"
                        >
                            🔄 Refresh
                        </button>
                    </div>

                    {!isConnected ? (
                        <div className="glass-card p-8 text-center">
                            <div className="text-4xl mb-4">🔗</div>
                            <p className="text-gray-400">Connect your wallet to view your tasks</p>
                        </div>
                    ) : myTasks.length === 0 ? (
                        <div className="glass-card p-8 text-center">
                            <div className="text-4xl mb-4">📋</div>
                            <p className="text-gray-400">You haven't created any tasks yet</p>
                            <button
                                onClick={() => setActiveTab('create')}
                                className="mt-4 px-6 py-2 bg-gradient-to-r from-purple-500 to-blue-500 rounded-lg font-medium"
                            >
                                Create Your First Task
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {myTasks.map(task => (
                                <div key={task.task_id} className="glass-card p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="font-semibold">{task.operation || task.task_type}</div>
                                        <span className={`px-2 py-1 rounded text-xs ${getStatusColor(task.status)}`}>
                                            {task.status}
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                            <div className="text-gray-400">Budget</div>
                                            <div className="font-medium">{task.budget_gstd?.toFixed(4)} GSTD</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400">Workers</div>
                                            <div className="font-medium">{task.workers_completed}/{task.max_workers}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-400">Paid Out</div>
                                            <div className="font-medium text-green-400">{task.paid_out_gstd?.toFixed(4)} GSTD</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
