/**
 * GSTD Smart Contract Deployment Script — TON Mainnet
 * 
 * Deploys contracts in correct dependency order:
 * 1. EscrowComplete — Task compensation escrow with full security
 * 2. SettlementMaster — Revenue split (85/10/5 Worker/Treasury/Protocol)
 * 
 * Usage:
 *   DEPLOYER_MNEMONIC="..." ADMIN_WALLET="EQ..." node scripts/deploy-mainnet.js
 *   DEPLOYER_MNEMONIC="..." ADMIN_WALLET="EQ..." DRY_RUN=1 node scripts/deploy-mainnet.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { TonClient, WalletContractV4, internal, toNano, Address } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { Cell, beginCell, contractAddress, storeStateInit } = require('@ton/core');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════

const NETWORK = process.env.TON_NETWORK || 'mainnet';
let DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
if (!DEPLOYER_MNEMONIC && fs.existsSync(path.join(__dirname, '..', 'deployer.json'))) {
    DEPLOYER_MNEMONIC = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'deployer.json'))).mnemonic;
}
const ADMIN_WALLET = process.env.ADMIN_WALLET || '';
const DRY_RUN = process.env.DRY_RUN === '1';

// Known GSTD ecosystem addresses
const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const TREASURY_WALLET = process.env.TREASURY_WALLET || ADMIN_WALLET;
const PROTOCOL_FEE_WALLET = process.env.PROTOCOL_FEE_WALLET || ADMIN_WALLET;

const ENDPOINTS = {
    mainnet: 'https://toncenter.com/api/v2/jsonRPC',
    testnet: 'https://testnet.toncenter.com/api/v2/jsonRPC',
};

// ═══════════════════════════════════════════════════════════════
// Contract Loading
// ═══════════════════════════════════════════════════════════════

function loadContract(name, subName) {
    const buildDir = path.join(__dirname, '..', 'build', name);
    const prefix = `${name}_${subName || name}`;
    
    const codeBocPath = path.join(buildDir, `${prefix}.code.boc`);
    if (!fs.existsSync(codeBocPath)) {
        throw new Error(`Contract bytecode not found: ${codeBocPath}\nRun: npm run build`);
    }
    
    const codeBoc = fs.readFileSync(codeBocPath);
    const code = Cell.fromBoc(codeBoc)[0];
    
    console.log(`   📦 Loaded ${prefix} (${codeBoc.length} bytes)`);
    return code;
}

// Build init data cell for Escrow contract
function buildEscrowInitData(ownerAddr, treasuryAddr) {
    const owner = Address.parse(ownerAddr);
    const treasury = Address.parse(treasuryAddr);
    
    return beginCell()
        .storeUint(0, 1)            // not initialized flag
        .storeAddress(owner)        // owner
        .storeAddress(treasury)     // treasury
        .endCell();
}

// Build init data cell for SettlementMaster contract
function buildSettlementInitData(ownerAddr, gstdJettonAddr, treasuryAddr, protocolFeeAddr) {
    const owner = Address.parse(ownerAddr);
    const gstdJetton = Address.parse(gstdJettonAddr);
    const treasury = Address.parse(treasuryAddr);
    const protocolFee = Address.parse(protocolFeeAddr);
    
    return beginCell()
        .storeUint(0, 1)           // not initialized yet flag
        .storeAddress(owner)       // owner
        .storeAddress(gstdJetton)  // gstdJetton
        .storeAddress(treasury)    // treasury
        .storeRef(
            beginCell()
                .storeAddress(protocolFee)  // protocolFee
            .endCell()
        )
        .endCell();
}

// ═══════════════════════════════════════════════════════════════
// Deployment
// ═══════════════════════════════════════════════════════════════

async function deployContract(client, walletContract, secretKey, code, data, seqno, value = '0.5') {
    const stateInit = { code, data };
    const addr = contractAddress(0, stateInit);
    
    console.log(`   📍 Contract address: ${addr.toString()}`);
    
    // Check if already deployed
    try {
        const state = await client.getContractState(addr);
        if (state.state === 'active') {
            console.log(`   ⚡ Already deployed and active!`);
            return addr.toString();
        }
    } catch (e) {
        // Not deployed yet — continue
        console.log(`   🔸 Not deployed yet: ${e.message}`);
    }
    
    if (DRY_RUN) {
        console.log(`   🔍 DRY RUN: Would deploy to ${addr.toString()}`);
        return addr.toString();
    }
    
    // Deploy
    await walletContract.sendTransfer({
        seqno,
        secretKey,
        messages: [
            internal({
                to: addr,
                value: toNano(value),
                init: stateInit,
                body: beginCell().endCell(),
            }),
        ],
    });
    
    console.log(`   ⏳ Deployment TX sent (seqno: ${seqno}). Waiting for confirmation...`);
    
    // Wait for seqno to increment
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const currentSeqno = await walletContract.getSeqno();
        if (currentSeqno > seqno) {
            console.log(`   ✅ Deployed successfully!`);
            return addr.toString();
        }
    }
    
    console.log(`   ⚠️  TX may still be pending. Check address: ${addr.toString()}`);
    return addr.toString();
}

async function main() {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔱 GSTD Smart Contract Deployment');
    console.log(`   Network:   ${NETWORK}`);
    console.log(`   Admin:     ${ADMIN_WALLET.slice(0, 12)}...`);
    console.log(`   DRY RUN:   ${DRY_RUN ? 'YES' : 'NO'}`);
    console.log('═══════════════════════════════════════════════════\n');

    // Validate
    if (!DEPLOYER_MNEMONIC) {
        console.error('❌ DEPLOYER_MNEMONIC not set');
        console.log('   Set: export DEPLOYER_MNEMONIC="word1 word2 ... word24"');
        process.exit(1);
    }
    if (!ADMIN_WALLET) {
        console.error('❌ ADMIN_WALLET not set');
        console.log('   Set: export ADMIN_WALLET="EQ..."');
        process.exit(1);
    }

    // Connect
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

    console.log(`💰 Deployer wallet: ${wallet.address.toString()}`);
    const balance = await client.getBalance(wallet.address);
    console.log(`   Balance: ${Number(balance) / 1e9} TON\n`);

    if (!DRY_RUN && Number(balance) < 1e9) {
        console.error('❌ Insufficient balance. Need at least 1 TON for deployment.');
        process.exit(1);
    }

    const deployed = {};

    // ═══════════════════════════════════════════════════════
    // 1. Deploy EscrowComplete
    // ═══════════════════════════════════════════════════════
    console.log('\n1️⃣  Deploying EscrowComplete...');
    const escrowCode = loadContract('EscrowComplete', 'Escrow');
    const escrowData = buildEscrowInitData(ADMIN_WALLET, TREASURY_WALLET);
    deployed.escrow = await deployContract(
        client, walletContract, keyPair.secretKey,
        escrowCode, escrowData, seqno++, '0.5'
    );

    // Wait between deploys
    if (!DRY_RUN) await new Promise(r => setTimeout(r, 10000));

    // ═══════════════════════════════════════════════════════
    // 2. Deploy SettlementMaster
    // ═══════════════════════════════════════════════════════
    console.log('\n2️⃣  Deploying SettlementMaster...');
    const settlementCode = loadContract('SettlementMaster', 'SettlementMaster');
    const settlementData = buildSettlementInitData(
        ADMIN_WALLET, GSTD_JETTON, TREASURY_WALLET, PROTOCOL_FEE_WALLET
    );
    deployed.settlement = await deployContract(
        client, walletContract, keyPair.secretKey,
        settlementCode, settlementData, seqno++, '0.5'
    );

    // ═══════════════════════════════════════════════════════
    // Save deployment addresses
    // ═══════════════════════════════════════════════════════
    const deploymentFile = path.join(__dirname, '..', `deployment-${NETWORK}.json`);
    const deploymentInfo = {
        network: NETWORK,
        deployedAt: new Date().toISOString(),
        deployer: wallet.address.toString(),
        dryRun: DRY_RUN,
        contracts: deployed,
        config: {
            gstdJetton: GSTD_JETTON,
            treasury: TREASURY_WALLET,
            protocolFee: PROTOCOL_FEE_WALLET,
        },
    };
    fs.writeFileSync(deploymentFile, JSON.stringify(deploymentInfo, null, 2));
    console.log(`\n📄 Deployment info saved to ${deploymentFile}`);

    // ═══════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════
    console.log('\n═══════════════════════════════════════════════════');
    console.log('🔱 DEPLOYMENT SUMMARY');
    console.log('═══════════════════════════════════════════════════');
    for (const [name, addr] of Object.entries(deployed)) {
        console.log(`  ${name}: ${addr}`);
    }
    if (DRY_RUN) {
        console.log('\n⚠️  DRY RUN completed. Run without DRY_RUN=1 to deploy.');
    } else {
        console.log('\n✅ All contracts deployed! Update backend .env:');
        console.log(`   ESCROW_CONTRACT_ADDRESS=${deployed.escrow}`);
        console.log(`   SETTLEMENT_CONTRACT_ADDRESS=${deployed.settlement}`);
    }
    console.log('═══════════════════════════════════════════════════');
}

main().catch(console.error);
