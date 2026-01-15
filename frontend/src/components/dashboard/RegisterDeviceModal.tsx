import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { logger } from '../../lib/logger';
import { API_BASE_URL } from '../../lib/config';
import { apiPost } from '../../lib/apiClient';
import { toast } from '../../lib/toast';

interface RegisterDeviceModalProps {
  onClose: () => void;
  onDeviceRegistered?: (nodeId: string) => void;
}

interface DeviceSpecs {
  cpu?: string;
  ram?: number;
}

export default function RegisterDeviceModal({ onClose, onDeviceRegistered }: RegisterDeviceModalProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    cpu: '',
    ram: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      setError('Wallet not connected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const specs: DeviceSpecs = {};
      if (formData.cpu) {
        specs.cpu = formData.cpu;
      }
      if (formData.ram) {
        specs.ram = parseInt(formData.ram) || 0;
      }

      interface NodeResponse {
        id: string;
        [key: string]: unknown;
      }
      
      const nodeData = await apiPost<NodeResponse>(
        `/nodes/register?wallet_address=${address}`,
        {
          name: formData.name,
          specs: specs,
        }
      );
      
      setNodeId(nodeData.id);
      setSuccess(true);
      
      toast.success(
        t('device_registered') || 'Device Registered Successfully!',
        t('device_registered_message') || 'Your computing node has been registered and is ready to process tasks.'
      );
      
      if (onDeviceRegistered) {
        onDeviceRegistered(nodeData.id);
      }
    } catch (err: any) {
      logger.error('Error registering device', err);
      const errorMessage = err?.message || 'Failed to register device';
      setError(errorMessage);
      toast.error(
        t('error') || 'Error',
        errorMessage
      );
    } finally {
      setLoading(false);
    }
  };

  if (success && nodeId) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="glass-card max-w-md w-full p-6">
          <div className="text-center">
            <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-500/20 border border-green-500/50 mb-4">
              <svg className="h-6 w-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white mb-2">
              {t('device_registered') || 'Device Registered Successfully!'}
            </h3>
            <p className="text-sm text-gray-300 mb-4">
              {t('device_registered_message') || 'Your computing node has been registered.'}
            </p>
            <div className="bg-white/5 rounded-lg p-4 mb-4 border border-white/10">
              <p className="text-xs text-gray-400 mb-2 font-semibold">
                {t('node_id') || 'Node ID'}:
              </p>
              <p className="text-sm font-mono text-white break-all">
                {nodeId}
              </p>
              <p className="text-xs text-gray-400 mt-2">
                {t('node_id_instruction') || 'Tasks will be processed automatically in your browser. No installation needed!'}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-full glass-button-gold px-4 py-2 rounded-lg transition-colors min-h-[44px]"
            >
              {t('close') || 'Close'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="glass-card max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">
            {t('register_device') || 'Register Device'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors glass-button p-1 rounded"
            aria-label="Close"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mb-4 bg-red-500/20 border border-red-500/50 rounded-lg p-3">
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-1">
              {t('device_name') || 'Device Name'} *
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-gold-900 focus:border-gold-900 transition-colors"
              placeholder={t('device_name_placeholder') || 'e.g., My-PC, Server-01'}
            />
          </div>

          <div>
            <label htmlFor="cpu" className="block text-sm font-medium text-gray-300 mb-1">
              {t('cpu_model') || 'CPU Model'} (Optional)
            </label>
            <input
              type="text"
              id="cpu"
              value={formData.cpu}
              onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-gold-900 focus:border-gold-900 transition-colors"
              placeholder={t('cpu_placeholder') || 'e.g., Intel i7-9700K, AMD Ryzen 9 5900X'}
            />
          </div>

          <div>
            <label htmlFor="ram" className="block text-sm font-medium text-gray-300 mb-1">
              {t('ram_gb') || 'RAM (GB)'} (Optional)
            </label>
            <input
              type="number"
              id="ram"
              min="1"
              value={formData.ram}
              onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:ring-2 focus:ring-gold-900 focus:border-gold-900 transition-colors"
              placeholder={t('ram_placeholder') || 'e.g., 16, 32, 64'}
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 glass-button text-white rounded-lg transition-colors min-h-[44px]"
              disabled={loading}
            >
              {t('cancel') || 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading || !formData.name}
              className="flex-1 px-4 py-2 glass-button-gold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
            >
              {loading ? (t('registering') || 'Registering...') : (t('register') || 'Register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

