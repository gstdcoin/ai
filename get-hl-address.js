const { mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV3R2 } = require('@ton/ton');

async function main() {
    const raw = process.env.TON_MNEMONIC || '';
    if (!raw.trim()) {
        console.error('Set TON_MNEMONIC (24 words, space-separated). Never commit real seeds.');
        process.exit(1);
    }
    const mnemonic = raw.trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV3R2.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    console.log(wallet.address.toString());
}

main().catch(console.error);
