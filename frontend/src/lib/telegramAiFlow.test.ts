import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => {}), kvSetNX: vi.fn(async () => true), kvConsumeQuota: vi.fn(async () => ({allowed:true})) }));
vi.mock('./nodes', () => ({ callNodeChat: vi.fn() }));
vi.mock('./edgeAi', () => ({ edgeChat: vi.fn() }));
vi.mock('./telegramWebhookAuth', () => ({ isValidWebhookRequest: vi.fn(() => true) }));
import { kvConsumeQuota } from './kv';
import { callNodeChat } from './nodes';
import { edgeChat } from './edgeAi';
let handler: any;
let request: ReturnType<typeof vi.fn>;
beforeAll(async () => { vi.stubEnv('TELEGRAM_BOT_TOKEN','unit-test-token'); handler=(await import('../pages/api/v1/telegram/webhook')).default; });
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.clearAllMocks(); request=vi.fn(async () => new Response(JSON.stringify({ok:true}))); vi.stubGlobal('fetch',request); vi.mocked(kvConsumeQuota).mockResolvedValue({allowed:true} as any); });
const invoke = () => handler({method:'POST',headers:{},body:{update_id:1,message:{chat:{id:123,type:'private'},from:{id:123,language_code:'en',first_name:'Test'},text:'Explain solar energy briefly.'}}},{status:vi.fn().mockReturnThis(),json:vi.fn()});
describe('Telegram AI user flow', () => {
 it('answers a user without a linked wallet and gives the node a bounded 45-second budget',async () => {
   vi.mocked(callNodeChat).mockResolvedValue({content:'Solar energy uses sunlight.',latency:100});
   await invoke();
   expect(callNodeChat).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({maxTokens:192,timeoutMs:45000}));
   expect(request.mock.calls.some(([,options]:any) => JSON.parse(options.body).text==='Solar energy uses sunlight.')).toBe(true);
 });
 it('labels a quota-bounded fallback after a node timeout instead of silently dropping the question',async () => {
   vi.mocked(callNodeChat).mockRejectedValue(new Error('operation timed out'));
   vi.mocked(edgeChat).mockResolvedValue('Fallback answer');
   await invoke();
   expect(edgeChat).toHaveBeenCalledWith(expect.any(Array),192);
   expect(request.mock.calls.some(([,options]:any) => {const text=JSON.parse(options.body).text;return typeof text==='string' && text.includes('Fallback answer') && text.includes('Cloudflare');})).toBe(true);
 });
 it('does not spend node or fallback compute when quota storage fails',async () => {
   vi.mocked(kvConsumeQuota).mockRejectedValue(new Error('quota unavailable'));
   await invoke();
   expect(callNodeChat).not.toHaveBeenCalled();
   expect(edgeChat).not.toHaveBeenCalled();
 });
});
