import type {GetStaticProps} from 'next';
import Head from 'next/head';
import Link from 'next/link';
import {useTranslation} from 'next-i18next';
import {getCommonStaticProps} from '../lib/i18n-static-props';
import {GSTD_PURCHASE,gstdSwapLink} from '../lib/gstdPurchase';
export default function BuyGstd(){
 const {t}=useTranslation('common'),p=(key:string)=>t('buy_gstd.'+key);
 const button='inline-block rounded-lg bg-violet-600 px-4 py-3 hover:bg-violet-500';
 return <main className="mx-auto max-w-3xl px-5 py-12 text-white space-y-6">
 <Head><title>{p('title')} · GSTD</title><meta name="description" content={p('intro')}/></Head>
 <h1 className="text-3xl font-semibold">{p('title')}</h1><p>{p('intro')}</p>
 <section className="rounded-xl border border-white/20 p-5 space-y-3"><h2 className="text-xl">{p('step1')}</h2><p>{p('wallet_hint')}</p><a className={button} href={GSTD_PURCHASE.wallet} target="_blank" rel="noopener noreferrer">{p('wallet')}</a><p className="text-sm text-gray-400">{p('card_notice')}</p></section>
 <section className="rounded-xl border border-violet-400/30 p-5 space-y-3"><h2 className="text-xl">{p('step2')}</h2><p>{p('swap_hint')}</p><div className="flex flex-wrap gap-3"><a className={button} href={gstdSwapLink('TON')} target="_blank" rel="noopener noreferrer">{p('from_ton')}</a><a className={button} href={gstdSwapLink('USDT')} target="_blank" rel="noopener noreferrer">{p('from_usdt')}</a></div><p className="text-sm text-amber-200">{p('quote_notice')}</p><details><summary className="cursor-pointer">{p('identity')}</summary><p className="text-sm mt-3">TON mainnet · GSTD · 9 decimals</p><code className="block break-all text-xs">{GSTD_PURCHASE.master}</code></details></section>
 <section className="rounded-xl border border-white/20 p-5 space-y-3"><h2 className="text-xl">{p('step3')}</h2><p>{p('use_hint')}</p><div className="flex flex-wrap gap-3"><Link className={button} href="/payments">{p('balance')}</Link><Link className="underline py-3" href="/escrow-mainnet">{p('escrow')}</Link><Link className="underline py-3" href="/agent-access">{p('agents')}</Link></div></section>
 <p className="text-sm text-gray-400">{p('free')}</p><Link href="/chat" className="underline">{p('try_free')}</Link>
 </main>;
}
export const getStaticProps:GetStaticProps=async({locale})=>({props:await getCommonStaticProps(locale)});
