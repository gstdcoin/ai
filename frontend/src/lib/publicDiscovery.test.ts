import {describe,it,expect,vi} from 'vitest';
const {kvKeys,kvMGet}=vi.hoisted(()=>({kvKeys:vi.fn(),kvMGet:vi.fn()}));
vi.mock('./kv',()=>({kvKeys,kvMGet}));
import models from '../pages/api/v1/models/available';
describe('live model discovery',()=>{
 it('ignores stale/future nodes, aliases and duplicate model entries',async()=>{
  kvKeys.mockResolvedValue(['node:a','node:b','node:c','node:d']);
  const now=Date.now();const node=(id:string,age:number,url:string)=>JSON.stringify({node_id:id,node_url:url,last_seen:new Date(now-age).toISOString(),capabilities:['llama3.2:3b','llama3.2:3b']});
  kvMGet.mockResolvedValue([node('a',0,'https://one.test'),node('b',1,'https://one.test'),node('c',700000,'https://stale.test'),node('d',-600000,'https://future.test')]);
  const res={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
  await models({method:'GET'} as any,res as any);
  expect(res.json.mock.calls[0][0].models).toMatchObject([{model_id:'llama3.2:3b',nodes_count:1,price_gstd:0}]);
  expect(res.json.mock.calls[0][0].models).toHaveLength(1);
 });
});
