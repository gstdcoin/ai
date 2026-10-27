import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {getCommonStaticProps} from './i18n-static-props';
it('loads RU/EN resources without a runtime config file or filesystem lookup',async()=>{
 const spy=vi.spyOn(fs,'existsSync').mockImplementation(()=>{throw Error('Worker filesystem unavailable')});
 try{
  const ru=await getCommonStaticProps('ru');
  expect((ru._nextI18Next!.initialI18nStore.ru.common as any).payments_page.title).toBe('Баланс и награды');
  const en=await getCommonStaticProps('en');
  expect((en._nextI18Next!.initialI18nStore.en.common as any).payments_page.title).toBe('Balance & rewards');
  expect(spy).not.toHaveBeenCalled();
 }finally{spy.mockRestore()}
});
