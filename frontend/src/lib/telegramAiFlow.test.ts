import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(async () => {}), kvSetNX: vi.fn(async () => true), kvConsumeQuota: vi.fn(async () => ({allowed:true})) }));
vi.mock('./nodes', () => ({ callNodeChat: vi.fn() }));
vi.mock('./edgeAi', () => ({ edgeChat: vi.fn() }));
vi.mock('./telegramWebhookAuth', () => ({ isValidWebhookRequest: vi.fn(() => true) }));
import { kvGet, kvSet, kvSetNX, kvConsumeQuota } from './kv';
import { callNodeChat } from './nodes';
import { edgeChat } from './edgeAi';
let handler: any;
let request: ReturnType<typeof vi.fn>;
beforeAll(async () => { vi.stubEnv('TELEGRAM_BOT_TOKEN','unit-test-token'); handler=(await import('../pages/api/v1/telegram/webhook')).default; });
afterAll(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
beforeEach(() => { vi.clearAllMocks(); vi.mocked(kvGet).mockResolvedValue(null); vi.mocked(kvSet).mockResolvedValue(undefined); vi.mocked(kvSetNX).mockResolvedValue(true); request=vi.fn(async () => new Response(JSON.stringify({ok:true}))); vi.stubGlobal('fetch',request); vi.mocked(kvConsumeQuota).mockResolvedValue({allowed:true} as any); });
const invoke = async () => { const response={status:vi.fn().mockReturnThis(),json:vi.fn()}; await handler({method:'POST',headers:{},body:{update_id:1,message:{chat:{id:123,type:'private'},from:{id:123,language_code:'en',first_name:'Test'},text:'Explain solar energy briefly.'}}},response); return response; };
describe('Telegram AI user flow', () => {
 it('answers a user without a linked wallet and gives the node a bounded 45-second budget',async () => {
   vi.mocked(callNodeChat).mockResolvedValue({content:'Solar energy uses sunlight.',latency:100});
   await invoke();
   expect(callNodeChat).toHaveBeenCalledWith(expect.any(Array),expect.objectContaining({maxTokens:96,timeoutMs:45000}));
   expect(request.mock.calls.some(([,options]:any) => JSON.parse(options.body).text==='Solar energy uses sunlight.')).toBe(true);
 });
 it('labels a quota-bounded fallback after a node timeout instead of silently dropping the question',async () => {
   vi.mocked(callNodeChat).mockRejectedValue(new Error('operation timed out'));
   vi.mocked(kvGet).mockImplementation(async key=>String(key).startsWith('tg_cloud_consent:')?'yes':null);
   vi.mocked(edgeChat).mockResolvedValue('Fallback answer');
   await invoke();
   expect(edgeChat).toHaveBeenCalledWith(expect.any(Array),96);
   expect(request.mock.calls.some(([,options]:any) => {const text=JSON.parse(options.body).text;return typeof text==='string' && text.includes('Fallback answer') && text.includes('Cloudflare');})).toBe(true);
 });
 it('does not send the question to a corporation without explicit user consent',async()=>{
   vi.mocked(callNodeChat).mockRejectedValue(new Error('No GSTD node available'));
   await invoke();expect(edgeChat).not.toHaveBeenCalled();
 });
 it('does not spend node or fallback compute when quota storage fails',async () => {
   vi.mocked(kvConsumeQuota).mockRejectedValue(new Error('quota unavailable'));
   await invoke();
   expect(callNodeChat).not.toHaveBeenCalled();
   expect(edgeChat).not.toHaveBeenCalled();
 });
});


describe('Telegram delivery and webhook retry safety', () => {
 it('retries a cached AI reply without new compute or quota after Telegram rejects delivery',async()=>{
   const store=new Map<string,string>([['tg_cloud_consent:123','yes']]);
   vi.mocked(kvGet).mockImplementation(async key=>store.get(String(key))||null);
   vi.mocked(kvSet).mockImplementation(async(key,value)=>{store.set(key,value);});
   vi.mocked(kvSetNX).mockImplementation(async(key,value)=>{if(store.has(key))return false;store.set(key,value);return true;});
   vi.mocked(callNodeChat).mockResolvedValue({content:'Cached node answer',latency:100});
   let rejectDelivery=true;
   request.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.endsWith('/sendMessage')&&rejectDelivery?{ok:false,description:'Too Many Requests'}:{ok:true,result:{message_id:7}})));
   const first=await invoke();
   expect(first.status).toHaveBeenCalledWith(503);
   expect(store.has('tg_upd:1')).toBe(false);
   expect(store.has('tg_session:123')).toBe(false);
   expect(store.has('tg_ai_reply:1')).toBe(true);
   expect(edgeChat).not.toHaveBeenCalled();
   // Model the naturally expired processing lease before Telegram retries.
   store.delete('tg_upd:1:processing');rejectDelivery=false;
   const retry=await invoke();
   expect(retry.status).toHaveBeenCalledWith(200);
   expect(callNodeChat).toHaveBeenCalledTimes(1);
   expect(kvConsumeQuota).toHaveBeenCalledTimes(1);
   expect(JSON.parse(store.get('tg_session:123')!).history.at(-1).content).toBe('Cached node answer');
   expect(store.get('tg_upd:1')).toBe('1');
   const calls=request.mock.calls.length;
   await invoke();
   expect(request).toHaveBeenCalledTimes(calls);
 });
 it('does not acknowledge an in-flight duplicate as completed',async()=>{
   vi.mocked(kvSetNX).mockImplementation(async key=>!key.endsWith(':processing'));
   const response=await invoke();
   expect(response.status).toHaveBeenCalledWith(503);
   expect(callNodeChat).not.toHaveBeenCalled();expect(kvConsumeQuota).not.toHaveBeenCalled();
 });
 it('does not lose the answer when the optional typing indicator fails',async()=>{
   vi.mocked(callNodeChat).mockResolvedValue({content:'Actual answer',latency:100});
   request.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.endsWith('/sendChatAction')?{ok:false}:{ok:true})));
   const response=await invoke();
   expect(response.status).toHaveBeenCalledWith(200);
   expect(request.mock.calls.some(([,options]:any)=>JSON.parse(options.body).text==='Actual answer')).toBe(true);
 });
 it('fails closed before compute when update deduplication storage is unavailable',async()=>{
   vi.mocked(kvGet).mockRejectedValue(new Error('storage unavailable'));
   const response=await invoke();
   expect(response.status).toHaveBeenCalledWith(503);
   expect(callNodeChat).not.toHaveBeenCalled();expect(edgeChat).not.toHaveBeenCalled();
 });
});


