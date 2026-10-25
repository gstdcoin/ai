'use client';

import { useEffect, useRef, useState } from 'react';
import { useTmaTranslation } from '../../lib/tmaI18n';
import {
    heartbeatWorker, isBrowserWorkerSupported, loadOrCreateIdentity, registerWorker, runOnce, type WorkerIdentity,
} from '../../lib/browserWorker';

const POLL_MS = 20_000;
const HEARTBEAT_MS = 180_000;

/** Lets a phone run verification tasks in the browser. Rewards come only from funded, accepted tasks. */
export default function BrowserWorkerPanel({ address }: { address?: string }) {
    const { t } = useTmaTranslation();
    const [active, setActive] = useState(false);
    const [done, setDone] = useState(0);
    const [msg, setMsg] = useState('');
    const idRef = useRef<WorkerIdentity | null>(null);
    const busyRef = useRef(false);
    const lastHeartbeatRef = useRef(0);
    const supported = typeof window !== 'undefined' && isBrowserWorkerSupported();

    useEffect(() => {
        if (!active || !address) return;
        let alive = true;
        const tick = async () => {
            if (busyRef.current) return;
            busyRef.current = true;
            try {
                if (!idRef.current) {
                    const identity = await loadOrCreateIdentity();
                    if (!(await registerWorker(identity, address))) throw new Error('register');
                    idRef.current = identity;
                    lastHeartbeatRef.current = Date.now();
                }
                if (Date.now() - lastHeartbeatRef.current >= HEARTBEAT_MS) {
                    if (!(await heartbeatWorker(idRef.current, address))) throw new Error('heartbeat');
                    lastHeartbeatRef.current = Date.now();
                }
                if (await runOnce(idRef.current, address)) setDone((n) => n + 1);
                if (alive) setMsg('');
            } catch {
                if (alive) setMsg(t('bw_error', 'Could not reach the network, retrying…'));
            } finally {
                busyRef.current = false;
            }
        };
        tick();
        const iv = setInterval(tick, POLL_MS);
        return () => { alive = false; clearInterval(iv); };
    }, [active, address, t]);

    return (
        <div className="rounded-xl bg-white/5 border border-white/10 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">{t('bw_title', 'Compute worker')}</div>
            <p className="text-xs text-gray-400">
                {t('bw_desc', 'Verify results with your phone while this screen is open. Rewards are paid only for completed, accepted tasks from funded campaigns; there is no guaranteed rate.')}
            </p>
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