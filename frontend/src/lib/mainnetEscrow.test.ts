import {it,expect,vi,afterEach} from 'vitest';
import {Address,beginCell,Cell} from '@ton/core';
import TonConnect,{WalletNotConnectedError} from '@tonconnect/sdk';
import {batchContext} from './batchEscrow';
import {MAINNET_ESCROW as policy,MAINNET_ESCROW_V2} from './mainnetEscrowManifest';
import {mainnetJobHash,mainnetPreview,mainnetTransaction,mainnetContext,verifyMainnetMaster,verifyMainnetWallet,withMainnetRpc,withMainnetDiagnosticRpc,type MainnetInput} from './mainnetEscrow';
import {mainnetDiagnosticRpc,mainnetRpc,testnetRpc} from './batchEscrowStatus';
import {kvDel} from './kv';
import artifact from './escrow-generated/wallet-code.json';
const input=():MainnetInput=>{
 const value:MainnetInput={manifest_version:1,network:'-239',payer:'0:'+'11'.repeat(32),worker:'0:'+'22'.repeat(32),protocol:policy.protocol,reserve:policy.reserve,budget:'0.005000000',taskId:'0'.repeat(64),deadline:Math.floor(Date.now()/1000)+1800,requests:1,execution:{version:1,node_id:'mainnet-node-fixture',model:'qwen2.5:0.5b',prompt_hash:'33'.repeat(32),max_tokens:128,nonce:'44'.repeat(32),payout_revision:1}};
 value.taskId=mainnetJobHash(value);return value;
};
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();});
it('derives canonical mainnet contracts with fixed recipients, code hashes and an exact split',async()=>{
 const value=input(),c=await mainnetContext(value),p=await mainnetPreview(value);
 expect(p).toMatchObject({network:'-239',test_only:false,master:policy.master,mode:'public_beta',budget_nano:'5000000'});
 expect(p.shares.map(s=>s.amount_nano)).toEqual(['4250000','500000','250000']);
 expect(c.task.init!.code.hash().toString('hex')).toBe(policy.coordinatorCodeHash);
 expect(c.shares.every(s=>s.init!.code.hash().toString('hex')===policy.shareCodeHash)).toBe(true);
 expect(p.shares.map(s=>s.owner)).toEqual([value.worker,policy.protocol,policy.reserve]);
 for(const changed of [{...value,budget:'1'},{...value,worker:value.payer},{...value,execution:{...value.execution,model:'other'}},{...value,execution:{...value.execution,prompt_hash:'55'.repeat(32)}}])expect(mainnetJobHash(changed)).not.toBe(value.taskId);
});
it('rejects testnet input, test assets, changed recipients and unknown manifest versions',async()=>{
 const value=input();
 for(const bad of [{...value,network:'-3'},{...value,testAssetVersion:2},{...value,protocol:value.worker},{...value,manifest_version:2},{...value,manifest_version:3}])await expect(mainnetContext(bad as any)).rejects.toThrow();
 await expect(mainnetTransaction(value,'mint',value.payer)).rejects.toThrow('invalid_action');
 await expect(mainnetTransaction(value,'accept',value.worker)).rejects.toThrow('wrong_signer');
 await expect(mainnetTransaction(value,'withdraw',value.payer,0)).rejects.toThrow('wrong_signer');
});
it('binds v2 to separate bytecode and encodes payer-only surplus without changing v1 recovery',async()=>{
 const old=input(),value:MainnetInput={...old,manifest_version:2};value.taskId=mainnetJobHash(value);
 const c=await mainnetContext(value),p=await mainnetPreview(value);
 expect(p.manifest_version).toBe(2);
 expect(p.task).not.toBe((await mainnetPreview(old)).task);
 expect(c.task.init!.code.hash().toString('hex')).toBe(MAINNET_ESCROW_V2.coordinatorCodeHash);
 expect(c.shares[0].init!.code.hash().toString('hex')).toBe(MAINNET_ESCROW_V2.shareCodeHash);
 await expect(mainnetTransaction(value,'surplus',value.worker,0,undefined,10n)).rejects.toThrow('wrong_signer');
 await expect(mainnetTransaction(old,'surplus',old.payer,0,undefined,10n)).rejects.toThrow('invalid_action');
 const tx=await mainnetTransaction(value,'surplus',value.payer,0,undefined,10n);
 const body=Cell.fromBase64(tx.messages[0].payload).beginParse();
 expect(body.loadUint(32)).toBe(0x4754450a);expect(body.loadCoins()).toBe(10n);
});
it('every unsigned mainnet action passes the installed wallet SDK and never addresses testnet',async()=>{
 const value=input(),sdk=new TonConnect({manifestUrl:'https://app.gstdtoken.com/tonconnect-mainnet-escrow-manifest.json',storage:{getItem:async()=>null,setItem:async()=>{},removeItem:async()=>{}}});
 for(const action of ['deploy','fund','accept','expire','sync','withdraw','refund','reclaim','report'] as const){
  const tx=await mainnetTransaction(value,action,action==='withdraw'?value.worker:value.payer);
  expect(tx.network).toBe('-239');
  for(const message of tx.messages){const a=Address.parseFriendly(message.address);expect(a.isTestOnly).toBe(false);expect(a.isBounceable).toBe(!message.stateInit);}
  await expect(sdk.sendTransaction(tx)).rejects.toBeInstanceOf(WalletNotConnectedError);
 }
});
it('uses different hosts and credentials for mainnet and testnet, including owner wallet derivation',async()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','mainnet-fixture-key');vi.stubEnv('ESCROW_TESTNET_TONCENTER_API_KEY','testnet-fixture-key');vi.stubEnv('ESCROW_MAINNET_TONAPI_KEY','');vi.stubEnv('ESCROW_TESTNET_TONAPI_KEY','');
 const seen:any[]=[];vi.stubGlobal('fetch',vi.fn(async(url:string,options:any)=>{
  seen.push({url,options});
  if(options?.method==='POST')return Response.json({ok:true,result:{exit_code:0,stack:[['slice',{bytes:Cell.EMPTY.toBoc().toString('base64')}]]}});
  return Response.json({ok:true,result:{state:'uninitialized',balance:'0'}});
 }));
 await mainnetRpc().get('blockchain/accounts/'+encodeURIComponent(policy.master));
 await testnetRpc().get('blockchain/accounts/'+encodeURIComponent(policy.master));
 expect(seen[0].url).toContain('https://toncenter.com/');
 expect(seen[0].options.headers['X-API-Key']).toBe('mainnet-fixture-key');
 expect(seen[1].url).toContain('https://testnet.toncenter.com/');
 expect(seen[1].options.headers['X-API-Key']).toBe('testnet-fixture-key');
 await expect(mainnetRpc().walletAddress!(policy.master,input().payer)).rejects.toThrow();
 const body=JSON.parse(seen[2].options.body);
 expect(body.method).toBe('get_wallet_address');expect(body.stack[0][0]).toBe('tvm.Slice');
 expect(Cell.fromBase64(body.stack[0][1]).beginParse().loadAddress().toRawString()).toBe(input().payer);
});
it('fails closed on a foreign jetton wallet code before caching verified canonical code',async()=>{
 await expect(verifyMainnetMaster({get:async()=>({success:true,decoded:{jetton_wallet_code:Cell.EMPTY.toBoc().toString('base64')}})})).rejects.toThrow('mainnet_master_mismatch');
 await verifyMainnetMaster({get:async()=>({success:true,decoded:{jetton_wallet_code:artifact.code_hex}})});
});

