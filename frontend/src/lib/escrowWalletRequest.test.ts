import {it,expect,vi} from 'vitest';
import TonConnect,{TonConnectError,WalletNotConnectedError,UserRejectsError,BadRequestError,UnknownError,WalletWrongNetworkError,WalletNotSupportFeatureError} from '@tonconnect/sdk';
import {Address} from '@ton/core';
import {batchTransaction,type BatchInput} from './batchEscrow';
import {isEscrowRequestValidationError,escrowWalletErrorCode} from './escrowWalletErrors';
const payer='0:'+'11'.repeat(32),worker='0:'+'22'.repeat(32);
const input:BatchInput={payer,worker,protocol:payer,reserve:payer,budget:'1',requests:100,taskId:'55'.repeat(32),deadline:Math.floor(Date.now()/1000)+3600};
function connector(){return new TonConnect({manifestUrl:'https://app.gstdtoken.com/tonconnect-testnet-manifest.json',storage:{getItem:async()=>null,setItem:async()=>undefined,removeItem:async()=>undefined}});}
it('every escrow transaction passes the installed SDK validator before any wallet/network access',async()=>{
 const sdk=connector(),fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('unexpected network'));
 try{
  for(const testAssetVersion of [1,2] as const)for(const action of ['mint','deploy','fund','accept','expire','sync','refund','reclaim','report','withdraw'] as const){
   const tx=await batchTransaction({...input,testAssetVersion},action,action==='withdraw'?worker:payer);
   for(const message of tx.messages){const a=Address.parseFriendly(message.address);expect(a.isTestOnly).toBe(true);expect(a.isBounceable).toBe(false);}
   // A disconnected SDK must reach the connection check, not fail payload validation.
   await expect(sdk.sendTransaction(tx)).rejects.toBeInstanceOf(WalletNotConnectedError);
  }
  expect(fetchSpy).not.toHaveBeenCalled();
 }finally{fetchSpy.mockRestore();}
});
it('reproduces the former raw-address failure and classifies only definite local validation errors',async()=>{
 const sdk=connector(),tx=await batchTransaction(input,'mint',payer);
 tx.messages[0].address=Address.parse(tx.messages[0].address).toRawString();
 let failure:unknown;try{await sdk.sendTransaction(tx);}catch(error){failure=error;}
 expect(failure).toBeInstanceOf(TonConnectError);expect(isEscrowRequestValidationError(failure)).toBe(true);
 expect((failure as Error).message).toContain("Wrong 'address' format");
 for(const error of [new Error((failure as Error).message),new TonConnectError('timeout'),new UserRejectsError('rejected'),new WalletNotConnectedError(),null])expect(isEscrowRequestValidationError(error)).toBe(false);
});

it('survives production class-name minification without exposing arbitrary error text',()=>{
 const minified=new TonConnectError();minified.message="[TON_CONNECT_SDK_ERROR] B\nSendTransactionRequest validation failed: Wrong 'address' format in message at index 0";
 expect(isEscrowRequestValidationError(minified)).toBe(true);expect(escrowWalletErrorCode(minified)).toBe('validation');
 expect(isEscrowRequestValidationError(new Error(minified.message))).toBe(false);
 for(const [error,code] of [[new UserRejectsError(),'rejected'],[new BadRequestError('private provider message'),'bad_request'],[new UnknownError('private'),'wallet_unknown'],[new WalletNotConnectedError(),'disconnected'],[new WalletWrongNetworkError('test',{cause:{expectedChainId:'-3',actualChainId:'-239'}}),'wrong_network'],[new WalletNotSupportFeatureError('test',{cause:{requiredFeature:{featureName:'SendTransaction'}}}),'unsupported'],[new Error('secret-url'),'transport_or_ui']] as const)expect(escrowWalletErrorCode(error)).toBe(code);
});
