/**
 * Validation for node URLs before the platform makes server-side requests to them.
 * Node URLs come from user-registered KV records and a public GitHub file, so they
 * are untrusted: only public HTTPS hostnames are accepted.
 */

const MAX_URL_LENGTH = 2048;
const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home', '.corp', '.intranet', '.localdomain'];

export interface SafeNodeUrlOptions {
    /** Operator-controlled values (e.g. GSTD_NODE_URL) may use http and private hosts. */
    trusted?: boolean;
}

/** Returns a normalized origin+path without trailing slash, or null if the URL is not allowed. */
export function safeNodeUrl(raw: unknown, options: SafeNodeUrlOptions = {}): string | null {
    if (typeof raw !== 'string') return null;
    const value = raw.trim();
    if (!value || value.length > MAX_URL_LENGTH) return null;

    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }

    if (url.username || url.password) return null;
    if (url.search || url.hash) return null;

    if (options.trusted) {
        if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    } else {
        if (url.protocol !== 'https:') return null;
        if (url.port && url.port !== '443') return null;
        if (!isPublicHostname(url.hostname)) return null;
    }

    return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

function isPublicHostname(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/\.$/, '');
    if (!host || host === 'localhost') return false;
    // IP literals (including IPv6 and the decimal/hex forms URL normalizes to dotted IPv4) are never accepted.
    if (host.startsWith('[') || host.includes(':')) return false;
    if (/^[0-9.]+$/.test(host)) return false;
    if (!host.includes('.')) return false;
    if (INTERNAL_SUFFIXES.some((suffix) => host.endsWith(suffix))) return false;
    return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host);
}
