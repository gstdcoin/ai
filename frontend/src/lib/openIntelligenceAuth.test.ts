import { describe, expect, it } from 'vitest';
import { isValidOpenIntelligenceCronRequest } from './openIntelligenceAuth';

describe('Open Intelligence cron authentication', () => {
    it('requires a configured secret and matching bearer token', () => {
        expect(isValidOpenIntelligenceCronRequest({ headers: { authorization: 'Bearer secret' } }, '')).toBe(false);
        expect(isValidOpenIntelligenceCronRequest({ headers: { authorization: 'Bearer wrong' } }, 'secret')).toBe(false);
        expect(isValidOpenIntelligenceCronRequest({ headers: { authorization: 'Bearer secret' } }, 'secret')).toBe(true);
    });
});
