import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./kv', () => ({ kvGet: vi.fn(async () => null), kvSet: vi.fn(), kvConsumeQuota: vi.fn() }));
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: vi.fn() }));
import { kvConsumeQuota } from './kv';
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { edgeChat } from './edgeAi';
const messages = [{ role: 'user', content: 'first' }, { role: 'assistant', content: 'answer' }, { role: 'user', content: 'next' }];
beforeEach(() => vi.clearAllMocks());
describe('Cloudflare fallback budget', () => {
  it('does not invoke Workers AI when the daily budget is exhausted', async () => {
    vi.mocked(kvConsumeQuota).mockResolvedValue({ allowed: false } as any);
    await expect(edgeChat(messages)).rejects.toThrow('budget exhausted');
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });
  it('does not invoke Workers AI when quota storage is unavailable', async () => {
    vi.mocked(kvConsumeQuota).mockRejectedValue(new Error('quota storage unavailable'));
    await expect(edgeChat(messages)).rejects.toThrow('quota storage unavailable');
    expect(getCloudflareContext).not.toHaveBeenCalled();
  });
});