it('refuses a token-wallet derivation that differs from the canonical master getter',async()=>{
 const c=await mainnetContext(input());
 await expect(verifyMainnetWallet(c.payer,c.tokenWallet(c.payer),{get:async()=>null,walletAddress:async()=>input().worker})).rejects.toThrow('mainnet_master_mismatch');
});
it('serializes mainnet RPC journeys and expires the per-journey time budget without another fetch',async()=>{
 vi.useFakeTimers();let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{release=r;});
 const first=withMainnetRpc(async()=>{entered();await held;return 'done';});await ready;
 await expect(withMainnetRpc(async()=>null)).rejects.toThrow('mainnet_rpc_busy');release();expect(await first).toBe('done');
 await vi.advanceTimersByTimeAsync(1001);
 await expect(withMainnetRpc(async rpc=>{await vi.advanceTimersByTimeAsync(56000);return rpc.get('blockchain/accounts/'+encodeURIComponent(policy.master));})).rejects.toThrow('mainnet_unavailable');
});

it('allows a settlement RPC journey while the operator diagnostic lease is held',async()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','settlement-fixture');
 vi.stubEnv('ESCROW_MAINNET_DIAGNOSTIC_TONCENTER_API_KEY','diagnostic-fixture');
 await kvDel('escrow:mainnet:rpc-lease');
 let release!:()=>void,entered!:()=>void;
 const ready=new Promise<void>(r=>{entered=r;}),held=new Promise<void>(r=>{release=r;});
 const diagnostic=withMainnetDiagnosticRpc(async()=>{entered();await held;return 'diagnosed';});
 try{
  await ready;
  await expect(withMainnetDiagnosticRpc(async()=>null)).rejects.toThrow('mainnet_rpc_busy');
  await expect(withMainnetRpc(async()=> 'settled')).resolves.toBe('settled');
 }finally{release();await diagnostic;}
});

