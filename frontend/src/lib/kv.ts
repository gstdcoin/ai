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
    const safePrefix = prefix.replace(/\*+$/, '');
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
