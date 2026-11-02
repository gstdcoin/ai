'use client';
import React,{createContext,useContext} from 'react';
import {useTMALocale,useTMALocaleSync} from '../hooks/useTMALocale';
type Locale='en'|'ru';
const TMALocaleContext=createContext<{locale:Locale}>({locale:'en'});
export function useTMALocaleContext():Locale{return useContext(TMALocaleContext).locale;}
export function TMALocaleProvider({children}:{children:React.ReactNode}) {
 useTMALocaleSync();const locale=useTMALocale();
 return <TMALocaleContext.Provider value={{locale}}>{children}</TMALocaleContext.Provider>;
}
