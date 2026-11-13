import {it,expect,vi,afterEach} from 'vitest';
vi.mock('./kv',()=>({kvGet:vi.fn(),kvKeys:vi.fn().mockResolvedValue(['node:real']),kvMGet:vi.fn()}));
import {kvMGet} from './kv';
import {getActiveNodes,callNodeChat,resolveNodeUrl,streamNodeChat,callNodeParallel} from './nodes';
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

it('routes private chat only to an approved identity with a fresh URL and matching bound key',async()=>{
 const endpoint='https://current-node.example.com',key='11'.repeat(32),trustedNodes=new Map([['real',key]]);
 const record={node_id:'real',node_url:endpoint,last_seen:new Date().toISOString(),capabilities:['exact:small'],cpu_cores:4,
  endpoint_verified_url:endpoint,endpoint_verified_key:key,endpoint_verified_at:Date.now()};
 vi.stubEnv('GSTD_NODE_URL','https://old-node.example.com');
 const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({model:'exact:small',choices:[{message:{content:'ok'}}]})));
 vi.stubGlobal('fetch',request);
 vi.mocked(kvMGet).mockResolvedValue([JSON.stringify({...record,endpoint_verified_at:0}),key]);
 await expect(callNodeChat([{role:'user',content:'hello'}],{model:'exact:small',trustedNodes})).rejects.toThrow('No GSTD node');
 const newKey='22'.repeat(32);
 vi.mocked(kvMGet).mockResolvedValue([JSON.stringify({...record,endpoint_verified_key:newKey}),newKey]);
 await expect(callNodeChat([{role:'user',content:'hello'}],{model:'exact:small',trustedNodes})).rejects.toThrow('No GSTD node');
 expect(request).not.toHaveBeenCalled();
 vi.mocked(kvMGet).mockResolvedValue([JSON.stringify(record),key]);
 expect((await callNodeChat([{role:'user',content:'hello'}],{model:'exact:small',trustedNodes})).content).toBe('ok');
 expect(request).toHaveBeenCalledTimes(1);
});

it('does not expose streamed output from a substituted model',async()=>{
 registry();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('data: '+JSON.stringify({model:'wrong:model',choices:[{delta:{content:'wrong output'}}]})+'\n\n')));
 const chunks:string[]=[];
 await expect((async()=>{for await(const chunk of streamNodeChat([{role:'user',content:'hi'}],{model:'exact:small'}))chunks.push(chunk)})()).rejects.toThrow('model_mismatch');
 expect(chunks).toEqual([]);
});
it('does not accept a substituted parallel response',async()=>{
 registry();vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify({model:'wrong:model',choices:[{message:{content:'wrong output'}}]}))));
 await expect(callNodeParallel([{role:'user',content:'hi'}],{model:'exact:small'})).rejects.toThrow('model_mismatch');
});

it('treats an omitted tag as latest without treating other variants as equal',async()=>{
 vi.mocked(kvMGet).mockResolvedValue([JSON.stringify({node_id:'real',node_url:'https://current-node.example.com',last_seen:new Date().toISOString(),capabilities:['example:latest'],cpu_cores:4})]);
 expect(await getActiveNodes('example')).toHaveLength(1);
 expect(await getActiveNodes('example:small')).toEqual([]);
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response(JSON.stringify({model:'example:latest',choices:[{message:{content:'ok'}}]}))));
 expect((await callNodeChat([{role:'user',content:'hi'}],{model:'example'})).content).toBe('ok');
});

// Consumer fixture: outbound transport is validated separately in nodeFetch.test.ts.
vi.mock('./nodeFetch',()=>({fetchNode:(url:string,init:RequestInit)=>fetch(url,init)}));
