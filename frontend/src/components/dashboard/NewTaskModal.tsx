import { useState, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { useWalletStore } from '../../store/walletStore';
import { useTonConnectUI } from '@tonconnect/ui-react';
import { logger } from '../../lib/logger';
import { toast } from '../../lib/toast';
import { createTaskSchema } from '../../lib/validation';
import { ESCROW_CONTRACT_ADDRESS, ADMIN_WALLET_ADDRESS } from '../../lib/config';
import { apiGet, apiPost } from '../../lib/apiClient';
import { X, Cpu, DollarSign, Terminal, CheckCircle, Clock, ArrowRight, Shield, Zap } from 'lucide-react';

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
  const [formData, setFormData] = useState({
    type: 'AI_INFERENCE',
    budget: '',
    payload: '',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      toast.error('Connect Wallet', 'Please connect your wallet first');
      return;
    }

    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      const budget = parseFloat(formData.budget);

      let payloadObj: any = {};
      if (formData.payload.trim()) {
        try {
          payloadObj = JSON.parse(formData.payload);
        } catch (err) {
          toast.error('Invalid JSON', 'Please check your payload format');
          return;
        }
      }

      const data = await apiPost<CreateTaskResponse>(
        `/tasks/create?wallet_address=${address}`,
        {
          type: formData.type,
          budget: budget,
          payload: payloadObj,
        }
      );
      setTaskData(data);
      setStep('payment');
      toast.success('Task Provisioned', 'Awaiting payment on TON');
    } catch (err: any) {
      setError(err?.message || 'Failed to create task');
      toast.error('Provisioning Failed', err?.message);
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
      const errors: Record<string, string> = {};
      error.errors?.forEach((err: any) => {
        if (err.path?.[0]) errors[err.path[0]] = err.message;
      });
      setFormErrors(errors);
      return false;
    }
  };

  const handlePayment = async () => {
    if (!tonConnectUI || !taskData) return;
    setStep('confirming');
    try {
      const rewardAmount = taskData.amount * 0.95;
      const feeAmount = taskData.amount * 0.05;

      const [rewardJD, feeJD] = await Promise.all([
        apiGet<{ address: string }>(`/wallet/jetton-address?owner=${ESCROW_CONTRACT_ADDRESS}`),
        apiGet<{ address: string }>(`/wallet/jetton-address?owner=${ADMIN_WALLET_ADDRESS}`)
      ]);

      const { beginCell, Address } = await import('@ton/core');
      const createBoc = (dest: string, amt: number, memo: string) => {
        return beginCell()
          .storeUint(0xf8a7ea5, 32)
          .storeUint(0, 64)
          .storeCoins(BigInt(Math.round(amt * 1e9)))
          .storeAddress(Address.parse(dest))
          .storeAddress(Address.parse(address!))
          .storeBit(0)
          .storeCoins(BigInt(1))
          .storeBit(1)
          .storeRef(beginCell().storeUint(0, 32).storeStringTail(memo).endCell())
          .endCell().toBoc().toString('base64');
      };

      await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 600,
        messages: [
          { address: rewardJD.address, amount: "50000000", payload: createBoc(ESCROW_CONTRACT_ADDRESS, rewardAmount, taskData.payment_memo) },
          { address: feeJD.address, amount: "50000000", payload: createBoc(ADMIN_WALLET_ADDRESS, feeAmount, `${taskData.payment_memo}-FEE`) }
        ]
      });
    } catch (err: any) {
      toast.error('Payment Reverted', err?.message);
      setStep('payment');
    }
  };

  useEffect(() => {
    if (step === 'confirming' && taskData) {
      const interval = setInterval(async () => {
        try {
          const task = await apiGet<{ status: string }>(`/tasks/${taskData.task_id}/payment`);
          if (task.status === 'queued' || task.status === 'pending' || task.status === 'active') {
            setStep('success');
            onTaskCreated?.();
            clearInterval(interval);
          }
        } catch (e) { }
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [step, taskData, onTaskCreated]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
      <div className="relative w-full max-w-xl bg-[#0a0a0b] border border-white/10 rounded-[32px] overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">

        {/* Animated Background Orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-violet-600/10 rounded-full blur-[100px] -mr-32 -mt-32" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-[100px] -ml-32 -mb-32" />

        <div className="relative z-10 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between p-8 border-b border-white/5 bg-white/[0.02]">
            <div>
              <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-3">
                <Zap className="text-yellow-400 w-6 h-6" />
                {t('create_task') || 'Deploy Task'}
              </h2>
              <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] mt-1">
                GSTD Distributed Execution Layer
              </p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-2xl transition-colors text-gray-500 hover:text-white">
              <X size={24} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
            {step === 'form' && (
              <form onSubmit={handleSubmit} className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <Terminal size={12} className="text-violet-400" />
                      Protocol Action
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      className="w-full h-14 bg-white/5 border border-white/10 rounded-2xl px-4 text-white font-bold appearance-none hover:bg-white/10 transition-colors focus:ring-2 focus:ring-violet-500/40 outline-none"
                    >
                      <option value="AI_INFERENCE">Neural Inference</option>
                      <option value="DATA_PROCESSING">Cluster Transform</option>
                      <option value="COMPUTATION">Raw Compute</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                      <DollarSign size={12} className="text-emerald-400" />
                      Labor Budget
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        placeholder="0.0"
                        value={formData.budget}
                        onChange={(e) => setFormData({ ...formData, budget: e.target.value })}
                        className={`w-full h-14 bg-white/5 border ${formErrors.budget ? 'border-red-500/50' : 'border-white/10'} rounded-2xl px-4 pr-16 text-white font-mono text-lg transition-colors focus:ring-2 focus:ring-emerald-500/40 outline-none`}
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-gray-500">GSTD</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                    <Cpu size={12} className="text-cyan-400" />
                    Task Payload (JSON Payload)
                  </label>
                  <textarea
                    value={formData.payload}
                    rows={6}
                    onChange={(e) => setFormData({ ...formData, payload: e.target.value })}
                    placeholder='{ "model": "mobilenet_v3", "input": "...", "verification": "zk_proof" }'
                    className="w-full bg-black/40 border border-white/5 rounded-2xl p-6 text-emerald-400 font-mono text-sm focus:ring-2 focus:ring-cyan-500/40 outline-none placeholder:text-gray-800"
                  />
                </div>

                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center text-violet-400">
                      <Shield size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black text-white uppercase tracking-tight">Trust Verification</h4>
                      <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">
                        Task will be verified by 3 independent agents [PoC: 0.99]
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-16 bg-white text-black rounded-2xl font-black text-lg hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-3 uppercase tracking-tighter"
                >
                  {loading ? <Clock className="animate-spin" /> : <ArrowRight />}
                  Provision Distributed Node
                </button>
              </form>
            )}

            {step === 'payment' && taskData && (
              <div className="space-y-8 py-4">
                <div className="text-center mb-8">
                  <div className="w-20 h-20 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/20 text-emerald-400">
                    <CheckCircle size={40} />
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Task Provisioned</h3>
                  <p className="text-gray-500 text-sm mt-2">ID: {taskData.task_id}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] block mb-2">Total Amount</label>
                    <div className="text-2xl font-black text-white tabular-nums">{taskData.amount.toFixed(2)} GSTD</div>
                  </div>
                  <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-[0.2em] block mb-2">Platform Fee</label>
                    <div className="text-2xl font-black text-violet-400 tabular-nums">5.0%</div>
                  </div>
                </div>

                <div className="p-8 rounded-3xl bg-blue-600/10 border border-blue-500/20 relative overflow-hidden group">
                  <div className="relative z-10 flex items-center gap-6">
                    <Shield className="text-blue-400 w-10 h-10" />
                    <div>
                      <h4 className="text-white font-black text-lg uppercase tracking-tight">Non-Custodial Escrow</h4>
                      <p className="text-gray-400 text-xs">Funds will be locked in the contract until the agent provides a verified PoC result.</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handlePayment}
                  className="w-full h-16 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white rounded-2xl font-black text-lg hover:shadow-[0_0_30px_rgba(139,92,246,0.3)] transition-all active:scale-[0.98] flex items-center justify-center gap-3 uppercase tracking-tighter"
                >
                  Confirm Payment via TON
                </button>
              </div>
            )}

            {step === 'confirming' && (
              <div className="py-20 text-center space-y-8">
                <div className="relative w-24 h-24 mx-auto">
                  <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-xl animate-pulse" />
                  <div className="relative w-24 h-24 rounded-full border-4 border-white/5 border-t-cyan-500 animate-spin" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tight">Synchronizing Ledger</h3>
                  <p className="text-gray-500 text-sm mt-3 leading-relaxed">
                    Awaiting blockchain confirmation. Your task will be instantly available in the Hive Mesh once verified.
                  </p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 font-mono text-[10px] text-gray-600">
                  NETWORK_STATUS: AWAITING_BOC_CONFIRMATION
                </div>
              </div>
            )}

            {step === 'success' && (
              <div className="py-12 text-center space-y-8">
                <div className="w-24 h-24 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center mx-auto shadow-[0_0_50px_rgba(16,185,129,0.3)]">
                  <CheckCircle size={48} className="text-white" />
                </div>
                <div>
                  <h3 className="text-3xl font-black text-white uppercase tracking-tighter">TASK DEPLOYED</h3>
                  <p className="text-gray-500 font-medium mt-3">
                    Your task is now being processed by globally distributed agents.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-12 h-14 bg-white/5 border border-white/10 rounded-2xl text-white font-black hover:bg-white/10 transition-all uppercase tracking-widest text-xs"
                >
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

