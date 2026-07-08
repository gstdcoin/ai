/**
 * Computes SettlementMaster's GSTD jetton wallet address.
 * TEP-74: call get_wallet_address(owner) on jetton master contract.
 */
import 'dotenv/config';
import { Address, TonClient } from '@ton/ton';
import { beginCell } from '@ton/core';

const GSTD_JETTON    = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const SM_ADDRESS     = 'EQAhuR_cEaIkRqs4gvgXSD-Qw2FRUkkBUZQkTBrFT5n-ZrSS';
const TON_API_KEY    = process.env.TON_API_KEY || '';

async function main() {
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: TON_API_KEY,
    });

    const jettonMaster = Address.parse(GSTD_JETTON);
    const smAddr       = Address.parse(SM_ADDRESS);

    console.log('Querying GSTD jetton master for SM wallet address...');
    const result = await client.runMethod(jettonMaster, 'get_wallet_address', [
        { type: 'slice', cell: beginCell().storeAddress(smAddr).endCell() },
    ]);

    const walletAddr = result.stack.readAddress();
    console.log('\n✅ SettlementMaster GSTD jetton wallet:');
    console.log('  ', walletAddr.toString());
    console.log('\nNext steps:');
    console.log('  1. Transfer GSTD from your wallet to:', walletAddr.toString());
    console.log('  2. Call SetOwnJettonWallet on SM with that address');
}

main().catch(console.error);
