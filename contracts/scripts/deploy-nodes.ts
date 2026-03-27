import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { TonClient, WalletContractV4, toNano, Address } from '@ton/ton';
import { mnemonicToPrivateKey } from '@ton/crypto';
import { AgentRegistry } from '../build/AgentRegistry/AgentRegistry_AgentRegistry';
import { DAOVoting } from '../build/DAOVoting/DAOVoting_DAOVoting';

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NETWORK = process.env.TON_NETWORK || 'mainnet';
let DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
if (!DEPLOYER_MNEMONIC && fs.existsSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'))) {
    DEPLOYER_MNEMONIC = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'), 'utf8')).mnemonic;
}

const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED';
const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const SETTLEMENT = 'EQCucUHZGCr8KwBalmumsITvtMBtc5ZylAfw7sJk5SXpBWVh';
const DRY_RUN = process.env.DRY_RUN === '1';

const ENDPOINTS: Record<string, string> = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔱 GSTD Nodes & DAO Deployment');
    console.log(`   Network:   ${NETWORK}`);
    console.log('═══════════════════════════════════════════════════\n');

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
    const walletContract = client.open(wallet);
    let seqno = await walletContract.getSeqno();

    const admin = Address.parse(ADMIN_WALLET);
    const settlement = Address.parse(SETTLEMENT);
    const jetton = Address.parse(GSTD_JETTON);

    // 1. Deploy Agent Registry
    console.log('1️⃣ Preparing AgentRegistry...');
    const agentRegistry = await AgentRegistry.fromInit(admin, settlement);
    const proxyAgent = client.open(agentRegistry);
    const agentAddr = agentRegistry.address;
    console.log(`   📍 Address: ${agentAddr}`);

    if (!DRY_RUN) {
        await proxyAgent.send(
            walletContract.sender(keyPair.secretKey),
            { value: toNano('0.25') },
            { $$type: 'Deploy', queryId: 0n }
        );
        console.log(`   ⏳ Transaction sent. Waiting...`);
        let currentSeqno = seqno;
        while (currentSeqno === seqno) {
            await new Promise(r => setTimeout(r, 2000));
            currentSeqno = await walletContract.getSeqno();
        }
        seqno = currentSeqno;
        console.log(`   ✅ Deployed AgentRegistry to ${agentAddr}`);
    }

    // 2. Deploy DAOVoting
    console.log('\n2️⃣ Preparing DAOVoting...');
    const daoVoting = await DAOVoting.fromInit(admin, jetton);
    const proxyDao = client.open(daoVoting);
    const daoAddr = daoVoting.address;
    console.log(`   📍 Address: ${daoAddr}`);

    if (!DRY_RUN) {
        await proxyDao.send(
            walletContract.sender(keyPair.secretKey),
            { value: toNano('0.25') },
            { $$type: 'Deploy', queryId: 0n }
        );
        console.log(`   ⏳ Transaction sent. Waiting...`);
        let currentSeqno = seqno;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 2000));
            currentSeqno = await walletContract.getSeqno();
            if (currentSeqno !== seqno) break;
        }
        console.log(`   ✅ Deployed DAOVoting to ${daoAddr}`);
    }

    console.log('\n✅ Deployment finished. Add these to .env / frontend:');
    console.log(`AGENT_REGISTRY_ADDRESS=${agentAddr}`);
    console.log(`DAO_VOTING_ADDRESS=${daoAddr}`);
}

main().catch(console.error);
