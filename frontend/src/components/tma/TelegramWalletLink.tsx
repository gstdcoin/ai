import {useState} from 'react';
import {useRouter} from 'next/router';
import {useTonConnectUI} from '@tonconnect/ui-react';
import {useWalletStore} from '../../store/walletStore';
import {getInitData,getTelegramUser} from '../../lib/telegram';
import {apiPost} from '../../lib/apiClient';
export default function TelegramWalletLink(){
 const {locale}=useRouter(),ru=locale==='ru';const {address}=useWalletStore();
 const [tonConnect]=useTonConnectUI();const [busy,setBusy]=useState(false),[result,setResult]=useState('');
 const initData=getInitData(),user=getTelegramUser();
 if(!initData||!user?.id)return null;
 async function link(){
  if(!address){await tonConnect.openModal();return;}
  setBusy(true);setResult('');
  try{await apiPost('/telegram/link-wallet',{telegram_id:user!.id,wallet_address:address,telegram_init_data:initData});
   setResult(ru?'Кошелёк подтверждён. Баланс и ноды теперь доступны в боте.':'Wallet verified. Your balance and nodes are now available in the bot.');
  }catch{setResult(ru?'Не удалось подтвердить привязку. Подключите кошелёк заново и повторно откройте приложение из бота.':'Could not verify the link. Reconnect your wallet and reopen the app from the bot.');}
  finally{setBusy(false);}
 }
 return <section className="rounded-xl border border-white/10 p-3 my-3 text-center text-sm">
  <p className="text-gray-400 mb-2">{ru?'Подтвердите владение TON-кошельком для доступа к его данным в боте.':'Verify TON wallet ownership before accessing its account data in the bot.'}</p>
  <button type="button" disabled={busy} onClick={()=>void link()} className="rounded-lg bg-violet-600 px-4 py-2 disabled:opacity-50">
   {busy?(ru?'Проверка…':'Verifying…'):address?(ru?'Привязать кошелёк к Telegram':'Link wallet to Telegram'):(ru?'Подключить кошелёк':'Connect wallet')}
  </button>{result&&<p role="status" className="mt-2 text-gray-300">{result}</p>}
 </section>;
}
