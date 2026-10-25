import { kvGet, kvSet } from './kv';

const VERSION_URL = 'https://raw.githubusercontent.com/gstdcoin/gstdbot/main/package.json';
const INSTALL_URL = 'https://raw.githubusercontent.com/gstdcoin/gstdbot/main/install.sh';
const CACHE_KEY = 'node:latest_version';
const CACHE_TTL_S = 3600;

export function compareVersions(a: string, b: string): number {
    const pa = String(a).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(/[.-]/).map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

/** Latest published node-client version, cached for an hour; null when unknown. */
export async function getLatestNodeVersion(timeoutMs = 2000): Promise<string | null> {
    try {
        const cached = await kvGet(CACHE_KEY);
        if (cached) return String(cached);
    } catch { /* fall through to a live lookup */ }
    try {
        const r = await fetch(VERSION_URL, { signal: AbortSignal.timeout(timeoutMs) });
        if (!r.ok) return null;
        const v = (await r.json())?.version;
        if (typeof v !== 'string' || !/^\d+\.\d+\.\d+/.test(v)) return null;
        await kvSet(CACHE_KEY, v, CACHE_TTL_S).catch(() => {});
        return v;
    } catch {
        return null;
    }
}

export async function nodeUpdateInfo(current: string | undefined, timeoutMs?: number) {
    const latest = await getLatestNodeVersion(timeoutMs);
    if (!latest || !current) return { update_available: false, latest_version: latest, update_url: INSTALL_URL };
    return {
        update_available: compareVersions(current, latest) < 0,
        latest_version: latest,
        current_version: current,
        update_url: INSTALL_URL,
    };
}
