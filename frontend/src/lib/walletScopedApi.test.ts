import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    kvGet,
    kvKeys,
    kvMGet,
    kvSet,
    kvRateLimit,
    getActiveNodes,
    validateEnterpriseKey,
    recordEnterpriseUsage,
    sessionWallet,
    chargeFee,
    refundFee,
    getClientIp,
    isValidBotToken,
} = vi.hoisted(() => ({
    kvGet: vi.fn(),
    kvKeys: vi.fn(),
    kvMGet: vi.fn(),
    kvSet: vi.fn(),
    kvRateLimit: vi.fn(),
    getActiveNodes: vi.fn(),
    validateEnterpriseKey: vi.fn(),
    recordEnterpriseUsage: vi.fn(),
    sessionWallet: vi.fn(),
    chargeFee: vi.fn(),
    refundFee: vi.fn(),
    getClientIp: vi.fn(),
    isValidBotToken: vi.fn(),
}));

vi.mock('./kv', () => ({ kvGet, kvKeys, kvMGet, kvSet, kvRateLimit }));
vi.mock('./walletSession', () => ({ sessionWallet }));
vi.mock('./nodes', () => ({ getActiveNodes, NODE_MODEL: 'llama3.2:3b' }));
vi.mock('./ratelimit', () => ({ getClientIp }));
vi.mock('./billing', () => ({ chargeFee, refundFee, getModelPrice: () => 0.005 }));
vi.mock('./paidInference', () => ({
    paidInference: async (_req: unknown,res: any,options: any) => {
        const charge = await chargeFee(options.wallet,options.model,null);
        return res.status(402).json(charge);
    },
}));
vi.mock('./botAuth', () => ({ isValidBotToken }));
vi.mock('../pages/api/v1/enterprise/keys', () => ({ validateEnterpriseKey }));
vi.mock('../pages/api/v1/enterprise/usage', () => ({ recordEnterpriseUsage }));

import chatCompletions from '../pages/api/v1/chat/completions';
import batchChat from '../pages/api/v1/chat/batch';
import accessTier from '../pages/api/v1/access/tier';
import creditsBalance from '../pages/api/v1/credits/balance';
import freeApiKey from '../pages/api/v1/free-api/key';
import b2bRegister from '../pages/api/v1/b2b/register';
import agentsRegister from '../pages/api/v1/agents/register';
import botBalance from '../pages/api/v1/telegram/bot/balance';
import botWallet from '../pages/api/v1/telegram/bot/wallet';
import myNodes from '../pages/api/v1/nodes/my';
import pullNodeModel from '../pages/api/v1/nodes/pull-model';
import myNodeRewards from '../pages/api/v1/nodes/rewards/my';
import stakingInfo from '../pages/api/v1/sovereign/staking/info';

type Handler = (req: NextApiRequest, res: NextApiResponse) => unknown;

async function call(
    handler: Handler,
    options: {
        method?: string;
        query?: Record<string, string | string[]>;
        body?: Record<string, unknown>;
        sessionToken?: string;
        headers?: Record<string, string>;
    } = {},
): Promise<{ status: number; body: unknown }> {
    let statusCode = 200;
    let responseBody: unknown;
    const req = {
        method: options.method || 'GET',
        query: options.query || {},
        body: options.body,
        headers: {
            ...(options.sessionToken ? { 'x-session-token': options.sessionToken } : {}),
            ...options.headers,
        },
    } as NextApiRequest;
    const res = {
        status(code: number) { statusCode = code; return this; },
        setHeader() { return this; },
        json(body: unknown) { responseBody = body; return this; },
    } as unknown as NextApiResponse;

    await handler(req, res);
    return { status: statusCode, body: responseBody };
}

