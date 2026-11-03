import {it,expect,vi,afterEach} from 'vitest';
import {Address,beginCell} from '@ton/core';
import {testnetRpc} from './batchEscrowStatus';
const owner='0:'+'11'.repeat(32),master='0:'+'22'.repeat(32);
const addressCell=(a:string)=>beginCell().storeAddress(Address.parse(a)).endCell().toBoc().toString('base64');
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('falls back on a failed free provider and stays on the fixed testnet fallback within this check',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(String(url));return calls.length===1?new Response('',{status:429}):Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});}));
 const rpc=testnetRpc();
 expect(await rpc.get('blockchain/accounts/'+encodeURIComponent(owner))).toEqual({status:'uninit',balance:'0'});
 await rpc.get('blockchain/accounts/'+encodeURIComponent(master));
 expect(calls.filter(x=>x.startsWith('https://testnet.tonapi.io/'))).toHaveLength(1);
 expect(calls.slice(1).every(x=>x.startsWith('https://testnet.toncenter.com/api/v2/getAddressInformation?'))).toBe(true);
});
it('decodes canonical wallet stack owners and amounts from TON Center without trusting request recipients',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).startsWith('https://testnet.tonapi.io/')?new Response('',{status:503}):
  Response.json({ok:true,result:{exit_code:0,stack:[['num','0x7'],['cell',{bytes:addressCell(owner)}],['cell',{bytes:addressCell(master)}]]}})));
 const r=await testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner)+'/methods/get_wallet_data');
 expect(r.decoded).toEqual({balance:'7',owner,jetton:master});
});
it('fails closed on an invalid provider result and never treats an active failed getter as an empty wallet',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).startsWith('https://testnet.tonapi.io/')?new Response('',{status:503}):
  String(url).includes('/runGetMethod')?Response.json({ok:true,result:{exit_code:11,stack:[]}}):Response.json({ok:true,result:{state:'active',balance:'20000000'}})));
 await expect(testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner)+'/methods/get_wallet_data')).rejects.toThrow('testnet_unavailable');
});

it('does not classify a frozen account as an absent token wallet',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(url:string)=>String(url).startsWith('https://testnet.tonapi.io/')?new Response('',{status:503}):
  String(url).includes('/runGetMethod')?Response.json({ok:true,result:{exit_code:11,stack:[]}}):Response.json({ok:true,result:{state:'frozen',balance:'20000000'}})));
 await expect(testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner)+'/methods/get_wallet_data')).rejects.toThrow('testnet_unavailable');
});

it('uses Workers-supported manual redirects and never follows an untrusted Location',async()=>{
 const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{
  if(options?.redirect==='error')throw new TypeError('Unsupported redirect mode: error');
  expect(options?.redirect).toBe('manual');calls.push(String(url));
  if(String(url).startsWith('https://testnet.tonapi.io/'))return new Response('',{status:302,headers:{Location:'http://127.0.0.1/private'}});
  return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});
 }));
 expect(await testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner))).toEqual({status:'uninit',balance:'0'});
 expect(calls).toHaveLength(2);expect(calls.every(x=>x.startsWith('https://testnet.tonapi.io/')||x.startsWith('https://testnet.toncenter.com/'))).toBe(true);
});

it('keeps provider keys server-side and scoped to their own fixed testnet hosts',async()=>{
 vi.stubEnv('ESCROW_TESTNET_TONAPI_KEY','test-only-tonapi');vi.stubEnv('ESCROW_TESTNET_TONCENTER_API_KEY','test-only-toncenter');
 const calls:Array<{url:string;headers:Headers}>=[];
 vi.stubGlobal('fetch',vi.fn(async(url:string,options?:RequestInit)=>{calls.push({url:String(url),headers:new Headers(options?.headers)});return calls.length===1?new Response('',{status:429}):Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});}));
 const result=await testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner));
 expect(calls[0].headers.get('Authorization')).toBe('Bearer test-only-tonapi');expect(calls[0].headers.has('X-API-Key')).toBe(false);
 expect(calls[1].headers.get('X-API-Key')).toBe('test-only-toncenter');expect(calls[1].headers.has('Authorization')).toBe(false);
 expect(JSON.stringify(result)+calls.map(c=>c.url).join('')).not.toContain('test-only');
});
it('uses a configured TON Center key directly instead of spending an anonymous TonAPI request',async()=>{
 vi.stubEnv('ESCROW_TESTNET_TONAPI_KEY','');vi.stubEnv('ESCROW_TESTNET_TONCENTER_API_KEY','test-only-toncenter');
 const calls:string[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string)=>{calls.push(String(url));return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});}));
 await testnetRpc().get('blockchain/accounts/'+encodeURIComponent(owner));expect(calls).toHaveLength(1);expect(calls[0]).toMatch(/^https:\/\/testnet\.toncenter\.com\//);
});
