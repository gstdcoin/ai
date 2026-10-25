/**
 * KV Storage abstraction
 *
 * Production: Upstash Redis REST API
 * Development: in-memory fallback (no setup needed)
 *
 * Production requires KV_REST_API_URL and KV_REST_API_TOKEN. The in-memory
 * fallback is development-only because it is not shared or durable.
 */

import { Redis } from '@upstash/redis/cloudflare';
import { logger } from './logger';

// ── In-memory fallback for local dev ──────────────────────────────
const mem = new Map<string, { value: string; exp: number | null }>();
const ALLOW_MEMORY_FALLBACK = process.env.NODE_ENV !== 'production';

function handleRedisFailure(operation: string, error: unknown): void {
    const fallback = ALLOW_MEMORY_FALLBACK
        ? 'using in-memory fallback in development'
        : 'in-memory fallback is disabled in production';
    logger.error(`${operation} failed; ${fallback}`, error);
    if (!ALLOW_MEMORY_FALLBACK) throw error;
}

function memGet(key: string): string | null {
    const entry = mem.get(key);
    if (!entry) return null;
    if (entry.exp !== null && entry.exp < Date.now()) { mem.delete(key); return null; }
    return entry.value;
}
function memSet(key: string, value: string, ttlSec?: number): void {
    mem.set(key, { value, exp: ttlSec ? Date.now() + ttlSec * 1000 : null });
}
function memDel(key: string): void { mem.delete(key); }
function memKeys(prefix: string): string[] {
    const now = Date.now();
    return Array.from(mem.entries())
        .filter(([k, v]) => k.startsWith(prefix) && (v.exp === null || v.exp > now))
        .map(([k]) => k);
}

function isJsonObject(value: string): boolean {
    try {
        const parsed: unknown = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed);
    } catch {
        return false;
    }
}

// ── Upstash Redis client ───────────────────────────────────────────
let _redis: Redis | null = null;

async function getRedis(): Promise<Redis | null> {
    if (_redis) return _redis;
    const url   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (!ALLOW_MEMORY_FALLBACK) {
            throw new Error('Upstash Redis credentials are required in production');
        }
        return null;
    }
    try {
        _redis = new Redis({ url, token });
        return _redis;
    } catch (error) {
        if (!ALLOW_MEMORY_FALLBACK) {
            logger.error('Failed to initialize Upstash Redis in production', error);
            throw error;
        }
        return null;
    }
}

// ── Public API ─────────────────────────────────────────────────────

export async function kvGet(key: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        try {
            const val = await r.get(key);
            if (val == null) return null;
            // Upstash auto-parses JSON strings into objects — serialize back to string
            return typeof val === 'string' ? val : JSON.stringify(val);
        } catch (e) { handleRedisFailure(`kvGet('${key}')`, e); }
    }
    return memGet(key);
}

export async function kvSet(key: string, value: string, ttlSec?: number): Promise<void> {
    const r = await getRedis();
    if (r) {
        try {
            if (ttlSec) await r.set(key, value, { ex: ttlSec });
            else        await r.set(key, value);
            return;
        } catch (e) { handleRedisFailure(`kvSet('${key}')`, e); }
    }
    memSet(key, value, ttlSec);
}

export async function kvSetNX(key: string, value: string, ttlSec: number): Promise<boolean> {
    const r = await getRedis();
    if (r) {
        try {
            return (await r.set(key, value, { nx: true, ex: ttlSec })) === 'OK';
        } catch (e) { handleRedisFailure(`kvSetNX('${key}')`, e); }
    }
    if (memGet(key) !== null) return false;
    memSet(key, value, ttlSec);
    return true;
}

const localRateLimits = new Map<string, { count: number; expiresAt: number }>();

export async function kvRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    if (!key || !Number.isSafeInteger(maxRequests) || maxRequests < 1
        || !Number.isSafeInteger(windowMs) || windowMs < 1) {
        throw new Error('Invalid rate limit configuration');
    }

    const r = await getRedis();
    if (r) {
        const script = `
            local count = redis.call('INCR', KEYS[1])
            if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
            return count
        `;
        try {
            const count = await r.eval<[string], number>(script, [key], [String(windowMs)]);
            return count <= maxRequests;
        } catch (e) {
            handleRedisFailure(`kvRateLimit('${key}')`, e);
        }
    }

    const now = Date.now();
    const entry = localRateLimits.get(key);
    if (!entry || entry.expiresAt <= now) {
        localRateLimits.set(key, { count: 1, expiresAt: now + windowMs });
        return true;
    }
    entry.count += 1;
    if (localRateLimits.size > 5000) {
        for (const [storedKey, value] of localRateLimits) {
            if (value.expiresAt <= now) localRateLimits.delete(storedKey);
        }
    }
    return entry.count <= maxRequests;
}

export type MobileRewardClaimResult =
    | { status: 'claimed'; amount: number; balance: number }
    | { status: 'insufficient'; amount: number }
    | { status: 'not_found' }
    | { status: 'wallet_mismatch' }
    | { status: 'invalid' };

