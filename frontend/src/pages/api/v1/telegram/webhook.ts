/**
 * POST /api/v1/telegram/webhook
 *
 * Telegram webhook receiver for @gstdaibot — runs on the platform (Cloudflare Worker).
 * TELEGRAM_BOT_TOKEN lives only as a Worker secret; nodes never hold it.
 *
 * Activate: set the secret, then run scripts/set-telegram-webhook.mjs (registers the
 * webhook with a secret token, localized command menus and descriptions).
 *
 * Security: every request must carry X-Telegram-Bot-Api-Secret-Token (derived from the
 * bot token, see lib/telegramWebhookAuth.ts). Updates are deduplicated by update_id.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvSet, kvSetNX, kvConsumeQuota } from '../../../../lib/kv';
import { callNodeChat } from '../../../../lib/nodes';
import { edgeChat } from '../../../../lib/edgeAi';
import { isValidWebhookRequest } from '../../../../lib/telegramWebhookAuth';
import { LANGS, LANG_NAMES, Lang, resolveLang, t, parseCommand, parseReferrer } from '../../../../lib/tgbot/i18n';

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const SWARM_URL = process.env.GSTD_SWARM_URL || 'https://app.gstdtoken.com';
const TMA_URL = `${SWARM_URL}/tma`;
const BOT_USERNAME = 'gstdaibot';
const AI_DAILY_LIMIT = Math.max(1, parseInt(process.env.TG_AI_DAILY_LIMIT || '30', 10) || 30);
const TON_ADDRESS_RE = /^(EQ[A-Za-z0-9_-]{46}|UQ[A-Za-z0-9_-]{46}|0:[a-fA-F0-9]{64})$/;
const INSTALL_URL = 'https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh';

interface Ctx { chatId: number; userId: number; lang: Lang; name: string; msgId?: number; updateId?: number }
interface View { text: string; kb?: any[][] }

const escHtml = (s: unknown) => String(s ?? '?').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
const fmt = (n: unknown, d = 4) => (Number(n) || 0).toFixed(d);
const shortAddr = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

// ── Telegram + platform API ──────────────────────────────────────────────────
class TelegramApiError extends Error {
    constructor(method: string, readonly notModified = false) {
        super('telegram_delivery_failed:' + method);
    }
}
async function tg(method: string, body: object): Promise<any> {
    if (!TOKEN) return null;
    const resp = await fetch(`https://api.telegram.org/bot${TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || data?.ok !== true) {
        throw new TelegramApiError(method, /message is not modified/i.test(data?.description || ''));
    }
    return data;
}

async function botApi(path: string, init: { method?: string; body?: unknown } = {}): Promise<any> {
    const r = await fetch(`${SWARM_URL}${path}`, {
        method: init.method || 'GET',
        headers: { 'Content-Type': 'application/json', 'X-Bot-Token': TOKEN },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
}

// Sends a view; when triggered from a button, edits the original message in place.
async function show(ctx: Ctx, v: View): Promise<void> {
    const payload: any = { text: v.text, parse_mode: 'HTML', disable_web_page_preview: true };
    if (v.kb) payload.reply_markup = { inline_keyboard: v.kb };
    if (ctx.msgId) {
        try {
            await tg('editMessageText', { chat_id: ctx.chatId, message_id: ctx.msgId, ...payload });
            return;
        } catch (error) {
            if (error instanceof TelegramApiError && error.notModified) return;
        }
    }
    await tg('sendMessage', { chat_id: ctx.chatId, ...payload });
}

// ── State ────────────────────────────────────────────────────────────────────
async function getLang(userId: number, code?: string): Promise<Lang> {
    const saved = await kvGet(`tg_lang:${userId}`).catch(() => null);
    return saved ? resolveLang(saved as string) : resolveLang(code);
}

async function getWallet(userId: number): Promise<string> {
    return ((await kvGet(`tg_wallet:${userId}`).catch(() => null)) as string) || '';
}

async function getSession(userId: number): Promise<{ model: string; history: any[] }> {
    const raw = await kvGet(`tg_session:${userId}`).catch(() => null);
    if (raw) try { return JSON.parse(raw as string); } catch {}
    return { model: 'auto', history: [] };
}

async function saveSession(userId: number, s: { model: string; history: any[] }): Promise<void> {
    if (s.history.length > 40) s.history = s.history.slice(-30);
    await kvSet(`tg_session:${userId}`, JSON.stringify(s), 3600).catch(() => {});
}

// ── Views ────────────────────────────────────────────────────────────────────
const menuKb = (l: Lang): any[][] => [
    [{ text: t(l, 'btn_ai'), callback_data: 'ai' }, { text: t(l, 'btn_earn'), callback_data: 'earn' }],
    [{ text: t(l, 'btn_wallet'), callback_data: 'wallet' }, { text: t(l, 'btn_invite'), callback_data: 'invite' }],
    [{ text: t(l, 'btn_network'), callback_data: 'network' }, { text: t(l, 'btn_settings'), callback_data: 'lang' }],
    [{ text: t(l, 'btn_app'), web_app: { url: TMA_URL } }, { text: t(l, 'btn_help'), callback_data: 'help' }],
];
const backKb = (l: Lang): any[][] => [[{ text: t(l, 'btn_menu'), callback_data: 'menu' }]];

async function viewMenu(c: Ctx): Promise<View> {
    return { text: t(c.lang, 'menu_title'), kb: menuKb(c.lang) };
}

async function viewStart(c: Ctx): Promise<View> {
    const wallet = await getWallet(c.userId);
    const w = wallet ? t(c.lang, 'wallet_linked', { wallet: shortAddr(wallet) }) : t(c.lang, 'wallet_none');
    return { text: t(c.lang, 'welcome', { name: escHtml(c.name), wallet: w }), kb: menuKb(c.lang) };
}

async function viewBalance(c: Ctx): Promise<View> {
    const wallet = await getWallet(c.userId);
    if (!wallet) return { text: t(c.lang, 'wallet_prompt'), kb: backKb(c.lang) };
    const data = await botApi(`/api/v1/telegram/bot/balance?telegram_id=${c.userId}`);
    const pending = Number(data.pending_gstd) || 0;
    const kb: any[][] = [];
    if (pending >= 0.01) kb.push([{ text: t(c.lang, 'btn_claim'), callback_data: 'claim' }]);
    kb.push([{ text:t(c.lang,'btn_app'),web_app:{url:SWARM_URL+(c.lang==='ru'?'/ru':'')+'/payments'} }], [{ text: t(c.lang, 'btn_node'), callback_data: 'nodes' }], ...backKb(c.lang));
    return {
        text: t(c.lang, 'balance', {
            wallet: t(c.lang, 'wallet_linked', { wallet: shortAddr(wallet) }),
            balance: fmt(data.balance_gstd), pending: fmt(pending), promo: fmt(data.promo_credits),
            legacy: fmt((Number(data.legacy_unreconciled_gstd)||0)+(Number(data.legacy_pending_unreconciled_gstd)||0)),
        }),
        kb,
    };
}

async function viewEarn(c: Ctx): Promise<View> {
    const wallet = await getWallet(c.userId);
    const step1 = t(c.lang, wallet ? 'step_wallet_ok' : 'step_wallet_todo');
    const cmd = `curl -fsSL ${INSTALL_URL} | GSTD_WALLET_ADDRESS=${wallet || '<YOUR_TON_WALLET>'} bash`;
    return {
        text: t(c.lang, 'earn', { step1, cmd: escHtml(cmd) }),
        kb: [[{ text: t(c.lang, 'btn_app'), web_app: { url: TMA_URL } }], [{ text: t(c.lang, 'btn_node'), callback_data: 'nodes' }, { text: t(c.lang, 'btn_wallet'), callback_data: 'wallet' }], ...backKb(c.lang)],
    };
}

async function viewNodes(c: Ctx): Promise<View> {
    const data = await botApi(`/api/v1/telegram/bot/nodes?telegram_id=${c.userId}`);
    if (!data.linked) return { text: t(c.lang, 'need_wallet'), kb: backKb(c.lang) };
    const nodes: any[] = Array.isArray(data.nodes) ? data.nodes : [];
    if (!nodes.length) return { text: t(c.lang, 'node_none'), kb: backKb(c.lang) };
    const lines = nodes.slice(0, 5).map(n => t(c.lang, 'node_line', {
        dot: n.online ? '🟢' : '🔴', name: escHtml(n.name || n.node_id), version: escHtml(n.version),
        tasks: Number(n.tasks_completed) || 0, earned: fmt(n.gstd_earned),
    })).join('\n\n');
    const pending = Number(data.pending_gstd) || 0;
    return {
        text: t(c.lang, 'node_list', { count: nodes.length, lines, pending: fmt(pending) }),
        kb: [...(pending >= 0.01 ? [[{ text: t(c.lang, 'btn_claim'), callback_data: 'claim' }]] : []), ...backKb(c.lang)],
    };
}

async function viewClaim(c: Ctx): Promise<View> {
    const r = await botApi('/api/v1/telegram/bot/claim_reward', { method: 'POST', body: { telegram_id: c.userId } });
    return {
        text: r.success ? t(c.lang, 'claim_ok', { amount: fmt(r.claimed_net) }) : t(c.lang, 'claim_none'),
        kb: backKb(c.lang),
    };
}

async function viewNetwork(c: Ctx): Promise<View> {
    const r = await fetch(`${SWARM_URL}/api/v1/network/stats`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) throw new Error(`stats ${r.status}`);
    const s: any = await r.json();
    return {
        text: t(c.lang, 'network', {
            online: Number(s.nodes_online) || 0, total: Number(s.total_nodes) || 0,
            tasks: Number(s.tasks_completed) || 0, queue: Number(s.queue_depth) || 0, paid: fmt(s.total_gstd_paid),
        }),
        kb: [[{ text: t(c.lang, 'btn_earn'), callback_data: 'earn' }], ...backKb(c.lang)],
    };
}

async function viewInvite(c: Ctx): Promise<View> {
    const link = `https://t.me/${BOT_USERNAME}?start=ref_${c.userId}`;
    const raw = await kvGet(`referral_stats:${c.userId}`).catch(() => null);
    let count = 0;
    if (raw) try { count = Number(JSON.parse(raw as string).total_referrals) || 0; } catch {}
    const share = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(t(c.lang, 'invite_share'))}`;
    return {
        text: t(c.lang, 'invite', { link, count }),
        kb: [[{ text: t(c.lang, 'btn_invite'), url: share }], ...backKb(c.lang)],
    };
}

async function viewWallet(c: Ctx): Promise<View> {
    const wallet = await getWallet(c.userId);
    return wallet ? viewBalance(c) : { text: t(c.lang, 'wallet_prompt'), kb: backKb(c.lang) };
}

const viewHelp = async (c: Ctx): Promise<View> => ({ text: t(c.lang, 'help'), kb: backKb(c.lang) });
const viewAiHint = async (c: Ctx): Promise<View> => ({ text: t(c.lang, 'ai_hint'), kb: backKb(c.lang) });

async function viewLang(c: Ctx): Promise<View> {
    const rows = LANGS.map(l => ({ text: LANG_NAMES[l], callback_data: `setlang:${l}` }));
    const kb: any[][] = [];
    for (let i = 0; i < rows.length; i += 2) kb.push(rows.slice(i, i + 2));
    return { text: t(c.lang, 'lang_pick'), kb };
}

const VIEWS: Record<string, (c: Ctx) => Promise<View>> = {
    menu: viewMenu, start: viewStart, balance: viewBalance, earn: viewEarn, nodes: viewNodes, claim: viewClaim,
    network: viewNetwork, invite: viewInvite, wallet: viewWallet, help: viewHelp, ai: viewAiHint, lang: viewLang,
};
const COMMAND_VIEW: Record<string, string> = {
    start: 'start', menu: 'menu', help: 'help', balance: 'balance', wallet: 'wallet', earn: 'earn',
    node: 'nodes', nodes: 'nodes', claim: 'claim', network: 'network', invite: 'invite', lang: 'lang',
};

async function runView(c: Ctx, name: string): Promise<void> {
    try {
        await show(c, await VIEWS[name](c));
    } catch (err: any) {
        console.error('[telegram/webhook] view', name, 'failed');
        await show(c, { text: t(c.lang, 'error'), kb: backKb(c.lang) });
    }
}

// ── Wallet linking ───────────────────────────────────────────────────────────
async function linkWallet(c: Ctx, address: string, username: string): Promise<void> {
    const refRaw = await kvGet(`tg_ref:${c.userId}`).catch(() => null);
    try {
        await botApi('/api/v1/telegram/bot/link', {
            method: 'POST',
            body: { telegram_id: c.userId, wallet_address: address, username, first_name: c.name, referrer_id: refRaw || undefined },
        });
    } catch {
        await show(c, { text: t(c.lang, 'wallet_fail') });
        return;
    }
    await show(c, {
        text: t(c.lang, 'wallet_ok', { wallet: escHtml(address) }),
        kb: [[{ text: t(c.lang, 'btn_earn'), callback_data: 'earn' }], ...backKb(c.lang)],
    });
}

// ── AI chat ──────────────────────────────────────────────────────────────────
interface CachedAiReply { body: { chat_id: number; text: string; reply_markup?: any }; session: { model: string; history: any[] }; sent?: boolean }
const replyKey = (c: Ctx) => c.updateId === undefined ? null : 'tg_ai_reply:' + c.updateId;

async function deliverAiReply(c: Ctx, reply: CachedAiReply): Promise<void> {
    const key = replyKey(c);
    // Persist before transmission: a webhook retry must not run paid/limited compute again.
    if (key) await kvSet(key, JSON.stringify(reply), 3600);
    await tg('sendMessage', reply.body);
    await saveSession(c.userId, reply.session);
    if (key) await kvSet(key, JSON.stringify({ ...reply, sent: true }), 3600);
}

async function handleAI(c: Ctx, text: string): Promise<void> {
    const key = replyKey(c);
    const cached = key ? await kvGet(key) : null;
    if (cached) {
        const reply: CachedAiReply = JSON.parse(cached);
        if (!reply.body || reply.body.chat_id !== c.chatId || typeof reply.body.text !== 'string' || !reply.session) throw Error('telegram_reply_cache_invalid');
        if (!reply.sent) await deliverAiReply(c, reply);
        return;
    }
    if (!(await kvSetNX(`tg_ai_gap:${c.userId}`, '1', 3).catch(() => true))) {
        await show(c, { text: t(c.lang, 'ai_slow') });
        return;
    }
    const day = new Date().toISOString().slice(0, 10);
    const quota = await kvConsumeQuota(`tg_ai_day:${c.userId}:${day}`, AI_DAILY_LIMIT, 90_000).catch(() => null);
    if (!quota) { await show(c, { text: t(c.lang, 'error') }); return; }
    if (!quota.allowed) {
        await show(c, { text: t(c.lang, 'ai_limit', { limit: AI_DAILY_LIMIT }), kb: [[{ text: t(c.lang, 'btn_earn'), callback_data: 'earn' }]] });
        return;
    }

    const session = await getSession(c.userId);
    await tg('sendChatAction', { chat_id: c.chatId, action: 'typing' }).catch(() => null);
    const messages = [
        { role: 'system', content: 'You are GSTD Sovereign AI — a decentralized AI running on the GSTD node network. Respond in the user\'s language. Be accurate and helpful. Answer briefly in at most two or three sentences.' },
        ...session.history.slice(-6),
        { role: 'user', content: text },
    ];
    let content = '', cloud = false;
    try {
        const response = await callNodeChat(messages, { maxTokens: 96, temperature: 0.7, timeoutMs: 45_000 });
        content = response.content;
    } catch (err: any) {
        const msg = err?.message || '';
        const offline = msg.includes('No GSTD node') || msg.includes('available');
        if (await kvGet('tg_cloud_consent:' + c.userId) === 'yes') {
            try {
                content = await edgeChat(messages, 96);
                cloud = !!content;
            } catch { /* fall through to the offline message */ }
        }
        if (!content) {
            await show(c, {
                text: t(c.lang, offline ? 'ai_offline' : 'ai_empty'),
                kb: offline ? [[{ text: t(c.lang, 'btn_earn'), callback_data: 'earn' }]] : undefined,
            });
            return;
        }
    }
    if (!content.trim()) { await show(c, { text: t(c.lang, 'ai_empty') }); return; }
    session.history.push({ role: 'user', content: text }, { role: 'assistant', content });
    // Delivery errors never trigger another model or transmit the query to a fallback.
    await deliverAiReply(c, {
        session,
        body: {
            chat_id: c.chatId,
            text: cloud ? `${content.slice(0, 3900)}\n\n${t(c.lang, 'ai_edge_note')}` : content.slice(0, 4096),
            ...(cloud ? { reply_markup: { inline_keyboard: [[{ text: t(c.lang, 'btn_earn'), callback_data: 'earn' }]] } } : {}),
        },
    });
}

