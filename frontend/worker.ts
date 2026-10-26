import openNextWorker from './.open-next/worker.js';

type WorkerEnvironment = Record<string, unknown> & {
    OPEN_INTELLIGENCE_CRON_SECRET?: string;
};

interface ScheduledEvent {
    cron: string;
    scheduledTime: number;
}

interface WorkerExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

export default {
    fetch(request: Request, env: WorkerEnvironment, ctx: WorkerExecutionContext): Promise<Response> {
        return openNextWorker.fetch(request, env, ctx);
    },

    scheduled(event: ScheduledEvent, env: WorkerEnvironment, ctx: WorkerExecutionContext): void {
        if (!env.OPEN_INTELLIGENCE_CRON_SECRET) {
            console.error('[open-intelligence/cron] OPEN_INTELLIGENCE_CRON_SECRET is not configured');
            return;
        }
        const path = event.cron === '*/10 * * * *' ? 'finance' : 'open-intelligence';
        const request = new Request('https://app.gstdtoken.com/api/cron/' + path, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${env.OPEN_INTELLIGENCE_CRON_SECRET}`,
                'x-gstd-scheduled-at': String(event.scheduledTime),
            },
        });
        ctx.waitUntil(openNextWorker.fetch(request, env, ctx).then(async response => {
            if (!response.ok) {
                console.error('[open-intelligence/cron] collection route returned', response.status);
            }
            await response.body?.cancel();
        }));
    },
};
