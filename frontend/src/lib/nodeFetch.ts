import {safeNodeUrl} from './safeNodeUrl';
/** Native Workers enforce public egress; standalone Node pins DNS at connect time. */
export async function fetchNode(url:string,init:RequestInit={},trusted=false):Promise<Response>{
 const u=new URL(url);if(u.hash||!safeNodeUrl(u.origin+u.pathname,{trusted}))throw Error('unsafe_node_url');
 let cloudflare=false;
 try{const {getCloudflareContext}=await import('@opennextjs/cloudflare');cloudflare=!!getCloudflareContext().env;}catch{/* Standalone Node uses the pinned-DNS transport below. */}
 if(cloudflare){const response=await fetch(url,{...init,redirect:'manual'});if(response.status>=300&&response.status<400){await response.body?.cancel();throw Error('node_redirect_rejected');}return response;}
 const [{request},{lookup},{BlockList}, {Readable}]=await Promise.all([u.protocol==='http:'?import('node:http'):import('node:https'),import('node:dns/promises'),import('node:net'),import('node:stream')]);
 const blocked=new BlockList(),global6=new BlockList();global6.addSubnet('2000::',3,'ipv6');
 for(const [ip,bits]of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]] as [string,number][])blocked.addSubnet(ip,bits,'ipv4');
 for(const [ip,bits]of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]] as [string,number][])blocked.addSubnet(ip,bits,'ipv6');
 const addresses=await lookup(u.hostname,{all:true});
 if(!addresses.length||!trusted&&addresses.some(a=>a.family===4?blocked.check(a.address,'ipv4'):!global6.check(a.address,'ipv6')||blocked.check(a.address,'ipv6')))throw Error('unsafe_node_address');
 if(init.signal?.aborted)throw init.signal.reason;
 const selected=addresses[0],headers=new Headers(init.headers);headers.set('Accept-Encoding','identity');
 if(init.body!==undefined&&init.body!==null&&typeof init.body!=='string')throw Error('invalid_node_request_body');
 return new Promise<Response>((resolve,reject)=>{
  const outgoing=request(u,{method:init.method||'GET',headers:Object.fromEntries(headers),agent:false,autoSelectFamily:false,signal:init.signal||undefined,
   lookup:(_hostname,_options,callback:any)=>callback(null,selected.address,selected.family)} as import('node:https').RequestOptions & {autoSelectFamily:boolean},incoming=>{
    const status=incoming.statusCode||502;
    if(status>=300&&status<400){incoming.destroy();reject(Error('node_redirect_rejected'));return;}
    const responseHeaders=new Headers();for(const[k,v]of Object.entries(incoming.headers))if(v!==undefined)responseHeaders.set(k,Array.isArray(v)?v.join(', '):v);
    if(incoming.headers['content-encoding']&&incoming.headers['content-encoding']!=='identity'){incoming.destroy();reject(Error('node_encoding_unsupported'));return;}
    const noBody=init.method==='HEAD'||status===204||status===205||status===304;
    resolve(new Response(noBody?null:Readable.toWeb(incoming) as ReadableStream,{status,headers:responseHeaders}));
    if(noBody)incoming.resume();
   });
  outgoing.on('error',reject);if(typeof init.body==='string')outgoing.write(init.body);outgoing.end();
 });
}
