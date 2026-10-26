import {beforeEach,describe,it,expect,vi} from 'vitest';
const {kvMGet}=vi.hoisted(()=>({kvMGet:vi.fn()}));
vi.mock('./kv',()=>({kvMGet}));
import {publicFinance} from './publicFinance';
import treasury from '../pages/api/v1/treasury/status';
describe('canonical public finance',()=>{
 beforeEach(()=>kvMGet.mockReset());
 it('reads only v2 funds and preserves exact nano amounts',async()=>{
  kvMGet.mockResolvedValue([JSON.stringify({nano:'9007199254740993'}),JSON.stringify({nano:'5000000000'})]);
  const a=await publicFinance();expect(a.protocol_nano).toBe('9007199254740993');
  expect(a.reserve_gstd).toBe(5);expect(a.fee_split).toEqual({node_operators_pct:85,protocol_treasury_pct:10,reserve_pct:5});
  expect(a.automatic_distribution_enabled).toBe(false);
  expect(kvMGet).toHaveBeenCalledWith(['money:v2:fund:protocol','money:v2:fund:reserve']);
 });
 it('rejects fake legacy distributions before any storage access',async()=>{
  const res={status:vi.fn().mockReturnThis(),json:vi.fn()};
  await treasury({method:'POST'} as any,res as any);
  expect(res.status).toHaveBeenCalledWith(410);expect(kvMGet).not.toHaveBeenCalled();
 });
});
