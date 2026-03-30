import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { TonClient, WalletContractV4, toNano, Address } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { LendingMaster } from '../build/LendingMaster/LendingMaster_LendingMaster';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NETWORK = process.env.TON_NETWORK || 'mainnet';
let DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
if (!DEPLOYER_MNEMONIC && fs.existsSync(path.join(__dirname, '..', 'deployer.json'))) {
    DEPLOYER_MNEMONIC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployer.json'), 'utf8')).mnemonic;
}

const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED';
const DRY_RUN = process.env.DRY_RUN === '1';

const ENDPOINTS: Record<string, string> = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔱 GSTD LendingVault Protocol Deployment');
    console.log(`   Network:   ${NETWORK}`);
    console.log('═══════════════════════════════════════════════════\n');

    if (!DEPLOYER_MNEMONIC) {
        console.error('❌ DEPLOYER_MNEMONIC not set');
        process.exit(1);
    }

    const client = new TonClient({
        endpoint: ENDPOINTS[NETWORK],
        apiKey: process.env.TON_API_KEY,
    });

    const mnemonic = DEPLOYER_MNEMONIC.split(' ');
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    
    // Create wallet contract directly without client.open to use standard methods
    const walletContract = client.open(wallet);
    let seqno = await walletContract.getSeqno();

    const admin = Address.parse(ADMIN_WALLET);
    // Use the backend's Highload Wallet address as the Keeper
    const keeper = Address.parse('EQCQfq_fdRNT-Esgtw0IRQfFfQ51zdwwQMPrrIeQiOyDK0ds');
    
    console.log(`💰 Highload Keeper: ${keeper.toString()}`);
    console.log(`👑 Owner DAO: ${admin.toString()}\n`);

    // 1. Deploy LendingMaster
    console.log('1️⃣ Preparing LendingMaster...');
    const lendingMaster = await LendingMaster.fromInit(admin, keeper);
    const proxyMaster = client.open(lendingMaster);
    const masterAddr = lendingMaster.address;
    
    console.log(`   📍 LendingMaster Address: ${masterAddr.toString()}`);

    if (DRY_RUN) {
        console.log(`   🔍 DRY RUN: Would deploy to ${masterAddr}`);
        return;
    }

    try {
        const state = await client.getContractState(masterAddr);
        if (state.state === 'active') {
            console.log(`   ⚡ Already deployed and active!`);
            process.exit(0);
        }
    } catch (e: unknown) {
        if (e instanceof Error) {
            console.log(`   🔸 Not deployed yet (${e.message})`);
        } else {
            console.log(`   🔸 Not deployed yet`);
        }
    }

    await proxyMaster.send(
        walletContract.sender(keyPair.secretKey),
        { value: toNano('0.25') },
        { $$type: 'Deploy', queryId: 0n }
    );
    
    console.log(`   ⏳ Transaction sent. Waiting for block confirmation...`);
    let currentSeqno = seqno;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        currentSeqno = await walletContract.getSeqno();
        if (currentSeqno !== seqno) break;
    }
    
    console.log(`   ✅ Deployed LendingMaster to ${masterAddr.toString()}`);

    console.log('\n✅ Deployment finished. Add this to backend .env');
    console.log(`LENDING_MASTER_ADDRESS=${masterAddr.toString()}`);
}

main().catch(console.error);