export async function kvClaimMobileRewards(
    sessionKey: string,
    balanceKey: string,
    walletAddress: string,
    nowTs: number,
    minimumClaim: number,
    sessionTtlSec: number,
): Promise<MobileRewardClaimResult> {
    const r = await getRedis();
    if (r) {
        const script = `
            local raw = redis.call('GET', KEYS[1])
            if not raw then return {'not_found'} end
            local ok, session = pcall(cjson.decode, raw)
            if not ok or type(session) ~= 'table' then return {'invalid'} end
            local requestedWallet = ARGV[1]
            local storedWallet = session.wallet_address or ''
            if storedWallet ~= '' and storedWallet ~= requestedWallet then
                return {'wallet_mismatch'}
            end
            local accrued = tonumber(session.accumulated_gstd or 0)
            local rate = tonumber(session.rate_per_hour or 0)
            local lastHeartbeat = tonumber(session.last_heartbeat_ts or 0)
            local now = tonumber(ARGV[2])
            if not accrued or accrued < 0 or not rate or rate < 0 or not now then
                return {'invalid'}
            end
            if lastHeartbeat > 0 and now > lastHeartbeat then
                accrued = accrued + ((now - lastHeartbeat) / 3600000) * rate
            end
            if accrued < tonumber(ARGV[3]) then
                return {'insufficient', tostring(accrued)}
            end
            local currentBalance = tonumber(redis.call('GET', KEYS[2]) or '0')
            if not currentBalance or currentBalance < 0 then return {'invalid'} end
            redis.call('INCRBYFLOAT', KEYS[2], tostring(accrued))
            currentBalance = currentBalance + accrued
            session.accumulated_gstd = 0
            session.last_heartbeat_ts = now
            session.wallet_address = requestedWallet
            redis.call('SET', KEYS[1], cjson.encode(session), 'EX', tonumber(ARGV[4]))
            redis.call('INCR', KEYS[3])
            return {'claimed', tostring(accrued), tostring(currentBalance)}
        `;
        try {
            const result = await r.eval<string[], [string, string, string, string]>(
                script,
                [sessionKey, balanceKey, 'stats:mobile_total_claimed'],
                [walletAddress, String(nowTs), String(minimumClaim), String(sessionTtlSec)],
            );
            const status = result[0];
            if (status === 'claimed') {
                return { status, amount: Number(result[1]), balance: Number(result[2]) };
            }
            if (status === 'insufficient') return { status, amount: Number(result[1]) };
            if (status === 'not_found' || status === 'wallet_mismatch' || status === 'invalid') {
                return { status };
            }
            return { status: 'invalid' };
        } catch (e) {
            handleRedisFailure(`kvClaimMobileRewards('${sessionKey}')`, e);
        }
    }

    const raw = memGet(sessionKey);
    if (!raw) return { status: 'not_found' };
    let session: Record<string, any>;
    try {
        session = JSON.parse(raw);
    } catch {
        return { status: 'invalid' };
    }
    const requestedWallet = walletAddress;
    const storedWallet = String(session.wallet_address || '');
    if (storedWallet && storedWallet !== requestedWallet) return { status: 'wallet_mismatch' };
    const accrued = Number(session.accumulated_gstd || 0);
    const rate = Number(session.rate_per_hour || 0);
    const lastHeartbeat = Number(session.last_heartbeat_ts || 0);
    if (!Number.isFinite(accrued) || accrued < 0 || !Number.isFinite(rate) || rate < 0) {
        return { status: 'invalid' };
    }
    const amount = accrued + (lastHeartbeat > 0 && nowTs > lastHeartbeat
        ? ((nowTs - lastHeartbeat) / 3_600_000) * rate
        : 0);
    if (amount < minimumClaim) return { status: 'insufficient', amount };
    const currentBalance = Number(memGet(balanceKey) || 0);
    if (!Number.isFinite(currentBalance) || currentBalance < 0) return { status: 'invalid' };
    session.accumulated_gstd = 0;
    session.last_heartbeat_ts = nowTs;
    session.wallet_address = requestedWallet;
    memSet(sessionKey, JSON.stringify(session), sessionTtlSec);
    const balance = currentBalance + amount;
    memSet(balanceKey, String(balance));
    memSet(
        'stats:mobile_total_claimed',
        String((Number(memGet('stats:mobile_total_claimed')) || 0) + 1),
    );
    return { status: 'claimed', amount, balance };
}

export type BalanceDebitResult =
    | { status: 'debited'; balance: number }
    | { status: 'insufficient'; balance: number }
    | { status: 'invalid' };