describe('wallet-scoped API authorization', () => {
    beforeEach(() => {
        kvGet.mockReset();
        kvKeys.mockReset();
        kvMGet.mockReset();
        kvSet.mockReset();
        kvRateLimit.mockReset().mockResolvedValue(true);
        getActiveNodes.mockReset().mockResolvedValue([]);
        validateEnterpriseKey.mockReset().mockResolvedValue(null);
        recordEnterpriseUsage.mockReset();
        sessionWallet.mockReset().mockResolvedValue(null);
        chargeFee.mockReset();
        refundFee.mockReset();
        getClientIp.mockReset().mockReturnValue('127.0.0.1');
        isValidBotToken.mockReset().mockReturnValue(false);
    });

    it('never charges a wallet supplied only by an unverified header or body', async () => {
        chargeFee.mockResolvedValue({ ok: false, error: 'no_wallet' });

        const response = await call(chatCompletions, {
            method: 'POST',
            body: { model: 'llama3.1:8b', messages: [{ role: 'user', content: 'hello' }], wallet: '0:' + '22'.repeat(32) },
            headers: { 'x-wallet-address': '0:' + '22'.repeat(32) },
        });

        expect(response.status).toBe(402);
        expect(chargeFee).toHaveBeenCalledWith(null, 'llama3.1:8b', null);
    });

    it('uses the TON session wallet for inference charges instead of spoofed wallet fields', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));
        chargeFee.mockResolvedValue({ ok: false, error: 'insufficient_balance', balance: 0, required: 0.005 });

        const response = await call(chatCompletions, {
            method: 'POST',
            sessionToken: 'verified-session',
            body: { model: 'llama3.1:8b', messages: [{ role: 'user', content: 'hello' }], wallet: '0:' + '22'.repeat(32) },
            headers: { 'x-wallet-address': '0:' + '22'.repeat(32) },
        });

        expect(response.status).toBe(402);
        expect(chargeFee).toHaveBeenCalledWith('0:' + '11'.repeat(32), 'llama3.1:8b', null);
    });

    it('accepts a wallet session when the client also sends that token as a bearer credential', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));
        chargeFee.mockResolvedValue({ ok: false, error: 'insufficient_balance', balance: 0, required: 0.005 });

        const response = await call(chatCompletions, {
            method: 'POST',
            sessionToken: 'verified-session',
            headers: { authorization: 'Bearer verified-session' },
            body: { model: 'llama3.1:8b', messages: [{ role: 'user', content: 'hello' }] },
        });

        expect(response.status).toBe(402);
        expect(chargeFee).toHaveBeenCalledWith('0:' + '11'.repeat(32), 'llama3.1:8b', null);
    });

    it('rejects batch inference without a session even when a wallet is supplied by the caller', async () => {
        const response = await call(batchChat, {
            method: 'POST',
            body: { prompts: ['hello'], wallet: '0:' + '22'.repeat(32) },
            headers: { 'x-wallet-address': '0:' + '22'.repeat(32) },
        });

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
        expect(getActiveNodes).not.toHaveBeenCalled();
    });

    it('rejects another wallet on the personal balance endpoint', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(creditsBalance, {
            query: { wallet: '0:' + '22'.repeat(32) },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('rejects another wallet on the access tier endpoint', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(accessTier, {
            query: { wallet: '0:' + '22'.repeat(32) },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('requires a session for node listings and rejects a mismatched wallet', async () => {
        const unauthenticated = await call(myNodes, { query: { wallet_address: '0:' + '22'.repeat(32) } });
        expect(unauthenticated.status).toBe(401);
        expect(kvKeys).not.toHaveBeenCalled();

        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));
        const mismatched = await call(myNodes, {
            query: { wallet_address: '0:' + '22'.repeat(32) },
            sessionToken: 'verified-session',
        });
        expect(mismatched.status).toBe(403);
        expect(kvKeys).not.toHaveBeenCalled();
    });

    it('rejects another wallet on node reward details', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(myNodeRewards, {
            query: { wallet: '0:' + '22'.repeat(32) },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvKeys).not.toHaveBeenCalled();
    });

    it('does not issue a persistent API key for a wallet other than the session wallet', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(freeApiKey, {
            method: 'POST',
            body: { wallet_address: '0:' + '22'.repeat(32), telegram_id: 'unverified-user' },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
        expect(kvSet).not.toHaveBeenCalled();
    });

    it('allows the Telegram bot to issue a key only for the linked wallet', async () => {
        isValidBotToken.mockReturnValue(true);
        kvGet.mockImplementation(async (key: string) => {
            if (key === 'tg_wallet:123456') return '0:' + '11'.repeat(32);
            if (key === 'balance:0:' + '11'.repeat(32)) return '10000';
            return null;
        });

        const response = await call(freeApiKey, {
            method: 'POST',
            body: { telegram_id: '123456', wallet_address: '0:' + '11'.repeat(32) },
            headers: { 'x-bot-token': 'valid-bot-token' },
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ wallet_address: '0:' + '11'.repeat(32), already_issued: false });
        expect(kvSet).toHaveBeenCalledWith('free_api_key:0:' + '11'.repeat(32), expect.any(String));
    });

    it('requires a wallet session to access wallet-specific staking details', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(stakingInfo, { query: { wallet: '0:' + '22'.repeat(32) } });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('requires the internal bot token before exposing a Telegram account balance', async () => {
        const response = await call(botBalance, { query: { telegram_id: '123456' } });

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('requires the internal bot token before resolving a Telegram wallet', async () => {
        const response = await call(botWallet, { query: { telegram_id: '123456' } });

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('requires the internal bot token for Telegram-linked tier lookups', async () => {
        const response = await call(accessTier, { query: { telegram_id: '123456' } });

        expect(response.status).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it('reports Telegram wallet storage failures instead of returning an unlinked result', async () => {
        isValidBotToken.mockReturnValue(true);
        kvGet.mockRejectedValue(new Error('KV unavailable'));

        const response = await call(botWallet, {
            query: { telegram_id: '123456' },
            headers: { 'x-bot-token': 'valid-bot-token' },
        });

        expect(response.status).toBe(500);
        expect(response.body).toMatchObject({ error: 'Could not resolve linked Telegram wallet' });
    });

    it('reports Telegram balance storage failures instead of returning zero balances', async () => {
        isValidBotToken.mockReturnValue(true);
        kvGet.mockRejectedValue(new Error('KV unavailable'));

        const response = await call(botBalance, {
            query: { telegram_id: '123456' },
            headers: { 'x-bot-token': 'valid-bot-token' },
        });

        expect(response.status).toBe(503);
        expect(response.body).toMatchObject({ error: 'ledger_unavailable' });
    });

    it('resolves bot tier requests only through the linked Telegram wallet', async () => {
        isValidBotToken.mockReturnValue(true);
        kvKeys.mockResolvedValue([]);
        kvMGet.mockResolvedValue([]);
        kvGet.mockImplementation(async (key: string) => {
            if (key === 'tg_wallet:123456') return '0:' + '11'.repeat(32);
            if (key === 'balance:0:' + '11'.repeat(32)) return '12';
            return null;
        });

        const response = await call(accessTier, {
            query: { telegram_id: '123456' },
            headers: { 'x-bot-token': 'valid-bot-token' },
        });

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ wallet: '0:' + '11'.repeat(32), balance_gstd: 12 });
        expect(kvGet).toHaveBeenCalledWith('balance:0:' + '11'.repeat(32));
    });

    it('does not issue a B2B API key for a wallet other than the session wallet', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(b2bRegister, {
            method: 'POST',
            body: { wallet_address: '0:' + '22'.repeat(32), company_name: 'Example' },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
        expect(kvSet).not.toHaveBeenCalled();
    });

    it('does not allow an agent registration to claim another wallet identity', async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(agentsRegister, {
            method: 'POST',
            body: { wallet: '0:' + '22'.repeat(32), capabilities: ['inference'] },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
    });

    it("does not let callers queue a model pull on another wallet's node", async () => {
        sessionWallet.mockResolvedValue('0:' + '11'.repeat(32));

        const response = await call(pullNodeModel, {
            method: 'POST',
            body: { node_id: 'victim-node', model: 'llama3.2:3b', wallet_address: '0:' + '22'.repeat(32) },
            sessionToken: 'verified-session',
        });

        expect(response.status).toBe(403);
        expect(kvGet).not.toHaveBeenCalled();
    });
});
