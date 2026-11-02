import {expect,it} from 'vitest';
import {chooseAppLocale} from './appLocale';
it('keeps an explicit English choice for a Russian Telegram account',()=>{
 expect(chooseAppLocale({saved:'en',link:'ru',telegram:'ru-RU',route:'ru'})).toBe('en');
 expect(chooseAppLocale({link:'en',telegram:'ru',route:'ru'})).toBe('en');
});
it('uses Telegram only as the initial default and ignores malformed preferences',()=>{
 expect(chooseAppLocale({telegram:'ru-RU'})).toBe('ru');
 expect(chooseAppLocale({telegram:'en-US'})).toBe('en');
 expect(chooseAppLocale({saved:'<script>',link:['ru','en'],route:'ru'})).toBe('ru');
 expect(chooseAppLocale({route:'en'})).toBe('en');
});
