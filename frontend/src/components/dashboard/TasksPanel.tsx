import { useState, useEffect, memo, useMemo, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import TaskDetailsModal from './TaskDetailsModal';
import WorkerTaskCard from './WorkerTaskCard';
import { EmptyState } from '../common/EmptyState';
import { ClipboardList } from 'lucide-react';
import { triggerHapticImpact } from '../../lib/telegram';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { apiGet, apiPost } from '../../lib/apiClient';

interface Task {
  task_id: string;
  task_type: string;
  status: string;
  labor_compensation_ton: number;
  created_at: string;
  completed_at?: string;
  assigned_device?: string;
  // Additional fields from backend
  requester_address?: string;
  operation?: string;
  model?: string;
  priority_score?: number;
  escrow_status?: string;
  confidence_depth?: number;
  executor_reward_ton?: number;
  platform_fee_ton?: number;
  executor_payout_status?: string;
  min_trust_score?: number;
  is_private?: boolean;
  redundancy_factor?: number;
  is_spot_check?: boolean;
}

interface TasksPanelProps {
  onTaskCreated?: () => void;
  onCompensationClaimed?: () => void;
}

function TasksPanel({ onTaskCreated, onCompensationClaimed }: TasksPanelProps) {
  const { t } = useTranslation('common');
  const { address } = useWalletStore();
  const [tonConnectUI] = useTonConnectUI();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'my' | 'available'>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [claimingCompensation, setClaimingCompensation] = useState<string | null>(null);

  const triggerConfetti = () => {
    // Simple confetti effect using canvas
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '9999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles: Array<{x: number; y: number; vx: number; vy: number; color: string}> = [];
    const colors = ['#FFD700', '#FFA500', '#FF6347', '#32CD32', '#1E90FF', '#9370DB'];

    // Create particles
    for (let i = 0; i < 100; i++) {
      particles.push({
        x: canvas.width / 2,
        y: canvas.height / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10 - 5,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }

    let animationFrame: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((particle, index) => {
        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vy += 0.2; // gravity

        ctx.fillStyle = particle.color;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, 5, 0, Math.PI * 2);
        ctx.fill();

        // Remove particles that are off screen
        if (particle.y > canvas.height + 10) {
          particles.splice(index, 1);
        }
      });

      if (particles.length > 0) {
        animationFrame = requestAnimationFrame(animate);
      } else {
        document.body.removeChild(canvas);
      }
    };

    animate();

    // Cleanup after 3 seconds
    setTimeout(() => {
      if (canvas.parentNode) {
        document.body.removeChild(canvas);
      }
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    }, 3000);
  };

  // Helper function to compare tasks for equality
  const tasksEqual = (a: Task[], b: Task[]): boolean => {
    if (a.length !== b.length) return false;
    const aMap = new Map(a.map(t => [t.task_id, JSON.stringify(t)]));
    for (const task of b) {
      const key = task.task_id;
      const aTaskStr = aMap.get(key);
      if (!aTaskStr || aTaskStr !== JSON.stringify(task)) {
        return false;
      }
    }
    return true;
  };

  const loadTasks = async () => {
    setLoading(true);
    try {
      let data: { tasks: Task[] };
      
      if (filter === 'my') {
        data = await apiGet<{ tasks: Task[] }>(`/tasks`, { requester: address });
      } else if (filter === 'available') {
        data = await apiGet<{ tasks: Task[] }>(`/device/tasks/available`, { device_id: address });
      } else {
        data = await apiGet<{ tasks: Task[] }>('/tasks');
      }
      
      const newTasks = data.tasks || [];
      
      // Check for newly completed tasks and trigger confetti
      if (tasks.length > 0) {
        newTasks.forEach((newTask: Task) => {
          const oldTask = tasks.find(t => t.task_id === newTask.task_id);
          if (oldTask && oldTask.status !== 'completed' && newTask.status === 'completed') {
            triggerConfetti();
            if (onTaskCreated) {
              onTaskCreated();
            }
          }
        });
      }
      
      // Only update state if tasks actually changed to prevent unnecessary re-renders
      // Use shallow comparison to avoid re-renders when data is the same
      if (!tasksEqual(tasks, newTasks)) {
        setTasks(newTasks);
      } else {
        // Even if tasks are equal, we still need to update loading state
        setLoading(false);
      }
    } catch (error) {
      logger.error('Error loading tasks', error);
      toast.error('Failed to load tasks', 'Please try refreshing the page');
    } finally {
      setLoading(false);
    }
  };

  // Pause polling when modal is open
  const isModalOpen = selectedTaskId !== null;
  
  useEffect(() => {
    // Don't start polling if modal is open
    if (isModalOpen) {
      return;
    }
    
    // Load tasks immediately
    loadTasks();
    
    // Poll for task updates every 12 seconds (increased from 5)
    const interval = setInterval(() => {
      // Double-check modal is still closed before loading
      if (!selectedTaskId) {
        loadTasks();
      }
    }, 12000); // Increased to 12 seconds
    
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, address, isModalOpen]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      assigned: 'bg-blue-100 text-blue-800',
      executing: 'bg-purple-100 text-purple-800',
      validating: 'bg-indigo-100 text-indigo-800',
      validated: 'bg-green-100 text-green-800',
      completed: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleClaimCompensation = async (task: Task) => {
    if (!address || !task.assigned_device) {
      toast.error('Wallet required', t('wallet_required') || 'Wallet address required');
      return;
    }

    setClaimingCompensation(task.task_id);
    try {
      // Get node wallet address from device_id (node_id)
      // assigned_device is node_id, need to get wallet_address from nodes table
      let executorWalletAddress = address; // Default to current user's address
      
      if (task.assigned_device) {
        try {
          const nodesData = await apiGet<{ nodes: Array<{ id: string; wallet_address: string }> }>('/nodes/my', { wallet_address: address });
          const node = nodesData.nodes?.find((n) => n.id === task.assigned_device);
          if (node?.wallet_address) {
            executorWalletAddress = node.wallet_address;
          } else {
            // If node not found, use current address (backward compatibility)
            logger.warn('Node not found, using current wallet address', { nodeId: task.assigned_device });
          }
        } catch (err) {
          logger.warn('Could not fetch node info, using current wallet address', err);
        }
      }
      
      // Get payout intent
      interface PayoutIntent {
        intent: string;
        executor_address: string;
        platform_fee_ton: number;
        executor_reward_ton: number;
        task_id: string;
        to_address: string;
        amount_nano: string;
      }
      
      const intent = await apiPost<PayoutIntent>('/payments/payout-intent', {
        task_id: task.task_id,
        executor_address: executorWalletAddress,
      });

      // Build Tact-compatible Cell payload using @ton/core
      const { beginCell, Address } = await import('@ton/core');
      
      // Parse executor address
      const executorAddress = Address.parse(intent.executor_address);
      
      // Convert TON amounts to nanoTON (1 TON = 1e9 nanoTON)
      const platformFeeNano = BigInt(Math.floor(intent.platform_fee_ton * 1e9));
      const executorRewardNano = BigInt(Math.floor(intent.executor_reward_ton * 1e9));
      
      // Build cell matching escrow.tact Withdraw message structure:
      // [op_code (32u), executor_address (MsgAddress), platform_fee (Coins), executor_reward (Coins), task_id (Ref->String)]
      const payloadCell = beginCell()
        .storeUint(0, 32) // op_code for Withdraw message
        .storeAddress(executorAddress)
        .storeCoins(platformFeeNano)
        .storeCoins(executorRewardNano)
        .storeRef(
          beginCell()
            .storeStringTail(intent.task_id)
            .endCell()
        )
        .endCell();
      
      // Convert to Base64 BoC for TonConnect
      const payloadBase64 = payloadCell.toBoc().toString('base64');

      // Send transaction via TonConnect
      const result = await tonConnectUI.sendTransaction({
        messages: [
          {
            address: intent.to_address,
            amount: intent.amount_nano.toString(),
            payload: payloadBase64,
          },
        ],
        validUntil: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
      });

      logger.info('Transaction sent', { taskId: task.task_id, result });
      
      // Trigger haptic feedback
      if (onCompensationClaimed) {
        onCompensationClaimed();
      }
      
      toast.success(t('labor_compensation_claimed_success') || 'Labor compensation claimed successfully!');
      
      // Reload tasks
      loadTasks();
    } catch (error) {
      logger.error('Failed to claim labor compensation', error);
      toast.error('Failed to claim compensation', t('labor_compensation_claim_failed') || 'Failed to claim labor compensation');
    } finally {
      setClaimingCompensation(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="glass-card">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gold-900 mx-auto"></div>
          <p className="text-gray-400 mt-4">{t('loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2 sm:gap-4 items-center">
        <button
          onClick={() => {
            setFilter('all');
            triggerHapticImpact('light');
          }}
          className={`px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm sm:text-base min-h-[44px] ${
            filter === 'all' 
              ? 'glass-button-gold' 
              : 'glass-button text-white'
          }`}
        >
          {t('tasks')}
        </button>
        {address && (
          <>
            <button
              onClick={() => {
                setFilter('my');
                triggerHapticImpact('light');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm sm:text-base min-h-[44px] ${
                filter === 'my' 
                  ? 'glass-button-gold' 
                  : 'glass-button text-white'
              }`}
            >
              {t('my_tasks')}
            </button>
            <button
              onClick={() => {
                setFilter('available');
                triggerHapticImpact('light');
              }}
              className={`px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm sm:text-base min-h-[44px] ${
                filter === 'available' 
                  ? 'glass-button-gold' 
                  : 'glass-button text-white'
              }`}
            >
              {t('available_tasks')}
            </button>
          </>
        )}
        <button
          onClick={loadTasks}
          disabled={loading}
          className="ml-auto glass-button text-white disabled:opacity-50"
          title={t('refresh') || 'Refresh task list'}
        >
          <span>🔄</span>
          <span className="hidden sm:inline">{t('refresh') || 'Refresh'}</span>
        </button>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="text-gray-400" size={48} />}
          title={t('no_tasks') || 'No tasks yet'}
          description={
            filter === 'my' 
              ? t('no_my_tasks_desc') || 'You haven\'t created any tasks yet. Create your first task to get started.'
              : filter === 'available'
              ? t('no_available_tasks_desc') || 'No tasks are currently available for execution.'
              : t('no_tasks_desc') || 'No tasks found. Create a new task to get started.'
          }
          action={filter !== 'available' ? (
            <button
              onClick={() => {
                // Trigger create task - this will be handled by parent
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('openCreateTask'));
                }
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              {t('create_task') || 'Create Task'}
            </button>
          ) : undefined}
        />
      ) : filter === 'available' ? (
        // Worker Mode: Show cards with START WORK buttons
        <div className="space-y-4">
          {tasks.map((task) => (
            <MemoizedWorkerTaskCard
              key={task.task_id}
              task={task}
              onTaskCompleted={() => {
                loadTasks();
                if (onTaskCreated) {
                  onTaskCreated();
                }
              }}
            />
          ))}
        </div>
      ) : (
        // Regular table view for other filters
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('task_id')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden sm:table-cell">
                    {t('task_type')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('status')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                    {t('labor_compensation')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                    {t('created_at')}
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {tasks.map((task) => (
                  <tr key={task.task_id} className="hover:bg-white/5 transition-colors">
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-mono text-white">
                      <span className="sm:hidden">{task.task_id.slice(0, 4)}...</span>
                      <span className="hidden sm:inline">{task.task_id.slice(0, 8)}...</span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-300 hidden sm:table-cell">
                      {task.task_type}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        task.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                        task.status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                        task.status === 'queued' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-gray-500/20 text-gray-400'
                      }`}>
                        {t(task.status)}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-300 hidden md:table-cell">
                      {task.labor_compensation_ton} TON
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-400 hidden lg:table-cell">
                      {new Date(task.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button 
                          onClick={() => {
                            setSelectedTaskId(task.task_id);
                            triggerHapticImpact('light');
                          }}
                          className="text-gold-900 hover:text-gold-700 text-xs sm:text-sm font-medium"
                        >
                          {t('view_details')}
                        </button>
                        {task.status === 'validated' && task.assigned_device === address && (
                          <button
                            onClick={() => handleClaimCompensation(task)}
                            disabled={claimingCompensation === task.task_id}
                            className="bg-green-500/20 text-green-400 px-2 sm:px-3 py-1 rounded hover:bg-green-500/30 disabled:opacity-50 text-xs sm:text-sm font-medium"
                          >
                            {claimingCompensation === task.task_id 
                              ? (t('claiming') || 'Claiming...') 
                              : (t('claim_compensation') || 'Claim')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {selectedTaskId && (
        <TaskDetailsModal 
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </div>
  );
}

// Memoize TasksPanel to prevent unnecessary re-renders
// Only re-render if props change
export default memo(TasksPanel, (prevProps, nextProps) => {
  return prevProps.onTaskCreated === nextProps.onTaskCreated && 
         prevProps.onCompensationClaimed === nextProps.onCompensationClaimed;
});

// Memoized WorkerTaskCard to prevent unnecessary re-renders
const MemoizedWorkerTaskCard = memo(WorkerTaskCard, (prevProps, nextProps) => {
  // Only re-render if task data actually changed
  return (
    prevProps.task.task_id === nextProps.task.task_id &&
    prevProps.task.status === nextProps.task.status &&
    prevProps.task.labor_compensation_ton === nextProps.task.labor_compensation_ton &&
    JSON.stringify(prevProps.task.payload) === JSON.stringify(nextProps.task.payload)
  );
});