export async function kvDebitBalance(
    wallet: string,
    amount: number,
    increments: Array<{ key: string; amount: number }> = [],
): Promise<BalanceDebitResult> {
    if (!wallet || !Number.isFinite(amount) || amount <= 0
        || increments.some(item => !item.key || item.key === `balance:${wallet.toLowerCase()}`
            || !Number.isFinite(item.amount))
        || new Set(increments.map(item => item.key)).size !== increments.length) {
        return { status: 'invalid' };
    }

    const balanceKey = `balance:${wallet.toLowerCase()}`;
    const keys = [balanceKey, ...increments.map(item => item.key)];
    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            local balanceType = redis.call('TYPE', KEYS[1]).ok
            if balanceType ~= 'none' and balanceType ~= 'string' then return {'invalid'} end
            local rawBalance = redis.call('GET', KEYS[1])
            local balance = tonumber(rawBalance or '0')
            if not finite(balance) then return {'invalid'} end
            local charge = tonumber(ARGV[1])
            if not finite(charge) or charge <= 0 then return {'invalid'} end
            if balance < charge then return {'insufficient', tostring(balance)} end

            for index = 2, #KEYS do
                local valueType = redis.call('TYPE', KEYS[index]).ok
                if valueType ~= 'none' and valueType ~= 'string' then return {'invalid'} end
                local rawValue = redis.call('GET', KEYS[index])
                local current = tonumber(rawValue or '0')
                local increment = tonumber(ARGV[index])
                if not finite(current) or not finite(increment) or not finite(current + increment) then
                    return {'invalid'}
                end
            end
            if not finite(balance - charge) then return {'invalid'} end

            local remaining = redis.call('INCRBYFLOAT', KEYS[1], -charge)
            for index = 2, #KEYS do
                redis.call('INCRBYFLOAT', KEYS[index], ARGV[index])
            end
            return {'debited', tostring(remaining)}
        `;
        try {
            const result = await r.eval<string[], [string, string?]>(
                script,
                keys,
                [String(amount), ...increments.map(item => String(item.amount))],
            );
            if (result[0] === 'debited' && result[1] !== undefined) {
                return { status: 'debited', balance: Number(result[1]) };
            }
            if (result[0] === 'insufficient' && result[1] !== undefined) {
                return { status: 'insufficient', balance: Number(result[1]) };
            }
            return { status: 'invalid' };
        } catch (e) { handleRedisFailure(`kvDebitBalance('${balanceKey}')`, e); }
    }

    const rawBalance = memGet(balanceKey);
    const balance = Number(rawBalance || '0');
    if (!Number.isFinite(balance)) return { status: 'invalid' };
    if (balance < amount) return { status: 'insufficient', balance };
    for (const increment of increments) {
        const rawValue = memGet(increment.key);
        if (rawValue !== null && !Number.isFinite(Number(rawValue))) return { status: 'invalid' };
    }
    const remaining = Math.round((balance - amount) * 1e9) / 1e9;
    memSet(balanceKey, String(remaining));
    for (const increment of increments) {
        const current = Number(memGet(increment.key) || '0');
        const next = Math.round((current + increment.amount) * 1e9) / 1e9;
        memSet(increment.key, String(next));
    }
    return { status: 'debited', balance: remaining };
}

export type ClaimPendingResult =
    | { status: 'claimed'; gross: number; net: number; balance: number }
    | { status: 'nothing' }
    | { status: 'invalid' };

/**
 * Atomically moves `rewards:pending:{wallet}` into `balance:{wallet}` (minus optional fee shares
 * credited to other keys). Concurrent claims can never credit the same pending amount twice.
 */
export async function kvClaimPending(
    walletKey: string,
    minAmount: number,
    fees: Array<{ key: string; pct: number }> = [],
): Promise<ClaimPendingResult> {
    const wallet = walletKey.toLowerCase();
    const pendingKey = `rewards:pending:${wallet}`;
    const balanceKey = `balance:${wallet}`;
    const totalPct = fees.reduce((s, f) => s + f.pct, 0);
    const destinationKeys = [balanceKey, ...fees.map(f => f.key)];
    if (!wallet || !Number.isFinite(minAmount) || minAmount < 0
        || fees.some(f => !f.key || !Number.isFinite(f.pct) || f.pct < 0)
        || !Number.isFinite(totalPct) || totalPct >= 1
        || new Set(destinationKeys).size !== destinationKeys.length
        || destinationKeys.includes(pendingKey)) {
        return { status: 'invalid' };
    }

    const round = (v: number) => Math.round(v * 1e6) / 1e6;
    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(v) return v and v == v and v ~= math.huge and v ~= -math.huge end
            local minAmount = tonumber(ARGV[1])
            if not finite(minAmount) or minAmount < 0 then return {'invalid'} end
            local t = redis.call('TYPE', KEYS[1]).ok
            if t ~= 'none' and t ~= 'string' then return {'invalid'} end
            local gross = tonumber(redis.call('GET', KEYS[1]) or '0')
            if not finite(gross) or gross < 0 then return {'invalid'} end
            if gross < minAmount or gross <= 0 then return {'nothing'} end
            local function r6(v) return math.floor(v * 1e6 + 0.5) / 1e6 end
            local destinationBalances = {}
            for i = 2, #KEYS do
                local destinationType = redis.call('TYPE', KEYS[i]).ok
                if destinationType ~= 'none' and destinationType ~= 'string' then return {'invalid'} end
                local destinationBalance = tonumber(redis.call('GET', KEYS[i]) or '0')
                if not finite(destinationBalance) or destinationBalance < 0 then return {'invalid'} end
                destinationBalances[i] = destinationBalance
            end
            local net = gross
            local n = (#ARGV - 1)
            local shares = {}
            for i = 1, n do
                local pct = tonumber(ARGV[i + 1])
                if not finite(pct) or pct < 0 then return {'invalid'} end
                local share = r6(gross * pct)
                if not finite(share) or not finite(destinationBalances[i + 2] + share) then
                    return {'invalid'}
                end
                shares[i] = share
                net = net - share
            end
            net = r6(net)
            if not finite(net) or net < 0 or not finite(destinationBalances[2] + net) then
                return {'invalid'}
            end
            redis.call('SET', KEYS[1], '0')
            for i = 1, n do
                redis.call('INCRBYFLOAT', KEYS[i + 2], tostring(shares[i]))
            end
            local bal = redis.call('INCRBYFLOAT', KEYS[2], tostring(net))
            return {'claimed', tostring(gross), tostring(net), tostring(bal)}
        `;
        try {
            const res = await r.eval<string[], string[]>(
                script,
                [pendingKey, balanceKey, ...fees.map(f => f.key)],
                [String(minAmount), ...fees.map(f => String(f.pct))],
            );
            if (res[0] === 'claimed') {
                return { status: 'claimed', gross: Number(res[1]), net: Number(res[2]), balance: Number(res[3]) };
            }
            return { status: res[0] === 'nothing' ? 'nothing' : 'invalid' };
        } catch (e) { handleRedisFailure(`kvClaimPending('${pendingKey}')`, e); }
    }

    const gross = Number(memGet(pendingKey) || '0');
    if (!Number.isFinite(gross) || gross < 0) return { status: 'invalid' };
    if (gross < minAmount || gross <= 0) return { status: 'nothing' };

    const balances = destinationKeys.map(key => {
        const raw = memGet(key);
        const balance = raw === null ? 0 : Number(raw);
        return Number.isFinite(balance) && balance >= 0 ? balance : null;
    });
    if (balances.some(balance => balance === null)) return { status: 'invalid' };

    let net = gross;
    const feeShares = fees.map(f => {
        const share = round(gross * f.pct);
        net -= share;
        return share;
    });
    net = round(net);
    const updatedFeeBalances = feeShares.map((share, index) => round((balances[index + 1] ?? 0) + share));
    const balance = round((balances[0] ?? 0) + net);
    if (!Number.isFinite(net) || net < 0 || !Number.isFinite(balance)
        || updatedFeeBalances.some(value => !Number.isFinite(value))) {
        return { status: 'invalid' };
    }

    fees.forEach((fee, index) => memSet(fee.key, String(updatedFeeBalances[index])));
    memSet(pendingKey, '0');
    memSet(balanceKey, String(balance));
    return { status: 'claimed', gross, net, balance };
}

export type FundedRecordResult =
    | { status: 'created'; balance: number }
    | { status: 'insufficient'; balance: number }
    | { status: 'exists' }
    | { status: 'invalid' };

