import {createHash} from 'node:crypto';
import {Address} from '@ton/core';
import {extractVerifiedWalletPublicKey} from './tonProof';
import {verifyEd25519} from './ed25519';
export function pilotAuthorizationText(task:string,nodeId:string,nonce:string){return `GSTD: разрешение запуска задания / job authorization\nNetwork: TON testnet (-3)\nTask: ${task}\nNode: ${nodeId}\nOperation: run one funded arithmetic task\nNonce: ${nonce}`;}
export function pilotSignDataDigest(address:string,domain:string,timestamp:number,text:string):Buffer{
 const addr=Address.parse(address),wc=Buffer.alloc(4),dom=Buffer.from(domain,'utf8'),domLength=Buffer.alloc(4),ts=Buffer.alloc(8),data=Buffer.from(text,'utf8'),length=Buffer.alloc(4);
 wc.writeInt32BE(addr.workChain);domLength.writeUInt32BE(dom.length);ts.writeBigUInt64BE(BigInt(timestamp));length.writeUInt32BE(data.length);
 return createHash('sha256').update(Buffer.concat([Buffer.from([255,255]),Buffer.from('ton-connect/sign-data/'),wc,addr.hash,domLength,dom,ts,Buffer.from('txt'),length,data])).digest();
}
/** Only the expected payer, exact fresh challenge text and owned app domain authorize execution. */
export function verifyPilotAuthorization(value:any,stateInit:unknown,payer:string,text:string,now=Math.floor(Date.now()/1000)):boolean{
 try{
  if(!value||value.domain!=='app.gstdtoken.com'||!Number.isSafeInteger(value.timestamp)||value.timestamp<now-300||value.timestamp>now+60||value.payload?.type!=='text'||value.payload.text!==text||typeof value.signature!=='string'||typeof value.address!=='string'||Address.parse(value.address).toRawString()!==payer||typeof stateInit!=='string')return false;
  const key=extractVerifiedWalletPublicKey(payer,stateInit),sig=Buffer.from(value.signature,'base64');if(!key||sig.length!==64||sig.toString('base64')!==value.signature)return false;
  return verifyEd25519(pilotSignDataDigest(payer,value.domain,value.timestamp,text),sig,key);
 }catch{return false;}
}
