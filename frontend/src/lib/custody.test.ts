import { afterEach, describe, expect, it, vi } from 'vitest';
import { Cell, loadTransaction } from '@ton/core';
import fixture from '../../tests/fixtures/gstd-deposit.json';
import { custodySnapshot, verifyDeposit, GSTD_MASTER } from './custody';
const tx = loadTransaction(Cell.fromBoc(Buffer.from(fixture.raw,'hex'))[0].beginParse());
if (tx.inMessage?.info.type !== 'internal') throw new Error('Invalid public fixture');
const sourceWallet = tx.inMessage.info.src.toRawString();
const sender = '0:a45c594d46cb9b529ed487b960fd2714a8b0a27dfd5008bb1d414d1aee4a61a9';
const owner = '0:a2f908da7ef71813bc2097d0dce6300526b9a2cbfa067dca1bcce45bda06507b';
function fetcher(results: unknown[]) {
    const mock = vi.fn();
    for(const value of results) mock.mockResolvedValueOnce({ok:true,json:async()=>value});
    vi.stubGlobal('fetch',mock);return mock;
}
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('verified mainnet GSTD custody and deposit format',()=>{
    it('resolves REST snake_case fields and verifies master, owner and exact balance',async()=>{
        vi.useFakeTimers();
        const mock=fetcher([{success:true,decoded:{jetton_wallet_address:fixture.account.address}},
            {success:true,decoded:{owner,jetton:GSTD_MASTER,balance:'499000000000'}}]);
        const promise=custodySnapshot(owner);
        await vi.runAllTimersAsync();
        expect(await promise).toEqual({owner,jettonWallet:fixture.account.address,reserve:'499000000000'});
        expect(mock).toHaveBeenCalledTimes(2);
    });
    it('accepts the actual historical TEP-74 inbound receipt without using an asserted amount',async()=>{
        vi.useFakeTimers();
        fetcher([fixture,{success:true,decoded:{jetton_wallet_address:sourceWallet}}]);
        const promise=verifyDeposit(fixture.hash,sender,fixture.account.address);
        await vi.runAllTimersAsync();
        expect(await promise).toMatchObject({amount:'499000000000',sender,hash:fixture.hash});
    });
    it('rejects a forged sender wallet even if the body and destination look valid',async()=>{
        vi.useFakeTimers();
        fetcher([fixture,{success:true,decoded:{jetton_wallet_address:'0:'+'11'.repeat(32)}}]);
        const assertion=expect(verifyDeposit(fixture.hash,sender,fixture.account.address)).rejects.toThrow('invalid_jetton_sender');
        await vi.runAllTimersAsync();await assertion;
    });
    it('rejects a forged hash before any credit can be made',async()=>{
        fetcher([fixture]);
        await expect(verifyDeposit('aa'.repeat(32),sender,fixture.account.address)).rejects.toThrow('invalid_deposit_transaction');
    });
});
