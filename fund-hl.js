const { mnemonicToPrivateKey } = require('@ton/crypto');
const { WalletContractV4, TonClient, internal } = require('@ton/ton');

/** Destination (highload / lending oracle). Override: LENDING_FUND_DEST */
const DEFAULT_LENDING_DEST = 'EQCQfq_fdRNT-Esgtw0IRQfFfQ51zdwwQMPrrIeQiOyDK0ds';

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
    const wallet = WalletContractV4.create({ publicKey: keyPair.publicKey, workchain: 0 });
    
    console.log(`Sending 0.5 TON from ${wallet.address.toString()} to HL...`);
    const contract = client.open(wallet);
    await contract.sendTransfer({
        secretKey: keyPair.secretKey,
        seqno: await contract.getSeqno(),
        messages: [
            internal({
                to: process.env.LENDING_FUND_DEST || DEFAULT_LENDING_DEST,
                value: process.env.LENDING_FUND_AMOUNT_TON || '0.5',
                bounce: false,
                body: process.env.LENDING_FUND_COMMENT || 'Gas for Lending Oracle'
            })
        ]
    });
    console.log('✅ Sent!');
}

main().catch(console.error);
