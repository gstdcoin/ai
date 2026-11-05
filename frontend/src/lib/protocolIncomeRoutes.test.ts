import {it,expect} from 'vitest';
import {kvSet} from './kv';
import {MAINNET_ESCROW} from './mainnetEscrowManifest';
import handler from '../pages/api/v1/finance/protocol';
async function call(body:any,session?:string){
 const res={code:200,value:null as any,setHeader(){return undefined;},status(code:number){this.code=code;return this;},json(value:any){this.value=value;return this;},end(){return this;}};
 await handler({method:'POST',headers:{...(session?{'x-session-token':session}:{}),'idempotency-key':'protocol-fixture-request'},body} as any,res as any);
 return res;
}
it('requires verified beneficiary ownership and refuses reserve or arbitrary destination access',async()=>{
 expect((await call({action:'credit_protocol'})).code).toBe(401);
 await kvSet('ton-auth:session:protocol-foreign-fixture','0:'+'71'.repeat(32));
 await kvSet('ton-auth:session:protocol-owner-fixture',MAINNET_ESCROW.protocol);
 expect((await call({action:'credit_protocol'},'protocol-foreign-fixture')).code).toBe(403);
 expect((await call({action:'credit_reserve'},'protocol-owner-fixture')).code).toBe(400);
 expect((await call({action:'credit_protocol',destination:'0:'+'72'.repeat(32)},'protocol-owner-fixture')).code).toBe(400);
});
