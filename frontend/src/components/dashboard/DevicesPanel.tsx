import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import RegisterDeviceModal from './RegisterDeviceModal';
import { EmptyState } from '../common/EmptyState';
import { Server, Plus } from 'lucide-react';
import { useAutoTaskWorker } from '../../hooks/useAutoTaskWorker';

interface Node {
  id: string;
  wallet_address: string;
  name: string;
  status: string;
  cpu_model?: string;
  ram_gb?: number;
  last_seen: string;
  created_at: string;
  updated_at: string;
}

export default function DevicesPanel() {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  
  // Auto-start task workers for all registered nodes
  useAutoTaskWorker(nodes);

  useEffect(() => {
    if (address) {
      loadNodes();
    }
  }, [address]);

  const loadNodes = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const apiBase = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/+$/, '');
      const response = await fetch(`${apiBase}/api/v1/nodes/my?wallet_address=${address}`);
      const data = await response.json();
      setNodes(data.nodes || []);
    } catch (error) {
      console.error('Error loading nodes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeviceRegistered = (nodeId: string) => {
    // Reload nodes after registration
    loadNodes();
  };

  const getStatusColor = (status: string) => {
    if (status === 'online') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="glass-card">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-900 mx-auto"></div>
          <p className="text-gray-400 mt-4">{t('loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">{t('my_nodes') || 'My Computing Nodes'}</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {t('total_nodes') || 'Total nodes'}: {nodes.length}
          </p>
        </div>
        <button
          onClick={() => setShowRegisterModal(true)}
          className="glass-button-gold min-h-[44px]"
        >
          <Plus size={18} />
          <span>{t('register_device') || 'Register Device'}</span>
        </button>
      </div>

      {nodes.length === 0 ? (
        <EmptyState
          icon={<Server className="text-gray-400" size={48} />}
          title={t('no_nodes') || 'No devices registered'}
          description={t('no_nodes_desc') || 'Register your first computing node to start earning GSTD by processing tasks.'}
          action={
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('register_first_device') || 'Register Your First Device'}
            </button>
          }
        />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('name') || 'Name'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    {t('node_id') || 'Node ID'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('status') || 'Status'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    {t('specs') || 'Specs'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    {t('last_seen') || 'Last Seen'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('actions') || 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {nodes.map((node) => (
                  <tr key={node.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">{node.name}</div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      <div className="text-sm font-mono text-gray-400 break-all max-w-xs">
                        {node.id}
                      </div>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        node.status === 'online' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {node.status === 'online' 
                          ? (t('auto_processing') || 'Auto Processing') 
                          : (t('offline') || 'Offline')}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-300 hidden md:table-cell">
                      {node.cpu_model && (
                        <div>CPU: {node.cpu_model}</div>
                      )}
                      {node.ram_gb && (
                        <div>RAM: {node.ram_gb} GB</div>
                      )}
                      {!node.cpu_model && !node.ram_gb && (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-400 hidden lg:table-cell">
                      {formatDate(node.last_seen)}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        node.status === 'online' 
                          ? 'bg-green-500/20 text-green-400' 
                          : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {node.status === 'online' 
                          ? (t('auto_processing') || 'Auto Processing') 
                          : (t('offline') || 'Offline')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showRegisterModal && (
        <RegisterDeviceModal
          onClose={() => setShowRegisterModal(false)}
          onDeviceRegistered={handleDeviceRegistered}
        />
      )}

      {/* УБРАНО: Connect Script Modal - задания выполняются автоматически в браузере */}
    </div>
  );
}

// УБРАНО: Connect Script Modal - задания выполняются автоматически в браузере



