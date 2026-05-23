/**
 * KV Storage abstraction
 *
 * Production: Vercel KV (Upstash Redis) — free tier: 256MB, 3K req/day
 * Development: in-memory fallback (no setup needed)
 *
 * Setup on Vercel:
 *   Dashboard → Storage → Create KV Database → link to project
 *   Env vars KV_REST_API_URL + KV_REST_API_TOKEN are added automatically.
 */

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

// ── Vercel KV client (dynamic import to avoid build errors in dev) ─
let _kv: any = null;
async function getKV() {
    if (_kv) return _kv;
    if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
        try {
            const mod = await import('@vercel/kv');
            _kv = mod.kv;
            return _kv;
        } catch { /* fall through to in-memory */ }
    }
    return null;
}

// ── Public API ─────────────────────────────────────────────────────
export async function kvGet(key: string): Promise<string | null> {
    const kv = await getKV();
    if (kv) {
        try { return await kv.get<string>(key); } catch { /* fallback */ }
    }
    return memGet(key);
}

export async function kvSet(key: string, value: string, ttlSec?: number): Promise<void> {
    const kv = await getKV();
    if (kv) {
        try {
            if (ttlSec) await kv.set(key, value, { ex: ttlSec });
            else await kv.set(key, value);
            return;
        } catch { /* fallback */ }
    }
    memSet(key, value, ttlSec);
}

export async function kvDel(key: string): Promise<void> {
    const kv = await getKV();
    if (kv) { try { await kv.del(key); return; } catch { /* fallback */ } }
    memDel(key);
}

/** Scan keys by prefix. Vercel KV free tier: use mem fallback for scans. */
export async function kvKeys(prefix: string): Promise<string[]> {
    const kv = await getKV();
    if (kv) {
        try {
            // @vercel/kv supports scan via keys pattern
            return await kv.keys(`${prefix}*`);
        } catch { /* fallback */ }
    }
    return memKeys(prefix);
}

export async function kvMGet(keys: string[]): Promise<(string | null)[]> {
    if (keys.length === 0) return [];
    const kv = await getKV();
    if (kv) {
        try { return await kv.mget<string[]>(...keys); } catch { /* fallback */ }
    }
    return keys.map(k => memGet(k));
}

// ── Queue helpers (LPUSH / RPOP) ───────────────────────────────────
export async function kvPush(key: string, ...values: string[]): Promise<void> {
    const kv = await getKV();
    if (kv) {
        try { await kv.lpush(key, ...values); return; } catch { /* fallback */ }
    }
    // In-memory queue: store as JSON array
    const raw = memGet(key);
    const list: string[] = raw ? JSON.parse(raw) : [];
    list.push(...values);
    memSet(key, JSON.stringify(list));
}

export async function kvPop(key: string): Promise<string | null> {
    const kv = await getKV();
    if (kv) {
        try { return await kv.rpop<string>(key); } catch { /* fallback */ }
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
    const kv = await getKV();
    if (kv) {
        try { return await kv.llen(key); } catch { /* fallback */ }
    }
    const raw = memGet(key);
    return raw ? (JSON.parse(raw) as string[]).length : 0;
}

// ── Increment counter ──────────────────────────────────────────────
export async function kvIncr(key: string): Promise<number> {
    const kv = await getKV();
    if (kv) {
        try { return await kv.incr(key); } catch { /* fallback */ }
    }
    const cur = parseInt(memGet(key) || '0', 10) + 1;
    memSet(key, String(cur));
    return cur;
}
