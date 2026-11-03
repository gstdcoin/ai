import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect,vi,beforeEach} from 'vitest';
const state=vi.hoisted(()=>({path:'/escrow',providers:0,nav:0}));
vi.mock('next/router',()=>({useRouter:()=>({pathname:state.path,locale:'ru'})}));
vi.mock('next-i18next',()=>({appWithTranslation:(component:unknown)=>component}));
vi.mock('@tonconnect/ui-react',()=>({THEME:{DARK:'dark',LIGHT:'light'},TonConnectUIProvider:({children}:{children:React.ReactNode})=>{state.providers++;return children;}}));
vi.mock('../components/common/TelegramThemeProvider',()=>({TelegramThemeProvider:({children}:{children:React.ReactNode})=>children}));
vi.mock('../components/layout/EcosystemNav',()=>({default:()=>{state.nav++;return null;}}));
vi.mock('../components/layout/EcosystemFooter',()=>({default:()=>null}));
vi.mock('../components/common/WalletListener',()=>({default:()=>null}));
vi.mock('../components/common/AutoClaimWorker',()=>({default:()=>null}));
vi.mock('sonner',()=>({Toaster:()=>null}));
import App from '../pages/_app';
beforeEach(()=>{state.path='/escrow';state.providers=0;state.nav=0;});
const child=()=>React.createElement('div',null,'page-content');
it('renders the testnet document without creating the singleton platform wallet provider',()=>{
 const html=renderToStaticMarkup(React.createElement(App,{Component:child,pageProps:{}} as any));
 expect(html).toContain('page-content');expect(state.providers).toBe(0);expect(state.nav).toBe(0);
});
it('keeps the normal platform provider and navigation on production payment pages',()=>{
 state.path='/payments';renderToStaticMarkup(React.createElement(App,{Component:child,pageProps:{}} as any));
 expect(state.providers).toBe(1);expect(state.nav).toBe(1);
});
