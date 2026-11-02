'use client';
import {useEffect,useRef} from 'react';
import {useRouter} from 'next/router';
import {getTelegramUser} from '../lib/telegram';
import {chooseAppLocale,savedAppLocale,appLocale} from '../lib/appLocale';
export type TMALocale='en'|'ru';
export function useTMALocale():TMALocale {
 return useRouter().locale==='ru'?'ru':'en';
}
export function useTMALocaleSync() {
 const router=useRouter(),synced=useRef(false);
 const telegram=getTelegramUser()?.language_code;
 useEffect(()=>{
  if(!router.isReady||synced.current)return;
  const saved=savedAppLocale();
  if(!saved&&!appLocale(router.query.lang)&&!telegram)return;
  const locale=chooseAppLocale({saved,link:router.query.lang,telegram,route:router.locale});
  synced.current=true;
  if(router.locale!==locale)void router.replace({pathname:router.pathname,query:router.query,hash:window.location.hash},undefined,{locale,scroll:false});
 },[router.isReady,router.locale,router.query.lang,telegram,router]);
}