export async function kvCreateFundedCampaign(
    wallet: string,
    amount: number,
    protocolFee: number,
    campaignKey: string,
    campaignJson: string,
    ttlSec: number,
): Promise<FundedRecordResult> {
    const balanceKey = `balance:${wallet.toLowerCase()}`;
    const keys = [balanceKey, campaignKey, 'stats:protocol_treasury_gstd', 'stats:total_campaigns'];
    if (!wallet || !campaignKey || !Number.isFinite(amount) || amount <= 0
        || !Number.isFinite(protocolFee) || protocolFee < 0 || protocolFee > amount
        || !Number.isInteger(ttlSec) || ttlSec < 1 || !isJsonObject(campaignJson)
        || new Set(keys).size !== keys.length) {
        return { status: 'invalid' };
    }

    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            if redis.call('EXISTS', KEYS[2]) == 1 then return {'exists'} end
            for index = 1, #KEYS do
                local valueType = redis.call('TYPE', KEYS[index]).ok
                if valueType ~= 'none' and valueType ~= 'string' then return {'invalid'} end
            end
            local balance = tonumber(redis.call('GET', KEYS[1]) or '0')
            local feeTotal = tonumber(redis.call('GET', KEYS[3]) or '0')
            local campaignCount = tonumber(redis.call('GET', KEYS[4]) or '0')
            local amount = tonumber(ARGV[1])
            local fee = tonumber(ARGV[2])
            if not finite(balance) or not finite(feeTotal) or not finite(campaignCount)
                or campaignCount < 0 or campaignCount ~= math.floor(campaignCount)
                or not finite(amount) or amount <= 0 or not finite(fee) or fee < 0
                or fee > amount or not finite(feeTotal + fee) then
                return {'invalid'}
            end
            if balance < amount then return {'insufficient', tostring(balance)} end

            local remaining = redis.call('INCRBYFLOAT', KEYS[1], -amount)
            if fee > 0 then redis.call('INCRBYFLOAT', KEYS[3], fee) end
            redis.call('SET', KEYS[2], ARGV[3], 'EX', tonumber(ARGV[4]))
            redis.call('INCR', KEYS[4])
            return {'created', tostring(remaining)}
        `;
        try {
            const result = await r.eval<string[], [string, string?]>(
                script,
                keys,
                [String(amount), String(protocolFee), campaignJson, String(ttlSec)],
            );
            if (result[0] === 'created' && result[1] !== undefined) {
                return { status: 'created', balance: Number(result[1]) };
            }
            if (result[0] === 'insufficient' && result[1] !== undefined) {
                return { status: 'insufficient', balance: Number(result[1]) };
            }
            return result[0] === 'exists' ? { status: 'exists' } : { status: 'invalid' };
        } catch (e) { handleRedisFailure(`kvCreateFundedCampaign('${campaignKey}')`, e); }
    }

    const rawBalance = memGet(balanceKey);
    const balance = Number(rawBalance || '0');
    const treasury = Number(memGet(keys[2]) || '0');
    const campaignCount = Number(memGet(keys[3]) || '0');
    if (memGet(campaignKey) !== null) return { status: 'exists' };
    if (!Number.isFinite(balance) || !Number.isFinite(treasury) || !Number.isInteger(campaignCount)
        || !Number.isFinite(treasury + protocolFee) || !Number.isFinite(balance - amount)) {
        return { status: 'invalid' };
    }
    if (balance < amount) return { status: 'insufficient', balance };
    const remaining = Math.round((balance - amount) * 1e9) / 1e9;
    memSet(balanceKey, String(remaining));
    if (protocolFee > 0) memSet(keys[2], String(Math.round((treasury + protocolFee) * 1e9) / 1e9));
    memSet(campaignKey, campaignJson, ttlSec);
    memSet(keys[3], String(campaignCount + 1));
    return { status: 'created', balance: remaining };
}

export async function kvCreateFundedTrainingJob(
    wallet: string,
    amount: number,
    jobKey: string,
    jobJson: string,
    walletJobsKey: string,
    jobId: string,
    taskJsons: string[],
    ttlSec: number,
): Promise<FundedRecordResult> {
    const balanceKey = `balance:${wallet.toLowerCase()}`;
    const keys = [balanceKey, jobKey, walletJobsKey, 'tasks:queue', 'stats:training_jobs_submitted'];
    if (!wallet || !jobKey || !walletJobsKey || !jobId || !Number.isFinite(amount) || amount <= 0
        || !Number.isInteger(ttlSec) || ttlSec < 1 || !isJsonObject(jobJson) || taskJsons.length < 1
        || taskJsons.some(task => !isJsonObject(task))
        || new Set(keys).size !== keys.length) {
        return { status: 'invalid' };
    }

    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            if redis.call('EXISTS', KEYS[2]) == 1 then return {'exists'} end
            for index = 1, #KEYS do
                local valueType = redis.call('TYPE', KEYS[index]).ok
                if valueType ~= 'none' and valueType ~= 'string'
                    and not (index == 4 and valueType == 'list') then
                    return {'invalid'}
                end
            end
            local balance = tonumber(redis.call('GET', KEYS[1]) or '0')
            local submitted = tonumber(redis.call('GET', KEYS[5]) or '0')
            local oldJobIds = redis.call('GET', KEYS[3]) or ''
            local amount = tonumber(ARGV[1])
            if not finite(balance) or not finite(submitted) or submitted < 0
                or submitted ~= math.floor(submitted) or not finite(amount) or amount <= 0 then
                return {'invalid'}
            end
            if balance < amount then return {'insufficient', tostring(balance)} end

            local remaining = redis.call('INCRBYFLOAT', KEYS[1], -amount)
            redis.call('SET', KEYS[2], ARGV[2], 'EX', tonumber(ARGV[3]))
            local updatedIds = oldJobIds
            if updatedIds ~= '' then updatedIds = updatedIds .. '\\n' end
            updatedIds = updatedIds .. ARGV[4]
            redis.call('SET', KEYS[3], updatedIds, 'EX', tonumber(ARGV[3]))
            for index = 1, tonumber(ARGV[5]) do
                redis.call('LPUSH', KEYS[4], ARGV[5 + index])
            end
            redis.call('INCR', KEYS[5])
            return {'created', tostring(remaining)}
        `;
        try {
            const args = [String(amount), jobJson, String(ttlSec), jobId, String(taskJsons.length), ...taskJsons];
            const result = await r.eval<string[], [string, string?]>(script, keys, args);
            if (result[0] === 'created' && result[1] !== undefined) {
                return { status: 'created', balance: Number(result[1]) };
            }
            if (result[0] === 'insufficient' && result[1] !== undefined) {
                return { status: 'insufficient', balance: Number(result[1]) };
            }
            return result[0] === 'exists' ? { status: 'exists' } : { status: 'invalid' };
        } catch (e) { handleRedisFailure(`kvCreateFundedTrainingJob('${jobId}')`, e); }
    }

    const rawBalance = memGet(balanceKey);
    const balance = Number(rawBalance || '0');
    const submitted = Number(memGet(keys[4]) || '0');
    if (memGet(jobKey) !== null) return { status: 'exists' };
    if (!Number.isFinite(balance) || !Number.isInteger(submitted) || submitted < 0
        || !Number.isFinite(balance - amount)) {
        return { status: 'invalid' };
    }
    if (balance < amount) return { status: 'insufficient', balance };

    const oldJobIds = memGet(walletJobsKey) || '';
    const rawQueue = memGet(keys[3]);
    let queue: string[] = [];
    if (rawQueue) {
        try { queue = JSON.parse(rawQueue) as string[]; } catch { return { status: 'invalid' }; }
        if (!Array.isArray(queue)) return { status: 'invalid' };
    }
    const remaining = Math.round((balance - amount) * 1e9) / 1e9;
    memSet(balanceKey, String(remaining));
    memSet(jobKey, jobJson, ttlSec);
    memSet(walletJobsKey, oldJobIds ? `${oldJobIds}\n${jobId}` : jobId, ttlSec);
    memSet(keys[3], JSON.stringify([...queue, ...taskJsons]));
    memSet(keys[4], String(submitted + 1));
    return { status: 'created', balance: remaining };
}

