export type AppLocale='en'|'ru';
export const APP_LOCALE_KEY='gstd_app_locale';
export function appLocale(value:unknown):AppLocale|null {
 return typeof value==='string' && (value==='en'||value==='ru')?value:null;
}
export function savedAppLocale():AppLocale|null {
 try{return typeof window==='undefined'?null:appLocale(window.localStorage.getItem(APP_LOCALE_KEY));}catch{return null;}
}
export function chooseAppLocale(input:{saved?:unknown;link?:unknown;telegram?:string;route?:string}):AppLocale {
 return appLocale(input.saved)||appLocale(input.link)||(input.telegram?input.telegram.toLowerCase().startsWith('ru')?'ru':'en':input.route==='ru'?'ru':'en');
}
