import { Address, beginCell } from '@ton/core';
import { type Withdrawal, walletId, MoneyError } from './money';
export function withdrawalTransaction(w: Withdrawal, owner: string, jettonWallet: string) {
    if (w.state!=='dispatching' || !w.validUntil || w.validUntil<=Math.floor(Date.now()/1000))
        throw new MoneyError('withdrawal_signing_window_closed');
    return { validUntil:w.validUntil,network:'-239' as const,from:walletId(owner),
        messages:[{address:Address.parse(jettonWallet).toString(),amount:'50000000',
            payload:withdrawalPayload(w,owner).toBoc().toString('base64')}] };
}

export function withdrawalPayload(w: Pick<Withdrawal, 'queryId' | 'amount' | 'wallet'>, owner: string) {
    return beginCell().storeUint(0x0f8a7ea5,32).storeUint(BigInt(w.queryId),64)
        .storeCoins(BigInt(w.amount)).storeAddress(Address.parse(w.wallet))
        .storeAddress(Address.parse(walletId(owner))).storeBit(0).storeCoins(1n).storeBit(0).endCell();
}
