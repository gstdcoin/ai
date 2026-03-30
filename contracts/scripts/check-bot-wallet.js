const { TonClient, WalletContractV4, fromNano } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const fs = require('fs');

async function main() {
    let w = JSON.parse(fs.readFileSync('/home/ubuntu/.config/gstdbot/wallet.json', 'utf8'));
    if (!w.mnemonic) { console.log('No mnemonic in bot wallet!'); return; }
    const keyPair = await mnemonicToPrivateKey(w.mnemonic.split(' '));
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    const client = new TonClient({ endpoint: 'https://toncenter.com/api/v2/jsonRPC', apiKey: process.env.TON_API_KEY });
    let balance = await client.getBalance(wallet.address);
    console.log("Bot Wallet:", wallet.address.toString());
    console.log("Balance:", fromNano(balance), "TON");
}
main().catch(console.error);
