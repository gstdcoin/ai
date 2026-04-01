import { toast } from '../lib/toast';
import { logger } from '../lib/logger';
import { WS_URL } from '../lib/config';
import { useWalletStore } from '../store/walletStore';

export type PowerProfile = 'eco' | 'balance' | 'max';

type WorkerState = 'idle' | 'igniting' | 'running' | 'paused' | 'error';
type StateSubscriber = (state: WorkerState) => void;
type StatsSubscriber = (data: Record<string, unknown>) => void;
type MetricsSubscriber = (metrics: ComputeMetrics) => void;

export interface ComputeMetrics {
    tflops: number;
    totalOps: number;
    totalGSTD: number;
    sessionUptime: number;
    batteryLevel: number;
    isCharging: boolean;
    effectiveProfile: string;
    tflopsHistory: Array<{ ts: number; tflops: number; profile: string; battery: number }>;
}

class WorkerService {
    private worker: Worker | null = null;
    public state: WorkerState = 'idle';
    public powerProfile: PowerProfile = 'balance';
    private subscribers: StateSubscriber[] = [];
    private statsSubscribers: StatsSubscriber[] = [];
    private metricsSubscribers: MetricsSubscriber[] = [];
    private taskLoop: any = null;
    private ws: WebSocket | null = null;
    private heartbeatInterval: any = null;
    private lastHeartbeatAck: number = 0;
    private retryCount: number = 0;
    private pendingQueue: any[] = [];
    private readonly deviceId: string = 'browser-' + Math.random().toString(36).substring(7);
    public targetTaskId: string | null = null;
    private syncInterval: any = null;

    // ═══ Wake Lock ═══
    private wakeLock: WakeLockSentinel | null = null;

    // ═══ Compute Metrics ═══
    public metrics: ComputeMetrics = {
        tflops: 0,
        totalOps: 0,
        totalGSTD: 0,
        sessionUptime: 0,
        batteryLevel: 100,
        isCharging: false,
        effectiveProfile: 'balance',
        tflopsHistory: [],
    };
    private metricsInterval: any = null;

    constructor() {
        if (globalThis.window !== undefined) {
            try {
                const saved = localStorage.getItem('gstd_pending_results');
                if (saved) this.pendingQueue = JSON.parse(saved);
            } catch (e) { logger.error('Failed to load pending results', e); }

            this.initWorker();
        }
    }

    private saveToQueue(payload: any) {
        this.pendingQueue.push(payload);
        if (globalThis.window !== undefined) {
            localStorage.setItem('gstd_pending_results', JSON.stringify(this.pendingQueue));
        }
        logger.debug(`[Resilience] Result saved to Queue. Total pending: ${this.pendingQueue.length}`);
        toast.info('Network Issue: Result Queued for Upload');
    }

    private processQueue() {
        if (this.pendingQueue.length === 0 || this.ws?.readyState !== WebSocket.OPEN) return;

        logger.debug(`[Resilience] Processing Queue (${this.pendingQueue.length} items)...`);

        const batch = [...this.pendingQueue];
        this.pendingQueue = [];
        localStorage.setItem('gstd_pending_results', '[]');

        batch.forEach(payload => {
            this.ws?.send(JSON.stringify(payload));
        });

        toast.success(`Synced ${batch.length} offline results!`);
    }

