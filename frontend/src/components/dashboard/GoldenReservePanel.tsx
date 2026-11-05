import { useEffect,useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
export default function GoldenReservePanel(){
 const ru=useRouter().locale==='ru';
 const [data,setData]=useState<{treasury_gstd:number;reserve_gstd:number;protocol_credited_gstd:number}|null>(null);
 const [error,setError]=useState(false);
 async function load(){try{const r=await fetch('/api/v1/fund/status');if(!r.ok)throw new Error();setData(await r.json());setError(false);}catch{setError(true);}}
 useEffect(()=>{void load();},[]);
 return <section className="col-span-2 lg:col-span-4 glass-card p-6 space-y-3">
  <h2 className="text-xl font-bold">{ru?'Средства протокола':'Protocol funds'}</h2>
  <p>85% {ru?'исполнителю':'executor'} · 10% {ru?'протоколу':'protocol'} · 5% {ru?'резерву':'reserve'}</p>
  {error?<p>{ru?'Данные недоступны':'Data unavailable'}</p>:data?<p>{ru?'Всего зачислено протоколу':'Total credited to protocol'}: {data.protocol_credited_gstd} GSTD · {ru?'Резерв':'Reserve'}: {data.reserve_gstd} GSTD</p>:<p>…</p>}
  <p className="text-sm text-gray-400">{ru?'Доход протокола автоматически зачисляется его получателю в обеспеченный баланс. Резерв 5% хранится отдельно; пополнение пула GSTD/XAUt0 ещё не автоматизировано. Переводы в блокчейн требуют подписей.':'Protocol income is automatically credited to its beneficiary in the backed ledger. The 5% reserve is separate; GSTD/XAUt0 liquidity provision is not automated. Blockchain transfers require signatures.'}</p>
  <button className="underline mr-4" onClick={()=>void load()}>{ru?'Обновить':'Refresh'}</button>
  <Link href="/payments" className="underline">{ru?'Платежи и вывод':'Payments and withdrawals'}</Link>
 </section>;
}