export async function kvApplyDeltas(deltas: Array<{ key: string; amount: number }>): Promise<void> {
    if (deltas.length === 0 || deltas.some(item => !item.key || !Number.isFinite(item.amount))
        || new Set(deltas.map(item => item.key)).size !== deltas.length) {
        throw new Error('Invalid balance adjustment parameters');
    }
    const r = await getRedis();
    if (r) {
        const keys = deltas.map(item => item.key);
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            for index = 1, #KEYS do
                local valueType = redis.call('TYPE', KEYS[index]).ok
                if valueType ~= 'none' and valueType ~= 'string' then return redis.error_reply('Invalid balance key type') end
                local current = tonumber(redis.call('GET', KEYS[index]) or '0')
                local delta = tonumber(ARGV[index])
                if not finite(current) or not finite(delta) or not finite(current + delta) then
                    return redis.error_reply('Invalid balance adjustment')
                end
            end
            for index = 1, #KEYS do
                redis.call('INCRBYFLOAT', KEYS[index], ARGV[index])
            end
            return 1
        `;
        try {
            await r.eval<string[], number>(script, keys, deltas.map(item => String(item.amount)));
            return;
        } catch (e) { handleRedisFailure('kvApplyDeltas', e); }
    }

    for (const delta of deltas) {
        const raw = memGet(delta.key);
        if (raw !== null && !Number.isFinite(Number(raw))) {
            throw new Error(`Invalid stored balance for '${delta.key}'`);
        }
    }
    for (const delta of deltas) {
        const current = Number(memGet(delta.key) || '0');
        const next = Math.round((current + delta.amount) * 1e9) / 1e9;
        memSet(delta.key, String(next));
    }
}

export type IdempotentCreditResult =
    | { status: 'credited'; balance: number }
    | { status: 'duplicate' }
    | { status: 'invalid' };

export async function kvCreditOnce(
    dedupKey: string,
    wallet: string,
    amount: number,
    dedupTtlSec: number,
    event?: { key: string; value: string; ttlSec: number },
): Promise<IdempotentCreditResult> {
    const balanceKey = `balance:${wallet.toLowerCase()}`;
    const keys = [dedupKey, balanceKey, ...(event ? [event.key] : [])];
    if (!dedupKey || !wallet || !Number.isFinite(amount) || amount <= 0
        || !Number.isInteger(dedupTtlSec) || dedupTtlSec < 1
        || (event && (!event.key || !event.value || !Number.isInteger(event.ttlSec) || event.ttlSec < 1))
        || new Set(keys).size !== keys.length) {
        return { status: 'invalid' };
    }

    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            if redis.call('EXISTS', KEYS[1]) == 1 then return {'duplicate'} end
            if #KEYS == 3 and redis.call('EXISTS', KEYS[3]) == 1 then return {'invalid'} end
            for index = 1, #KEYS do
                local valueType = redis.call('TYPE', KEYS[index]).ok
                if valueType ~= 'none' and valueType ~= 'string' then return {'invalid'} end
            end
            local current = tonumber(redis.call('GET', KEYS[2]) or '0')
            local amount = tonumber(ARGV[1])
            if not finite(current) or not finite(amount) or amount <= 0 or not finite(current + amount) then
                return {'invalid'}
            end
            local seen = redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[2]), 'NX')
            if not seen then return {'duplicate'} end
            local balance = redis.call('INCRBYFLOAT', KEYS[2], amount)
            if #KEYS == 3 then redis.call('SET', KEYS[3], ARGV[3], 'EX', tonumber(ARGV[4])) end
            return {'credited', tostring(balance)}
        `;
        const args = [String(amount), String(dedupTtlSec)];
        if (event) args.push(event.value, String(event.ttlSec));
        try {
            const result = await r.eval<string[], [string, string?]>(script, keys, args);
            if (result[0] === 'credited' && result[1] !== undefined) {
                return { status: 'credited', balance: Number(result[1]) };
            }
            if (result[0] === 'duplicate') return { status: 'duplicate' };
            return { status: 'invalid' };
        } catch (e) { handleRedisFailure(`kvCreditOnce('${dedupKey}')`, e); }
    }

    if (memGet(dedupKey) !== null) return { status: 'duplicate' };
    const rawBalance = memGet(balanceKey);
    const balance = Number(rawBalance || '0');
    if (!Number.isFinite(balance) || !Number.isFinite(balance + amount)) return { status: 'invalid' };
    if (event && memGet(event.key) !== null) return { status: 'invalid' };
    const nextBalance = Math.round((balance + amount) * 1e9) / 1e9;
    memSet(dedupKey, '1', dedupTtlSec);
    memSet(balanceKey, String(nextBalance));
    if (event) memSet(event.key, event.value, event.ttlSec);
    return { status: 'credited', balance: nextBalance };
}

export type QuotaReservation =
    | { allowed: true; remaining: number }
    | { allowed: false; remaining: 0 | number };

export async function kvConsumeQuota(key: string, limit: number, ttlSec: number): Promise<QuotaReservation> {
    if (!key || !Number.isInteger(limit) || limit < 1 || !Number.isInteger(ttlSec) || ttlSec < 1) {
        throw new Error('Invalid quota reservation parameters');
    }
    const r = await getRedis();
    if (r) {
        const script = `
            local function finite(value)
                return value and value == value and value ~= math.huge and value ~= -math.huge
            end
            local valueType = redis.call('TYPE', KEYS[1]).ok
            if valueType ~= 'none' and valueType ~= 'string' then return {'invalid'} end
            local raw = redis.call('GET', KEYS[1])
            local used = tonumber(raw or '0')
            if not finite(used) or used < 0 or used ~= math.floor(used) then return {'invalid'} end
            local limit = tonumber(ARGV[1])
            if used >= limit then return {'denied', '0'} end
            local nextUsed = redis.call('INCR', KEYS[1])
            if nextUsed == 1 or redis.call('TTL', KEYS[1]) < 0 then
                redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
            end
            return {'allowed', tostring(limit - nextUsed)}
        `;
        try {
            const result = await r.eval<[string, string], [string, string]>(
                script,
                [key],
                [String(limit), String(ttlSec)],
            );
            if (result[0] === 'allowed') return { allowed: true, remaining: Number(result[1]) };
            if (result[0] === 'denied') return { allowed: false, remaining: 0 };
            throw new Error(`Invalid stored quota value for '${key}'`);
        } catch (e) {
            if (e instanceof Error && e.message.startsWith('Invalid stored quota value')) throw e;
            handleRedisFailure(`kvConsumeQuota('${key}')`, e);
        }
    }

    const raw = memGet(key);
    const used = Number(raw || '0');
    if (!Number.isInteger(used) || used < 0) throw new Error(`Invalid stored quota value for '${key}'`);
    if (used >= limit) return { allowed: false, remaining: 0 };
    const nextUsed = used + 1;
    const current = mem.get(key);
    if (nextUsed === 1 || current?.exp == null) {
        memSet(key, String(nextUsed), ttlSec);
    } else {
        mem.set(key, { value: String(nextUsed), exp: current.exp });
    }
    return { allowed: true, remaining: limit - nextUsed };
}

