import { Address } from '@ton/core';
import { createHash, randomUUID } from 'crypto';
import { kvGet, kvMGet, kvMoneyCAS, kvMoneyDue } from './kv';

export const MONEY_VERSION = 2;
export const SPLIT = { executor: 85, protocol: 10, reserve: 5 } as const;
const PREFIX = 'money:v2:';
const SYS = PREFIX + 'system';
const MAX_NANO = 1_000_000_000n * 1_000_000_000n;
export class MoneyError extends Error {
    constructor(public code: string) { super(code); }
}
export function walletId(value: string): string {
    try { return Address.parse(value).toRawString(); } catch { throw new MoneyError('invalid_wallet'); }
}
export function nano(value: string | number): bigint {
    const text = String(value);
    if (!/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(text)) throw new MoneyError('invalid_amount');
    const [whole, fraction = ''] = text.split('.');
    const amount = BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, '0'));
    if (amount > MAX_NANO) throw new MoneyError('amount_too_large');
    return amount;
}
export function units(amount: bigint | string): string {
    const n = BigInt(amount);
    return n / 1_000_000_000n + '.' + (n % 1_000_000_000n).toString().padStart(9, '0');
}
export function splitNano(amount: bigint) {
    const executor = amount * 85n / 100n, protocol = amount * 10n / 100n;
    return { executor, protocol, reserve: amount - executor - protocol };
}
export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function id(value: string): string {
    if (!/^[a-zA-Z0-9:_-]{1,180}$/.test(value)) throw new MoneyError('invalid_id');
    return value;
}
const accountKey = (wallet: string) => PREFIX + 'account:' + walletId(wallet);
const jobKey = (job: string) => PREFIX + 'job:' + id(job);
type Account = { available: string; reserved: string; pending: string; promo: string; earned: string };
export type MoneySystem = { owner: string; jettonWallet: string; reserve: string; allocated: string; legacyHold: string;
    payoutInFlight?: string; openedAt: number; checkedAt: number; validUntil: number; migrationReviewed: boolean; manifest: string };
export type MoneyJob = { id: string; wallet: string; amount: string; available: string;
    state: 'reserved' | 'captured' | 'released'; kind: 'chat' | 'campaign' | 'task';
    fingerprint: string; expiresAt: number; parent?: string; executor?: string; result?: unknown;
    createdAt: number; finishedAt?: number };
