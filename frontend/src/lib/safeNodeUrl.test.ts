import { describe, expect, it } from 'vitest';
import { safeNodeUrl } from './safeNodeUrl';

describe('safeNodeUrl', () => {
    it('accepts public https hosts and normalizes trailing slashes', () => {
        expect(safeNodeUrl('https://node.example.com/')).toBe('https://node.example.com');
        expect(safeNodeUrl('https://abc-def.trycloudflare.com:443/base/')).toBe('https://abc-def.trycloudflare.com/base');
    });

    it.each([
        'http://node.example.com',
        'https://localhost',
        'https://127.0.0.1',
        'https://2130706433',
        'https://0x7f.1',
        'https://10.0.0.5',
        'https://169.254.169.254/latest/meta-data',
        'https://[::1]',
        'https://[fd00::1]',
        'https://user:pass@node.example.com',
        'https://node.example.com:8443',
        'https://node.example.com?x=1',
        'https://intranet',
        'https://printer.local',
        'https://db.internal',
        'ftp://node.example.com',
        'not a url',
        '',
    ])('rejects %s', (value) => {
        expect(safeNodeUrl(value)).toBeNull();
    });

    it('rejects non-string values', () => {
        expect(safeNodeUrl(undefined)).toBeNull();
        expect(safeNodeUrl(42)).toBeNull();
    });

    it('allows trusted operator values over http', () => {
        expect(safeNodeUrl('http://localhost:11434/', { trusted: true })).toBe('http://localhost:11434');
        expect(safeNodeUrl('file:///etc/passwd', { trusted: true })).toBeNull();
    });
});
