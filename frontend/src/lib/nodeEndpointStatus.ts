import {safeNodeUrl} from './safeNodeUrl';
export function endpointVerified(record:any,expectedUrl?:string,now=Date.now()):boolean{
 const url=safeNodeUrl(record.node_url||record.multiaddrs?.[0]||'');
 return !!url&&(!expectedUrl||url===expectedUrl)&&record.endpoint_verified_url===url&&typeof record.endpoint_verified_key==='string'&&
 /^[a-f0-9]{64}$/.test(record.endpoint_verified_key)&&Number.isSafeInteger(record.endpoint_verified_at)&&
 record.endpoint_verified_at<=now&&now-record.endpoint_verified_at<86400000;
}