const emptyAccount = (): Account => ({ available: '0', reserved: '0', pending: '0', promo: '0', earned: '0' });
function parseAccount(raw: string | null): Account {
    const a = raw ? JSON.parse(raw) as Account : emptyAccount();
    a.earned ??= '0';
    if (!/^\d+$/.test(a.earned)) throw new MoneyError('invalid_ledger');
    for (const key of ['available','reserved','pending','promo'] as const) {
        if (!/^\d+$/.test(a[key]) || BigInt(a[key]) > MAX_NANO) throw new MoneyError('invalid_ledger');
    }
    return a;
}
function change(a: Account, key: keyof Account, delta: bigint) {
    const next = BigInt(a[key]) + delta;
    if (next < 0n || (key !== 'earned' && next > MAX_NANO)) throw new MoneyError('insufficient_balance');
    a[key] = String(next);
}
function system(raw: string | null, fresh = true): MoneySystem {
    if (!raw) throw new MoneyError('backing_not_reconciled');
    const s = JSON.parse(raw) as MoneySystem;
    if (!s.migrationReviewed || BigInt(s.reserve) < BigInt(s.allocated) + BigInt(s.legacyHold)
        || (fresh && s.validUntil < Date.now())) throw new MoneyError('backing_not_reconciled');
    return s;
}
type Transaction = { writes: Record<string,string>; due?: { id: string; at: number | null }; queue?: { key: string; value: string }; expires?: Record<string,number> };
async function atomic<T>(keys: string[], run: (old: Record<string,string|null>) => { value: T; tx?: Transaction }): Promise<T> {
    keys = [...new Set(keys)];
    for (let attempt = 0; attempt < 12; attempt++) {
        const values = await kvMGet(keys);
        const old = Object.fromEntries(keys.map((key,i) => [key, values[i]]));
        const { value, tx } = run(old);
        if (!tx || await kvMoneyCAS(old, tx.writes, tx.due, tx.queue, tx.expires)) return value;
    }
    throw new MoneyError('ledger_busy');
}
export async function moneyBalance(wallet: string) {
    const canonical = walletId(wallet);
    const address = Address.parse(canonical);
    const aliases = [...new Set([canonical,wallet.toLowerCase(),
        ...[true,false].flatMap(bounceable=>[true,false].map(urlSafe=>
            address.toString({bounceable,urlSafe}).toLowerCase()))])];
    const values = await kvMGet([accountKey(canonical),SYS,
        ...aliases.map(alias=>'balance:'+alias),...aliases.map(alias=>'rewards:pending:'+alias)]);
    const [raw,s] = values;
    const sumLegacy = (parts: (string|null)[]) => parts.reduce((sum,value)=>{
        const amount = Number(value || 0);
        if (!Number.isFinite(amount) || amount < 0) throw new MoneyError('invalid_legacy_ledger');
        return sum+amount;
    },0);
    const legacy = sumLegacy(values.slice(2,2+aliases.length));
    const pending = sumLegacy(values.slice(2+aliases.length));
    const a = parseAccount(raw);
    let backed = false;
    try { system(s); backed = true; } catch { /* Explicitly report unverified legacy balances. */ }
    return { wallet: canonical, ledger_version: 2, balance_gstd: Number(units(a.available)),
        pending_gstd: Number(units(a.pending)), reserved_gstd: Number(units(a.reserved)),
        promo_credits: Number(units(a.promo)), lifetime_earned_gstd: Number(units(a.earned)), available_nano: a.available, pending_nano: a.pending,
        reserved_nano: a.reserved, promo_nano: a.promo, backing_verified: backed,
        legacy_unreconciled_gstd: Number(legacy || 0), legacy_pending_unreconciled_gstd: Number(pending || 0),
        withdrawal_enabled: true, withdrawal_mode: 'owner_signed', deposit_owner: s ? JSON.parse(s).owner : null,
        deposit_jetton_wallet: s ? JSON.parse(s).jettonWallet : null };
}
export async function moneyJob(job: string): Promise<MoneyJob | null> {
    const raw = await kvGet(jobKey(job)); return raw ? JSON.parse(raw) : null;
}
export async function reserveMoney(wallet: string, jobId: string, amount: bigint, fingerprint: string,
    expiresAt: number, kind: MoneyJob['kind'] = 'chat', extra?: { key: string; value: string }): Promise<MoneyJob & { acquired: boolean }> {
    wallet = walletId(wallet); const ak = accountKey(wallet), jk = jobKey(jobId);
    if (amount <= 0n || amount > MAX_NANO || expiresAt <= Date.now()) throw new MoneyError('invalid_reservation');
    return atomic<MoneyJob & { acquired: boolean }>([SYS, ak, jk, ...(extra ? [extra.key] : [])], old => {
        if (old[jk]) {
            const previous: MoneyJob = JSON.parse(old[jk]!);
            if (previous.wallet !== wallet || previous.amount !== String(amount) || previous.fingerprint !== fingerprint)
                throw new MoneyError('idempotency_conflict');
            return { value: { ...previous, acquired: false } };
        }
        system(old[SYS]); const a = parseAccount(old[ak]);
        change(a, 'available', -amount); change(a, 'reserved', amount);
        const job: MoneyJob = { id: jobId, wallet, amount: String(amount), available: String(amount),
            state: 'reserved', kind, fingerprint, expiresAt, createdAt: Date.now() };
        const writes = { [ak]: JSON.stringify(a), [jk]: JSON.stringify(job), ...(extra ? { [extra.key]: extra.value } : {}) };
        return { value: { ...job, acquired: true }, tx: { writes, due: { id: jobId, at: expiresAt } } };
    });
}
export async function captureMoney(jobId: string, executorWallet: string, result: unknown): Promise<MoneyJob> {
    const known = await moneyJob(jobId);
    if (!known) throw new MoneyError('reservation_not_found');
    executorWallet = walletId(executorWallet);
    const payer = accountKey(known.wallet), executor = accountKey(executorWallet);
    const protocol = PREFIX + 'fund:protocol', reserve = PREFIX + 'fund:reserve', jk = jobKey(jobId), responseKey = PREFIX+'response:'+jobId;
    return atomic([SYS, payer, executor, protocol, reserve, jk, responseKey], old => {
        const job: MoneyJob = JSON.parse(old[jk]!);
        if (job.state === 'captured') {
            if (job.executor !== executorWallet) throw new MoneyError('idempotency_conflict');
            return { value: job };
        }
        if (job.state !== 'reserved' || job.kind === 'campaign' || job.expiresAt <= Date.now())
            throw new MoneyError('reservation_expired');
        system(old[SYS]); const amount = BigInt(job.amount), shares = splitNano(amount);
        const accounts = new Map<string,Account>();
        const get = (key: string) => { if (!accounts.has(key)) accounts.set(key, parseAccount(old[key])); return accounts.get(key)!; };
        change(get(payer), 'reserved', -amount);
        change(get(executor), 'pending', shares.executor);
        change(get(executor), 'earned', shares.executor);
        const p = BigInt(old[protocol] ? JSON.parse(old[protocol]!).nano : '0') + shares.protocol, r = BigInt(old[reserve] ? JSON.parse(old[reserve]!).nano : '0') + shares.reserve;
        job.state = 'captured'; job.available = '0'; job.executor = executorWallet;
        job.result = { digest: digest(result), retention: 'private_response_10_minutes' }; job.finishedAt = Date.now();
        const writes: Record<string,string> = { [jk]: JSON.stringify(job), [responseKey]: JSON.stringify(result), [protocol]: JSON.stringify({ nano: String(p) }), [reserve]: JSON.stringify({ nano: String(r) }) };
        for (const [key,a] of accounts) writes[key] = JSON.stringify(a);
        return { value: job, tx: { writes, due: { id: jobId, at: null }, expires: { [responseKey]: 600 } } };
    });
}
export async function releaseMoney(jobId: string, wallet?: string): Promise<MoneyJob> {
    const known = await moneyJob(jobId); if (!known) throw new MoneyError('reservation_not_found');
    if (wallet && walletId(wallet) !== known.wallet) throw new MoneyError('wallet_mismatch');
    const ak = accountKey(known.wallet), jk = jobKey(jobId);
    return atomic([ak, jk], old => {
        const job: MoneyJob = JSON.parse(old[jk]!);
        if (job.state !== 'reserved') return { value: job };
        const amount = BigInt(job.available), a = parseAccount(old[ak]);
        change(a, 'reserved', -amount); change(a, 'available', amount);
        job.state = 'released'; job.available = '0'; job.finishedAt = Date.now();
        return { value: job, tx: { writes: { [ak]: JSON.stringify(a), [jk]: JSON.stringify(job) }, due: { id: jobId, at: null } } };
    });
}
export async function claimMoney(wallet: string) {
    const key = accountKey(wallet), journal = PREFIX + 'claim:' + randomUUID();
    return atomic([key, journal], old => {
        const a = parseAccount(old[key]), amount = BigInt(a.pending);
        if (amount === 0n) return { value: { amount, balance: BigInt(a.available) } };
        change(a,'pending',-amount); change(a,'available',amount);
        return { value: { amount, balance: BigInt(a.available) }, tx: { writes: {
            [key]: JSON.stringify(a), [journal]: JSON.stringify({ wallet: walletId(wallet), amount: String(amount),
                fee: '0', createdAt: Date.now() }) } } };
    });
}
/** Promo credits are service-only: no conversion to available/pending or campaign funding. */
export async function grantPromo(wallet: string, amount: bigint, reference: string) {
    const key = accountKey(wallet), journal = PREFIX + 'promo:' + id(reference);
    return atomic([key,journal], old => {
        if (old[journal]) return { value: false };
        const a = parseAccount(old[key]); change(a,'promo',amount);
        return { value: true, tx: { writes: { [key]: JSON.stringify(a),
            [journal]: JSON.stringify({ wallet: walletId(wallet), amount: String(amount), createdAt: Date.now() }) } } };
    });
}
export async function reserveCampaignTask(campaign: string, task: Record<string,unknown>, amount: bigint,
    expiresAt: number, metadata: Record<string,unknown>, fingerprint = digest(task)): Promise<MoneyJob> {
    const parentId = 'campaign:' + id(campaign), parent = await moneyJob(parentId);
    if (!parent) throw new MoneyError('reservation_not_found');
    const taskId = String(task.task_id), jk = jobKey(taskId), pk = jobKey(parentId), ck = 'campaign:' + campaign;
    return atomic([SYS,pk,jk,ck], old => {
        system(old[SYS]);
        if (old[jk]) {
            const previous: MoneyJob = JSON.parse(old[jk]!);
            if (previous.fingerprint !== fingerprint) throw new MoneyError('idempotency_conflict');
            return { value: previous };
        }
        const p: MoneyJob = JSON.parse(old[pk]!);
        if (p.state !== 'reserved' || p.expiresAt <= Date.now() || expiresAt > p.expiresAt)
            throw new MoneyError('reservation_expired');
        if (amount <= 0n || BigInt(p.available) < amount) throw new MoneyError('insufficient_balance');
        p.available = String(BigInt(p.available) - amount);
        const job: MoneyJob = { id: taskId, wallet: p.wallet, amount: String(amount), available: String(amount),
            state: 'reserved', kind: 'task', parent: parentId, fingerprint, expiresAt, createdAt: Date.now() };
        const data = JSON.parse(old[ck] || '{}');
        data.remaining_budget = Number(units(p.available));
        const queue = { ...metadata, ...task, reward_gstd: Number(units(splitNano(amount).executor)), protocol_fee: 0,
            funding_version: 2, funding_id: taskId };
        return { value: job, tx: { writes: { [pk]: JSON.stringify(p), [jk]: JSON.stringify(job), [ck]: JSON.stringify(data) },
            due: { id: taskId, at: expiresAt }, queue: { key: 'tasks:queue', value: JSON.stringify(queue) } } };
    });
}
export async function reapMoney(limit = 50) {
    const ids = await kvMoneyDue(Date.now(), limit);
    let released = 0;
    for (const jobId of ids) {
        const job = await moneyJob(jobId);
        if (job && job.state === 'reserved' && job.expiresAt <= Date.now()) { await releaseMoney(jobId); released++; }
    }
    return { checked: ids.length, released };
}
export async function readMoneySystem(): Promise<MoneySystem | null> {
    const raw = await kvGet(SYS); return raw ? JSON.parse(raw) : null;
}
/** Called only after an independently fetched mainnet snapshot and explicit admin inventory review.
 * No legacy balance is inferred or converted automatically. All allocations are journalled. */
