/**
 * POST /api/v1/users/login
 *
 * Wallet login for the web dashboard's TonConnect flow. The address is only
 * accepted after the server verifies a fresh, domain-bound TonConnect proof.
 *
 * Body: { connect_payload: { wallet_address, public_key, wallet_state_init, ton_proof } }
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { randomBytes } from 'crypto';
import { kvDel, kvGet, kvSet, kvSetNX } from '../../../../lib/kv';
import { getAllowedTonConnectDomains, verifyTonConnectProof } from '../../../../lib/tonProof';

const TON_ADDRESS_RE = /^-?\d+:[a-fA-F0-9]{64}$/;
const SESSION_TTL_SEC = 30 * 24 * 3600; // 30 days
const CHALLENGE_TTL_SECONDS = 5 * 60;

interface UserRecord {
    wallet_address: string;
    created_at: string;
    updated_at: string;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const walletAddress = req.body?.connect_payload?.wallet_address;
    if (!walletAddress || typeof walletAddress !== 'string' || !TON_ADDRESS_RE.test(walletAddress)) {
        return res.status(400).json({ error: 'Valid connect_payload.wallet_address required' });
    }

    const connectPayload = req.body.connect_payload;
    const tonProofReply = connectPayload.ton_proof;
    const proof = tonProofReply?.name === 'ton_proof' ? tonProofReply.proof : null;
    const publicKey = connectPayload.public_key;
    const walletStateInit = connectPayload.wallet_state_init;

    if (
        !proof
        || typeof publicKey !== 'string'
        || typeof walletStateInit !== 'string'
        || typeof proof.timestamp !== 'number'
        || !proof.domain
        || typeof proof.domain.value !== 'string'
        || typeof proof.domain.lengthBytes !== 'number'
        || typeof proof.payload !== 'string'
        || typeof proof.signature !== 'string'
        || !/^[a-f0-9]{64}$/.test(proof.payload)
    ) {
        return res.status(401).json({ error: 'A valid TonConnect wallet proof is required' });
    }

    const challengeKey = `ton-auth:challenge:${proof.payload}`;
    if (!await kvGet(challengeKey)) {
        return res.status(401).json({ error: 'Wallet proof challenge is invalid or expired' });
    }

    const verified = verifyTonConnectProof({
        address: walletAddress,
        publicKey,
        walletStateInit,
        proof,
    }, proof.payload, getAllowedTonConnectDomains());
    if (!verified) return res.status(401).json({ error: 'Wallet proof verification failed' });

    if (!await kvSetNX(`ton-auth:consumed:${proof.payload}`, '1', CHALLENGE_TTL_SECONDS)) {
        return res.status(401).json({ error: 'Wallet proof has already been used' });
    }
    await kvDel(challengeKey);

    const walletKey = walletAddress.toLowerCase();
    const userKey = `user:${walletKey}`;

    const existingRaw = await kvGet(userKey);
    const now = new Date().toISOString();
    const user: UserRecord = existingRaw
        ? { ...(JSON.parse(existingRaw as string) as UserRecord), updated_at: now }
        : { wallet_address: walletAddress, created_at: now, updated_at: now };

    const sessionToken = randomBytes(32).toString('hex');

    await Promise.all([
        kvSet(userKey, JSON.stringify(user)),
        kvSet(`ton-auth:session:${sessionToken}`, walletKey, SESSION_TTL_SEC),
    ]);

    return res.status(200).json({
        user: { wallet_address: user.wallet_address, address: user.wallet_address, created_at: user.created_at, updated_at: user.updated_at },
        session_token: sessionToken,
    });
}
