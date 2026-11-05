'use client';

import { useEffect, useRef, useState } from 'react';
import { useTmaTranslation } from '../../lib/tmaI18n';
import {
    heartbeatWorker, isBrowserWorkerSupported, loadOrCreateIdentity, registerWorker, runOnce, type WorkerIdentity,
} from '../../lib/browserWorker';

import {startBrowserWorkerLoop} from '../../lib/browserWorkerLoop';
import {getTelegramWebApp} from '../../lib/telegram';
const HEARTBEAT_MS = 180_000;

/** Lets a phone run verification tasks in the browser. Rewards come only from funded, accepted tasks. */
export default function BrowserWorkerPanel({ address }: { address?: string }) {
    const { t } = useTmaTranslation();
    const [active, setActive] = useState(false);
    const [done, setDone] = useState(0);
    const [foreground,setForeground]=useState(true);
    const [msg, setMsg] = useState('');
    const idRef = useRef<WorkerIdentity | null>(null);
    const busyRef = useRef(false);
    const lastHeartbeatRef = useRef(0);
    useEffect(()=>{setActive(false);idRef.current=null;lastHeartbeatRef.current=0;},[address]);
    const supported = typeof window !== 'undefined' && isBrowserWorkerSupported();

    useEffect(() => {
        if (!active || !address) return;
        let alive = true;
        const tick = async ():Promise<boolean> => {
            if (busyRef.current) return false;
            busyRef.current = true;
            try {
                if (!idRef.current) {
                    const identity = await loadOrCreateIdentity();
                    if(!alive)return false;
                    if (!(await registerWorker(identity, address))) throw new Error('register');
                    if(!alive)return false;
                    idRef.current = identity;
                    lastHeartbeatRef.current = Date.now();
                }
                if (Date.now() - lastHeartbeatRef.current >= HEARTBEAT_MS) {
                    if (!(await heartbeatWorker(idRef.current, address))) throw new Error('heartbeat');
                    lastHeartbeatRef.current = Date.now();
                }
                if(!alive)return false;
                const completed=await runOnce(idRef.current, address);
                if(alive&&completed)setDone((n)=>n+1);
                if(alive)setMsg('');
                return completed;
            } catch {
                if (alive) setMsg(t('bw_error', 'Could not reach the network, retrying…'));
                throw new Error('worker_cycle_failed');
            } finally {
                busyRef.current = false;
            }
        };
        // Keep the worker across UI tabs; respect both WebView and Telegram lifecycle.
        const tg=getTelegramWebApp();
        let appActive=(tg as {isActive?:boolean}|null)?.isActive!==false;
        const events=new EventTarget();
        const visible=()=>!document.hidden&&appActive;
        const relay=(event:Event)=>{
            setForeground(visible());
            events.dispatchEvent(new Event(event.type));
        };
        const activate=()=>{appActive=true;relay(new Event('visibilitychange'));};
        const deactivate=()=>{appActive=false;relay(new Event('visibilitychange'));};
        document.addEventListener('visibilitychange',relay);
        window.addEventListener('online',relay);
        window.addEventListener('offline',relay);
        tg?.onEvent('activated',activate);
        tg?.onEvent('deactivated',deactivate);
        setForeground(visible());
        const stop=startBrowserWorkerLoop({run:tick,visible,online:()=>navigator.onLine,events,onError:()=>{}});
        return()=>{
            alive=false;stop();
            document.removeEventListener('visibilitychange',relay);
            window.removeEventListener('online',relay);
            window.removeEventListener('offline',relay);
            tg?.offEvent('activated',activate);
            tg?.offEvent('deactivated',deactivate);
        };
    }, [active, address, t]);

    return (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('bw_title', 'Compute worker')}</div>
            <p className="text-xs text-gray-400">
                {t('bw_desc', 'Verify results with your phone while this screen is open. Rewards are paid only for completed, accepted tasks from funded campaigns; there is no guaranteed rate.')}
            </p>
            <p className="text-xs text-gray-400">{t('mini_app.worker_lifecycle', 'Switching tabs keeps this session. Leaving Telegram pauses browser work; it resumes when you return. Closing or reloading requires Start again. For continuous compute, install a server node.')}</p>
            {active&&!foreground&&<p className="text-xs text-amber-400">{t('mini_app.worker_paused', 'Paused while Telegram is in the background.')}</p>}
            {!supported && <p className="text-xs text-amber-400">{t('bw_unsupported', 'This browser does not support the required cryptography (Ed25519).')}</p>}
            {supported && !address && <p className="text-xs text-amber-400">{t('bw_need_wallet', 'Connect a wallet first.')}</p>}
            {supported && address && (
                <button
                    onClick={() => setActive((a) => !a)}
                    className="w-full rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 text-sm"
                >
                    {active ? t('bw_stop', 'Stop worker') : t('bw_start', 'Start worker')}
                </button>
            )}
            {active && <p className="text-xs text-gray-400">{t('bw_done', 'Tasks completed this session')}: <b className="text-white">{done}</b></p>}
            {msg && <p className="text-xs text-red-400">{msg}</p>}
        </div>
    );
}