const { TonClient, WalletContractV4, fromNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

async function main() {
    let mnemonic = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'), 'utf8')).mnemonic;
    const keyPair = await mnemonicToPrivateKey(mnemonic.split(' '));
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    
    const client = new TonClient({
        endpoint: 'https://toncenter.com/api/v2/jsonRPC',
        apiKey: process.env.TON_API_KEY,
    });
    
    let balance = await client.getBalance(wallet.address);
    console.log("Wallet:", wallet.address.toString());
    console.log("Balance:", fromNano(balance), "TON");
}
main().catch(console.error);
