import { useState, useEffect, memo } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import RegisterDeviceModal from './RegisterDeviceModal';
import EmptyState from '../common/EmptyState';
import { Server, Plus } from 'lucide-react';

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
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  useEffect(() => {
    if (address) {
      loadNodes();
    }
  }, [address]);

  const loadNodes = async () => {
    if (!address) return;
    
    setLoading(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
      const response = await fetch(`${apiUrl}/api/v1/nodes/my?wallet_address=${address}`);
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
          actionLabel={t('register_first_device') || 'Register Your First Device'}
          onAction={() => setShowRegisterModal(true)}
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
                        {node.status}
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
                      <button
                        onClick={() => setSelectedNodeId(node.id)}
                        className="glass-button text-white text-xs min-h-[32px]"
                      >
                        {t('connect_script') || 'Connect Script'}
                      </button>
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

      {selectedNodeId && (
        <ConnectScriptModal
          nodeId={selectedNodeId}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}

// Connect Script Modal Component
function ConnectScriptModal({ nodeId, onClose }: { nodeId: string; onClose: () => void }) {
  const { t } = useTranslation('common');
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://app.gstdtoken.com/api/v1';
  const command = `python3 worker.py --node_id ${nodeId} --api ${apiUrl}`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(command);
    alert(t('copied_to_clipboard') || 'Copied to clipboard!');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">
            {t('connect_script') || 'Connect Script'}
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

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('python_command') || 'Python Command:'}
            </label>
            <div className="bg-gray-50 rounded-lg p-4 font-mono text-sm relative">
              <code className="text-gray-900 break-all">{command}</code>
              <button
                onClick={copyToClipboard}
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
                title={t('copy') || 'Copy'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>{t('instructions') || 'Instructions:'}</strong>
            </p>
            <ol className="text-sm text-blue-800 list-decimal list-inside mt-2 space-y-1">
              <li>{t('install_sdk') || 'Install the GSTD Python SDK: pip install gstd-sdk'}</li>
              <li>{t('copy_command') || 'Copy the command above'}</li>
              <li>{t('run_command') || 'Run it in your terminal'}</li>
              <li>{t('worker_ready') || 'Your worker will start fetching and processing tasks automatically'}</li>
            </ol>
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