export async function reconcileMoney(snapshot: { owner: string; jettonWallet: string; reserve: string },
    input: { manifest: string; legacyHold: string; migrationReviewed: boolean;
        allocations: { wallet: string; amount_nano: string; reference: string }[]; preserveLegacyHold?: boolean }) {
    id(input.manifest);
    if (!input.migrationReviewed || !/^\d+$/.test(input.legacyHold) || !/^\d+$/.test(snapshot.reserve))
        throw new MoneyError('inventory_review_required');
    if (input.allocations.length > 100) throw new MoneyError('too_many_allocations');
    const allocations = input.allocations.map(a => ({ wallet: walletId(a.wallet), amount: BigInt(a.amount_nano), ref: id(a.reference) }));
    if (allocations.some(a => a.amount <= 0n || a.amount > MAX_NANO) || new Set(allocations.map(a=>a.ref)).size !== allocations.length)
        throw new MoneyError('invalid_allocation');
    const journal = PREFIX + 'inventory:' + input.manifest;
    const keys = [SYS, journal, ...allocations.flatMap(a => [accountKey(a.wallet), PREFIX + 'allocation:' + a.ref])];
    return atomic(keys, old => {
        const previous: MoneySystem | null = old[SYS] ? JSON.parse(old[SYS]!) : null;
        const legacyHold = input.preserveLegacyHold && previous ? previous.legacyHold : input.legacyHold;
        if (previous && (previous.owner !== walletId(snapshot.owner) || previous.jettonWallet !== walletId(snapshot.jettonWallet)))
            throw new MoneyError('custody_change_requires_migration');
        if (previous?.payoutInFlight && allocations.some(a=>!old[PREFIX+'allocation:'+a.ref])) throw new MoneyError('payout_in_flight');
        let allocated = BigInt(previous?.allocated || '0');
        const writes: Record<string,string> = {};
        const review = JSON.stringify(input);
        if (old[journal] && JSON.parse(old[journal]!).review !== review) throw new MoneyError('idempotency_conflict');
        if (!old[journal]) writes[journal] = JSON.stringify({ review, snapshot, createdAt: Date.now() });
        const accounts = new Map<string,Account>();
        for (const a of allocations) {
            const receipt = PREFIX + 'allocation:' + a.ref;
            const record = JSON.stringify({ wallet: a.wallet, amount: String(a.amount), reference: a.ref });
            if (old[receipt]) { if (old[receipt] !== record) throw new MoneyError('idempotency_conflict'); continue; }
            const key = accountKey(a.wallet);
            if (!accounts.has(key)) accounts.set(key, parseAccount(old[key]));
            change(accounts.get(key)!, 'available', a.amount);
            allocated += a.amount; writes[receipt] = record;
        }
        for (const [key,a] of accounts) writes[key] = JSON.stringify(a);
        if (BigInt(snapshot.reserve) < allocated + BigInt(legacyHold)) throw new MoneyError('insufficient_backing');
        const s: MoneySystem = { owner: walletId(snapshot.owner), jettonWallet: walletId(snapshot.jettonWallet),
            reserve: snapshot.reserve, allocated: String(allocated), legacyHold,
            openedAt: previous?.openedAt || Date.now(), checkedAt: Date.now(), validUntil: Date.now() + 15 * 60_000,
            migrationReviewed: true, manifest: input.manifest, ...(previous?.payoutInFlight ? {payoutInFlight:previous.payoutInFlight} : {}) };
        writes[SYS] = JSON.stringify(s);
        return { value: s, tx: { writes } };
    });
}
export async function refreshBacking(snapshot: { owner: string; jettonWallet: string; reserve: string }) {
    return atomic([SYS], old => {
        if (!old[SYS]) throw new MoneyError('backing_not_reconciled');
        const s: MoneySystem = JSON.parse(old[SYS]!);
        if (s.owner !== walletId(snapshot.owner) || s.jettonWallet !== walletId(snapshot.jettonWallet))
            throw new MoneyError('custody_mismatch');
        s.reserve = s.payoutInFlight && BigInt(snapshot.reserve)>BigInt(s.reserve) ? s.reserve : snapshot.reserve; s.checkedAt = Date.now(); s.validUntil = Date.now() + 15*60_000;
        return { value: s, tx: { writes: { [SYS]: JSON.stringify(s) } } };
    });
}

