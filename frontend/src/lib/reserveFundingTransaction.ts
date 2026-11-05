import{Address,beginCell}from '@ton/core';
import{MoneyError,walletId,type MoneySystem}from './money';
import type{ReserveFunding}from './reserveFunding';
/** Explicit owner-signed funding only; attached TON is a budget, not a measured fee. */
export function reserveFundingTransaction(t:ReserveFunding,s:MoneySystem){
 if(t.state!=='dispatching'||t.validUntil<=Math.floor(Date.now()/1000)||s.payoutInFlight!=='reserve:'+t.id||walletId(s.owner)!==t.owner||t.wallet===t.owner)throw new MoneyError('reserve_signing_window_closed');
 const payload=beginCell().storeUint(0x0f8a7ea5,32).storeUint(BigInt(t.queryId),64).storeCoins(BigInt(t.amount))
  .storeAddress(Address.parse(t.wallet)).storeAddress(Address.parse(t.owner)).storeBit(false).storeCoins(100000000n).storeBit(false).endCell();
 return{network:'-239' as const,from:t.owner,validUntil:t.validUntil,messages:[{address:Address.parse(s.jettonWallet).toString(),amount:'200000000',payload:payload.toBoc().toString('base64')}]};
}