it('preserves Russian locale when opening wallet accounting from the bot',async()=>{
 vi.mocked(kvGet).mockImplementation(async key=>String(key).startsWith('tg_wallet:')?'0:'+'22'.repeat(32):null);
 request.mockImplementation(async(url:string)=>new Response(JSON.stringify(url.includes('/api/v1/telegram/bot/balance')?{balance_gstd:0,pending_gstd:0}:{ok:true})));
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
 await handler({method:'POST',headers:{},body:{update_id:2,message:{chat:{id:123,type:'private'},from:{id:123,language_code:'ru'},text:'/balance'}}},response);
 const sent=request.mock.calls.filter(([url]:any)=>url.endsWith('/sendMessage')).map(([,options]:any)=>JSON.parse(options.body));
 expect(sent.some(body=>body.reply_markup?.inline_keyboard.flat().some((button:any)=>button.web_app?.url==='https://app.gstdtoken.com/ru/payments'))).toBe(true);
});


it('does not replay an older wallet link after failed delivery and a newer link',async()=>{
 const store=new Map<string,string>();
 vi.mocked(kvGet).mockImplementation(async key=>store.get(String(key))||null);
 vi.mocked(kvSet).mockImplementation(async(key,value)=>{store.set(key,value);});
 vi.mocked(kvSetNX).mockImplementation(async(key,value)=>{if(store.has(key))return false;store.set(key,value);return true;});
 const oldWallet='0:'+'33'.repeat(32),newWallet='0:'+'44'.repeat(32);
 let linked='',linkCalls=0,failDelivery=true;
 request.mockImplementation(async(url:string,options:any)=>{
  if(url.endsWith('/api/v1/telegram/bot/link')){linked=JSON.parse(options.body).wallet_address;linkCalls++;return new Response(JSON.stringify({success:true}));}
  return new Response(JSON.stringify({ok:!failDelivery}));
 });
 const link=async(update_id:number,text:string)=>{
  const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
  await handler({method:'POST',headers:{},body:{update_id,message:{chat:{id:123,type:'private'},from:{id:123,language_code:'en'},text}}},response);
  return response;
 };
 const first=await link(10,oldWallet);
 expect(first.status).toHaveBeenCalledWith(503);expect(linked).toBe(oldWallet);
 failDelivery=false;await link(11,newWallet);expect(linked).toBe(newWallet);
 const replay=await link(10,oldWallet);
 expect(replay.status).toHaveBeenCalledWith(200);
 expect(linkCalls).toBe(2);expect(linked).toBe(newWallet);
});

it('fails closed before non-AI mutations when start deduplication cannot be persisted',async()=>{
 vi.mocked(kvSetNX).mockRejectedValue(new Error('storage unavailable'));
 const response={status:vi.fn().mockReturnThis(),json:vi.fn()};
 await handler({method:'POST',headers:{},body:{update_id:12,message:{chat:{id:123,type:'private'},from:{id:123},text:'0:'+'55'.repeat(32)}}},response);
 expect(response.status).toHaveBeenCalledWith(503);
 expect(request).not.toHaveBeenCalled();
});
