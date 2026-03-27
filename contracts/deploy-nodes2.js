require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { TonClient, WalletContractV4, internal, toNano, Address, beginCell } = require('@ton/ton');
const { mnemonicToPrivateKey } = require('@ton/crypto');
const { Cell, contractAddress } = require('@ton/core');
const fs = require('fs');
const path = require('path');

const NETWORK = process.env.TON_NETWORK || 'mainnet';
let DEPLOYER_MNEMONIC = process.env.DEPLOYER_MNEMONIC || '';
if (!DEPLOYER_MNEMONIC && fs.existsSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'))) {
    DEPLOYER_MNEMONIC = JSON.parse(fs.readFileSync(path.join(process.env.HOME || '/home/ubuntu', '.gstd', 'wallet.json'))).mnemonic;
}

const ADMIN_WALLET = process.env.ADMIN_WALLET || 'UQCkXFlNRsubUp7Uh7lg_ScUqLCiff1QCLsdQU0a7kphqQED'; // From .env
const GSTD_JETTON = 'EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO';
const SETTLEMENT = 'EQCucUHZGCr8KwBalmumsITvtMBtc5ZylAfw7sJk5SXpBWVh';

function loadContract(name, subName) {
    const buildDir = path.join(__dirname, 'build', name);
    const prefix = `${name}_${subName || name}`;
    const codeBoc = fs.readFileSync(path.join(buildDir, `${prefix}.code.boc`));
    const dataBoc = fs.readFileSync(path.join(buildDir, `${prefix}.pkg`));
    
    // We already have the compiled typescript wrapped classes! We can just use them!
    return Cell.fromBoc(codeBoc)[0];
}
