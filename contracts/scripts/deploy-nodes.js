"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ton_1 = require("@ton/ton");
const crypto_1 = require("@ton/crypto");
const AgentRegistry_AgentRegistry_1 = require("../build/AgentRegistry/AgentRegistry_AgentRegistry");
const DAOVoting_DAOVoting_1 = require("../build/DAOVoting/DAOVoting_DAOVoting");
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
const ENDPOINTS = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};
async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔱 GSTD Nodes & DAO Deployment');
    console.log(`   Network:   ${NETWORK}`);
    console.log('═══════════════════════════════════════════════════\n');
    const client = new ton_1.TonClient({
        endpoint: ENDPOINTS[NETWORK],
        apiKey: process.env.TON_API_KEY,
    });
    const mnemonic = DEPLOYER_MNEMONIC.split(' ');
    const keyPair = await (0, crypto_1.mnemonicToPrivateKey)(mnemonic);
    const wallet = ton_1.WalletContractV4.create({
        publicKey: keyPair.publicKey,
        workchain: 0,
    });
    const walletContract = client.open(wallet);
    let seqno = await walletContract.getSeqno();
    const admin = ton_1.Address.parse(ADMIN_WALLET);
    const settlement = ton_1.Address.parse(SETTLEMENT);
    const jetton = ton_1.Address.parse(GSTD_JETTON);
    // 1. Deploy Agent Registry
    console.log('1️⃣ Preparing AgentRegistry...');
    const agentRegistry = await AgentRegistry_AgentRegistry_1.AgentRegistry.fromInit(admin, settlement);
    const proxyAgent = client.open(agentRegistry);
    const agentAddr = agentRegistry.address;
    console.log(`   📍 Address: ${agentAddr}`);
    if (!DRY_RUN) {
        await proxyAgent.send(walletContract.sender(keyPair.secretKey), { value: (0, ton_1.toNano)('0.25') }, { $$type: 'Deploy', queryId: 0n });
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
    const daoVoting = await DAOVoting_DAOVoting_1.DAOVoting.fromInit(admin, jetton);
    const proxyDao = client.open(daoVoting);
    const daoAddr = daoVoting.address;
    console.log(`   📍 Address: ${daoAddr}`);
    if (!DRY_RUN) {
        await proxyDao.send(walletContract.sender(keyPair.secretKey), { value: (0, ton_1.toNano)('0.25') }, { $$type: 'Deploy', queryId: 0n });
        console.log(`   ⏳ Transaction sent. Waiting...`);
        let currentSeqno = seqno;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 2000));
            currentSeqno = await walletContract.getSeqno();
            if (currentSeqno !== seqno)
                break;
        }
        console.log(`   ✅ Deployed DAOVoting to ${daoAddr}`);
    }
    console.log('\n✅ Deployment finished. Add these to .env / frontend:');
    console.log(`AGENT_REGISTRY_ADDRESS=${agentAddr}`);
    console.log(`DAO_VOTING_ADDRESS=${daoAddr}`);
}
main().catch(console.error);
