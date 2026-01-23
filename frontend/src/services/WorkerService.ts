import { toast } from 'sonner';

type WorkerState = 'idle' | 'igniting' | 'running' | 'paused' | 'error';
type WorkerCallback = (data: any) => void;

class WorkerService {
    private worker: Worker | null = null;
    public state: WorkerState = 'idle';
    private subscribers: Function[] = [];
    private statsSubscribers: Function[] = [];
    private taskLoop: any = null;

    constructor() {
        if (typeof window !== 'undefined') {
            this.initWorker();
        }
    }

    private initWorker() {
        try {
            this.worker = new Worker('/mobile_worker.js');

            this.worker.onmessage = (event) => {
                const { status, result, reason } = event.data;

                if (status === 'completed') {
                    this.notifyStats({
                        completed: true,
                        latency: result.latency_ms,
                        reward: 0.00001 // Mock reward per task
                    });
                } else if (status === 'skipped') {
                    console.log('Worker skipped task:', reason);
                }
            };

            this.worker.onerror = (err) => {
                console.error('Worker Script Error:', err);
            };

        } catch (e) {
            console.error('Failed to init worker:', e);
            this.state = 'error';
        }
    }

    public ignite() {
        if (this.state === 'running') return;

        if (!this.worker) this.initWorker();

        this.state = 'igniting';
        this.notifyState();

        setTimeout(() => {
            this.state = 'running';
            this.notifyState();
            toast.success('GSTD Mining Ignited: Processing Tasks');
            this.startTaskLoop();
        }, 1000);
    }

    private startTaskLoop() {
        if (this.taskLoop) clearInterval(this.taskLoop);

        this.taskLoop = setInterval(() => {
            if (this.state !== 'running' || !this.worker) return;

            const task = {
                type: 'inference',
                id: Math.random().toString(36).substring(7),
                model: 'mobilenet_v2',
                priority: 'normal', // Let battery saver logic work
                input: new Float32Array(100)
            };

            this.worker.postMessage(task);
        }, 2000); // Send a task every 2 seconds
    }

    public pause() {
        this.state = 'paused';
        if (this.taskLoop) clearInterval(this.taskLoop);
        this.notifyState();
    }

    public subscribe(callback: (state: WorkerState) => void) {
        this.subscribers.push(callback);
        callback(this.state); // Initial state
        return () => this.subscribers = this.subscribers.filter(cb => cb !== callback);
    }

    public subscribeStats(callback: WorkerCallback) {
        this.statsSubscribers.push(callback);
        return () => this.statsSubscribers = this.statsSubscribers.filter(cb => cb !== callback);
    }

    private notifyState() {
        this.subscribers.forEach(cb => cb(this.state));
    }

    private notifyStats(data: any) {
        this.statsSubscribers.forEach(cb => cb(data));
    }

    public terminate() {
        this.pause();
        this.worker?.terminate();
        this.worker = null;
        this.state = 'idle';
        this.notifyState();
    }
}

export const workerService = new WorkerService();
