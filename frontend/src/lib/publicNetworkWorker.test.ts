import {it,expect,vi,afterEach} from 'vitest';
import {publicNetworkResponse} from '../../worker-public-network';
import {offerKey} from './workEconomics';
const env={KV_REST_API_URL:'https://redis.invalid',KV_REST_API_TOKEN:'fixture-only'};
const node={node_id:'native-node',node_url:'https://native.example.com',last_seen:new Date().toISOString(),capabilities:['exact:small']};
afterEach(()=>vi.unstubAllGlobals());
it('reads live counters in batches without Next rendering or publishing credentials',async()=>{
 const calls:any[]=[];vi.stubGlobal('fetch',vi.fn(async(_u,init)=>{const body=JSON.parse(init.body);calls.push(body);return Response.json(body.length===3?[{result:['node:native-node','node:metadata:cache']},{result:['1','7','0.1','0.01','2','0','0.02','3','1']},{result:4}]:[{result:[JSON.stringify(node)]}]);}));
 const r=(await publicNetworkResponse(new Request('https://app.gstdtoken.com/api/v1/network/stats'),env))!;
 expect(r.status).toBe(200);const data=await r.json();expect(data.nodes_online).toBe(1);expect(data.total_tasks).toBe(7);expect(data.queue_depth).toBe(4);expect(JSON.stringify(data)).not.toContain('fixture-only');expect(calls).toHaveLength(2);
});
it('preserves quote-required model markers using the same canonical offer key',async()=>{
 const calls:any[]=[];let n=0;vi.stubGlobal('fetch',vi.fn(async(_u,init)=>{calls.push(JSON.parse(init.body));return Response.json([{result:++n===1?['node:native-node']:n===2?[JSON.stringify(node)]:[JSON.stringify({nodeId:node.node_id,model:'exact:small',netUsdMicro:'1000',active:true})]}]);}));
 const r=(await publicNetworkResponse(new Request('https://app.gstdtoken.com/api/v1/models/available'),env))!,data=await r.json();
 expect(data.models[0].pricing).toBe('quote_required');expect(data.models[0].min_executor_usd).toBe('0.001000');expect(calls[2][0][1]).toBe(offerKey(node.node_id,'exact:small'));
});
it('does not publish zero statistics on storage failure or process other paths',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 expect((await publicNetworkResponse(new Request('https://app.gstdtoken.com/api/v1/network/stats'),env))!.status).toBe(503);
 expect(await publicNetworkResponse(new Request('https://app.gstdtoken.com/api/v1/finance/balance'),env)).toBeNull();
 expect((await publicNetworkResponse(new Request('https://app.gstdtoken.com/api/v1/network/stats',{method:'POST'}),env))!.status).toBe(405);
});
