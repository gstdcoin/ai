import type { UserConfig } from 'next-i18next';
import type { BackendModule } from 'i18next';
import en from '../../public/locales/en/common.json';
import ru from '../../public/locales/ru/common.json';

const resources = { en: { common: en }, ru: { common: ru } };
// Cloudflare Workers have no project filesystem. Load bundled translations,
// including on routes without page-level translation props, without HTTP calls.
const backend:BackendModule={
    type:'backend',init(){},
    read(language,namespace,callback){
        const bundle=resources[language as keyof typeof resources];
        callback(null,namespace==='common'&&bundle?bundle.common:{});
    },
};
export const i18nConfig:UserConfig={
    i18n:{defaultLocale:'en',locales:['en','ru'],localeDetection:false},
    resources,ns:['common'],defaultNS:'common',fallbackLng:'en',
    use:[backend],serializeConfig:false,reloadOnPrerender:false,
};
