// Worker Task Card - One-tap task execution with progress bar
import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { getTaskRunner, TaskRunnerProgress } from '../../lib/taskRunner';
import { triggerHapticImpact, triggerHapticNotification } from '../../lib/telegram';
import { API_BASE_URL } from '../../lib/config';
import { toast } from '../../lib/toast';
import { Play, CheckCircle2, Loader2 } from 'lucide-react';

interface WorkerTaskCardProps {
  task: {
    task_id: string;
    task_type: string;
    status: string;
    labor_compensation_ton: number;
    created_at: string;
    payload?: any;
  };
  onTaskCompleted?: () => void;
}

export default function WorkerTaskCard({ task, onTaskCompleted }: WorkerTaskCardProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [progress, setProgress] = useState<TaskRunnerProgress>({
    progress: 0,
    status: 'idle',
    message: ''
  });
  const [isRunning, setIsRunning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const handleStartWork = async () => {
    if (!address || !tonConnectUI?.connected) {
      toast.error(t('connect_wallet_to_work') || 'Please connect your wallet to start working');
      return;
    }

    if (isRunning || isCompleted) {
      return;
    }

    // Haptic feedback on button press
    triggerHapticImpact('medium');

    setIsRunning(true);
    setProgress({
      progress: 0,
      status: 'running',
      message: t('starting_computation') || 'Starting computation...'
    });

    try {
      const taskRunner = getTaskRunner();

      // Run task computation (10 seconds simulation)
      const result = await taskRunner.runTask(
        task.task_id,
        task.payload || {},
        10000, // 10 seconds
        (progressUpdate) => {
          setProgress(progressUpdate);
        }
      );

      // Task computation completed
      setProgress({
        progress: 100,
        status: 'completed',
        message: t('computation_completed') || 'Computation completed!'
      });

      // Sign result data with wallet (SECURITY: Required for validation)
      setProgress({
        progress: 95,
        status: 'running',
        message: t('signing_result') || 'Signing result...'
      });

      // Import signResultData function
      const { signResultData } = await import('../../lib/taskWorker');
      let signature: string;
      try {
        signature = await signResultData(task.task_id, result.result, tonConnectUI);
      } catch (error: any) {
        throw new Error(t('signature_failed') || `Signature failed: ${error?.message || 'Unknown error'}`);
      }

      // Submit result to backend with signature
      // Use apiPost to automatically include session token
      const { apiPost } = await import('../../lib/apiClient');
      await apiPost('/tasks/worker/submit', {
        task_id: task.task_id,
        node_id: address, // Using wallet address as node_id for browser workers
        result: result.result,
        signature: signature, // SECURITY: Add signature for validation
        execution_time_ms: result.executionTimeMs,
      });



      // Success!
      setIsCompleted(true);
      triggerHapticNotification('success');

      if (onTaskCompleted) {
        onTaskCompleted();
      }
    } catch (error: any) {
      // Task execution failed
      setProgress({
        progress: 0,
        status: 'error',
        message: error?.message || t('task_execution_failed') || 'Task execution failed'
      });
      triggerHapticNotification('error');
      setIsRunning(false);
    }
  };

  // Reset when task changes
  useEffect(() => {
    setIsRunning(false);
    setIsCompleted(false);
    setProgress({
      progress: 0,
      status: 'idle',
      message: ''
    });
  }, [task.task_id]);

  return (
    <div className="glass-card border-gold-900/30 bg-gold-900/10 p-4 sm:p-6 mb-4">
      {/* Task Info */}
      <div className="mb-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-white font-display mb-1">
              {task.task_type}
            </h3>
            <p className="text-xs text-gray-400 font-mono truncate">
              {t('task_id')}: {task.task_id.slice(0, 8)}...{task.task_id.slice(-6)}
            </p>
          </div>
          <div className="text-right ml-4">
            <p className="text-sm font-semibold text-gold-900">
              {task.labor_compensation_ton.toFixed(6)} TON
            </p>
            <p className="text-xs text-gray-400">{t('reward')}</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {progress.status !== 'idle' && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300">{progress.message}</span>
            <span className="text-sm font-semibold text-gold-900">{progress.progress}%</span>
          </div>
          <div className="glass-dark h-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-gold-900/50 to-gold-900 transition-all duration-300 ease-out relative"
              style={{ width: `${progress.progress}%` }}
            >
              {/* Shimmer effect */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isCompleted ? (
        <button
          onClick={handleStartWork}
          disabled={isRunning || !address || !tonConnectUI?.connected}
          className="w-full glass-button-gold text-white font-bold py-4 px-6 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 min-h-[56px] hover:scale-[1.02] active:scale-[0.98]"
        >
          {isRunning ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{t('working') || 'Working...'}</span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5" fill="currentColor" />
              <span className="text-lg">{t('start_work') || 'START WORK'}</span>
            </>
          )}
        </button>
      ) : (
        <div
          className="w-full glass-button-gold text-white font-bold py-4 px-6 rounded-lg flex items-center justify-center gap-3 min-h-[56px] bg-green-500/20 border-green-500/50"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
          <span className="text-lg">{t('task_completed') || 'Task Completed!'}</span>
        </div>
      )}

      {/* Status Message */}
      {progress.status === 'error' && (
        <div
          className="mt-3 p-3 bg-red-500/20 border border-red-500/50 rounded-lg"
          role="alert"
          aria-live="assertive"
        >
          <p className="text-sm text-red-300">{progress.message}</p>
        </div>
      )}
    </div>
  );
}

