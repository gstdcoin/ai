import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
    const url = request.nextUrl;
    const hostname = request.headers.get('host') || '';

    if (hostname.includes('monitor.')) {
        if (url.pathname === '/') {
            url.pathname = '/monitor';
            return NextResponse.rewrite(url);
        }
    }

    return NextResponse.next();
}
