import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import RegisterDeviceModal from './RegisterDeviceModal';
import { EmptyState } from '../common/EmptyState';
import { SkeletonTable } from '../common/SkeletonLoader';
import { Server, Plus } from 'lucide-react';
import { useAutoTaskWorker } from '../../hooks/useAutoTaskWorker';
import { logger } from '../../lib/logger';
import { apiGet } from '../../lib/apiClient';
import { toast } from '../../lib/toast';

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
  source?: 'node' | 'device';
}

interface Device {
  device_id: string;
  device_type: string;
  reputation?: number;
  total_tasks?: number;
  successful_tasks?: number;
  last_seen_at: string;
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
      // If кошелёк подключён – грузим устройства
      loadNodes();
    } else {
      // Если адреса нет – сразу убираем загрузку и очищаем список
      setNodes([]);
      setLoading(false);
    }
  }, [address]);

  const loadNodes = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const [nodesRes, devicesRes] = await Promise.all([
        apiGet<{ nodes: Node[] }>('/nodes/my', { wallet_address: address }),
        apiGet<{ devices: Device[] }>('/devices/my', { wallet_address: address }).catch(() => ({ devices: [] })),
      ]);

      const nodeList: Node[] = (nodesRes.nodes || []).map((n) => ({ ...n, source: 'node' as const }));
      const deviceList: Node[] = (devicesRes.devices || []).map((d) => ({
        id: d.device_id,
        wallet_address: address,
        name: d.device_type === 'a2a' ? 'A2A Agent' : d.device_type === 'openclaw' ? 'OpenClaw' : d.device_type || 'Device',
        status: 'online',
        last_seen: d.last_seen_at,
        created_at: d.last_seen_at,
        updated_at: d.last_seen_at,
        source: 'device' as const,
      }));

      // Merge: nodes first, then devices (avoid duplicates by id)
      const seen = new Set<string>();
      const merged: Node[] = [];
      for (const n of [...nodeList, ...deviceList]) {
        if (!seen.has(n.id)) {
          seen.add(n.id);
          merged.push(n);
        }
      }
      setNodes(merged);
    } catch (error: any) {
      logger.error('Error loading swarm', error);
      setNodes([]);
      toast.error(t('error') || 'Error', error?.message || 'Failed to load devices');
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

  // Если кошелёк не подключён – показываем понятное сообщение
  if (!address) {
    return (
      <EmptyState
        icon={<Server className="text-gray-400" size={48} />}
        title={t('connect_wallet') || 'Connect Wallet'}
        description={t('connect_wallet_to_work') || 'Please connect your wallet to view and manage devices.'}
      />
    );
  }

  if (loading) {
    return (
      <div className="glass-card overflow-hidden">
        <SkeletonTable rows={5} />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white font-display">{t('my_nodes') || 'My Swarm'}</h2>
          <p className="text-sm sm:text-base text-gray-400 mt-1">
            {nodes.length} {nodes.length === 1 ? 'device' : 'devices'} in the swarm
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
        <div className="space-y-4">
          <div className="p-6 rounded-2xl bg-cyan-500/5 border border-cyan-500/20">
            <h3 className="text-lg font-bold text-white mb-2">Any device can join the swarm</h3>
            <p className="text-sm text-gray-400 mb-4">
              No tokens? No problem. Connect your phone, PC, OpenClaw, or IoT device. Earn GSTD by contributing compute.
            </p>
            <div className="space-y-3 mb-4">
              <p className="text-xs font-bold text-cyan-400/90 uppercase tracking-wider">1. Get API key</p>
              <p className="text-[10px] text-gray-400">
                Dashboard → SovereignSwitch → Generate API Key. Or headless: <code className="text-cyan-400/80">GET /agents/challenge</code> → solve PoW → <code className="text-cyan-400/80">POST /agents/claim-key</code>
              </p>
              <p className="text-xs font-bold text-cyan-400/90 uppercase tracking-wider">2. Connect device (A2A)</p>
              <pre className="text-xs bg-black/40 p-3 rounded-lg text-gray-300 font-mono overflow-x-auto">
{`curl -O https://raw.githubusercontent.com/gstdcoin/A2A/main/connect.py
python3 connect.py --api-key YOUR_KEY`}
              </pre>
              <p className="text-[10px] text-gray-500">
                API: app.gstdtoken.com • OpenClaw: openclaw_bridge.py • <a href="https://github.com/gstdcoin/ai/blob/main/docs/skills/SKILL.md" target="_blank" rel="noopener" className="text-cyan-400 hover:underline">Skill: SKILL.md</a>
              </p>
            </div>
            <button
              onClick={() => setShowRegisterModal(true)}
              className="px-5 py-2.5 rounded-xl bg-cyan-500 text-black font-bold hover:bg-cyan-400 transition-colors"
            >
              {t('register_first_device') || 'Add This Device'}
            </button>
          </div>
          <EmptyState
            icon={<Server className="text-gray-400" size={48} />}
            title={t('no_nodes') || 'No devices yet'}
            description={t('no_nodes_desc') || 'Register a device to start earning GSTD.'}
            action={
              <button
                onClick={() => setShowRegisterModal(true)}
                className="px-4 py-2 glass-button-gold rounded-lg transition-colors min-h-[44px]"
              >
                {t('register_first_device') || 'Register Device'}
              </button>
            }
          />
        </div>
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
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    {t('status') || 'Status'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    {t('specs') || 'Specs'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    {t('last_seen') || 'Last Seen'}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    Eco-Label
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
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden sm:table-cell">
                      {(() => {
                        const isOnline = (new Date().getTime() - new Date(node.last_seen).getTime()) < 30000;
                        return (
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${isOnline
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-500/20 text-gray-400'
                            }`}>
                            {isOnline
                              ? (t('online') || 'Online')
                              : (t('offline') || 'Offline')}
                          </span>
                        );
                      })()}
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
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap hidden lg:table-cell">
                      {(node as any).eco_certified && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          Eco-Proof
                        </span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(node.id);
                            toast.success(t('copied') || 'Copied', t('node_id_copied') || 'Node ID copied to clipboard');
                          }}
                          className="text-xs glass-button text-white px-2 py-1 rounded"
                          title={t('copy_node_id') || 'Copy Node ID'}
                        >
                          {t('copy') || 'Copy ID'}
                        </button>
                      </div>
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



