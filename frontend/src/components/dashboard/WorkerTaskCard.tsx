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
    labor_compensation_gstd: number;
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
      toast.error(t('connect_wallet_to_work', 'Please connect your wallet to view and manage devices.') || 'Please connect your wallet to start working');
      return;
    }

    if (isRunning || isCompleted) {
      return;
    }

    // Set as active task for mining
    const { workerService } = await import('../../services/WorkerService');
    workerService.targetTaskId = task.task_id;

    // Haptic feedback on button press
    triggerHapticImpact('medium');

    setIsRunning(true);
    setProgress({
      progress: 0,
      status: 'running',
      message: t('starting_computation', 'Starting computation...') || 'Starting computation...'
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
        message: t('computation_completed', 'Computation completed') || 'Computation completed!'
      });

      // Sign result data with wallet (SECURITY: Required for validation)
      setProgress({
        progress: 95,
        status: 'running',
        message: t('signing_result', 'Signing result...') || 'Signing result...'
      });

      // Import signResultData function
      const { signResultData } = await import('../../lib/taskWorker');
      let signature: string;
      try {
        signature = await signResultData(task.task_id, result.result, tonConnectUI);
      } catch (error: any) {
        throw new Error(t('signature_failed', 'Signature failed') || `Signature failed: ${error?.message || 'Unknown error'}`);
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
        message: error?.message || t('task_execution_failed', 'Task execution failed') || 'Task execution failed'
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
    <div className="glass-card border-violet-500/30 bg-violet-500/10 p-4 sm:p-6 mb-4 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-violet-500/10 transition-colors" />

      {/* Task Info */}
      <div className="mb-4 relative z-10">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-black text-white uppercase tracking-tight mb-1">
              {task.task_type}
            </h3>
            <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">
              NODE_ID: {task.task_id.slice(0, 8)}...{task.task_id.slice(-6)}
            </p>
          </div>
          <div className="text-right ml-4">
            <p className="text-xl font-black text-violet-400 tabular-nums">
              {task.labor_compensation_gstd.toFixed(6)}
            </p>
            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{t('reward', 'Reward') || 'Bounty (GSTD)'}</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {progress.status !== 'idle' && (
        <div className="mb-6 relative z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">{progress.message}</span>
            <span className="text-xs font-black text-violet-400">{progress.progress}%</span>
          </div>
          <div className="h-2 bg-black/40 rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-400 transition-all duration-300 ease-out relative"
              style={{ width: `${progress.progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {!isCompleted ? (
        <button
          onClick={handleStartWork}
          disabled={isRunning || !address || !tonConnectUI?.connected}
          className="w-full relative h-[60px] bg-white/[0.03] border-2 border-white/5 rounded-2xl overflow-hidden group/btn hover:border-violet-500/50 transition-all active:scale-[0.98] disabled:opacity-30"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-violet-600/10 to-fuchsia-600/10 opacity-0 group-hover/btn:opacity-100 transition-opacity" />
          <div className="relative z-10 flex items-center justify-center gap-3">
            {isRunning ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                <span className="text-sm font-black text-white uppercase tracking-widest">{t('working', 'Working...') || 'Executing Core...'}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 text-violet-400" fill="currentColor" />
                <span className="text-sm font-black text-white uppercase tracking-widest">{t('start_work', 'Start Work') || 'Compute Task'}</span>
              </>
            )}
          </div>
        </button>
      ) : (
        <div
          className="w-full h-[60px] bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl flex items-center justify-center gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-black text-emerald-400 uppercase tracking-widest">{t('task_completed', 'Task Completed') || 'Verified'}</span>
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

