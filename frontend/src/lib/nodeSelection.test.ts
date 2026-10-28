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
