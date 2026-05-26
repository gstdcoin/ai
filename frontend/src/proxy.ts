import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// In-memory sliding window rate limiter for Edge runtime.
// Per Vercel: each Edge function instance is isolated — this is a best-effort
// limit that protects against burst traffic per-instance.
const windows = new Map<string, { count: number; resetAt: number }>();

function rateLimit(key: string, max: number, windowMs: number): boolean {
    const now = Date.now();
    const entry = windows.get(key);
    if (!entry || entry.resetAt < now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    entry.count++;
    return entry.count <= max;
}

function getIp(req: NextRequest): string {
    return (
        req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
        req.headers.get('x-real-ip') ??
        'unknown'
    );
}

// Per-route limits  [max requests, window ms]
const LIMITS: Record<string, [number, number]> = {
    '/api/v1/chat/completions':   [10,  60_000],   // 10/min — expensive inference
    '/api/v1/nodes/register':     [5,   60_000],   // 5/min — startup only
    '/api/v1/nodes/heartbeat':    [20,  60_000],   // 20/min — 8-min interval normal
    '/api/v1/tasks/complete':     [60,  60_000],   // 60/min — active workers
    '/api/v1/tasks/fail':         [60,  60_000],
    '/api/v1/tasks/poll':         [120, 60_000],   // 2/sec — polling loop
    '/api/v1/nodes/deregister':   [10,  60_000],
};

const DEFAULT_LIMIT: [number, number] = [60, 60_000]; // 60/min default

export function proxy(req: NextRequest) {
    const { pathname } = req.nextUrl;

    // Only protect API routes
    if (!pathname.startsWith('/api/')) {
        return NextResponse.next();
    }

    const ip = getIp(req);
    const [max, windowMs] = LIMITS[pathname] ?? DEFAULT_LIMIT;
    const allowed = rateLimit(`${ip}:${pathname}`, max, windowMs);

    if (!allowed) {
        return new NextResponse(
            JSON.stringify({ error: 'Too Many Requests', retryAfter: 60 }),
            {
                status: 429,
                headers: {
                    'Content-Type': 'application/json',
                    'Retry-After': '60',
                    'X-RateLimit-Limit': String(max),
                },
            }
        );
    }

    const res = NextResponse.next();

    // Security headers on all API responses
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options', 'DENY');
    res.headers.set('X-XSS-Protection', '1; mode=block');
    res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Allow cross-origin requests for the public API (nodes/agents call from anywhere)
    if (req.method === 'OPTIONS') {
        res.headers.set('Access-Control-Allow-Origin', '*');
        res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Wallet-Address');
    } else {
        res.headers.set('Access-Control-Allow-Origin', '*');
    }

    return res;
}

export const config = {
    matcher: '/api/:path*',
};
