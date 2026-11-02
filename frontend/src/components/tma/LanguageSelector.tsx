import {useRouter} from 'next/router';
import {APP_LOCALE_KEY,AppLocale} from '../../lib/appLocale';
export default function LanguageSelector() {
 const router=useRouter(),locale=router.locale==='ru'?'ru':'en';
 const select=(next:AppLocale)=>{
  try{window.localStorage.setItem(APP_LOCALE_KEY,next);}catch{/* Private browser: the URL retains the choice. */}
  void router.replace({pathname:router.pathname,query:{...router.query,lang:next},hash:window.location.hash},undefined,{locale:next,scroll:false});
 };
 return <div role="group" aria-label={locale==='ru'?'Язык приложения':'Application language'} className="flex justify-center gap-2 py-2">
  {(['en','ru'] as const).map(l=><button key={l} type="button" lang={l} aria-pressed={locale===l} onClick={()=>select(l)}
   className={'rounded-lg border px-3 py-1.5 text-sm '+(locale===l?'border-violet-400 text-white':'border-white/20 text-gray-400')}>
   {l==='en'?'English':'Русский'}
  </button>)}
 </div>;
}
