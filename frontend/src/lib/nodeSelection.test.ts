import {it,expect,vi,afterEach} from 'vitest';
vi.mock('./kv',()=>({kvGet:vi.fn(),kvKeys:vi.fn().mockResolvedValue(['node:real']),kvMGet:vi.fn()}));
import {kvMGet} from './kv';
import {getActiveNodes,callNodeChat,resolveNodeUrl} from './nodes';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();vi.clearAllMocks()});
function registry(){vi.mocked(kvMGet).mockResolvedValue([JSON.stringify({node_id:'real',node_url:'https://current-node.example.com',last_seen:new Date().toISOString(),capabilities:['exact:small'],cpu_cores:4})])}
it('does not route a specific model to a node advertising only another variant',async()=>{registry();expect(await getActiveNodes('exact:large')).toEqual([])});
it('prefers the live registry over a stale configured tunnel',async()=>{
 registry();vi.stubEnv('GSTD_NODE_URL','https://old-node.example.com');
 expect(await resolveNodeUrl('exact:small')).toBe('https://current-node.example.com');
 const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:'exact:small',choices:[{message:{content:'ok'}}]})));vi.stubGlobal('fetch',request);
 await callNodeChat([{role:'user',content:'hello'}],{model:'exact:small'});
 expect(request.mock.calls[0][0]).toBe('https://current-node.example.com/v1/chat/completions');
});
