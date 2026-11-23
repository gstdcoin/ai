import {publicNetworkResponse,nativePublicFetch} from './worker-public-network';
import openNextWorker from './.open-next/worker.js';
import {previewAccess,type PreviewEnvironment} from './worker-preview-access';
import {createTelegramHealthProbe} from './worker-telegram-health';

const telegramHealth = createTelegramHealthProbe(nativePublicFetch);

type WorkerEnvironment = Record<string, unknown> & PreviewEnvironment & {
    OPEN_INTELLIGENCE_CRON_SECRET?: string;
};

interface ScheduledEvent {
    cron: string;
    scheduledTime: number;
}

interface WorkerExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
}

async function platformFetch(request:Request,env:WorkerEnvironment,ctx:WorkerExecutionContext):Promise<Response>{
    const path=new URL(request.url).pathname;
    if(path==='/api/v1/telegram/health'){
        if(request.method!=='GET')return Response.json({error:'Method not allowed'},{status:405,headers:{Allow:'GET','Cache-Control':'no-store'}});
        const report=await telegramHealth(String(env.TELEGRAM_BOT_TOKEN||process.env.TELEGRAM_BOT_TOKEN||''));
        return Response.json(report,{status:report.status==='ok'?200:503,headers:{'Cache-Control':'public, max-age=60'}});
    }
    if(env.GSTD_PRIVATE_PREVIEW===undefined&&request.method==='GET'&&['/api/v1/network/stats','/api/v1/models/available'].includes(path)){
        const cache=(globalThis as any).caches?.default;
        const cacheKey=new Request(new URL(path,request.url).toString());
        const hit=cache?await cache.match(cacheKey):null;
        if(hit)return hit;
        const response=await publicNetworkResponse(request,env,nativePublicFetch);
        if(response){if(response.ok&&cache)ctx.waitUntil(cache.put(cacheKey,response.clone()));return response;}
    }
    return (await publicNetworkResponse(request,env,nativePublicFetch)) || openNextWorker.fetch(request,env,ctx);
}

export default {
    async fetch(request: Request, env: WorkerEnvironment, ctx: WorkerExecutionContext): Promise<Response> {
        const denied=previewAccess(request,env);if(denied)return denied;
        if(env.GSTD_PRIVATE_PREVIEW!==undefined){
            const headers=new Headers(request.headers);headers.delete('x-gstd-preview-key');
            request=new Request(request,{headers});
        }
        const response=await platformFetch(request,env,ctx);
        if(env.GSTD_PRIVATE_PREVIEW===undefined)return response;
        const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');
        return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
    },

    scheduled(event: ScheduledEvent, env: WorkerEnvironment, ctx: WorkerExecutionContext): void {
        if(env.GSTD_PRIVATE_PREVIEW!==undefined)return;
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