// ── Dispatcher ───────────────────────────────────────────────────────────────
async function processUpdate(update: any): Promise<void> {

    if (update.inline_query) {
        const q = update.inline_query;
        const lang = await getLang(q.from.id, q.from.language_code);
        const link = `https://t.me/${BOT_USERNAME}?start=ref_${q.from.id}`;
        await tg('answerInlineQuery', {
            inline_query_id: q.id, cache_time: 60, is_personal: true,
            results: [{
                type: 'article', id: `invite_${q.from.id}`, title: 'GSTD', description: t(lang, 'invite_share'),
                input_message_content: { message_text: `${t(lang, 'invite_share')}\n${link}` },
            }],
        });
        return;
    }

    const cb = update.callback_query;
    if (cb) {
        const userId = cb.from?.id;
        const chatId = cb.message?.chat?.id;
        await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => null);
        if (!userId || !chatId) return;
        const lang = await getLang(userId, cb.from?.language_code);
        const ctx: Ctx = { chatId, userId, lang, name: cb.from?.first_name || '', msgId: cb.message?.message_id, updateId: update.update_id };
        const data: string = cb.data || '';
        if (data.startsWith('setlang:')) {
            const nl = resolveLang(data.slice(8));
            await kvSet(`tg_lang:${userId}`, nl).catch(() => {});
            ctx.lang = nl;
            await show(ctx, { text: `${t(nl, 'lang_set')}\n\n${t(nl, 'menu_title')}`, kb: menuKb(nl) });
        } else if (VIEWS[data]) {
            await runView(ctx, data);
        }
        return;
    }

    const msg = update.message;
    if (!msg?.text || msg.chat?.type !== 'private') return;
    const userId: number = msg.from?.id;
    const lang = await getLang(userId, msg.from?.language_code);
    const ctx: Ctx = { chatId: msg.chat.id, userId, lang, name: msg.from?.first_name || '', updateId: update.update_id };
    const text: string = msg.text.trim();

    if (TON_ADDRESS_RE.test(text)) { await linkWallet(ctx, text, msg.from?.username || ''); return; }

    const parsed = parseCommand(text);
    if (parsed) {
        if (parsed.cmd === 'start') {
            const ref = parseReferrer(parsed.args);
            if (ref && ref !== String(userId)) await kvSetNX(`tg_ref:${userId}`, ref, 30 * 86400).catch(() => {});
        }
        if (parsed.cmd === 'cloud') {
            const enabled=parsed.args.trim().toLowerCase()==='on';
            await kvSet('tg_cloud_consent:'+userId,enabled?'yes':'no');
            await show(ctx,{text:t(lang,enabled?'cloud_enabled':'cloud_disabled')});
        } else if (parsed.cmd === 'new') {
            await saveSession(userId, { model: 'auto', history: [] });
            await show(ctx, { text: t(lang, 'reset') });
        } else if (COMMAND_VIEW[parsed.cmd]) {
            await runView(ctx, COMMAND_VIEW[parsed.cmd]);
        } else {
            await runView(ctx, 'help');
        }
        return;
    }

    await handleAI(ctx, text);
}

