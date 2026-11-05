import {publicNetworkResponse,nativePublicFetch} from './worker-public-network';
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
    async fetch(request: Request, env: WorkerEnvironment, ctx: WorkerExecutionContext): Promise<Response> {
        const path=new URL(request.url).pathname;
        if(request.method==='GET'&&['/api/v1/network/stats','/api/v1/models/available'].includes(path)){
            const cache=(globalThis as any).caches?.default;
            const cacheKey=new Request(new URL(path,request.url).toString());
            const hit=cache?await cache.match(cacheKey):null;
            if(hit)return hit;
            const response=await publicNetworkResponse(request,env,nativePublicFetch);
            if(response){if(response.ok&&cache)ctx.waitUntil(cache.put(cacheKey,response.clone()));return response;}
        }
        return (await publicNetworkResponse(request,env,nativePublicFetch)) || openNextWorker.fetch(request, env, ctx);
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
