import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { API_BASE_URL } from '../../lib/config';

interface CreateTaskModalProps {
  onClose: () => void;
  onTaskCreated?: () => void;
}

export default function CreateTaskModal({ onClose, onTaskCreated }: CreateTaskModalProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    task_type: 'inference',
    operation: '',
    model: '',
    input_source: 'ipfs',
    input_hash: '',
    time_limit_sec: 5,
    max_energy_mwh: 10,
    labor_compensation_ton: 0.05,
    validation_method: 'majority',
    min_trust: 0.1,
    is_private: false,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const apiBase = API_BASE_URL;
      const response = await fetch(`${apiBase}/api/v1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requester_address: address,
          task_type: formData.task_type,
          operation: formData.operation,
          model: formData.model,
          input_source: formData.input_source,
          input_hash: formData.input_hash,
          time_limit_sec: formData.time_limit_sec,
          max_energy_mwh: formData.max_energy_mwh,
          labor_compensation_ton: formData.labor_compensation_ton,
          validation_method: formData.validation_method,
          min_trust: formData.min_trust,
          is_private: formData.is_private
        }),
      });

      if (response.ok) {
        // Trigger haptic feedback
        if (onTaskCreated) {
          onTaskCreated();
        }
        toast.success(t('task_created') || 'Task created successfully');
        onClose();
      } else {
        const error = await response.json();
        const errorMsg = error.message || t('error') || 'Failed to create task';
        toast.error('Error', errorMsg);
      }
    } catch (error) {
      logger.error('Error creating task', error);
      toast.error('Error', t('error') || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold">{t('create_task')}</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('task_type')}
            </label>
            <select
              value={formData.task_type}
              onChange={(e) => setFormData({ ...formData, task_type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="inference">Inference</option>
              <option value="human">Human</option>
              <option value="validation">Validation</option>
              <option value="agent">Agent</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('operation')}
            </label>
            <input
              type="text"
              value={formData.operation}
              onChange={(e) => setFormData({ ...formData, operation: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="classify_text"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('model')}
            </label>
            <input
              type="text"
              value={formData.model}
              onChange={(e) => setFormData({ ...formData, model: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="light-nlp-v1"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('time_limit')}
              </label>
              <input
                type="number"
                min="1"
                max="5"
                value={formData.time_limit_sec}
                onChange={(e) => setFormData({ ...formData, time_limit_sec: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('max_energy')}
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={formData.max_energy_mwh}
                onChange={(e) => setFormData({ ...formData, max_energy_mwh: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('labor_compensation')} (TON)
            </label>
            <input
              type="number"
              step="0.001"
              min="0.01"
              value={formData.labor_compensation_ton}
              onChange={(e) => setFormData({ ...formData, labor_compensation_ton: parseFloat(e.target.value) })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('validation_method')}
            </label>
            <select
              value={formData.validation_method}
              onChange={(e) => setFormData({ ...formData, validation_method: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="reference">{t('reference')}</option>
              <option value="majority">{t('majority')}</option>
              <option value="ai_check">{t('ai_check')}</option>
              <option value="human">{t('human')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('input_source')}
            </label>
            <select
              value={formData.input_source}
              onChange={(e) => setFormData({ ...formData, input_source: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              required
            >
              <option value="ipfs">IPFS</option>
              <option value="http">HTTP</option>
              <option value="inline">Inline</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('input_hash')}
            </label>
            <input
              type="text"
              value={formData.input_hash}
              onChange={(e) => setFormData({ ...formData, input_hash: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder="Qm..."
              required
            />
          </div>

          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {loading ? t('loading') : t('submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}



