const { mnemonicToPrivateKey } = require('@ton/crypto');
const { TonClient, WalletContractV3R2 } = require('@ton/ton');

async function main() {
    const raw = process.env.TON_MNEMONIC || '';
    if (!raw.trim()) {
        console.error('Set TON_MNEMONIC. Never commit real seeds.');
        process.exit(1);
    }
    const apiKey = process.env.TON_API_KEY || '';
    if (!apiKey) {
        console.error('Set TON_API_KEY for toncenter JSON-RPC.');
        process.exit(1);
    }
    const mnemonic = raw.trim().split(/\s+/);
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const endpoint = process.env.TON_JSON_RPC_URL || 'https://toncenter.com/api/v2/jsonRPC';
    const client = new TonClient({ endpoint, apiKey });

    const wallet = WalletContractV3R2.create({ publicKey: keyPair.publicKey, workchain: 0 });
    console.log(`Wallet Address: ${wallet.address.toString()}`);
    
    const contract = client.open(wallet);
    console.log('Initializing wallet...');
    
    // Sending a message to self to initialize
    await contract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno: 0, // 0 for initialization
        messages: []
    });
    console.log('✅ Initialized!');
}

main().catch(console.error);
