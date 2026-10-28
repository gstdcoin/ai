import { describe, expect, it } from 'vitest';
import { getClientIp } from './ratelimit';
describe('client quota identity', () => {
  it('prefers the Cloudflare edge address over client forwarded headers', () => {
    expect(getClientIp({'cf-connecting-ip':'203.0.113.7','x-forwarded-for':'198.51.100.1'})).toBe('203.0.113.7');
    expect(getClientIp({'cf-connecting-ip':'203.0.113.7','x-forwarded-for':'198.51.100.2'})).toBe('203.0.113.7');
  });
  it('retains forwarded-header compatibility outside Cloudflare', () => {
    expect(getClientIp({'x-forwarded-for':'203.0.113.8, 203.0.113.9'})).toBe('203.0.113.8');
    expect(getClientIp({})).toBe('unknown');
  });
});