/** Only inference updates may resume from a persisted reply after failed delivery.
 * Commands can mutate account mappings; replaying an older command after a newer
 * one must never restore a stale wallet or repeat a financial action.
 */
function isAiUpdate(update: any): boolean {
    if (update?.inline_query || update?.callback_query) return false;
    const message = update?.message;
    if (typeof message?.text !== 'string' || !message.text || message.chat?.type !== 'private') return false;
    const text = message.text.trim();
    return !TON_ADDRESS_RE.test(text) && !parseCommand(text);
}

// ── Handler ──────────────────────────────────────────────────────────────────
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!TOKEN) return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
    if (!isValidWebhookRequest(req, TOKEN)) return res.status(401).json({ error: 'Invalid webhook secret' });

    // AI delivery can resume safely from its outbox without repeating inference.
    // Commands/callbacks retain start-deduplication to prevent stale mutation replay.
    // Storage errors fail closed. AI leases expire naturally without an unlock race.
    const updateId = req.body?.update_id;
    const key = Number.isSafeInteger(updateId) && updateId >= 0 ? 'tg_upd:' + updateId : null;
    const retryableAi = isAiUpdate(req.body);
    try {
        if (key) {
            if (retryableAi) {
                if (await kvGet(key)) return res.status(200).json({ ok: true });
                if (!(await kvSetNX(key + ':processing', '1', 120))) return res.status(503).json({ ok: false, error: 'update_processing' });
            } else if (!(await kvSetNX(key, '1', 86400))) {
                return res.status(200).json({ ok: true });
            }
        }
        await processUpdate(req.body);
        if (key && retryableAi) await kvSet(key, '1', 86400);
        return res.status(200).json({ ok: true });
    } catch (err: any) {
        console.error('[telegram/webhook]', err instanceof TelegramApiError ? err.message : 'processing_failed');
        return res.status(503).json({ ok: false, error: 'processing_failed' });
    }
}
