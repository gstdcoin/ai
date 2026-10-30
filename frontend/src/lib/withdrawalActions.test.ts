import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({session:null as string|null, known:null as any, reject:vi.fn(), request:vi.fn()}));
vi.mock('./walletSession',()=>({sessionWallet:async()=>state.session}));
vi.mock('./money',async()=>({...await vi.importActual<typeof import('./money')>('./money'),
    getWithdrawal:async()=>state.known,requestWithdrawal:(...args:any[])=>state.request(...args),rejectWithdrawal:(...args:any[])=>state.reject(...args)}));
import handler from '../pages/api/v1/finance/withdrawals';
import { PLATFORM_CUSTODY_OWNER } from './custody';
import { MoneyError } from './money';
const recipient='0:'+'55'.repeat(32);
function response(){const r:any={setHeader:vi.fn(),status:vi.fn(),json:vi.fn()};r.status.mockReturnValue(r);r.json.mockReturnValue(r);return r as NextApiResponse;}
beforeEach(()=>{state.session=null;state.known={id:'request',wallet:recipient,state:'requested'};state.reject.mockReset();state.request.mockReset();});
it('never lets an unauthenticated or recipient session exercise custody-owner rejection',async()=>{
    const req={method:'POST',headers:{},body:{action:'reject',id:'request'}} as NextApiRequest;
    const anonymous=response();await handler(req,anonymous);expect(anonymous.status).toHaveBeenCalledWith(401);
    state.session=recipient;
    const user=response();await handler(req,user);expect(user.status).toHaveBeenCalledWith(403);
    expect(state.reject).not.toHaveBeenCalled();
});
it('routes rejection to the authenticated custody owner and never dispatches a transfer',async()=>{
    state.session=PLATFORM_CUSTODY_OWNER;state.reject.mockResolvedValue({state:'cancelled',cancellationReason:'operator_declined'});
    const res=response();await handler({method:'POST',headers:{},body:{action:'reject',id:'request'}} as NextApiRequest,res);
    expect(state.reject).toHaveBeenCalledExactlyOnceWith('request',PLATFORM_CUSTODY_OWNER);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({withdrawal:{state:'cancelled',cancellationReason:'operator_declined'},fee_gstd:0});
});

it('exposes a bounded retry interval for request churn without dispatching or rejecting another request',async()=>{
    state.session=recipient;state.request.mockRejectedValue(new MoneyError('withdrawal_request_cooldown'));
    const res=response();await handler({method:'POST',headers:{'idempotency-key':'cooldown-request'},
        body:{action:'request',amount_gstd:'1'}} as unknown as NextApiRequest,res);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After','60');
    expect(res.json).toHaveBeenCalledWith({error:'withdrawal_request_cooldown',retry_after:60});
    expect(state.reject).not.toHaveBeenCalled();
});
