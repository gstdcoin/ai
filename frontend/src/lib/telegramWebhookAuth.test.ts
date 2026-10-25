import { describe, expect, it } from 'vitest';
import { isValidWebhookRequest, webhookSecret } from './telegramWebhookAuth';

const req = (h: Record<string, string>) => ({ headers: h }) as any;

describe('telegram webhook auth', () => {
    it('accepts the derived secret', () => {
        const s = webhookSecret('123:ABC');
        expect(isValidWebhookRequest(req({ 'x-telegram-bot-api-secret-token': s }), '123:ABC')).toBe(true);
    });
    it('rejects missing, wrong and cross-token secrets', () => {
        expect(isValidWebhookRequest(req({}), '123:ABC')).toBe(false);
        expect(isValidWebhookRequest(req({ 'x-telegram-bot-api-secret-token': 'x' }), '123:ABC')).toBe(false);
        const old = webhookSecret('old:TOKEN');
        expect(isValidWebhookRequest(req({ 'x-telegram-bot-api-secret-token': old }), '123:ABC')).toBe(false);
    });
    it('fails closed without a bot token', () => {
        expect(isValidWebhookRequest(req({ 'x-telegram-bot-api-secret-token': '' }), '')).toBe(false);
    });
});
