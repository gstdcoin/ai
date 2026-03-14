import { useState, useEffect, memo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { logger } from '../../lib/logger';
import { apiGet } from '../../lib/apiClient';

interface TaskDetailsModalProps {
  taskId: string;
  onClose: () => void;
}

interface TaskDetails {
  task_id: string;
  task_type: string;
  status: string;
  escrow_status: string;
  labor_compensation_gstd: number;
  created_at: string;
  assigned_at?: string;
  completed_at?: string;
  assigned_device?: string;
  execution_time_ms?: number;
  platform_fee_gstd?: number;
  executor_reward_gstd?: number;
  priority_score?: number;
  executor_payout_status?: string;
  min_trust_score?: number;
  confidence_depth?: number;
  result?: unknown;
}

function TaskDetailsModal({ taskId, onClose }: TaskDetailsModalProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [task, setTask] = useState<TaskDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<unknown>(null);
  const [loadingResult, setLoadingResult] = useState(false);

  const loadTaskDetails = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<TaskDetails>(`/tasks/${taskId}`);
      setTask(data);
    } catch (error) {
      logger.error('Error loading task details', error);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    loadTaskDetails();
  }, [loadTaskDetails]);

  const loadResult = async () => {
    if (!address) return;
    setLoadingResult(true);
    try {
      // Use device endpoint for result retrieval
      const data = await apiGet<{ result: unknown }>(
        `/device/tasks/${taskId}/result`,
        { requester_address: address }
      );

      if (data && data.result) {
        setResult(data.result);
      }
    } catch (error) {
      logger.error('Error loading result', error);
    } finally {
      setLoadingResult(false);
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      assigned: 'bg-blue-100 text-blue-800',
      executing: 'bg-purple-100 text-purple-800',
      validating: 'bg-indigo-100 text-indigo-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8">
          <div className="text-gray-500">{t('loading', 'Loading...')}</div>
        </div>
      </div>
    );
  }

  if (!task) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-2xl font-bold">{t('task_details', 'Task Details')}</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Статус */}
          <div className="flex gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('status', 'Status')}
              </label>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(task.status)}`}>
                {t(task.status)}
              </span>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('escrow_status', 'Escrow Status')}
              </label>
              <span className={`px-3 py-1 rounded-full text-sm font-semibold ${task.escrow_status === 'locked' ? 'bg-green-100 text-green-800' :
                  task.escrow_status === 'awaiting' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                }`}>
                {t(task.escrow_status)}
              </span>
            </div>
          </div>

          {/* Информация о задании */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('task_id', 'Task ID')}
              </label>
              <div className="text-sm font-mono text-gray-600">{task.task_id}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('task_type', 'Task Type')}
              </label>
              <div className="text-sm text-gray-600">{task.task_type}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('labor_compensation', 'Compensation')}
              </label>
              <div className="text-sm text-gray-600">{task.labor_compensation_gstd} GSTD</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('created_at', 'Created')}
              </label>
              <div className="text-sm text-gray-600">
                {new Date(task.created_at).toLocaleString()}
              </div>
            </div>
          </div>

          {/* Информация о выполнении */}
          {task.assigned_at && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('assigned', 'Assigned')}
              </label>
              <div className="text-sm text-gray-600">
                {new Date(task.assigned_at).toLocaleString()}
              </div>
            </div>
          )}

          {task.execution_time_ms && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('execution_time', 'Execution Time')}
              </label>
              <div className="text-sm text-gray-600">{task.execution_time_ms} ms</div>
            </div>
          )}

          {/* Выплаты */}
          {task.platform_fee_gstd && task.executor_reward_gstd && (
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-2">{t('payment_breakdown', 'Payment Breakdown')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t('executor_compensation', 'Executor Compensation') || t('executor_reward', 'Executor Reward')}:</span>
                  <span className="font-medium">{task.executor_reward_gstd} GSTD</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('platform_fee', 'Platform Fee')}:</span>
                  <span className="font-medium">{task.platform_fee_gstd} GSTD</span>
                </div>
                <div className="flex justify-between font-semibold border-t pt-2">
                  <span>{t('total', 'Total')}:</span>
                  <span>{task.labor_compensation_gstd} GSTD</span>
                </div>
              </div>
            </div>
          )}

          {/* Результат */}
          {task.status === 'completed' || task.status === 'validating' ? (
            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold">{t('result', 'Result')}</h3>
                {!result && (
                  <button
                    onClick={loadResult}
                    disabled={loadingResult}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
                  >
                    {loadingResult ? t('loading', 'Loading...') : t('load_result', 'Load Result')}
                  </button>
                )}
              </div>
              {result ? (
                <div className="bg-gray-50 rounded-lg p-4">
                  <pre className="text-sm overflow-auto">
                    {JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">{t('result_not_loaded', 'Result not loaded')}</div>
              )}
            </div>
          ) : null}

          <div className="flex justify-end pt-4 border-t">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              {t('close', 'Close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export default memo(TaskDetailsModal, (prevProps, nextProps) => {
  // Only re-render if taskId or onClose changes
  return prevProps.taskId === nextProps.taskId && prevProps.onClose === nextProps.onClose;
});