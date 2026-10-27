import { useEffect, useState } from 'react';
import type { GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { getCommonStaticProps } from '../lib/i18n-static-props';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import { useWalletStore } from '../store/walletStore';

type Withdrawal = { id:string;wallet:string;amount:string;state:string;receiptHash?:string };
export default function PaymentsPage() {
    const {t}=useTranslation('common');
    const p=(key:string)=>t('payments_page.'+key);
    const {address}=useWalletStore();
    const [tonConnect]=useTonConnectUI();
    const [balance,setBalance]=useState<any>(null),[rows,setRows]=useState<Withdrawal[]>([]);
    const [operator,setOperator]=useState(false),[amount,setAmount]=useState(''),[hash,setHash]=useState('');
    const [receipts,setReceipts]=useState<Record<string,string>>({});
    const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
    const errorText=(code:string)=>t('payments_page.errors.'+code,{defaultValue:p('error_generic')});
    async function api(path:string,body?:unknown,key?:string) {
        const token=localStorage.getItem('session_token');
        if (!token) throw new Error('auth_required');
        const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',
            'X-Session-Token':token,...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
        const data=await response.json();
        if (!response.ok) throw new Error(response.status===401?'auth_required':data.error || 'request_failed');
        return data;
    }
    async function load() {
        const [b,w]=await Promise.all([api('/api/v1/credits/balance'),api('/api/v1/finance/withdrawals?scope=operator')]);
        setBalance(b);setRows(w.withdrawals);setOperator(w.operator);
    }
    useEffect(()=>{setBalance(null);setRows([]);setStatus('');setOperator(false);if(address)load().catch(e=>setStatus(e.message));},[address]);
    async function act(task:()=>Promise<unknown>) {
        setBusy(true);setStatus('');
        try {await task();await load();setStatus('done');}
        catch(e:any){setStatus(e.message);}
        finally{setBusy(false);}
    }
    async function sign(id:string) {
        const prepared=await api('/api/v1/finance/withdrawals',{action:'dispatch',id});
        // Dispatch is recorded before opening the wallet. Never retry automatically.
        try {
            const result=await tonConnect.sendTransaction(prepared.transaction);
            await api('/api/v1/finance/withdrawals',{action:'submitted',id,boc:result.boc});
        } catch { throw new Error('signature_uncertain'); }
    }
    const button='rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-40';
    const input='rounded-lg border border-white/20 bg-black/30 px-3 py-2 w-full';
    return <main className="mx-auto max-w-3xl px-5 py-12 text-white space-y-6">
        <Head><title>{p('title')} · GSTD</title><meta name="description" content={p('intro')}/></Head>
        <header className="space-y-3"><h1 className="text-3xl font-semibold">{p('title')}</h1><p className="text-gray-300">{p('intro')}</p></header>
        <section className="rounded-xl border border-violet-400/30 bg-violet-500/5 p-5 space-y-3">
            <h2 className="text-xl font-semibold">{p('node_title')}</h2>
            <ol className="list-decimal pl-5 space-y-2 text-gray-300"><li>{p('node_step1')}</li><li>{p('node_step2')}</li><li>{p('node_step3')}</li></ol>
            <p className="text-sm text-gray-400">{p('node_note')}</p>
        </section>
        <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">{p('wallet_title')}</h2><p className="text-sm text-gray-400">{p('wallet_hint')}</p><WalletConnect/>
            {address && <button className="underline" disabled={busy} onClick={()=>act(async()=>{})}>{p('refresh')}</button>}
        </section>
        {status && <p role="status" className="break-words text-amber-200">{status==='done'?p('done'):errorText(status)}</p>}
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">{p('balance_title')}</h2>
            <p>{p('available')}: <b>{balance.balance_gstd} GSTD</b></p><p className="text-sm text-gray-400">{p('available_hint')}</p>
            <p>{p('pending')}: {balance.pending_gstd} GSTD</p><p className="text-sm text-gray-400">{p('pending_hint')}</p>
            <button className={button} disabled={busy || !(Number(balance.pending_gstd)>0)} onClick={()=>act(()=>api('/api/v1/nodes/claim-rewards',{}))}>{p('claim')}</button>
            <p>{p('reserved')}: {balance.reserved_gstd} GSTD</p><p className="text-sm text-gray-400">{p('reserved_hint')}</p>
            <p>{p('promo')}: {balance.promo_credits}</p><p className="text-sm text-gray-400">{p('promo_hint')}</p>
            <Link className="inline-block underline" href="/chat">{p('use_balance')}</Link>
            <p className="text-sm text-gray-400">{p('split')}</p>
            {!balance.backing_verified && <p role="alert" className="text-amber-300">{p('reserve_unavailable')}</p>}
        </section>}
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">{p('deposit_title')}</h2><p className="text-sm text-gray-300">{p('deposit_hint')}</p>
            <details className="space-y-3"><summary className="cursor-pointer">{p('deposit_steps')}</summary>
                <p className="text-sm text-gray-400">{p('deposit_instruction')}</p>
                <p className="text-sm">{p('deposit_address')}</p><code className="block break-all text-sm">{balance.deposit_owner||p('address_unavailable')}</code>
                <label className="block space-y-2"><span>{p('hash_label')}</span><input className={input} value={hash} onChange={e=>setHash(e.target.value)} placeholder={p('hash_placeholder')}/></label>
                <button className={button} disabled={busy || !/^[a-f0-9]{64}$/i.test(hash.trim()) || !balance.deposit_owner} onClick={()=>act(()=>api('/api/v1/credits/deposit',{tx_hash:hash.trim()}))}>{p('deposit_verify')}</button>
            </details>
        </section>}
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">{p('withdraw_title')}</h2><p className="text-sm text-gray-300">{p('withdraw_hint')}</p>
            <label className="block space-y-2"><span>{p('amount_label')}</span><input className={input} value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder={p('amount_placeholder')}/></label>
            <button className={button} disabled={busy || !(Number(amount)>0)} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',{action:'request',amount_gstd:amount},crypto.randomUUID()))}>{p('withdraw_request')}</button>
            <p className="text-sm text-gray-400">{p('withdraw_fee')}</p>
        </section>}
        {balance && <section className="space-y-3"><h2 className="text-xl">{operator?p('operator_history'):p('history')}</h2>{!rows.length&&<p className="text-gray-400">{p('history_empty')}</p>}
        {rows.map(w=><article key={w.id} className="rounded-xl border border-white/15 p-5 space-y-3">
            <p><b>{(Number(w.amount)/1e9).toFixed(9)} GSTD</b> · {t('payments_page.states.'+w.state,{defaultValue:p('state_unknown')})}</p>
            <p className="text-sm">{p('recipient')}</p><code className="block break-all text-xs">{w.wallet}</code>
            <details><summary className="cursor-pointer text-sm text-gray-400">{p('request_id')}</summary><code className="block break-all text-xs">{w.id}</code></details>
            {w.state==='requested' && <>
                {operator && <div className="space-y-2"><p className="text-sm text-gray-400">{p('operator_hint')}</p><button className={button} disabled={busy} onClick={()=>act(()=>sign(w.id))}>{p('sign')}</button></div>}
                {w.wallet===balance?.wallet && <button className="ml-3 underline" disabled={busy} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',{action:'cancel',id:w.id}))}>{p('cancel')}</button>}
            </>}
            {['dispatching','submitted'].includes(w.state) && <>
                <p className="text-sm text-amber-300">{p('awaiting')}</p>
                <details className="space-y-3"><summary className="cursor-pointer">{p('receipt_help')}</summary>
                    <label className="block space-y-2"><span>{p('hash_label')}</span><input className={input} value={receipts[w.id]||''} onChange={e=>setReceipts({...receipts,[w.id]:e.target.value})} placeholder={p('hash_placeholder')}/></label>
                    <button className={button} disabled={busy || !/^[a-f0-9]{64}$/i.test((receipts[w.id]||'').trim())} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',{action:'confirm',id:w.id,tx_hash:receipts[w.id].trim()}))}>{p('verify_receipt')}</button>
                    <button className="block underline" disabled={busy} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',{action:'recover-unsent',id:w.id}))}>{p('recover')}</button>
                </details>
            </>}
            {w.receiptHash && <a className="underline" href={'https://tonviewer.com/transaction/'+w.receiptHash} target="_blank" rel="noreferrer">{p('transaction')}</a>}
        </article>)}</section>}
    </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