it('rejects absent and reused diagnostic credentials before reaching a provider',async()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','settlement-fixture');
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
 for(const key of ['','settlement-fixture']){
  vi.stubEnv('ESCROW_MAINNET_DIAGNOSTIC_TONCENTER_API_KEY',key);
  await expect(withMainnetDiagnosticRpc(async()=>null)).rejects.toThrow('mainnet_diagnostic_rpc_not_configured');
 }
 expect(fetcher).not.toHaveBeenCalled();
});

it('uses only the diagnostic key for account and master reads and does not fall back',async()=>{
 vi.stubEnv('ESCROW_MAINNET_TONCENTER_API_KEY','settlement-fixture');
 vi.stubEnv('ESCROW_MAINNET_TONAPI_KEY','settlement-tonapi-fixture');
 vi.stubEnv('ESCROW_MAINNET_DIAGNOSTIC_TONCENTER_API_KEY','diagnostic-fixture');
 const address=input().payer;
 const slice=beginCell().storeAddress(Address.parse(address)).endCell().toBoc().toString('base64');
 const fetcher=vi.fn<typeof fetch>()
  .mockResolvedValueOnce(Response.json({ok:true,result:{state:'active',balance:'123'}}))
  .mockResolvedValueOnce(Response.json({ok:true,result:{exit_code:0,stack:[['slice',{bytes:slice}]]}}))
  .mockResolvedValueOnce(Response.json({ok:false},{status:429}));
 vi.stubGlobal('fetch',fetcher);
 const rpc=mainnetDiagnosticRpc();
 const path='blockchain/accounts/'+encodeURIComponent(policy.master);
 await expect(rpc.get(path)).resolves.toEqual({status:'active',balance:'123'});
 await expect(rpc.walletAddress!(policy.master,address)).resolves.toBe(address);
 await expect(rpc.get(path)).rejects.toThrow('mainnet_unavailable');
 expect(fetcher.mock.calls).toHaveLength(3);
 for(const [url,init] of fetcher.mock.calls){
  expect(String(url)).toMatch(/^https:\/\/toncenter\.com\/api\/v2\//);
  expect(new Headers(init?.headers).get('x-api-key')).toBe('diagnostic-fixture');
 }
});

it('public payment recovery derives the same contract without exposing private execution metadata',async()=>{
 const value=input(),{execution,...payment}=value;
 expect(JSON.stringify(payment)).not.toContain(execution.prompt_hash);expect(JSON.stringify(payment)).not.toContain(execution.nonce);
 expect((await mainnetPreview(payment)).task).toBe((await mainnetPreview(value)).task);
 const tx=await mainnetTransaction(payment,'withdraw',value.worker,0);expect(tx.network).toBe('-239');expect(tx.from).toBe(value.worker);
});

it('a mainnet recovery input cannot be interpreted by the legacy testnet planner',async()=>{
 const value=input();await expect(batchContext(value as any)).rejects.toThrow('invalid_batch');
});
