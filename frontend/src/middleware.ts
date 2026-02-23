import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
    const url = request.nextUrl;
    const hostname = request.headers.get('host') || '';

    if (hostname.includes('monitor.')) {
        // Support serving the monitor application natively on monitor.gstdtoken.com
        // Only rewrite the root path to /monitor
        if (url.pathname === '/') {
            url.pathname = '/monitor';
            return NextResponse.rewrite(url);
        }
    }

    return NextResponse.next();
}