/** A service request consumes one nonwithdrawable promo unit and creates no token reward. */
export async function consumePromoRequest(wallet: string, reference: string): Promise<boolean> {
    const key = accountKey(wallet), journal = PREFIX + 'promo-use:' + id(reference);
    return atomic([key,journal], old => {
        if (old[journal]) return { value: true };
        const a = parseAccount(old[key]);
        if (BigInt(a.promo) < 1_000_000_000n) return { value: false };
        change(a,'promo',-1_000_000_000n);
        return { value: true, tx: { writes: { [key]: JSON.stringify(a),
            [journal]: JSON.stringify({ wallet: walletId(wallet), requests: 1, createdAt: Date.now() }) } } };
    });
}

export type Withdrawal = { id: string; wallet: string; amount: string; queryId: string;
    state: 'requested' | 'dispatching' | 'submitted' | 'confirmed' | 'cancelled';
    createdAt: number; dispatchedAt?: number; validUntil?: number; bocHash?: string;
    receiptHash?: string; reserveAtDispatch?: string; walletSeqno?:string; confirmedAt?: number;
    cancellationReason?: 'user_cancelled' | 'operator_declined'; cancelledAt?: number };
const WQUEUE = PREFIX + 'withdraw-queue';
const withdrawalKey = (withdrawalId: string) => PREFIX + 'withdrawal:' + id(withdrawalId);
const withdrawalIndex = (wallet: string) => PREFIX + 'withdraw-index:' + walletId(wallet);
const withdrawalRequestRateKey = (wallet: string) => PREFIX + 'withdraw-request-rate:' + walletId(wallet);
export const WITHDRAWAL_REQUEST_COOLDOWN_SECONDS = 60;
export async function getWithdrawal(withdrawalId: string): Promise<Withdrawal | null> {
    const raw = await kvGet(withdrawalKey(withdrawalId)); return raw ? JSON.parse(raw) : null;
}
export async function listWithdrawals(wallet?: string): Promise<Withdrawal[]> {
    const ids = JSON.parse(await kvGet(wallet ? withdrawalIndex(wallet) : WQUEUE) || '[]') as string[];
    const values = await kvMGet(ids.slice(-200).map(withdrawalKey));
    return values.filter((v): v is string => !!v).map(v=>JSON.parse(v));
}
export async function requestWithdrawal(wallet: string, amount: bigint, requestId: string): Promise<Withdrawal> {
    wallet = walletId(wallet); id(requestId);
    if (amount <= 0n || amount > MAX_NANO) throw new MoneyError('invalid_amount');
    const withdrawalId = digest(['withdrawal',wallet,requestId]), key = withdrawalKey(withdrawalId);
    const ak = accountKey(wallet), index = withdrawalIndex(wallet), rateKey = withdrawalRequestRateKey(wallet);
    return atomic<Withdrawal>([SYS,ak,key,index,WQUEUE,rateKey], old=>{
        if (old[key]) {
            const previous: Withdrawal = JSON.parse(old[key]!);
            if (previous.amount !== String(amount)) throw new MoneyError('idempotency_conflict');
            return { value: previous };
        }
        system(old[SYS]);
        const queue: string[] = JSON.parse(old[WQUEUE] || '[]');
        const history: string[] = JSON.parse(old[index] || '[]');
        if (queue.length >= 200) throw new MoneyError('withdrawal_queue_full');
        if (history.some(item=>queue.includes(item))) throw new MoneyError('withdrawal_already_pending');
        const lastRequested = Number(old[rateKey] || '0');
        if (!Number.isSafeInteger(lastRequested) || lastRequested < 0) throw new MoneyError('invalid_ledger');
        if (Date.now() - lastRequested < WITHDRAWAL_REQUEST_COOLDOWN_SECONDS * 1000)
            throw new MoneyError('withdrawal_request_cooldown');
        const a = parseAccount(old[ak]);
        change(a,'available',-amount); change(a,'reserved',amount);
        const withdrawal: Withdrawal = { id: withdrawalId, wallet, amount: String(amount),
            queryId: String(BigInt('0x'+withdrawalId.slice(0,16))), state: 'requested', createdAt: Date.now() };
        queue.push(withdrawalId); history.push(withdrawalId);
        return { value: withdrawal, tx: { writes: { [ak]: JSON.stringify(a), [key]: JSON.stringify(withdrawal),
            [index]: JSON.stringify(history.slice(-1000)), [WQUEUE]: JSON.stringify(queue),
            [rateKey]: String(Date.now()) }, expires: { [rateKey]: WITHDRAWAL_REQUEST_COOLDOWN_SECONDS } } };
    });
}
export async function cancelWithdrawal(withdrawalId: string, wallet: string): Promise<Withdrawal> {
    const known = await getWithdrawal(withdrawalId);
    if (!known || known.wallet !== walletId(wallet)) throw new MoneyError('withdrawal_not_found');
    const key=withdrawalKey(withdrawalId),ak=accountKey(wallet);
    return atomic([ak,key,WQUEUE],old=>{
        const w: Withdrawal=JSON.parse(old[key]!);
        if (w.state === 'cancelled') return { value:w };
        // No timeout or user assertion may unlock a possibly broadcast transfer.
        if (w.state !== 'requested') throw new MoneyError('withdrawal_requires_chain_reconciliation');
        const a=parseAccount(old[ak]),amount=BigInt(w.amount);
        change(a,'reserved',-amount);change(a,'available',amount);w.state='cancelled';
        w.cancellationReason='user_cancelled';w.cancelledAt=Date.now();
        const queue: string[]=JSON.parse(old[WQUEUE]||'[]');
        return {value:w,tx:{writes:{[ak]:JSON.stringify(a),[key]:JSON.stringify(w),
            [WQUEUE]:JSON.stringify(queue.filter(item=>item!==withdrawalId))}}};
    });
}
/** The custody owner can free a queued request without a chain transaction.
 * Once dispatch wins the atomic race, only chain reconciliation may release it. */
