import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { createTaskSchema, type CreateTaskFormData } from '../../lib/validation';

interface NewTaskModalProps {
  onClose: () => void;
  onTaskCreated?: () => void;
}

interface CreateTaskResponse {
  task_id: string;
  status: string;
  payment_memo: string;
  amount: number;
  platform_wallet: string;
}

export default function NewTaskModal({ onClose, onTaskCreated }: NewTaskModalProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'form' | 'payment' | 'confirming' | 'success'>('form');
  const [taskData, setTaskData] = useState<CreateTaskResponse | null>(null);
  const [formData, setFormData] = useState<{
    type: string;
    budget: string;
    payload: string;
  }>({
    type: 'AI_INFERENCE',
    budget: '',
    payload: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      const errorMsg = 'Wallet not connected';
      setError(errorMsg);
      toast.error('Wallet required', 'Please connect your wallet first');
      return;
    }

    // Validate form
    if (!validateForm()) {
      toast.error('Validation failed', 'Please check the form fields');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Проверка баланса GSTD только при создании задания
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const balanceResponse = await fetch(`${apiBase}/api/v1/wallet/gstd-balance?address=${address}`);
      
      // Use the same threshold as backend (0.000001 GSTD)
      const MIN_GSTD_BALANCE = 0.000001;
      
      if (balanceResponse.ok) {
        const balanceData = await balanceResponse.json();
        const balance = parseFloat(balanceData.balance) || 0;
        
        // Check balance directly - if balance is >= threshold, allow task creation
        // has_gstd might be false if API check failed, but balance might still be > 0
        if (balance < MIN_GSTD_BALANCE) {
          throw new Error(t('gstd_required_for_tasks') || 'You need at least 0.000001 GSTD tokens to create tasks. Please purchase GSTD tokens first.');
        }
      } else {
        // If API call fails, log warning but don't block task creation
        // The backend will handle the actual balance check during task creation
        logger.warn('Failed to check GSTD balance, but allowing task creation to proceed. Backend will verify balance.');
      }

      const budget = parseFloat(formData.budget);
      const payloadObj = formData.payload.trim() ? JSON.parse(formData.payload) : {};

      const response = await fetch(`${apiBase}/api/v1/tasks/create?wallet_address=${address}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: formData.type,
          budget: budget,
          payload: payloadObj,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create task');
      }

      const data: CreateTaskResponse = await response.json();
      setTaskData(data);
      setStep('payment');
      toast.success('Task created successfully', 'Please complete the payment');
    } catch (err: any) {
      logger.error('Error creating task', err);
      const errorMsg = err?.message || 'Failed to create task';
      setError(errorMsg);
      toast.error('Failed to create task', errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const validateForm = (): boolean => {
    try {
      createTaskSchema.parse(formData);
      setFormErrors({});
      return true;
    } catch (error: any) {
      if (error.errors) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          if (err.path.length > 0) {
            errors[err.path[0]] = err.message;
          }
        });
        setFormErrors(errors);
      }
      return false;
    }
  };

  const handleFormChange = (field: keyof typeof formData, value: string) => {
    setFormData({ ...formData, [field]: value });
    // Clear error for this field when user starts typing
    if (formErrors[field]) {
      setFormErrors({ ...formErrors, [field]: '' });
    }
  };

  const handlePayment = async () => {
    if (!tonConnectUI || !taskData) {
      setError('TonConnect not available');
      return;
    }

    setStep('confirming');
    setError(null);

    try {
      // Note: Jetton transfers via TonConnect require special handling
      // For now, we'll show instructions and start polling for payment confirmation
      // In production, implement proper jetton transfer using @ton/core or similar
      
      logger.debug('Payment details', {
        platform_wallet: taskData.platform_wallet,
        amount: taskData.amount,
        memo: taskData.payment_memo,
      });

      // Start polling for payment confirmation
      // The PaymentWatcher service will detect the payment and update the task status
    } catch (err: any) {
      logger.error('Error initiating payment', err);
      const errorMsg = err?.message || 'Failed to initiate payment';
      setError(errorMsg);
      toast.error('Payment error', errorMsg);
      setStep('payment');
    }
  };

  // Poll for payment confirmation
  useEffect(() => {
    if (step === 'confirming' && taskData) {
      const interval = setInterval(async () => {
        try {
          const paymentApiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
          const response = await fetch(`${paymentApiUrl}/api/v1/tasks/${taskData.task_id}/payment`);
          
          if (response.ok) {
            const task = await response.json();
            if (task.status === 'queued') {
              setStep('success');
              if (onTaskCreated) {
                onTaskCreated();
              }
              clearInterval(interval);
            }
          }
        } catch (err) {
          logger.error('Error checking task status', err);
        }
      }, 5000); // Check every 5 seconds

      return () => clearInterval(interval);
    }
  }, [step, taskData?.task_id, address]); // Removed onTaskCreated to prevent infinite loop

  if (step === 'success' && taskData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100 mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('task_created') || 'Task Created Successfully!'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('payment_confirmed') || 'Your payment has been confirmed and the task is now queued.'}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-600 mb-1 font-semibold">
                {t('task_id') || 'Task ID'}:
              </p>
              <p className="text-sm font-mono text-gray-900 break-all">
                {taskData.task_id}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('close') || 'Close'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'confirming') {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
              <svg className="animate-spin h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {t('waiting_confirmation') || 'Waiting for Blockchain Confirmation'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('confirming_payment') || 'Please wait while we confirm your payment on the blockchain...'}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-600 mb-1">
                {t('task_id') || 'Task ID'}: {taskData?.task_id}
              </p>
              <p className="text-xs text-gray-600">
                {t('amount') || 'Amount'}: {taskData?.amount} GSTD
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {t('close') || 'Close'} (Task will continue processing)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'payment' && taskData) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {t('pay_for_task') || 'Pay for Task'}
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <div className="space-y-4 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">{t('task_id') || 'Task ID'}:</span>
                <span className="text-sm font-mono text-gray-900">{taskData.task_id}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-gray-600">{t('amount') || 'Amount'}:</span>
                <span className="text-sm font-semibold text-gray-900">{taskData.amount} GSTD</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">{t('payment_memo') || 'Payment Memo'}:</span>
                <span className="text-sm font-mono text-gray-900">{taskData.payment_memo}</span>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-800 font-semibold mb-2">
                {t('payment_instruction_title') || 'Payment Instructions:'}
              </p>
              <ol className="text-xs text-blue-800 list-decimal list-inside space-y-1">
                <li>{t('payment_step1') || 'Open your TON wallet'}</li>
                <li>{t('payment_step2')?.replace('{amount}', taskData.amount.toString())?.replace('{wallet}', taskData.platform_wallet) || `Send ${taskData.amount} GSTD to: ${taskData.platform_wallet}`}</li>
                <li>{t('payment_step3')?.replace('{memo}', taskData.payment_memo) || `Include this memo in the transaction: ${taskData.payment_memo}`}</li>
                <li>{t('payment_step4') || 'Click "Confirm Payment" after sending'}</li>
              </ol>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep('form')}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('back') || 'Back'}
            </button>
            <button
              onClick={handlePayment}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              {t('confirm_payment') || 'Confirm Payment'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t('create_task') || 'Create New Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-1">
              {t('task_type') || 'Task Type'} *
            </label>
            <select
              id="type"
              required
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="AI_INFERENCE">AI_INFERENCE</option>
              <option value="DATA_PROCESSING">DATA_PROCESSING</option>
              <option value="COMPUTATION">COMPUTATION</option>
            </select>
          </div>

          <div>
            <label htmlFor="budget" className="block text-sm font-medium text-gray-700 mb-1">
              {t('budget_gstd') || 'Budget (GSTD)'} *
            </label>
            <input
              type="number"
              id="budget"
              required
              min="0.000000001"
              step="0.000000001"
              value={formData.budget}
              onChange={(e) => handleFormChange('budget', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
                formErrors.budget ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="10.5"
            />
            {formErrors.budget && (
              <p className="mt-1 text-sm text-red-600">{formErrors.budget}</p>
            )}
          </div>

          <div>
            <label htmlFor="payload" className="block text-sm font-medium text-gray-700 mb-1">
              {t('payload') || 'Payload (JSON)'} (Optional)
            </label>
            <textarea
              id="payload"
              value={formData.payload}
              onChange={(e) => handleFormChange('payload', e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm ${
                formErrors.payload ? 'border-red-300' : 'border-gray-300'
              }`}
              rows={4}
              placeholder='{"input": "data", "model": "gpt-4"}'
            />
            {formErrors.payload ? (
              <p className="mt-1 text-sm text-red-600">{formErrors.payload}</p>
            ) : (
              <p className="text-xs text-gray-500 mt-1">
                {t('payload_help') || 'Enter valid JSON or leave empty'}
              </p>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading || !formData.type || !formData.budget || !address || !tonConnectUI?.connected}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative group"
              title={!address || !tonConnectUI?.connected ? (t('connect_wallet_to_create_task') || 'Connect wallet to create task') : ''}
            >
              {loading ? (t('creating') || 'Creating...') : (t('create') || 'Create Task')}
              {(!address || !tonConnectUI?.connected) && (
                <span className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
                  {t('connect_wallet_to_create_task') || 'Connect wallet to create task'}
                </span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

