import {it,expect,vi,afterEach} from 'vitest';
import {readFileSync} from 'node:fs';
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:()=>({env:{}})}));
import {fetchNode} from './nodeFetch';
afterEach(()=>vi.unstubAllGlobals());
it('uses the supported Workers manual mode and rejects every redirect without a second request',async()=>{
 const fetcher=vi.fn(async(_url:RequestInfo|URL,_init?:RequestInit)=>new Response('',{status:302,headers:{Location:'http://127.0.0.1/private'}}));vi.stubGlobal('fetch',fetcher);
 await expect(fetchNode('https://node.example.com/chat',{redirect:'follow'})).rejects.toThrow('node_redirect_rejected');
 expect(fetcher).toHaveBeenCalledTimes(1);expect(fetcher.mock.calls[0][1]?.redirect).toBe('manual');
 for(const path of ['wrangler.jsonc','wrangler.production.jsonc'])expect(readFileSync(path,'utf8')).toContain('global_fetch_strictly_public');
});
it('preserves a valid public response and rejects an unsafe initial URL before sending',async()=>{
 const fetcher=vi.fn(async()=>Response.json({ok:true}));vi.stubGlobal('fetch',fetcher);
 expect(await (await fetchNode('https://node.example.com/base/chat')).json()).toEqual({ok:true});
 await expect(fetchNode('https://127.0.0.1/private')).rejects.toThrow('unsafe_node_url');expect(fetcher).toHaveBeenCalledTimes(1);
});
