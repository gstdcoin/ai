import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';

interface RegisterDeviceModalProps {
  onClose: () => void;
  onDeviceRegistered?: (nodeId: string) => void;
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
      const specs: any = {};
      if (formData.cpu) {
        specs.cpu = formData.cpu;
      }
      if (formData.ram) {
        specs.ram = parseInt(formData.ram) || 0;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/v1/nodes/register?wallet_address=${address}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          specs: specs,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to register device');
      }

      const nodeData = await response.json();
      setNodeId(nodeData.id);
      setSuccess(true);
      
      if (onDeviceRegistered) {
        onDeviceRegistered(nodeData.id);
      }
    } catch (err: any) {
      console.error('Error registering device:', err);
      setError(err?.message || 'Failed to register device');
    } finally {
      setLoading(false);
    }
  };

  if (success && nodeId) {
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
              {t('device_registered') || 'Device Registered Successfully!'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {t('device_registered_message') || 'Your computing node has been registered.'}
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-600 mb-2 font-semibold">
                {t('node_id') || 'Node ID'}:
              </p>
              <p className="text-sm font-mono text-gray-900 break-all">
                {nodeId}
              </p>
              <p className="text-xs text-gray-500 mt-2">
                {t('node_id_instruction') || 'Save this ID - you will need it for your worker script.'}
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t('register_device') || 'Register Device'}
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
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              {t('device_name') || 'Device Name'} *
            </label>
            <input
              type="text"
              id="name"
              required
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('device_name_placeholder') || 'e.g., My-PC, Server-01'}
            />
          </div>

          <div>
            <label htmlFor="cpu" className="block text-sm font-medium text-gray-700 mb-1">
              {t('cpu_model') || 'CPU Model'} (Optional)
            </label>
            <input
              type="text"
              id="cpu"
              value={formData.cpu}
              onChange={(e) => setFormData({ ...formData, cpu: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('cpu_placeholder') || 'e.g., Intel i7-9700K, AMD Ryzen 9 5900X'}
            />
          </div>

          <div>
            <label htmlFor="ram" className="block text-sm font-medium text-gray-700 mb-1">
              {t('ram_gb') || 'RAM (GB)'} (Optional)
            </label>
            <input
              type="number"
              id="ram"
              min="1"
              value={formData.ram}
              onChange={(e) => setFormData({ ...formData, ram: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder={t('ram_placeholder') || 'e.g., 16, 32, 64'}
            />
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
              disabled={loading || !formData.name}
              className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (t('registering') || 'Registering...') : (t('register') || 'Register')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

