import { describe, it, expect } from 'vitest';
import { kvSet, kvGet, kvLLen } from './kv';
import joinCampaign from '../pages/api/v1/campaigns/join';
import createCampaign from '../pages/api/v1/campaigns/create';
import requestTask from '../pages/api/v1/marketplace/request';

function call(handler: any, body: any, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
        const res: any = {
            statusCode: 200,
            status(c: number) { this.statusCode = c; return this; },
            json(j: any) { resolve({ status: this.statusCode, json: j }); return this; },
        };
        Promise.resolve(handler({ method: 'POST', body, headers, query: {} }, res)).catch(reject);
    });
}

describe('campaign funding authorization', () => {
    const wallet = `uqfunder${Math.random().toString(16).slice(2)}`;
    const token = `tok${Math.random().toString(16).slice(2)}`;
    const base = { company: 'Acme', title: 'T', reward_per_task: 1, total_budget: 10, wallet_address: wallet };

    it('rejects funding without a session for that wallet', async () => {
        await kvSet(`balance:${wallet}`, '100', 600);
        expect((await call(createCampaign, base)).status).toBe(401);
        await kvSet('ton-auth:session:other', 'uqsomeoneelse', 600);
        expect((await call(createCampaign, base, { 'x-session-token': 'other' })).status).toBe(401);
        expect(await kvGet(`balance:${wallet}`)).toBe('100');
    });

    it('funds with a valid session and only the funder can request tasks', async () => {
        await kvSet(`balance:${wallet}`, '100', 600);
        await kvSet(`ton-auth:session:${token}`, wallet, 600);
        const created = await call(createCampaign, base, { 'x-session-token': token });
        expect(created.status).toBe(200);
        const id = created.json.campaign_id;

        const req = { campaign_id: id, type: 'custom', payload: { kind: 'sha256_verify', data: 'aa' } };
        expect((await call(requestTask, req)).status).toBe(403);
        await kvSet('ton-auth:session:other', 'uqsomeoneelse', 600);
        expect((await call(requestTask, req, { 'x-session-token': 'other' })).status).toBe(403);

        const before = await kvLLen('tasks:queue');
        const ok = await call(requestTask, req, { 'x-session-token': token });
        expect(ok.status).toBe(200);
        expect(ok.json.reward_gstd).toBeGreaterThan(0);
        expect(await kvLLen('tasks:queue')).toBe(before + 1);
    });
    it('joining does not rewrite the campaign record (budget stays as reserved)', async () => {
        const w = `uqj${Math.random().toString(16).slice(2)}`; const tk = `tj${Math.random().toString(16).slice(2)}`;
        await kvSet(`balance:${w}`, '100', 600);
        await kvSet(`ton-auth:session:${tk}`, w, 600);
        const c = await call(createCampaign, { ...base, wallet_address: w }, { 'x-session-token': tk });
        const id = c.json.campaign_id;
        await call(requestTask, { campaign_id: id, type: 'custom', payload: {} }, { 'x-session-token': tk });
        const before = JSON.parse((await kvGet(`campaign:${id}`))!);
        const j = await call(joinCampaign, { campaign_id: id, node_id: 'web-abc', capabilities: [], resources: {} });
        expect(j.status).toBe(200);
        expect(JSON.parse((await kvGet(`campaign:${id}`))!)).toEqual(before);
    });
});