    private initWorker() {
        try {
            logger.debug('[Compute Node] Init TWA Compute Worker...');
            this.worker = new Worker('/mobile_worker.js');
            this.worker.postMessage({ type: 'set_power_profile', profile: this.powerProfile });

            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', () => {
                    const active = document.visibilityState === 'visible';
                    this.worker?.postMessage({ type: 'user_active', active });
                });
            }

            this.worker.onmessage = (event) => {
                const data = event.data;
                this.processingTask = false;

                if (data.status === 'completed') {
                    logger.debug('[Compute Node] Task completed', data.result);

                    // Play reward sound
                    try {
                        const audio = new Audio('/sounds/coin.mp3');
                        audio.volume = 0.3;
                        audio.play().catch(() => undefined);
                    } catch {
                        /* autoplay may be blocked by browser policy */
                    }

                    // Update local metrics
                    this.metrics.tflops = data.result.tflops || 0;
                    this.metrics.totalOps++;
                    this.metrics.totalGSTD += data.result.reward_gstd || 0;
                    this.metrics.batteryLevel = data.result.battery_pct || 100;
                    this.metrics.effectiveProfile = data.result.power_profile || 'balance';

                    const proofHash = btoa(data.result.latency_ms + '-' + Math.random());

                    this.notifyStats({
                        completed: true,
                        latency: data.result.latency_ms,
                        reward: data.result.reward_gstd || 1e-5,
                        tflops: data.result.tflops || 0,
                        battery: data.result.battery_pct,
                        profile: data.result.power_profile,
                    });

                    const payload = {
                        type: 'task_completed',
                        result: data.result,
                        proof: {
                            hash: proofHash,
                            connectivity_score: navigator.onLine ? 1 : 0,
                            timestamp: Date.now()
                        }
                    };

                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(JSON.stringify(payload));
                    } else {
                        this.saveToQueue(payload);
                    }

                } else if (data.status === 'skipped') {
                    logger.debug('Worker skipped task:', data.reason);
                    this.notifyStats({
                        skipped: true,
                        reason: data.reason,
                        battery: data.batteryLevel,
                        profile: data.effectiveProfile,
                    });

                } else if (data.status === 'metrics' || data.status === 'metrics_update') {
                    // Update metrics from worker
                    if (data.tflops !== undefined) this.metrics.tflops = data.tflops;
                    if (data.totalOps !== undefined) this.metrics.totalOps = data.totalOps;
                    if (data.totalGSTD !== undefined) this.metrics.totalGSTD = data.totalGSTD;
                    if (data.batteryLevel !== undefined) this.metrics.batteryLevel = data.batteryLevel;
                    if (data.isCharging !== undefined) this.metrics.isCharging = data.isCharging;
                    if (data.effectiveProfile !== undefined) this.metrics.effectiveProfile = data.effectiveProfile;
                    if (data.tflopsHistory) this.metrics.tflopsHistory = data.tflopsHistory;
                    if (data.sessionUptime !== undefined) this.metrics.sessionUptime = data.sessionUptime;

                    this.notifyMetrics();

                } else if (data.status === 'workload_adjusted') {
                    this.metrics.batteryLevel = data.batteryLevel || 100;
                    this.metrics.isCharging = data.isCharging || false;
                    this.metrics.effectiveProfile = data.mode || data.effectiveProfile || 'balance';
                    this.notifyMetrics();
                }
            };

            this.worker.onerror = (err) => {
                logger.error('Worker Script Error', err);
            };

        } catch (e) {
            logger.error('Failed to init worker', e);
            this.state = 'error';
        }
    }

    // ═══ Wake Lock API ═══
    private async acquireWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.wakeLock = await (navigator as any).wakeLock.request('screen');
                logger.debug('[WakeLock] Screen wake lock acquired');
                this.wakeLock?.addEventListener('release', () => {
                    logger.debug('[WakeLock] Released');
                    // Re-acquire on visibility change
                    if (this.state === 'running') {
                        document.addEventListener('visibilitychange', () => {
                            if (document.visibilityState === 'visible' && this.state === 'running') {
                                this.acquireWakeLock();
                            }
                        }, { once: true });
                    }
                });
            }
        } catch (err) {
            logger.debug('[WakeLock] Not available or denied', err);
        }
    }

    private releaseWakeLock() {
        if (this.wakeLock) {
            this.wakeLock.release();
            this.wakeLock = null;
            logger.debug('[WakeLock] Released manually');
        }
    }

    public ignite(taskId?: string) {
        if (this.state === 'running' && !taskId) return;

        if (taskId) {
            this.targetTaskId = taskId;
        }

        if (!this.worker) this.initWorker();

        this.state = 'igniting';
        this.notifyState();
        logger.debug('[Compute Node] Igniting...');

        // Acquire Wake Lock
        this.acquireWakeLock();

        // Connect WebSocket
        this.connectWebSocket();

        // Start metrics polling
        this.startMetricsPolling();

        setTimeout(() => {
            if (this.state === 'error') return;
            this.state = 'running';
            this.notifyState();
            toast.success(this.targetTaskId ? `Processing Task: ${this.targetTaskId}` : '🔥 Neural Node Ignited');
            this.startTaskLoop();
        }, 1000);
    }

    private connectWebSocket() {
        logger.debug('[Compute Node] Establishing Socket Connection...');
        const wsUrl = `${WS_URL.replace(/\/+$/, '')}/ws`;
        const walletAddress = globalThis.window === undefined ? null : useWalletStore.getState().address;
        const params = new URLSearchParams({ device_id: this.deviceId });
        if (walletAddress) params.set('wallet_address', walletAddress);
        this.ws = new WebSocket(`${wsUrl}?${params.toString()}`);

        this.ws.onopen = () => {
            logger.debug('[Compute Node] Socket Connected');
            this.retryCount = 0;
            this.startHeartbeat();
            this.processQueue();
        };

        this.ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'heartbeat_ack') {
                    this.lastHeartbeatAck = Date.now();
                    if (msg.fleet_command?.action === 'standby') {
                        this.pause();
                        toast.info('Fleet Command', 'All nodes set to standby');
                    } else if (msg.fleet_command?.action === 'resume') {
                        if (this.state === 'paused') this.ignite();
                        toast.info('Fleet Command', 'Fleet resumed');
                    } else if (msg.fleet_command?.action === 'clean') {
                        this.triggerMaintenance();
                        toast.info('Fleet Command', 'Cache cleanup triggered');
                    }
                }
            } catch (e) { logger.debug('WS message parse', e); }
        };

        const handleReconnect = () => {
            if (this.state === 'paused') return;
            const delay = Math.min(1000 * (2 ** this.retryCount), 30000);
            logger.debug(`[Compute Node] Reconnecting in ${delay}ms...`);
            this.retryCount++;
            setTimeout(() => {
                if (this.state !== 'paused') this.connectWebSocket();
            }, delay);
        };

        // Browser fires onclose after onerror; reconnect only from onclose to avoid double timers.
        this.ws.onerror = (e) => {
            logger.error('[Compute Node] Socket Error', e);
            if (this.retryCount === 0) toast.error('Connection Lost. Reconnecting...');
        };

        this.ws.onclose = () => {
            logger.debug('[Compute Node] Socket Closed');
            handleReconnect();
        };
    }

    private startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.lastHeartbeatAck = Date.now();

        const getWallet = () => (globalThis.window === undefined ? null : useWalletStore.getState().address);

        const performHTTPSync = async () => {
            const currentWallet = getWallet();
            if (!currentWallet) return;
            try {
                const { apiPost } = await import('../lib/apiClient');
                await apiPost('/nodes/heartbeat', {
                    wallet_address: currentWallet,
                    node_name: `TMA Node - ${this.deviceId.substring(8, 12)}`,
                    is_mobile: /Mobi|Android|iPhone/i.test(navigator.userAgent),
                    uptime_hours: this.metrics.sessionUptime || 0,
                    queries_served: this.metrics.totalOps || 0
                });
            } catch (e) {
                logger.debug('HTTP heartbeat sync failed (Node platform API)', e);
            }
        };

        // First immediate sync to register the node
        setTimeout(performHTTPSync, 1500);

        this.heartbeatInterval = setInterval(() => {
            if (this.ws?.readyState !== WebSocket.OPEN) return;

            if (Date.now() - this.lastHeartbeatAck > 60000) {
                logger.error('Heartbeat Timeout: Backend not responding');
                this.state = 'error';
                this.notifyState();
                toast.error('Connection Timeout: No Heartbeat');
                this.ws.close();
                return;
            }

            this.ws.send(JSON.stringify({
                type: 'heartbeat',
                device_id: this.deviceId,
                wallet_address: getWallet(),
                tflops: this.metrics.tflops,
                battery: this.metrics.batteryLevel,
            }));
        }, 3000);

        // Every 60s update the Backend Node API to keep node status alive on Network Dashboard
        this.syncInterval = setInterval(() => {
            performHTTPSync();
        }, 60000);
    }

    private processingTask: boolean = false;
    private lastTaskTime: number = 0;

    private startTaskLoop() {
        if (this.taskLoop) clearInterval(this.taskLoop);

        this.taskLoop = setInterval(() => {
            if (this.state !== 'running' || !this.worker) return;

            if (this.processingTask) {
                if (Date.now() - this.lastTaskTime > 30000) {
                    logger.warn('[Compute Node] Task Timeout - Resetting');
                    this.processingTask = false;
                } else {
                    return;
                }
            }

            this.processingTask = true;
            this.lastTaskTime = Date.now();

            const task = {
                type: 'inference',
                id: this.targetTaskId || Math.random().toString(36).substring(7),
                is_targeted: !!this.targetTaskId,
                model: 'mobilenet_v2',
                priority: 'normal',
                input: new Float32Array(100),
                power_profile: this.powerProfile
            };

            this.worker.postMessage(task);
        }, 1000);
    }

    private startMetricsPolling() {
        if (this.metricsInterval) clearInterval(this.metricsInterval);

        this.metricsInterval = setInterval(() => {
            if (this.worker && this.state === 'running') {
                this.worker.postMessage({ type: 'get_metrics' });
            }
        }, 3000); // Every 3 seconds
    }

    public pause() {
        this.state = 'paused';
        if (this.taskLoop) clearInterval(this.taskLoop);
        if (this.metricsInterval) clearInterval(this.metricsInterval);
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
        this.releaseWakeLock();
        this.notifyState();
    }

    public subscribe(callback: (state: WorkerState) => void) {
        this.subscribers.push(callback);
        callback(this.state);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    public subscribeStats(callback: StatsSubscriber) {
        this.statsSubscribers.push(callback);
        return () => {
            this.statsSubscribers = this.statsSubscribers.filter(cb => cb !== callback);
        };
    }

    public subscribeMetrics(callback: (metrics: ComputeMetrics) => void) {
        this.metricsSubscribers.push(callback);
        callback(this.metrics);
        return () => {
            this.metricsSubscribers = this.metricsSubscribers.filter(cb => cb !== callback);
        };
    }

    private notifyState() {
        this.subscribers.forEach(cb => cb(this.state));
    }

    private notifyStats(data: Record<string, unknown>) {
        this.statsSubscribers.forEach((cb) => cb(data));
    }

    private notifyMetrics() {
        this.metricsSubscribers.forEach(cb => cb(this.metrics));
    }

    public terminate() {
        this.pause();
        this.worker?.terminate();
        this.worker = null;
        if (this.ws) this.ws.close();
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.syncInterval) clearInterval(this.syncInterval);
        this.releaseWakeLock();
        this.state = 'idle';
        this.notifyState();
    }

    /** Set power profile (Eco / Balance / Max) */
    public setPowerProfile(profile: PowerProfile) {
        this.powerProfile = profile;
        if (this.worker) {
            this.worker.postMessage({ type: 'set_power_profile', profile });
        }
    }

    /** Zero-Touch Maintenance: Trigger cache cleanup when storage low */
    public triggerMaintenance() {
        if (this.worker) {
            this.worker.postMessage({ type: 'check_maintenance' });
        }
    }
}

export const workerService = new WorkerService();
