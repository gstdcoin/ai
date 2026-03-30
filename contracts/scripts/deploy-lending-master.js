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
const LendingMaster_LendingMaster_1 = require("../build/LendingMaster/LendingMaster_LendingMaster");
dotenv.config({ path: path.join(__dirname, '..', '.env') });
const NETWORK = process.env.TON_NETWORK || 'mainnet';
let DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
if (!DEPLOYER_MNEMONIC && fs.existsSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'))) {
    DEPLOYER_MNEMONIC = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'), 'utf8')).mnemonic;
}
const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED';
const DRY_RUN = process.env.DRY_RUN === '1';
const ENDPOINTS = {
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
    // Create wallet contract directly without client.open to use standard methods
    const walletContract = client.open(wallet);
    let seqno = await walletContract.getSeqno();
    const admin = ton_1.Address.parse(ADMIN_WALLET);
    // Use deployer's wallet as the Keeper (backend operator) for now
    const keeper = wallet.address;
    console.log(`💰 Deployer wallet/Keeper: ${keeper.toString()}`);
    console.log(`👑 Owner DAO: ${admin.toString()}\n`);
    // 1. Deploy LendingMaster
    console.log('1️⃣ Preparing LendingMaster...');
    const lendingMaster = await LendingMaster_LendingMaster_1.LendingMaster.fromInit(admin, keeper);
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
    }
    catch (e) {
        console.log(`   🔸 Not deployed yet`);
    }
    await proxyMaster.send(walletContract.sender(keyPair.secretKey), { value: (0, ton_1.toNano)('0.25') }, { $$type: 'Deploy', queryId: 0n });
    console.log(`   ⏳ Transaction sent. Waiting for block confirmation...`);
    let currentSeqno = seqno;
    for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        currentSeqno = await walletContract.getSeqno();
        if (currentSeqno !== seqno)
            break;
    }
    console.log(`   ✅ Deployed LendingMaster to ${masterAddr.toString()}`);
    console.log('\n✅ Deployment finished. Add this to backend .env');
    console.log(`LENDING_MASTER_ADDRESS=${masterAddr.toString()}`);
}
main().catch(console.error);
