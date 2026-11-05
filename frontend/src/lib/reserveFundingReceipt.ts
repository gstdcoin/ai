import{Cell,loadTransaction}from '@ton/core';
import{MoneyError,walletId}from './money';
import{verifyDeposit}from './custody';
import{escrowRuntimeSecret}from './escrowRuntimeSecrets';
import type{ReserveFunding,VerifiedReserveReceipt}from './reserveFunding';
/** Validate the vault transaction itself, not an indexer's interpreted action list. */
export function parseReserveNotification(rawHex:string,expectedHash:string,transfer:ReserveFunding){
 if(!/^[a-f0-9]{64}$/.test(expectedHash)||typeof rawHex!=='string'||rawHex.length>2000000||! /^(?:[a-fA-F0-9]{2})+$/.test(rawHex))throw new MoneyError('invalid_reserve_notification');
 const cell=Cell.fromBoc(Buffer.from(rawHex,'hex'))[0];
 if(cell.hash().toString('hex')!==expectedHash)throw new MoneyError('invalid_reserve_notification');
 const tx=loadTransaction(cell.beginParse()),message=tx.inMessage,description=tx.description;
 if(tx.address!==BigInt('0x'+transfer.wallet.split(':')[1])||description.type!=='generic'||description.aborted||
  description.computePhase.type!=='vm'||!description.computePhase.success||description.actionPhase?.success===false||
  !message||message.info.type!=='internal'||message.info.bounced||message.info.dest.toRawString()!==transfer.wallet||
  message.info.src.toRawString()!==transfer.jettonWallet||tx.now<Math.floor(transfer.dispatchedAt/1000))throw new MoneyError('invalid_reserve_notification');
 const body=message.body.beginParse();if(body.loadUint(32)!==0x7362d09c)throw new MoneyError('invalid_reserve_notification');
 const queryId=body.loadUintBig(64).toString(),amount=body.loadCoins().toString(),sender=body.loadAddress().toRawString();
 if(queryId!==transfer.queryId||amount!==transfer.amount||sender!==transfer.owner)throw new MoneyError('reserve_receipt_mismatch');
 return{hash:expectedHash,amount,sender,queryId,utime:tx.now,vault:transfer.wallet,jettonWallet:transfer.jettonWallet};
}
/** Fixed public mainnet provider. Never follows a redirect with an API credential. */
export async function verifyReserveFundingReceipts(transfer:ReserveFunding,depositHash:string,notificationHash:string):Promise<VerifiedReserveReceipt>{
 if(!/^[a-f0-9]{64}$/.test(notificationHash)||depositHash===notificationHash)throw new MoneyError('invalid_reserve_notification');
 const deposit=await verifyDeposit(depositHash,transfer.owner,transfer.jettonWallet);
 await new Promise(resolve=>setTimeout(resolve,1100));
 const apiKey=escrowRuntimeSecret('ESCROW_MAINNET_TONAPI_KEY');
 const response=await fetch('https://tonapi.io/v2/blockchain/transactions/'+notificationHash,{cache:'no-store',redirect:'manual',signal:AbortSignal.timeout(10000),headers:apiKey?{Authorization:'Bearer '+apiKey}:{}});
 if(!response.ok)throw new MoneyError('chain_snapshot_unavailable');
 const value=await response.json();
 if(walletId(value.account?.address)!==transfer.wallet)throw new MoneyError('invalid_reserve_notification');
 return{deposit,notification:parseReserveNotification(value.raw,notificationHash,transfer)};
}