export type CampaignTaskReservation =
    | { status: 'reserved'; remainingBudget: number; nodeReward: number; protocolFee: number }
    | { status: 'not_found' | 'inactive' | 'expired' | 'exhausted' | 'invalid' };

export async function kvReserveCampaignTask(
    campaignKey: string,
    queueKey: string,
    taskJson: string,
    ttlSec: number,
    nowMs: number,
    expiresAtMs: number,
): Promise<CampaignTaskReservation> {
    const r = await getRedis();
    if (r) {
        const script = `
            local campaignRaw = redis.call('GET', KEYS[1])
            if not campaignRaw then return {'not_found'} end
            local ok, campaign = pcall(cjson.decode, campaignRaw)
            if not ok or type(campaign) ~= 'table' then return {'invalid'} end
            if campaign.active ~= true then return {'inactive'} end
            local reward = tonumber(campaign.reward_per_task)
            local budget = tonumber(campaign.remaining_budget)
            if not reward or reward <= 0 or not budget then return {'invalid'} end
            if tonumber(ARGV[4]) >= tonumber(ARGV[5]) then return {'expired'} end
            if budget < reward then return {'exhausted'} end
            local taskOk, task = pcall(cjson.decode, ARGV[1])
            if not taskOk or type(task) ~= 'table' then return {'invalid'} end

            local queueType = redis.call('TYPE', KEYS[2]).ok
            local taskStatsType = redis.call('TYPE', KEYS[3]).ok
            local rewardStatsType = redis.call('TYPE', KEYS[4]).ok
            if (queueType ~= 'none' and queueType ~= 'list')
                or (taskStatsType ~= 'none' and taskStatsType ~= 'string')
                or (rewardStatsType ~= 'none' and rewardStatsType ~= 'string') then
                return {'invalid'}
            end
            local taskCount = redis.call('GET', KEYS[3])
            local rewardTotal = redis.call('GET', KEYS[4])
            if (taskCount and not tonumber(taskCount)) or (rewardTotal and not tonumber(rewardTotal)) then
                return {'invalid'}
            end

            local protocolFee = math.floor(reward * tonumber(ARGV[2]) * 100 + 0.5) / 100
            local nodeReward = math.floor((reward - protocolFee) * 100 + 0.5) / 100
            local remaining = math.floor((budget - reward) * 100 + 0.5) / 100
            campaign.remaining_budget = remaining
            task.campaign_id = campaign.id
            task.company = campaign.company
            task.reward_gstd = nodeReward
            task.protocol_fee = protocolFee
            if task.required_caps == nil or task.required_caps == cjson.null then task.required_caps = campaign.required_caps or {} end
            if task.min_resources == nil or task.min_resources == cjson.null then task.min_resources = campaign.min_resources or {} end
            if task.requester == nil or task.requester == cjson.null then task.requester = campaign.company end

            redis.call('LPUSH', KEYS[2], cjson.encode(task))
            redis.call('SET', KEYS[1], cjson.encode(campaign), 'EX', tonumber(ARGV[3]))
            redis.call('INCR', KEYS[3])
            redis.call('INCRBYFLOAT', KEYS[4], tostring(nodeReward))
            return {'reserved', tostring(remaining), tostring(nodeReward), tostring(protocolFee)}
        `;
        try {
            const result = await r.eval<
                [string, string, string, string, string],
                [string, string?, string?, string?]
            >(
                script,
                [campaignKey, queueKey, 'stats:total_tasks_submitted', 'stats:total_reward_gstd'],
                [taskJson, '0.1', String(ttlSec), String(nowMs), String(expiresAtMs)],
            );
            const status = result[0];
            if (status !== 'reserved') {
                if (status === 'not_found' || status === 'inactive' || status === 'expired'
                    || status === 'exhausted' || status === 'invalid') {
                    return { status };
                }
                return { status: 'invalid' };
            }
            return {
                status: 'reserved',
                remainingBudget: Number(result[1]),
                nodeReward: Number(result[2]),
                protocolFee: Number(result[3]),
            };
        } catch (e) { handleRedisFailure(`kvReserveCampaignTask('${campaignKey}')`, e); }
    }

    const raw = memGet(campaignKey);
    if (!raw) return { status: 'not_found' };
    let campaign: Record<string, any>;
    let task: Record<string, any>;
    try {
        campaign = JSON.parse(raw);
        task = JSON.parse(taskJson);
    } catch {
        return { status: 'invalid' };
    }
    if (campaign.active !== true) return { status: 'inactive' };
    const reward = Number(campaign.reward_per_task);
    const budget = Number(campaign.remaining_budget);
    const expiry = Date.parse(campaign.expires_at);
    if (!Number.isFinite(reward) || reward <= 0 || !Number.isFinite(budget) || !Number.isFinite(expiry)) {
        return { status: 'invalid' };
    }
    if (nowMs >= expiry) return { status: 'expired' };
    if (budget < reward) return { status: 'exhausted' };

    const protocolFee = Math.round(reward * 0.1 * 100) / 100;
    const nodeReward = Math.round((reward - protocolFee) * 100) / 100;
    const remainingBudget = Math.round((budget - reward) * 100) / 100;
    campaign.remaining_budget = remainingBudget;
    task.campaign_id = campaign.id;
    task.company = campaign.company;
    task.reward_gstd = nodeReward;
    task.protocol_fee = protocolFee;
    if (task.required_caps == null) task.required_caps = campaign.required_caps || [];
    if (task.min_resources == null) task.min_resources = campaign.min_resources || {};
    if (task.requester == null) task.requester = campaign.company;

    const rawQueue = memGet(queueKey);
    const queue: string[] = rawQueue ? JSON.parse(rawQueue) : [];
    queue.push(JSON.stringify(task));
    memSet(queueKey, JSON.stringify(queue));
    memSet(campaignKey, JSON.stringify(campaign), ttlSec);
    memSet('stats:total_tasks_submitted', String((parseInt(memGet('stats:total_tasks_submitted') || '0', 10) || 0) + 1));
    const rewardTotal = (parseFloat(memGet('stats:total_reward_gstd') || '0') || 0) + nodeReward;
    memSet('stats:total_reward_gstd', String(Math.round(rewardTotal * 1e6) / 1e6));
    return { status: 'reserved', remainingBudget, nodeReward, protocolFee };
}

