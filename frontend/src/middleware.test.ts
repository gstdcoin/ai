import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('next/server', () => ({ NextResponse: class extends Response {
 static next() { return new Response(null, {headers:{'x-middleware-next':'1'}}); }
} }));
beforeEach(() => vi.resetModules());
function request(method: string, forwarded='198.51.100.1') { return {
 method, nextUrl:{pathname:'/api/v1/chat/completions'},
 headers:new Headers({'cf-connecting-ip':'203.0.113.10','x-forwarded-for':forwarded}),
} as any; }
it('terminates browser preflight and permits paid idempotent requests', async () => {
 const {default:middleware}=await import('./middleware');
 const response=middleware(request('OPTIONS'));
 expect(response.status).toBe(204);
 expect(response.headers.get('x-middleware-next')).toBeNull();
 expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Idempotency-Key');
 expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
});
it('preflights do not exhaust inference quota and forwarded spoofing cannot evade it', async () => {
 const {default:middleware}=await import('./middleware');
 for(let i=0;i<15;i++) expect(middleware(request('OPTIONS')).status).toBe(204);
 for(let i=0;i<10;i++) expect(middleware(request('POST','198.51.100.'+i)).status).toBe(200);
 const limited=middleware(request('POST','198.51.100.99'));
 expect(limited.status).toBe(429);
 expect(limited.headers.get('Access-Control-Allow-Origin')).toBe('*');
});
