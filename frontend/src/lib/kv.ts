/**
 * KV Storage abstraction
 *
 * Production: Upstash Redis (via Vercel KV integration) — free tier
 * Development: in-memory fallback (no setup needed)
 *
 * Env vars (auto-added by Vercel KV integration):
 *   KV_REST_API_URL   — Upstash Redis REST URL
 *   KV_REST_API_TOKEN — Upstash Redis REST token
 */

import type { Redis } from '@upstash/redis';
import { logger } from './logger';

// ── In-memory fallback for local dev ──────────────────────────────
const mem = new Map<string, { value: string; exp: number | null }>();

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
    if (!url || !token) return null;
    try {
        const { Redis } = await import('@upstash/redis');
        _redis = new Redis({ url, token });
        return _redis;
    } catch {
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
        } catch (e) { logger.error(`kvGet('${key}') failed, falling back to in-memory store`, e); }
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
        } catch (e) { logger.error(`kvSet('${key}') failed, falling back to in-memory store`, e); }
    }
    memSet(key, value, ttlSec);
}

export async function kvDel(key: string): Promise<void> {
    const r = await getRedis();
    if (r) { try { await r.del(key); return; } catch (e) { logger.error(`kvDel('${key}') failed, falling back to in-memory store`, e); } }
    memDel(key);
}

export async function kvKeys(prefix: string): Promise<string[]> {
    const safePrefix = prefix.replace(/\*+$/, '');
    const r = await getRedis();
    if (r) {
        try {
            const keys = await r.keys(`${safePrefix}*`);
            return keys as string[];
        } catch (e) { logger.error(`kvKeys('${safePrefix}') failed, falling back to in-memory store`, e); }
    }
    return memKeys(safePrefix);
}

export async function kvIncrByFloat(key: string, delta: number): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incrbyfloat(key, delta); } catch { /* INCRBYFLOAT unsupported on some Upstash plans — try GET+SET instead */ }
        try {
            const raw = await r.get(key);
            const cur = parseFloat((raw as string) || '0') || 0;
            const next = cur + delta;
            await r.set(key, String(next));
            return next;
        } catch (e) { logger.error(`kvIncrByFloat('${key}') failed, falling back to in-memory store`, e); }
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
        } catch (e) { logger.error(`kvMGet(${keys.length} keys) failed, falling back to in-memory store`, e); }
    }
    return keys.map(k => memGet(k));
}

// ── Queue helpers (LPUSH / RPOP) ───────────────────────────────────

export async function kvPush(key: string, ...values: string[]): Promise<void> {
    const r = await getRedis();
    if (r) {
        try { await r.lpush(key, ...values); return; } catch (e) { logger.error(`kvPush('${key}') failed, falling back to in-memory store`, e); }
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
        } catch (e) { logger.error(`kvPop('${key}') failed, falling back to in-memory store`, e); }
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
        try { return await r.llen(key); } catch (e) { logger.error(`kvLLen('${key}') failed, falling back to in-memory store`, e); }
    }
    const raw = memGet(key);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
}

export async function kvIncr(key: string): Promise<number> {
    const r = await getRedis();
    if (r) {
        try { return await r.incr(key); } catch { /* INCR unsupported on some Upstash plans — try GET+SET instead */ }
        try {
            const raw = await r.get(key);
            const cur = parseInt((raw as string) || '0', 10) || 0;
            await r.set(key, String(cur + 1));
            return cur + 1;
        } catch (e) { logger.error(`kvIncr('${key}') failed, falling back to in-memory store`, e); }
    }
    const cur = parseInt(memGet(key) || '0', 10) + 1;
    memSet(key, String(cur));
    return cur;
}
