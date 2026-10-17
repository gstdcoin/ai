import { createHash, timingSafeEqual } from 'crypto';
import { Address, Cell, loadStateInit } from '@ton/core';
import {
    WalletContractV1R1,
    WalletContractV1R2,
    WalletContractV1R3,
    WalletContractV2R1,
    WalletContractV2R2,
    WalletContractV3R1,
    WalletContractV3R2,
    WalletContractV4,
    WalletContractV5R1,
} from '@ton/ton';
import { signVerify } from '@ton/crypto';

const PROOF_MAX_AGE_SECONDS = 5 * 60;
const PROOF_FUTURE_SKEW_SECONDS = 60;
const EMPTY_PUBLIC_KEY = Buffer.alloc(32);

interface WalletCodeLayout {
    codeHash: string;
    publicKeyOffsetBits: number;
}

function walletCodeLayout(code: Cell, publicKeyOffsetBits: number): WalletCodeLayout {
    return { codeHash: code.hash().toString('hex'), publicKeyOffsetBits };
}

const SUPPORTED_WALLET_CODE_LAYOUTS: WalletCodeLayout[] = [
    walletCodeLayout(WalletContractV1R1.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 32),
    walletCodeLayout(WalletContractV1R2.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 32),
    walletCodeLayout(WalletContractV1R3.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 32),
    walletCodeLayout(WalletContractV2R1.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 32),
    walletCodeLayout(WalletContractV2R2.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 32),
    walletCodeLayout(WalletContractV3R1.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 64),
    walletCodeLayout(WalletContractV3R2.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 64),
    walletCodeLayout(WalletContractV4.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 64),
    walletCodeLayout(WalletContractV5R1.create({ workchain: 0, publicKey: EMPTY_PUBLIC_KEY }).init.code, 65),
];

export interface TonConnectProof {
    timestamp: number;
    domain: {
        lengthBytes: number;
        value: string;
    };
    payload: string;
    signature: string;
}

export interface TonConnectWalletProof {
    address: string;
    publicKey: string;
    walletStateInit: string;
    proof: TonConnectProof;
}

export function getAllowedTonConnectDomains(): string[] {
    const configuredDomains = process.env.GSTD_TONCONNECT_AUTH_DOMAINS;
    const domains = configuredDomains === undefined
        ? ['app.gstdtoken.com', 'platform.gstdtoken.com']
        : configuredDomains.split(',');

    return domains.map((domain) => domain.trim().toLowerCase()).filter(Boolean);
}

export function verifyTonConnectProof(
    wallet: TonConnectWalletProof,
    expectedPayload: string,
    allowedDomains: string[],
    nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
    if (
        !wallet
        || !wallet.proof
        || !wallet.proof.domain
        || typeof wallet.address !== 'string'
        || typeof wallet.publicKey !== 'string'
        || typeof wallet.walletStateInit !== 'string'
        || typeof wallet.proof.payload !== 'string'
        || typeof wallet.proof.signature !== 'string'
        || typeof wallet.proof.domain.value !== 'string'
        || !Array.isArray(allowedDomains)
    ) {
        return false;
    }

    const { proof } = wallet;
    if (
        !/^-?\d+:[0-9a-fA-F]{64}$/.test(wallet.address)
        || !/^[0-9a-fA-F]{64}$/.test(wallet.publicKey)
        || wallet.walletStateInit.length === 0
        || wallet.walletStateInit.length > 65_536
        || proof.payload !== expectedPayload
        || proof.payload.length > 256
        || !Number.isSafeInteger(proof.timestamp)
        || proof.timestamp > nowSeconds + PROOF_FUTURE_SKEW_SECONDS
        || proof.timestamp < nowSeconds - PROOF_MAX_AGE_SECONDS
        || typeof proof.domain.value !== 'string'
        || !Number.isSafeInteger(proof.domain.lengthBytes)
        || proof.domain.lengthBytes < 0
        || proof.domain.lengthBytes > 65_535
        || proof.domain.lengthBytes !== Buffer.byteLength(proof.domain.value, 'utf8')
        || !allowedDomains.some((domain) => domain.toLowerCase() === proof.domain.value.toLowerCase())
    ) {
        return false;
    }

    try {
        const address = Address.parse(wallet.address);
        const stateInitRoots = Cell.fromBoc(Buffer.from(wallet.walletStateInit, 'base64'));
        if (stateInitRoots.length !== 1) return false;

        const stateInitCell = stateInitRoots[0];
        if (!stateInitCell.hash().equals(address.hash)) return false;

        const stateInit = loadStateInit(stateInitCell.beginParse());
        if (!stateInit.code || !stateInit.data) return false;

        const codeHash = stateInit.code.hash().toString('hex');
        const walletLayout = SUPPORTED_WALLET_CODE_LAYOUTS.find((layout) => layout.codeHash === codeHash);
        if (!walletLayout) return false;

        const statePublicKey = stateInit.data.beginParse();
        statePublicKey.skip(walletLayout.publicKeyOffsetBits);
        const publicKey = statePublicKey.loadBuffer(32);
        const suppliedPublicKey = Buffer.from(wallet.publicKey, 'hex');
        if (!timingSafeEqual(publicKey, suppliedPublicKey)) return false;

        const signature = Buffer.from(proof.signature, 'base64');
        if (signature.length !== 64 || signature.toString('base64') !== proof.signature) return false;

        const workchain = Buffer.alloc(4);
        workchain.writeInt32BE(address.workChain);
        const domainLength = Buffer.alloc(4);
        domainLength.writeUInt32LE(proof.domain.lengthBytes);
        const timestamp = Buffer.alloc(8);
        timestamp.writeBigUInt64LE(BigInt(proof.timestamp));

        const proofMessage = Buffer.concat([
            Buffer.from('ton-proof-item-v2/'),
            workchain,
            address.hash,
            domainLength,
            Buffer.from(proof.domain.value, 'utf8'),
            timestamp,
            Buffer.from(proof.payload, 'utf8'),
        ]);
        const messageHash = createHash('sha256').update(proofMessage).digest();
        const signedHash = createHash('sha256')
            .update(Buffer.concat([Buffer.from([0xff, 0xff]), Buffer.from('ton-connect'), messageHash]))
            .digest();

        return signVerify(signedHash, signature, publicKey);
    } catch {
        return false;
    }
}
