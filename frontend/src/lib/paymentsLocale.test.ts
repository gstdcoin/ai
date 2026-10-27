import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
it('provides matching RU/EN payment copy and translations for every page label',()=>{
 const en=JSON.parse(readFileSync('public/locales/en/common.json','utf8')).payments_page;
 const ru=JSON.parse(readFileSync('public/locales/ru/common.json','utf8')).payments_page;
 const keys=(value:any,prefix=''):string[]=>Object.entries(value).flatMap(([k,v])=>typeof v==='object'?keys(v,prefix+k+'.'):[prefix+k]).sort();
 expect(keys(ru)).toEqual(keys(en));
 const source=readFileSync('src/pages/payments.tsx','utf8');
 for(const m of source.matchAll(/\bp\('([^']+)'\)/g)){expect(en[m[1]],m[1]).toBeTruthy();expect(ru[m[1]],m[1]).toBeTruthy()}
 expect(source).toContain('getCommonStaticProps(locale)');
 expect(ru.node_note).toContain('Пополнение не требуется');
 expect(ru.pending_hint).toContain('не отправляет в блокчейн');
});
