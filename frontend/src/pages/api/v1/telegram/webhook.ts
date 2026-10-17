/**
 * POST /api/v1/telegram/webhook
 *
 * Telegram webhook receiver — handles bot updates on the platform API.
 * Configure TELEGRAM_BOT_TOKEN as a Cloudflare Worker secret when deployment is ready.
 * The Pi node has NO token — it only serves AI inference.
 *
 * To activate:
 *   1. Set TELEGRAM_BOT_TOKEN as a Cloudflare Worker secret (not in any committed file)
 *   2. Register webhook: POST https://api.telegram.org/bot<TOKEN>/setWebhook
 *      { "url": "https://app.gstdtoken.com/api/v1/telegram/webhook" }
 *   3. Remove TELEGRAM_BOT_TOKEN from Pi's gstdbot/.env
 *
 * Security: every request must carry X-Telegram-Bot-Api-Secret-Token (derived from the
 * bot token, see lib/telegramWebhookAuth.ts). Register with scripts/set-telegram-webhook.mjs.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvIncr } from '../../../../lib/kv';
import { resolveNodeUrl, callNodeChat } from '../../../../lib/nodes';
import { isValidWebhookRequest } from '../../../../lib/telegramWebhookAuth';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SWARM_URL = process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com';
const TMA_URL = `${SWARM_URL}/tma`;

// ── Telegram API helper ───────────────────────────────────────────────────────
async function tg(method: string, body: object): Promise<any> {
    if (!TOKEN) return null;
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
        signal:  AbortSignal.timeout(10_000),
    });
    return resp.json().catch(() => ({}));
}

async function sendMessage(chatId: number, text: string, extra: object = {}): Promise<void> {
    await tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function answerCallback(callbackQueryId: string): Promise<void> {
    await tg('answerCallbackQuery', { callback_query_id: callbackQueryId });
}

// ── Session (Telegram user state) ────────────────────────────────────────────
async function getSession(userId: number): Promise<{ model: string; history: any[] }> {
    const raw = await kvGet(`tg_session:${userId}`).catch(() => null);
    if (raw) try { return JSON.parse(raw as string); } catch {}
    return { model: 'auto', history: [] };
}

async function saveSession(userId: number, session: { model: string; history: any[] }): Promise<void> {
    if (session.history.length > 40) session.history = session.history.slice(-30);
    await kvSet(`tg_session:${userId}`, JSON.stringify(session), 3600).catch(() => {});
}

// ── Wallet helpers ────────────────────────────────────────────────────────────
async function getWallet(userId: number): Promise<string> {
    const raw = await kvGet(`tg_wallet:${userId}`).catch(() => null);
    return raw ? (raw as string) : '';
}

async function getBalance(userId: number): Promise<{ balance: number; pending: number }> {
    const wallet = await getWallet(userId);
    if (!wallet) return { balance: 0, pending: 0 };
    const [balRaw, pendRaw] = await Promise.all([
        kvGet(`balance:${wallet.toLowerCase()}`).catch(() => null),
        kvGet(`rewards:pending:${wallet.toLowerCase()}`).catch(() => null),
    ]);
    return {
        balance: balRaw  ? parseFloat(balRaw  as string) : 0,
        pending: pendRaw ? parseFloat(pendRaw as string) : 0,
    };
}

// ── Command handlers ──────────────────────────────────────────────────────────
async function handleStart(chatId: number, userId: number, firstName: string): Promise<void> {
    const wallet = await getWallet(userId);
    const walletLine = wallet
        ? `🔗 Wallet: <code>${wallet.slice(0, 8)}…${wallet.slice(-4)}</code>`
        : `🔗 Link wallet to start earning: send your TON address`;

    await sendMessage(chatId,
        `🐝 <b>Welcome to GSTD Sovereign AI Network</b>\n\n` +
        `Hi ${firstName}! Here's how to get started:\n\n` +
        `1️⃣ <b>Link your wallet</b> — paste your TON address\n` +
        `2️⃣ <b>Run a node</b> /node — earn GSTD automatically\n` +
        `3️⃣ <b>Use GSTD</b> — better AI models\n\n` +
        `${walletLine}\n\n` +
        `<b>You need 0 GSTD to start. Just link + run.</b>\n\n` +
        `Commands: /earn /balance /node /wallet /help`,
        { reply_markup: { keyboard: [
            [{ text: '🐝 Earn GSTD' }, { text: '💎 Balance' }],
            [{ text: '📱 Mobile Node' }, { text: '🔗 Wallet' }],
            [{ text: '🤖 AI Chat' }],
        ], resize_keyboard: true } }
    );
}

async function handleBalance(chatId: number, userId: number): Promise<void> {
    const wallet = await getWallet(userId);
    const { balance, pending } = await getBalance(userId);

    // Get tier
    let tierEmoji = '🌱', tierName = 'Basic';
    if (balance >= 10000) { tierEmoji = '🧠'; tierName = 'Ultra'; }
    else if (balance >= 1000) { tierEmoji = '🔥'; tierName = 'Pro'; }
    else if (balance >= 100)  { tierEmoji = '⚡'; tierName = 'Standard'; }
    else if (balance >= 10)   { tierEmoji = '🐝'; tierName = 'Contributor'; }

    const walletLine = wallet
        ? `🔗 <code>${wallet.slice(0, 6)}…${wallet.slice(-4)}</code>`
        : `⚠️ No wallet linked — use /wallet`;

    const pendingLine = pending > 0.001
        ? `\n⏳ Pending reward: <b>${pending.toFixed(4)} GSTD</b>` : '';

    await sendMessage(chatId,
        `💎 <b>Balance</b>\n\n${walletLine}\n\n` +
        `💰 <b>${balance.toFixed(4)} GSTD</b>\n` +
        `${tierEmoji} Tier: <b>${tierName}</b>` + pendingLine +
        `\n\n/earn to get more · /node to run`,
        {
            reply_markup: { inline_keyboard: [
                ...(pending > 0.01 ? [[{ text: '🎁 Claim Reward', callback_data: 'claim_reward' }]] : []),
                [{ text: '🐝 Earn More', callback_data: 'earn_menu' }],
            ]},
        }
    );
}

async function handleWalletCommand(chatId: number, userId: number): Promise<void> {
    const wallet = await getWallet(userId);
    if (wallet) {
        await sendMessage(chatId,
            `🔗 <b>Your Wallet</b>\n\n` +
            `✅ <code>${wallet}</code>\n\n` +
            `To change: paste a new TON address in chat.\n` +
            `/earn · /balance`
        );
    } else {
        await sendMessage(chatId,
            `🔗 <b>Link Wallet — Step 1 to Earning</b>\n\n` +
            `<b>You need 0 GSTD to start.</b>\n\n` +
            `Paste your TON wallet address:\n` +
            `<code>EQDv6cYW9nNiKjN3Nwl8D6ABjUiH1gYfWVGZhfP7-9tZskTO</code>\n\n` +
            `No wallet yet?\n` +
            `• <a href="https://tonkeeper.com">Tonkeeper</a>\n` +
            `• <a href="https://mytonwallet.io">MyTonWallet</a>`
        );
    }
}

async function handleEarn(chatId: number, userId: number): Promise<void> {
    const wallet = await getWallet(userId);
    const tmaUrl = TMA_URL;
    const step1 = wallet ? `✅ Wallet linked` : `1️⃣ /wallet — link your wallet (0 GSTD needed)`;

    await sendMessage(chatId,
        `🐝 <b>Earn GSTD by contributing compute</b>\n\n` +
        `${step1}\n` +
        `2️⃣ Run a node — one command:\n` +
        `<code>curl -fsSL https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh | GSTD_WALLET_ADDRESS=${wallet || '&lt;YOUR_TON_WALLET&gt;'} bash</code>\n` +
        `3️⃣ Check status and rewards: /node\n\n` +
        `<i>Rewards are paid for completed, accepted tasks and depend on network demand. There are no guaranteed hourly rates.</i>`,
        { reply_markup: { inline_keyboard: [
            [{ text: '🖥 My node', callback_data: 'node_status' }],
            [{ text: '💎 Check Balance', callback_data: 'check_balance' }],
        ]}}
    );
}

async function botApi(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const r = await fetch(`${SWARM_URL}${path}`, {
        method:  init.method || 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Bot-Token': TOKEN },
        body:    init.body ? JSON.stringify(init.body) : undefined,
        signal:  AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
}

const escHtml = (s: unknown) => String(s ?? '?').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));

async function handleNodeStatus(chatId: number, userId: number): Promise<void> {
    let data: any;
    try { data = await botApi(`/api/v1/telegram/bot/nodes?telegram_id=${userId}`); }
    catch { await sendMessage(chatId, '❌ Could not load node status. Try again later.'); return; }

    if (!data.linked) { await sendMessage(chatId, '🖥 Link your TON wallet first → /wallet'); return; }
    const nodes: any[] = Array.isArray(data.nodes) ? data.nodes : [];
    if (!nodes.length) {
        await sendMessage(chatId, '🖥 <b>No node found for your wallet.</b>\nMake sure GSTD_WALLET_ADDRESS in the node .env matches your linked wallet.\n\nStart one → /earn');
        return;
    }
    const lines = nodes.slice(0, 5).map(n =>
        `${n.online ? '🟢' : '🔴'} <b>${escHtml(n.name || n.node_id)}</b> v${escHtml(n.version)}\n   tasks: ${Number(n.tasks_completed) || 0} · earned: ${(Number(n.gstd_earned) || 0).toFixed(4)} GSTD`
    ).join('\n\n');
    const pending = Number(data.pending_gstd) || 0;
    await sendMessage(chatId, `🖥 <b>Your nodes</b> (${nodes.length})\n\n${lines}\n\n💰 Claimable: <b>${pending.toFixed(4)} GSTD</b>`,
        { reply_markup: { inline_keyboard: pending >= 0.01 ? [[{ text: '🎁 Claim', callback_data: 'claim_reward' }]] : [] } });
}

async function handleClaim(chatId: number, userId: number): Promise<void> {
    try {
        const r = await botApi('/api/v1/telegram/bot/claim_reward', { method: 'POST', body: { telegram_id: userId } });
        await sendMessage(chatId, r.success
            ? `✅ Claimed <b>${Number(r.claimed_net).toFixed(4)} GSTD</b> to your balance.`
            : 'Nothing to claim yet.');
    } catch { await sendMessage(chatId, '❌ Claim failed. Try again later.'); }
}


async function handleAI(chatId: number, userId: number, text: string): Promise<void> {
    const session = await getSession(userId);

    await tg('sendChatAction', { chat_id: chatId, action: 'typing' });

    const messages = [
        { role: 'system', content: 'You are GSTD Sovereign AI — a decentralized AI running on the GSTD node network. Respond in the user\'s language. Be accurate, concise, and helpful.' },
        ...session.history.slice(-16),
        { role: 'user', content: text },
    ];

    try {
        // Bound node inference time so webhook processing stays within request limits.
        const response = await callNodeChat(messages, { maxTokens: 600, temperature: 0.7, timeoutMs: 20_000 });
        const content = response.content || '🐝 No response from the swarm. Try again.';

        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content });
        await saveSession(userId, session);

        await sendMessage(chatId, content.slice(0, 4096));
    } catch (err: any) {
        const msg = err.message || '';
        if (msg.includes('No GSTD node') || msg.includes('available')) {
            await sendMessage(chatId, '🐝 Node network is offline right now. Try again in a minute.');
        } else {
            await sendMessage(chatId, `🐝 GSTD AI: ${msg.slice(0, 80) || 'Inference error. Try again.'}`);
        }
    }
}

// ── Update dispatcher ─────────────────────────────────────────────────────────
async function processUpdate(update: any): Promise<void> {
    const msg     = update.message;
    const cbQuery = update.callback_query;

    if (cbQuery) {
        const chatId = cbQuery.message?.chat?.id;
        const userId = cbQuery.from?.id;
        const data   = cbQuery.data || '';
        await answerCallback(cbQuery.id);

        if (data === 'node_status') await handleNodeStatus(chatId, userId);
        else if (data === 'claim_reward') await handleClaim(chatId, userId);
        else if (data === 'check_balance' || data === 'earn_menu') {
            if (data === 'earn_menu') await handleEarn(chatId, userId);
            else await handleBalance(chatId, userId);
        }
        return;
    }

    if (!msg || !msg.text) return;

    const chatId   = msg.chat?.id;
    const userId   = msg.from?.id;
    const text     = msg.text.trim();
    const firstName = msg.from?.first_name || 'friend';
    const isPrivate = msg.chat?.type === 'private';

    if (!isPrivate) return; // Only handle private chats

    // TON address detection
    const tonRegex = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
    if (tonRegex.test(text)) {
        let linked = false;
        try {
            const lr = await fetch(`${SWARM_URL}/api/v1/telegram/bot/link`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'X-Bot-Token': TOKEN },
                body:    JSON.stringify({ telegram_id: userId, wallet_address: text, username: msg.from?.username || '' }),
                signal:  AbortSignal.timeout(5000),
            });
            linked = lr.ok;
        } catch {}
        if (!linked) {
            await sendMessage(chatId, '❌ Could not link the wallet right now. Try again in a minute.');
            return;
        }

        // Fetch live price for Stars rate display
        const STAR_USD = 0.013;
        let gstdPerStar = 65;
        try {
            const pr = await fetch(`${SWARM_URL}/api/v1/market/price`, { signal: AbortSignal.timeout(3000) });
            if (pr.ok) {
                const pd = await pr.json();
                if (pd.gstd_price_usd > 0) gstdPerStar = Math.round(STAR_USD / pd.gstd_price_usd);
            }
        } catch {}

        const short = text.slice(0, 6) + '…' + text.slice(-4);
        await sendMessage(chatId,
            `✅ <b>Wallet Linked!</b>\n\n<code>${text}</code>\n\n` +
            `🎯 GSTD purchases now go <b>directly to your TON wallet</b>.\n\n` +
            `⭐ <b>Buy GSTD with Telegram Stars:</b>\n` +
            `10⭐ → <b>${10 * gstdPerStar} GSTD</b>  ·  50⭐ → <b>${50 * gstdPerStar} GSTD</b>  ·  200⭐ → <b>${200 * gstdPerStar} GSTD</b>\n\n` +
            `🐝 Or earn for free: /node\n` +
            `💰 Rewards flow to ${short} automatically.`,
            { reply_markup: { inline_keyboard: [
                [
                    { text: `10⭐ → ${10 * gstdPerStar} GSTD`, callback_data: 'buy_stars_10' },
                    { text: `50⭐ → ${50 * gstdPerStar} GSTD`, callback_data: 'buy_stars_50' },
                ],
                [{ text: '🐝 Earn for free', callback_data: 'earn_menu' }],
            ]}}
        );
        return;
    }

    switch (text) {
        case '/start': case '🐝 GSTD':
            await handleStart(chatId, userId, firstName); break;
        case '/balance': case '💎 Balance': case '/balance@gstdaibot':
            await handleBalance(chatId, userId); break;
        case '/wallet': case '🔗 Wallet':
            await handleWalletCommand(chatId, userId); break;
        case '/earn': case '🐝 Earn GSTD':
            await handleEarn(chatId, userId); break;
        case '/node': case '📱 Mobile Node':
            await handleNodeStatus(chatId, userId); break;
        case '/help':
            await sendMessage(chatId,
                `❓ <b>Commands</b>\n\n` +
                `/earn — Earn GSTD (no tokens needed)\n` +
                `/wallet — Link your TON wallet\n` +
                `/balance — Balance & tier\n` +
                `/node — Run mobile node\n` +
                `/new — Reset AI conversation\n\n` +
                `Just type any question to chat with the AI.`
            );
            break;
        case '/new':
            await saveSession(userId, { model: 'auto', history: [] });
            await sendMessage(chatId, '🔄 Conversation reset.');
            break;
        case '🤖 AI Chat':
            await sendMessage(chatId, '🤖 Just type your question and I\'ll answer using the GSTD node network.');
            break;
        default:
            if (!text.startsWith('/')) await handleAI(chatId, userId, text);
    }
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!TOKEN) return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    if (!isValidWebhookRequest(req, TOKEN)) return res.status(401).json({ error: 'Invalid webhook secret' });

    // Complete processing before responding; do not rely on background work after the response.
    try {
        await processUpdate(req.body);
    } catch (err: any) {
        console.error('[telegram/webhook]', err.message);
    }

    return res.status(200).json({ ok: true });
}
