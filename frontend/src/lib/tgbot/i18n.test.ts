import { describe, it, expect } from 'vitest';
import { DICTS, LANGS, t, resolveLang, parseCommand, parseReferrer } from './i18n';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');

describe('tgbot i18n', () => {
    it('every locale has exactly the English keys', () => {
        const keys = Object.keys(DICTS.en).sort();
        for (const l of LANGS) expect(Object.keys(DICTS[l]).sort(), l).toEqual(keys);
    });

    it('placeholders match English in every locale', () => {
        for (const l of LANGS) {
            for (const k of Object.keys(DICTS.en)) {
                expect(placeholders(DICTS[l][k]), `${l}.${k}`).toBe(placeholders(DICTS.en[k]));
            }
        }
    });

    it('resolves languages and falls back to English', () => {
        expect(resolveLang('ru-RU')).toBe('ru');
        expect(resolveLang('zh-hans')).toBe('zh');
        expect(resolveLang('be')).toBe('ru');
        expect(resolveLang('xx')).toBe('en');
        expect(resolveLang(undefined)).toBe('en');
    });

    it('interpolates variables', () => {
        expect(t('en', 'claim_ok', { amount: '1.0000' })).toContain('1.0000');
    });

    it('parses commands and referrals', () => {
        expect(parseCommand('/start@gstdaibot ref_42')).toEqual({ cmd: 'start', args: 'ref_42' });
        expect(parseCommand('/Menu')).toEqual({ cmd: 'menu', args: '' });
        expect(parseCommand('hello')).toBeNull();
        expect(parseReferrer('ref_42')).toBe('42');
        expect(parseReferrer('ref_x')).toBeNull();
    });
});