export async function kvAccrueTaskReward(
    taskId: string,
    walletKey: string,
    nodeId: string,
    nodeShare: number,
    communityShare: number,
    feeGstd: number,
): Promise<boolean> {
    const r = await getRedis();
    const seenKey = `reward_seen:${taskId}`;
    const pendingKey = `rewards:pending:${walletKey}`;
    const lifetimeKey = `rewards:lifetime:${nodeId}`;
    if (r) {
        const script = `
            if redis.call('SET', KEYS[1], '1', 'EX', ARGV[5], 'NX') then
                redis.call('INCRBYFLOAT', KEYS[2], ARGV[1])
                redis.call('INCRBYFLOAT', KEYS[3], ARGV[1])
                redis.call('INCRBYFLOAT', KEYS[4], ARGV[2])
                redis.call('INCRBYFLOAT', KEYS[5], ARGV[3])
                redis.call('SET', KEYS[6], ARGV[4])
                return 1
            end
            return 0
        `;
        try {
            const result = await r.eval<[string, string, string, string, number], number>(
                script,
                [seenKey, pendingKey, lifetimeKey, 'rewards:treasury', 'stats:total_gstd_paid', `rewards:node_wallet:${nodeId}`],
                [String(nodeShare), String(communityShare), String(feeGstd), walletKey, 86400 * 7],
            );
            return result === 1;
        } catch (e) { handleRedisFailure(`kvAccrueTaskReward('${taskId}')`, e); }
    }
    if (memGet(seenKey) !== null) return false;
    memSet(seenKey, '1', 86400 * 7);
    const add = (key: string, amount: number) => {
        memSet(key, String((parseFloat(memGet(key) || '0') || 0) + amount));
    };
    add(pendingKey, nodeShare);
    add(lifetimeKey, nodeShare);
    add('rewards:treasury', communityShare);
    add('stats:total_gstd_paid', feeGstd);
    memSet(`rewards:node_wallet:${nodeId}`, walletKey);
    return true;
}

export type TaskCompletionResult =
    | { status: 'completed'; assignment: string }
    | { status: 'duplicate'; assignment: string }
    | { status: 'disabled_task' }
    | { status: 'invalid' }
    | { status: 'invalid_result' }
    | { status: 'wallet_mismatch' };

export async function kvCompleteAssignedTask(
    taskId: string,
    nodeId: string,
    wallet: string,
    fallbackReward: number,
    communityTax: number,
    nodeTtlSec: number,
    completionTtlSec: number,
    resultHash?: string,
): Promise<TaskCompletionResult> {
    const assignmentKey = `task_assigned:${taskId}`;
    const completionKey = `task_completed:${taskId}`;
    const nodeKey = `node:${nodeId}`;
    const walletKey = wallet.toLowerCase();
    const keys = [
        assignmentKey,
        completionKey,
        nodeKey,
        `rewards:pending:${walletKey}`,
        `rewards:lifetime:${nodeId}`,
        'rewards:treasury',
        'stats:total_gstd_paid',
        `rewards:node_wallet:${nodeId}`,
        'stats:total_tasks_completed',
        `reward_seen:${taskId}`,
    ];
    const args = [
        nodeId,
        walletKey,
        String(fallbackReward),
        String(communityTax),
        String(nodeTtlSec),
        String(completionTtlSec),
    ];
    const timestamp = new Date().toISOString();
    args.push(timestamp, resultHash || '');
    const r = await getRedis();
    if (r) {
        const script = `
            local completed = redis.call('GET', KEYS[2])
            if completed then
                local ok, previous = pcall(cjson.decode, completed)
                if ok and previous.node_id == ARGV[1] then
                    return {'duplicate', previous.assignment}
                end
                return {'invalid', ''}
            end
            local raw = redis.call('GET', KEYS[1])
            if not raw then return {'invalid', ''} end
            local ok, assignment = pcall(cjson.decode, raw)
            if not ok or assignment.node_id ~= ARGV[1] then return {'invalid', ''} end
            if assignment.task_type == 'finetune' or assignment.task_type == 'bridge_verify'
                or assignment.job_id or assignment.shard_id then
                return {'disabled_task', ''}
            end
            if assignment.expected_hash and string.lower(assignment.expected_hash) ~= string.lower(ARGV[8]) then
                return {'invalid_result', ''}
            end
            local nodeRaw = redis.call('GET', KEYS[3])
            if not nodeRaw then return {'invalid', ''} end
            local nodeOk, node = pcall(cjson.decode, nodeRaw)
            if not nodeOk then return {'invalid', ''} end
            local storedWallet = string.lower(node.wallet_address or '')
            if storedWallet == '' or storedWallet ~= ARGV[2] then return {'wallet_mismatch', ''} end

            local reward = tonumber(assignment.reward_gstd)
            if not reward or reward < 0 then reward = tonumber(ARGV[3]) end
            local tax = tonumber(ARGV[4])
            local nodeShare = math.floor((reward * (1 - tax) * 1000000) + 0.5) / 1000000
            local communityShare = math.floor((reward * tax * 1000000) + 0.5) / 1000000
            node.tasks_completed = (tonumber(node.tasks_completed) or 0) + 1
            node.gstd_earned = math.floor(((tonumber(node.gstd_earned) or 0) + reward) * 1000000 + 0.5) / 1000000
            node.last_seen = ARGV[7]
            redis.call('SET', KEYS[3], cjson.encode(node), 'EX', tonumber(ARGV[5]))
            redis.call('INCR', KEYS[9])

            if reward > 0 and redis.call('SET', KEYS[10], '1', 'EX', 604800, 'NX') then
                redis.call('INCRBYFLOAT', KEYS[4], nodeShare)
                redis.call('INCRBYFLOAT', KEYS[5], nodeShare)
                redis.call('INCRBYFLOAT', KEYS[6], communityShare)
                redis.call('INCRBYFLOAT', KEYS[7], reward)
                redis.call('SET', KEYS[8], ARGV[2])
            end

            local completion = cjson.encode({node_id = ARGV[1], assignment = raw})
            redis.call('SET', KEYS[2], completion, 'EX', tonumber(ARGV[6]))
            redis.call('DEL', KEYS[1])
            return {'completed', raw}
        `;
        try {
            const result = await r.eval<string[], unknown[]>(script, keys, args);
            const status = String(result?.[0] ?? 'invalid');
            if (status === 'completed' || status === 'duplicate') {
                const value = result[1];
                return {
                    status,
                    assignment: typeof value === 'string' ? value : JSON.stringify(value),
                };
            }
            return {
                status: status === 'wallet_mismatch'
                    ? 'wallet_mismatch'
                    : status === 'invalid_result' ? 'invalid_result'
                    : status === 'disabled_task' ? 'disabled_task' : 'invalid',
            };
        } catch (e) { handleRedisFailure(`kvCompleteAssignedTask('${taskId}')`, e); }
    }

    const completionRaw = memGet(completionKey);
    if (completionRaw) {
        try {
            const previous = JSON.parse(completionRaw) as { node_id: string; assignment: string };
            return previous.node_id === nodeId
                ? { status: 'duplicate', assignment: previous.assignment }
                : { status: 'invalid' };
        } catch {
            memDel(completionKey);
        }
    }
    const raw = memGet(assignmentKey);
    if (!raw) return { status: 'invalid' };
    let assignment: {
        node_id?: string;
        expected_hash?: unknown;
        task_type?: unknown;
        job_id?: unknown;
        shard_id?: unknown;
    };
    try {
        assignment = JSON.parse(raw);
    } catch {
        return { status: 'invalid' };
    }
    if (assignment.node_id !== nodeId) return { status: 'invalid' };
    if (assignment.task_type === 'finetune' || assignment.task_type === 'bridge_verify'
        || 'job_id' in assignment || 'shard_id' in assignment) {
        return { status: 'disabled_task' };
    }
    if (typeof assignment.expected_hash === 'string'
        && assignment.expected_hash.toLowerCase() !== String(resultHash || '').toLowerCase()) {
        return { status: 'invalid_result' };
    }
    const nodeRaw = memGet(nodeKey);
    if (!nodeRaw) return { status: 'invalid' };
    let node: Record<string, any>;
    try {
        node = JSON.parse(nodeRaw);
    } catch {
        return { status: 'invalid' };
    }
    if (String(node.wallet_address || '').trim().toLowerCase() !== walletKey || !walletKey) {
        return { status: 'wallet_mismatch' };
    }
    node.tasks_completed = (Number(node.tasks_completed) || 0) + 1;
    const assignedReward = Number((JSON.parse(raw) as { reward_gstd?: unknown }).reward_gstd);
    const rewardGstd = Number.isFinite(assignedReward) && assignedReward >= 0 ? assignedReward : fallbackReward;
    const nodeShare = Math.round(rewardGstd * (1 - communityTax) * 1e6) / 1e6;
    const communityShare = Math.round(rewardGstd * communityTax * 1e6) / 1e6;
    node.gstd_earned = Math.round(((Number(node.gstd_earned) || 0) + rewardGstd) * 1e6) / 1e6;
    node.last_seen = timestamp;
    memSet(nodeKey, JSON.stringify(node), nodeTtlSec);
    const increment = (key: string, amount: number) => {
        memSet(key, String((parseFloat(memGet(key) || '0') || 0) + amount));
    };
    increment('stats:total_tasks_completed', 1);
    if (rewardGstd > 0 && memGet(`reward_seen:${taskId}`) === null) {
        memSet(`reward_seen:${taskId}`, '1', 604800);
        increment(`rewards:pending:${walletKey}`, nodeShare);
        increment(`rewards:lifetime:${nodeId}`, nodeShare);
        increment('rewards:treasury', communityShare);
        increment('stats:total_gstd_paid', rewardGstd);
        memSet(`rewards:node_wallet:${nodeId}`, walletKey);
    }
    memDel(assignmentKey);
    memSet(completionKey, JSON.stringify({ node_id: nodeId, assignment: raw }), completionTtlSec);
    return { status: 'completed', assignment: raw };
}

