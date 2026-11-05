import {it,expect,vi,beforeEach} from 'vitest';
const fixture=vi.hoisted(()=>({addresses:[{address:'93.184.216.34',family:4}],status:200,lookup:null as any,requestCount:0}));
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:()=>{throw Error('standalone fixture');}}));
vi.mock('node:dns/promises',()=>({lookup:async()=>fixture.addresses}));
vi.mock('node:https',async()=>{
 const {EventEmitter}=await import('node:events'),{Readable}=await import('node:stream');
 return{request:(_url:any,options:any,callback:any)=>{
  fixture.requestCount++;fixture.lookup=options.lookup;
  const request:any=new EventEmitter();request.write=()=>{};request.end=()=>{const incoming:any=Readable.from([Buffer.from('{"ok":true}')]);incoming.statusCode=fixture.status;incoming.headers={'content-type':'application/json'};callback(incoming);};return request;
 }};
});
import {fetchNode} from './nodeFetch';
beforeEach(()=>{fixture.addresses=[{address:'93.184.216.34',family:4}];fixture.status=200;fixture.requestCount=0;});
it('pins a public DNS result to the connection and preserves base path and response body',async()=>{
 const result=await fetchNode('https://node.example.com/base/v1/models');expect(await result.json()).toEqual({ok:true});
 let pinned:any[]=[];fixture.lookup('ignored.example.com',{},(...args:any[])=>pinned=args);expect(pinned).toEqual([null,'93.184.216.34',4]);
});
it('rejects private or mixed DNS results before creating any request',async()=>{
 for(const addresses of [[{address:'127.0.0.1',family:4}],[{address:'10.0.0.1',family:4}],[{address:'::ffff:127.0.0.1',family:6}],[{address:'93.184.216.34',family:4},{address:'169.254.169.254',family:4}]]){
  fixture.addresses=addresses;await expect(fetchNode('https://node.example.com/base')).rejects.toThrow('unsafe_node_address');
 }
 expect(fixture.requestCount).toBe(0);
});
it('never follows redirects or accepts a direct internal address as an untrusted node',async()=>{
 fixture.status=302;await expect(fetchNode('https://node.example.com/base')).rejects.toThrow('node_redirect_rejected');expect(fixture.requestCount).toBe(1);
 await expect(fetchNode('http://127.0.0.1/')).rejects.toThrow('unsafe_node_url');
});
