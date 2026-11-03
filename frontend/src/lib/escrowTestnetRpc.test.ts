import {it,expect,vi,afterEach} from 'vitest';
import {Address,beginCell} from '@ton/core';
import {testnetRpc} from './batchEscrowStatus';
const owner='0:'+'11'.repeat(32),master='0:'+'22'.repeat(32);
const addressCell=(a:string)=>beginCell().storeAddress(Address.parse(a)).endCell().toBoc().toString('base64');
afterEach(()=>vi.unstubAllGlobals());
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
