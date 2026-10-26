import { useEffect, useState } from 'react';
import { useTonConnectUI } from '@tonconnect/ui-react';
import WalletConnect from '../components/WalletConnect';
import { useWalletStore } from '../store/walletStore';

type Withdrawal = { id:string;wallet:string;amount:string;state:string;receiptHash?:string };
export default function PaymentsPage() {
    const {address}=useWalletStore();
    const [tonConnect]=useTonConnectUI();
    const [balance,setBalance]=useState<any>(null),[rows,setRows]=useState<Withdrawal[]>([]);
    const [operator,setOperator]=useState(false),[amount,setAmount]=useState(''),[hash,setHash]=useState('');
    const [receipts,setReceipts]=useState<Record<string,string>>({});
    const [status,setStatus]=useState(''),[busy,setBusy]=useState(false);
    async function api(path:string,body?:unknown,key?:string) {
        const token=localStorage.getItem('session_token');
        if (!token) throw new Error('Подключите кошелёк и подтвердите вход / Connect your wallet and verify login');
        const response=await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',
            'X-Session-Token':token,...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});
        const data=await response.json();
        if (!response.ok) throw new Error(data.error || 'Request failed');
        return data;
    }
    async function load() {
        const [b,w]=await Promise.all([api('/api/v1/credits/balance'),api('/api/v1/finance/withdrawals?scope=operator')]);
        setBalance(b);setRows(w.withdrawals);setOperator(w.operator);
    }
    useEffect(()=>{if(address)load().catch(e=>setStatus(e.message));else{setBalance(null);setRows([]);}},[address]);
    async function act(task:()=>Promise<unknown>) {
        setBusy(true);setStatus('');
        try {await task();await load();setStatus('Готово / Done');}
        catch(e:any){setStatus(e.message);}
        finally{setBusy(false);}
    }
    async function sign(id:string) {
        const prepared=await api('/api/v1/finance/withdrawals',{action:'dispatch',id});
        // The server records dispatch before opening the wallet; never retry this send automatically.
        try {
            const result=await tonConnect.sendTransaction(prepared.transaction);
            await api('/api/v1/finance/withdrawals',{action:'submitted',id,boc:result.boc});
        } catch {
            throw new Error('Подпись отклонена или результат неизвестен. Проверьте кошелёк и транзакцию; не отправляйте повторно. / Check the wallet and chain before any retry.');
        }
    }
    const button='rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-40';
    const input='rounded-lg border border-white/20 bg-black/30 px-3 py-2 w-full';
    return <main className="mx-auto max-w-3xl px-5 py-12 text-white space-y-6">
        <h1 className="text-3xl font-semibold">GSTD · Платежи / Payments</h1>
        <p className="text-gray-400">Оплатите полезные вычисления, заработайте на принятых заданиях и используйте награды для запросов к другим нодам. / Pay for compute, earn from accepted work, and spend earnings on other nodes.</p>
        <WalletConnect/>
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <p>Доступно / Available: <b>{balance.balance_gstd} GSTD</b></p>
            <p>Награды / Pending rewards: {balance.pending_gstd} GSTD · Резерв / Reserved: {balance.reserved_gstd} GSTD</p>
            <p>Промозапросы / Promo requests: {balance.promo_credits}</p>
            <p className="text-sm text-gray-400">85% исполнитель · 10% протокол · 5% резерв. Комиссия получения и вывода: 0 GSTD. Перевод подписывает владелец резерва; он оплачивает сетевой газ TON. / Owner-signed payouts; the custody owner pays native TON execution costs.</p>
            <button className={button} disabled={busy || !balance.pending_gstd} onClick={()=>act(()=>api('/api/v1/nodes/claim-rewards',{}))}>Получить награду / Claim rewards</button>
            {!balance.backing_verified && <p className="text-amber-300">Проверка резерва временно недоступна. Новые списания и выплаты приостановлены. / Reserve verification is unavailable.</p>}
        </section>}
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">Пополнение / Deposit</h2>
            <p className="text-sm text-gray-400">Переведите канонический GSTD со своего подключённого кошелька на адрес ниже и подтвердите хеш входящей Jetton-транзакции. / Send canonical GSTD from your connected wallet, then confirm the receiver Jetton transaction hash.</p>
            <code className="block break-all text-sm">{balance.deposit_owner}</code>
            <input className={input} value={hash} onChange={e=>setHash(e.target.value)} placeholder="Jetton transaction hash · 64 hex"/>
            <button className={button} disabled={busy || !hash} onClick={()=>act(()=>api('/api/v1/credits/deposit',{tx_hash:hash}))}>Подтвердить депозит / Verify deposit</button>
        </section>}
        {balance && <section className="rounded-xl border border-white/15 p-5 space-y-3">
            <h2 className="text-xl">Вывод / Withdraw</h2>
            <input className={input} value={amount} onChange={e=>setAmount(e.target.value)} inputMode="decimal" placeholder="GSTD"/>
            <button className={button} disabled={busy || !amount} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',
                {action:'request',amount_gstd:amount},crypto.randomUUID()))}>Создать заявку / Request withdrawal</button>
            <button className="ml-3 underline" disabled={busy} onClick={()=>act(load)}>Обновить / Refresh</button>
        </section>}
        {rows.map(w=><section key={w.id} className="rounded-xl border border-white/15 p-5 space-y-3">
            <p><b>{(Number(w.amount)/1e9).toFixed(9)} GSTD</b> · {w.state}</p>
            <code className="block break-all text-xs">{w.wallet}</code>
            <code className="block break-all text-xs">{w.id}</code>
            {w.state==='requested' && <>
                {operator && <button className={button} disabled={busy} onClick={()=>act(()=>sign(w.id))}>Подписать выплату · до 0,05 TON / Sign payout</button>}
                {w.wallet===balance?.wallet && <button className="ml-3 underline" disabled={busy} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',{action:'cancel',id:w.id}))}>Отменить / Cancel</button>}
            </>}
            {['dispatching','submitted'].includes(w.state) && <>
                <button className="underline" disabled={busy} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',
                    {action:'recover-unsent',id:w.id}))}>Вернуть резерв после отказа кошелька · после 12 минут / Recover unsent payout</button>
                <p className="text-sm text-amber-300">Ожидается проверка в блокчейне. Не отправляйте платёж повторно. / Awaiting chain reconciliation. Do not resend.</p>
                <input className={input} value={receipts[w.id]||''} onChange={e=>setReceipts({...receipts,[w.id]:e.target.value})} placeholder="Receiver Jetton transaction hash"/>
                <button className={button} disabled={busy} onClick={()=>act(()=>api('/api/v1/finance/withdrawals',
                    {action:'confirm',id:w.id,tx_hash:receipts[w.id]}))}>Проверить получение / Verify receipt</button>
            </>}
            {w.receiptHash && <a className="underline" href={'https://tonviewer.com/transaction/'+w.receiptHash} target="_blank" rel="noreferrer">Транзакция / Transaction</a>}
        </section>)}
        {status && <p role="status" className="break-words text-amber-200">{status}</p>}
    </main>;
}
