/**
 * Simple in-memory rate limiter for serverless isolates.
 * Uses a sliding window counter per IP.
 * Resets on cold start and is not shared across isolates.
 */

interface WindowEntry { count: number; resetAt: number; }
const windows = new Map<string, WindowEntry>();

export function rateLimit(key: string, maxReq: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = windows.get(key);

    if (!entry || entry.resetAt < now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return true; // allowed
    }

    entry.count++;
    if (entry.count > maxReq) return false; // blocked
    return true;
}

export function getClientIp(headers: Record<string, string | string[] | undefined>): string {
    const fwd = headers['x-forwarded-for'];
    if (typeof fwd === 'string') return fwd.split(',')[0].trim();
    if (Array.isArray(fwd)) return fwd[0].split(',')[0].trim();
    return 'unknown';
}
