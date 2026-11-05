import {it,expect,vi,afterEach} from 'vitest';
import {WalletContractV4} from '@ton/ton';
import {beginCell,storeStateInit} from '@ton/core';
import {keyPairFromSeed,sign} from '@ton/crypto';
import {kvSet} from './kv';
import ownerHandler from '../pages/api/v1/agents/grants';
import paidHandler from '../pages/api/v1/agents/paid-infer';
import {pilotSignDataDigest} from './escrowJobAuth';
import {getAgentGrant,reconcileMoney,nano,moneyBalance} from './money';
vi.mock('./nodes',()=>({getActiveNodes:async()=>[{nodeId:'grant-route-node',url:'https://fixture.invalid'}]}));
const key=keyPairFromSeed(Buffer.alloc(32,93)),wrong=keyPairFromSeed(Buffer.alloc(32,94));
const wallet=WalletContractV4.create({workchain:0,publicKey:key.publicKey}),address=wallet.address.toRawString();
const init=beginCell().store(storeStateInit(wallet.init)).endCell().toBoc().toString('base64');
const operator='0:'+'ef'.repeat(32);
const authorization=(text:string,signer=key)=>{const timestamp=Math.floor(Date.now()/1000);return{address,domain:'app.gstdtoken.com',timestamp,payload:{type:'text',text},signature:sign(pilotSignDataDigest(address,'app.gstdtoken.com',timestamp,text),signer.secretKey).toString('base64')};};
async function call(handler:any,body:any,headers:any={},method='POST',query={}){
 const res={code:200,value:null as any,setHeader(){return undefined;},status(n:number){this.code=n;return this;},json(v:any){this.value=v;return this;},end(){return this;}};
 await handler({method,body,headers,query} as any,res as any);return res;
}
afterEach(()=>vi.unstubAllGlobals());
it('requires a real owner signature and reuses receipts without duplicate inference or payment',async()=>{
 await kvSet('ton-auth:session:grant-route-session',address);
 await kvSet('node:grant-route-node',JSON.stringify({wallet_address:operator}));
 const headers={'x-session-token':'grant-route-session'};
 const policy={label:'route fixture',models:['qwen2.5:0.5b'],executors:[{nodeId:'grant-route-node',wallet:operator}],budgetNano:'10000000',perRequestNano:'5000000',maxRequests:3,maxTokens:32,expiresAt:Date.now()+60000};
 expect((await call(ownerHandler,{action:'challenge',policy})).code).toBe(401);
 const c=(await call(ownerHandler,{action:'challenge',policy},headers)).value;
 expect(c.text).toContain('Network: TON mainnet');
 const request={action:'create',nonce:c.nonce,stateInit:init,authorization:authorization(c.text,wrong)};
 expect((await call(ownerHandler,request,headers)).code).toBe(403);
 expect((await call(ownerHandler,{...request,authorization:authorization(c.text.replace('10000000','99999999'))},headers)).code).toBe(403);
 const created=await call(ownerHandler,{...request,authorization:authorization(c.text)},headers);
 expect(created.code).toBe(201);const token=created.value.token,gid=created.value.grant.id;
 expect((await call(ownerHandler,{...request,authorization:authorization(c.text)},headers)).code).toBe(400);
 const auth={authorization:'Bearer '+token};
 const body={model:'qwen2.5:0.5b',prompt:'fixture',max_tokens:32,allow_network:true,max_cost_gstd:'0.005',request_id:'route-paid-request-1'};
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({model:body.model,choices:[{message:{content:'accepted fixture'}}]}),{status:200}));
 vi.stubGlobal('fetch',fetcher);
 expect((await call(paidHandler,body,auth)).code).not.toBe(200);
 expect(fetcher).not.toHaveBeenCalled();
 expect((await getAgentGrant(gid))?.requests).toBe(0);
 await reconcileMoney({owner:operator,jettonWallet:operator,reserve:nano('1000000000').toString()},
 {manifest:'route-grant-inventory',legacyHold:'0',migrationReviewed:true,allocations:[{wallet:address,amount_nano:nano('0.02').toString(),reference:'route-grant-fund'}]});
 const response=await call(paidHandler,body,auth);expect(response.code).toBe(200);
 expect(response.value._gstd.billing.charged_gstd).toBe(0.005);
 expect((await call(paidHandler,body,auth)).code).toBe(200);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect((await getAgentGrant(gid))?.spentNano).toBe('5000000');
 const receipt=await call(paidHandler,null,auth,'GET',{request_id:body.request_id});
 expect(receipt.value.state).toBe('captured');
 expect(receipt.value.response.choices[0].message.content).toBe('accepted fixture');
 expect((await call(paidHandler,{...body,prompt:'changed'},auth)).code).toBe(409);
 fetcher.mockImplementationOnce(async()=>new Response(JSON.stringify({model:'wrong-model',choices:[{message:{content:'bad'}}]}),{status:200}));
 const before=(await moneyBalance(address)).available_nano;
 expect((await call(paidHandler,{...body,request_id:'route-paid-request-2'},auth)).value.refunded).toBe(true);
 expect((await moneyBalance(address)).available_nano).toBe(before);
 expect((await getAgentGrant(gid))?.spentNano).toBe('5000000');
 await call(ownerHandler,{action:'revoke',id:gid},headers);
 expect((await call(paidHandler,{...body,request_id:'route-paid-request-3'},auth)).code).toBe(403);
 expect((await call(paidHandler,null,auth,'GET',{request_id:body.request_id})).value.state).toBe('captured');
});

// Consumer fixture: outbound transport is validated separately in nodeFetch.test.ts.
vi.mock('./nodeFetch',()=>({fetchNode:(url:string,init:RequestInit)=>fetch(url,init)}));

// Financial orchestration fixture assumes an independently attested executor.
vi.mock('./nodeEndpointStatus',()=>({endpointVerified:()=>true}));
