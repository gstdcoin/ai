// Public, read-only deployment check. Never log response bodies or credentials.
import {setTimeout as delay} from 'node:timers/promises';
const base=new URL(process.argv[2]||'https://app.gstdtoken.com');
if(base.protocol!=='https:'||base.username||base.password||
 !(base.hostname==='app.gstdtoken.com'||base.hostname.endsWith('.workers.dev')))throw Error('Unexpected wallet manifest check origin');
const canonical='https://app.gstdtoken.com';
for(const [file,expectedUrl] of [['tonconnect-manifest.json',canonical],['tonconnect-testnet-manifest.json',canonical+'/escrow']]){
 let last;
 for(let attempt=0;attempt<3;attempt++){
  try{
   const headers={Origin:'https://wallet.example.com'};
   if(base.hostname.endsWith('.workers.dev') && process.env.GSTD_PREVIEW_ACCESS_KEY){
    if(!/^[a-f0-9]{64}$/.test(process.env.GSTD_PREVIEW_ACCESS_KEY))throw Error('invalid preview access key');
    headers['x-gstd-preview-key']=process.env.GSTD_PREVIEW_ACCESS_KEY;
   }
   const response=await fetch(new URL('/'+file,base),{redirect:'manual',signal:AbortSignal.timeout(10000),headers});
   if(response.status!==200)throw Error('HTTP '+response.status);
   if(response.headers.get('access-control-allow-origin')!=='*')throw Error('missing credential-free CORS');
   if(!response.headers.get('content-type')?.includes('application/json'))throw Error('unexpected content type');
   let value;try{value=await response.json();}catch{throw Error('invalid JSON');}
   if(value.url!==expectedUrl||typeof value.name!=='string'||!value.name||
    value.iconUrl!==canonical+'/logo.png'||(file.includes('testnet')&&!value.name.includes('Testnet')))throw Error('unexpected public metadata');
   console.log(file+': public JSON, CORS and identity verified');
   last=null;break;
  }catch(error){last=error;if(attempt<2)await delay(1000);}
 }
 if(last)throw Error(file+': '+last.message);
}