export async function rejectWithdrawal(withdrawalId: string, owner: string): Promise<Withdrawal> {
    const known = await getWithdrawal(withdrawalId);
    if (!known) throw new MoneyError('withdrawal_not_found');
    const key=withdrawalKey(withdrawalId),ak=accountKey(known.wallet);
    return atomic([SYS,ak,key,WQUEUE],old=>{
        if (!old[SYS] || JSON.parse(old[SYS]!).owner !== walletId(owner))
            throw new MoneyError('custody_owner_required');
        if (!old[key]) throw new MoneyError('withdrawal_not_found');
        const w:Withdrawal=JSON.parse(old[key]!);
        if (w.state === 'cancelled') return {value:w};
        if (w.state !== 'requested') throw new MoneyError('withdrawal_requires_chain_reconciliation');
        const a=parseAccount(old[ak]),amount=BigInt(w.amount);
        change(a,'reserved',-amount);change(a,'available',amount);
        w.state='cancelled';w.cancellationReason='operator_declined';w.cancelledAt=Date.now();
        const queue:string[]=JSON.parse(old[WQUEUE]||'[]');
        return {value:w,tx:{writes:{[ak]:JSON.stringify(a),[key]:JSON.stringify(w),
            [WQUEUE]:JSON.stringify(queue.filter(item=>item!==w.id))}}};
    });
}
export async function dispatchWithdrawal(withdrawalId: string, owner: string, walletSeqno: string): Promise<Withdrawal & { acquired: boolean }> {
    const key=withdrawalKey(withdrawalId);
    return atomic<Withdrawal & { acquired: boolean }>([SYS,key],old=>{
        const s=system(old[SYS]);
        if (s.owner !== walletId(owner)) throw new MoneyError('custody_owner_required');
        if (!old[key]) throw new MoneyError('withdrawal_not_found');
        const w:Withdrawal=JSON.parse(old[key]!);
        if (w.state !== 'requested') return {value:{...w,acquired:false}};
        if (s.payoutInFlight) throw new MoneyError('another_payout_requires_reconciliation');
        w.state='dispatching';w.dispatchedAt=Date.now();w.validUntil=Math.floor(Date.now()/1000)+600;
        if(!/^\d+$/.test(walletSeqno))throw new MoneyError('invalid_wallet_seqno');
        w.reserveAtDispatch=s.reserve;w.walletSeqno=walletSeqno;s.payoutInFlight=w.id;
        return {value:{...w,acquired:true},tx:{writes:{[SYS]:JSON.stringify(s),[key]:JSON.stringify(w)}}};
    });
}
export async function noteWithdrawalSubmission(withdrawalId: string, owner: string, bocHash: string) {
    if (!/^[a-f0-9]{64}$/.test(bocHash)) throw new MoneyError('invalid_message_hash');
    const key=withdrawalKey(withdrawalId);
    return atomic([SYS,key],old=>{
        if (!old[SYS] || JSON.parse(old[SYS]!).owner !== walletId(owner)) throw new MoneyError('custody_owner_required');
        if (!old[key]) throw new MoneyError('withdrawal_not_found');
        const w:Withdrawal=JSON.parse(old[key]!);
        if (w.state === 'confirmed') return {value:w};
        if (w.bocHash && w.bocHash !== bocHash) throw new MoneyError('idempotency_conflict');
        if (w.state !== 'dispatching' && w.state !== 'submitted') throw new MoneyError('invalid_withdrawal_state');
        w.state='submitted';w.bocHash=bocHash;
        return {value:w,tx:{writes:{[key]:JSON.stringify(w)}}};
    });
}
/** Receipt must be independently verified by custody.ts before entering this transaction. */
export async function confirmWithdrawal(withdrawalId: string,
    proof: { hash: string; amount: string; sender: string; queryId: string; utime: number },
    snapshot: { owner: string; jettonWallet: string; reserve: string }): Promise<Withdrawal> {
    const known=await getWithdrawal(withdrawalId);
    if (!known) throw new MoneyError('withdrawal_not_found');
    const key=withdrawalKey(withdrawalId),ak=accountKey(known.wallet),receipt=PREFIX+'withdraw-receipt:'+id(proof.hash);
    return atomic([SYS,ak,key,receipt,WQUEUE],old=>{
        const w:Withdrawal=JSON.parse(old[key]!);
        if (w.state==='confirmed') {
            if (w.receiptHash!==proof.hash) throw new MoneyError('idempotency_conflict');
            return {value:w};
        }
        const s:MoneySystem=JSON.parse(old[SYS]!);
        if (w.state!=='dispatching' && w.state!=='submitted') throw new MoneyError('invalid_withdrawal_state');
        if (s.payoutInFlight!==w.id || s.owner!==walletId(proof.sender) ||
            s.owner!==walletId(snapshot.owner) || s.jettonWallet!==walletId(snapshot.jettonWallet) ||
            proof.amount!==w.amount || proof.queryId!==w.queryId ||
            proof.utime < Math.floor(w.dispatchedAt!/1000)) throw new MoneyError('withdrawal_receipt_mismatch');
        if (old[receipt]) throw new MoneyError('withdrawal_receipt_already_used');
        const amount=BigInt(w.amount),a=parseAccount(old[ak]);
        change(a,'reserved',-amount);
        if (BigInt(s.allocated)<amount) throw new MoneyError('invalid_ledger');
        s.allocated=String(BigInt(s.allocated)-amount);
        const dispatchReserve=BigInt(w.reserveAtDispatch!);
        const conservative=dispatchReserve>amount?dispatchReserve-amount:0n;
        s.reserve=String([BigInt(snapshot.reserve),BigInt(s.reserve),conservative].reduce((a,b)=>a<b?a:b));
        s.checkedAt=Date.now();s.validUntil=Date.now()+15*60_000;delete s.payoutInFlight;
        w.state='confirmed';w.receiptHash=proof.hash;w.confirmedAt=Date.now();
        const queue:string[]=JSON.parse(old[WQUEUE]||'[]');
        return {value:w,tx:{writes:{[SYS]:JSON.stringify(s),[ak]:JSON.stringify(a),[key]:JSON.stringify(w),
            [receipt]:JSON.stringify({withdrawal:w.id,hash:proof.hash,amount:w.amount}),
            [WQUEUE]:JSON.stringify(queue.filter(item=>item!==w.id))}}};
    });
}

