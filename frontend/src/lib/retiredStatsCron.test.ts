import {expect,it,vi} from 'vitest';
vi.mock('./kv',()=>({kvSet:vi.fn(),kvGet:vi.fn(),kvKeys:vi.fn(),kvMGet:vi.fn()}));
import {kvSet,kvGet} from './kv';
import refresh from '../pages/api/cron/refresh-stats';
it('never rebuilds legacy rewards through GET or an asserted cron token',()=>{
 for(const method of ['GET','POST']){let status=200;refresh({method,headers:{authorization:'Bearer undefined'}} as any,{setHeader(){},status(n:number){status=n;return this;},json(){}} as any);expect(status).toBe(410);}
 expect(kvSet).not.toHaveBeenCalled();expect(kvGet).not.toHaveBeenCalled();
});