export async function kvGetDelForNode(key: string, nodeId: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        const script = `
            local value = redis.call('GET', KEYS[1])
            if not value then return nil end
            local ok, assignment = pcall(cjson.decode, value)
            if not ok or assignment.node_id ~= ARGV[1] then return nil end
            redis.call('DEL', KEYS[1])
            return value
        `;
        try {
            const value = await r.eval<[string], unknown>(script, [key], [nodeId]);
            if (value == null) return null;
            return typeof value === 'string' ? value : JSON.stringify(value);
        } catch (e) { handleRedisFailure(`kvGetDelForNode('${key}')`, e); }
    }
    const value = memGet(key);
    if (!value) return null;
    try {
        if (JSON.parse(value).node_id !== nodeId) return null;
    } catch {
        memDel(key);
        return null;
    }
    memDel(key);
    return value;
}

export async function kvDel(key: string): Promise<void> {
    const r = await getRedis();
    if (r) { try { await r.del(key); return; } catch (e) { handleRedisFailure(`kvDel('${key}')`, e); } }
    memDel(key);
}

export async function kvKeys(prefix: string): Promise<string[]> {
    let safePrefix = prefix;
    while (safePrefix.endsWith('*')) safePrefix = safePrefix.slice(0, -1);
    const r = await getRedis();
    if (r) {
        try {
            const keys = await r.keys(`${safePrefix}*`);
            return keys as string[];
        } catch (e) { handleRedisFailure(`kvKeys('${safePrefix}')`, e); }
    }
    return memKeys(safePrefix);
}

export async function kvIncrByFloat(key: string, delta: number): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incrbyfloat(key, delta); }
        catch (e) { handleRedisFailure(`kvIncrByFloat('${key}')`, e); }
    }
    const cur = parseFloat(memGet(key) || '0') + delta;
    memSet(key, String(cur));
    return cur;
}

export async function kvMGet(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const r = await getRedis();
    if (r) {
        try {
            const vals = await r.mget(...keys);
            return (vals as (unknown | null)[]).map(v => v == null ? null : String(v));
        } catch (e) { handleRedisFailure(`kvMGet(${keys.length} keys)`, e); }
    }
    return keys.map(k => memGet(k));
}

// ── Queue helpers (LPUSH / RPOP) ───────────────────────────────────

export async function kvPush(key: string, ...values: string[]): Promise<void> {
    const r = await getRedis();
    if (r) {
        try { await r.lpush(key, ...values); return; } catch (e) { handleRedisFailure(`kvPush('${key}')`, e); }
    }
    const raw = memGet(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    list.push(...values);
    memSet(key, JSON.stringify(list));
}

export async function kvPop(key: string): Promise<string | null> {
    const r = await getRedis();
    if (r) {
        try {
            const val = await r.rpop(key);
            return val == null ? null : String(val);
        } catch (e) { handleRedisFailure(`kvPop('${key}')`, e); }
    }
    const raw = memGet(key);
    if (!raw) return null;
    const list: string[] = JSON.parse(raw);
    const val = list.shift() ?? null;
    if (list.length > 0) memSet(key, JSON.stringify(list));
    else memDel(key);
    return val;
}

export async function kvLLen(key: string): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.llen(key); } catch (e) { handleRedisFailure(`kvLLen('${key}')`, e); }
    }
    const raw = memGet(key);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
}

export async function kvIncr(key: string): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incr(key); }
        catch (e) { handleRedisFailure(`kvIncr('${key}')`, e); }
    }
    const cur = parseInt(memGet(key) || '0', 10) + 1;
    memSet(key, String(cur));
    return cur;
}