/** No automatic timeout unlock after dispatch. The API independently proves
 * the signed window expired on-chain and the custody wallet seqno never moved. */
export async function expireUnsentWithdrawal(withdrawalId:string,
    evidence:{seqno:string;chainTime:number}):Promise<Withdrawal> {
    const known=await getWithdrawal(withdrawalId);
    if(!known)throw new MoneyError('withdrawal_not_found');
    const key=withdrawalKey(withdrawalId),ak=accountKey(known.wallet);
    return atomic([SYS,key,ak,WQUEUE],old=>{
        const s:MoneySystem=JSON.parse(old[SYS]!),w:Withdrawal=JSON.parse(old[key]!);
        if(w.state==='cancelled')return{value:w};
        if(w.state!=='dispatching'||w.bocHash||s.payoutInFlight!==w.id||!w.validUntil||
            Date.now()/1000<=w.validUntil+120||evidence.chainTime<=w.validUntil+120||
            w.walletSeqno!==evidence.seqno)throw new MoneyError('withdrawal_requires_chain_reconciliation');
        const a=parseAccount(old[ak]),amount=BigInt(w.amount);
        change(a,'reserved',-amount);change(a,'available',amount);w.state='cancelled';delete s.payoutInFlight;
        const queue:string[]=JSON.parse(old[WQUEUE]||'[]');
        return{value:w,tx:{writes:{[SYS]:JSON.stringify(s),[key]:JSON.stringify(w),[ak]:JSON.stringify(a),
            [WQUEUE]:JSON.stringify(queue.filter(item=>item!==w.id))}}};
    });
}
