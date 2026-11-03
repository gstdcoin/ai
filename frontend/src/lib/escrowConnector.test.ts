import {it,expect,vi,afterEach} from 'vitest';
import {createEscrowConnector,testnetConnectionPrefix} from './escrowConnector';
afterEach(()=>vi.unstubAllGlobals());
function memory(){
 const data=new Map<string,string>([['ton-connect-storage_bridge-connection','platform-session'],['gstd_escrow_testnet_v1:draft','saved-batch']]),reads:string[]=[];
 return{data,reads,storage:{getItem:(key:string)=>{reads.push(key);return data.get(key)??null;},setItem:(key:string,value:string)=>{data.set(key,value);},removeItem:(key:string)=>{data.delete(key);}}};
}
it('encodes testnet in the real SDK connection request before a wallet can reply',async()=>{
 class OfflineEvents{onopen:(()=>void)|null=null;onerror:any;onmessage:any;readyState=1;constructor(){queueMicrotask(()=>this.onopen?.());}close(){}}
 vi.stubGlobal('EventSource',OfflineEvents);vi.stubGlobal('fetch',vi.fn(async()=>Response.json([])));
 const x=memory(),connector=createEscrowConnector('https://app.gstdtoken.com',x.storage),controller=new AbortController();
 const link=connector.connect({universalLink:'https://app.tonkeeper.com/ton-connect',bridgeUrl:'https://bridge.tonapi.io/bridge'},{signal:controller.signal,openingDeadlineMS:1000});
 const request=JSON.parse(new URL(link).searchParams.get('r')!);
 expect(request.items.find((x:any)=>x.name==='ton_addr')).toEqual({name:'ton_addr',network:'-3'});
 expect(request.manifestUrl).toBe('https://app.gstdtoken.com/tonconnect-testnet-manifest.json');
 controller.abort();await Promise.resolve();
});
it('restores only the dedicated connection namespace and leaves platform and escrow recovery data intact',async()=>{
 const x=memory(),connector=createEscrowConnector('https://app.gstdtoken.com',x.storage);
 await connector.restoreConnection();
 expect(x.reads.length).toBeGreaterThan(0);expect(x.reads.every(k=>k.startsWith(testnetConnectionPrefix))).toBe(true);
 expect(x.data.get('ton-connect-storage_bridge-connection')).toBe('platform-session');
 expect(x.data.get('gstd_escrow_testnet_v1:draft')).toBe('saved-batch');
 expect(connector.connected).toBe(false);
});
