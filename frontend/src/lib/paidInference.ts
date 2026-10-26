import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet } from './kv';
import { getActiveNodes } from './nodes';
import { MoneyError, captureMoney, digest, moneyJob, nano, releaseMoney, reserveMoney, splitNano, units, walletId } from './money';

export async function paidInference(req: NextApiRequest, res: NextApiResponse, options: {
    wallet: string | null; price: number; model: string; messages: { role: string; content: string }[];
    maxTokens: number; surface: 'web' | 'api'; tier?: string;
}) {
    if (!options.wallet) return res.status(402).json({ error: 'wallet_required', cost: options.price });
    const rawId = req.headers['idempotency-key'];
    if (typeof rawId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(rawId))
        return res.status(400).json({ error: 'idempotency_key_required' });
    const wallet = walletId(options.wallet);
    const jobId = 'chat:' + digest([wallet,rawId]);
    const fingerprint = digest(options);
    let acquired = false;
    try {
        const previous = await moneyJob(jobId);
        if (previous && previous.fingerprint !== fingerprint) throw new MoneyError('idempotency_conflict');
        if (previous?.state === 'captured') return sendResult(req,res,previous.result,options.surface);
        if (previous) {
            if (previous.state === 'reserved' && previous.expiresAt <= Date.now()) await releaseMoney(jobId);
            return res.status(409).json({ error: previous.expiresAt <= Date.now() ? 'reservation_expired' : 'request_already_processed', payment_id: jobId });
        }
        // A paid task is routed only to a registered operator with a valid payout address.
        const candidates = await getActiveNodes(options.model);
        let target: (typeof candidates)[number] | undefined, executor = '';
        for (const candidate of candidates) {
            const raw = await kvGet('node:' + candidate.nodeId);
            try {
                const node = JSON.parse(raw || '{}');
                executor = walletId(String(node.wallet_address || ''));
                target = candidate; break;
            } catch { continue; }
        }
        if (!target) throw new MoneyError('no_paid_executor');
        const reservation = await reserveMoney(wallet,jobId,nano(options.price),fingerprint,Date.now()+120_000);
        if (!reservation.acquired) return res.status(409).json({ error: 'request_in_progress', payment_id: jobId });
        acquired = true;
        const response = await fetch(target.url + '/v1/chat/completions', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: options.model, messages: options.messages, stream: false,
                max_tokens: options.maxTokens, temperature: 0.7 }),
            signal: AbortSignal.timeout(55_000),
        });
        if (!response.ok) throw new MoneyError('inference_failed');
        const data: any = await response.json();
        const content = String(data.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>\s*/g,'').trim();
        if (options.model !== 'auto' && data.model !== options.model) throw new MoneyError('model_mismatch');
        if (!content || data._gstd?.tier === 'fallback' || data._gstd?.error) throw new MoneyError('inference_failed');
        if ((req as any).aborted || (res as any).destroyed) throw new MoneyError('client_disconnected');
        const shares = splitNano(nano(options.price));
        const result = {
            id: jobId, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: data.model || options.model,
            choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
            usage: data.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
            collective: { tier: options.tier, expertCount: 1, experts: [target.nodeId],
                cost_gstd: options.price, latency_ms: Date.now()-reservation.createdAt },
            _gstd: { node_id: target.nodeId, payment_id: jobId, ledger_version: 2,
                billing: { charged_gstd: options.price, executor_gstd: Number(units(shares.executor)),
                    protocol_gstd: Number(units(shares.protocol)), reserve_gstd: Number(units(shares.reserve)) } },
        };
        const captured = await captureMoney(jobId, executor, result);
        return sendResult(req,res,captured.result,options.surface);
    } catch (error) {
        // If capture succeeded but the response was lost, releaseMoney is a no-op.
        // A retry with the same key retrieves the captured response without another charge.
        let refunded = false;
        if (acquired) { const job = await releaseMoney(jobId); refunded = job.state === 'released'; }
        const code = error instanceof MoneyError ? error.code : 'inference_failed';
        return res.status(code === 'insufficient_balance' ? 402 : code === 'idempotency_conflict' ? 409 : 503)
            .json({ error: code, refunded, payment_id: jobId });
    }
}
function sendResult(req: NextApiRequest,res: NextApiResponse,value: unknown,surface: 'web'|'api') {
    const data = value as any;
    if (req.body?.stream && surface === 'web') {
        res.setHeader('Content-Type','text/event-stream'); res.setHeader('Cache-Control','no-store');
        res.write('event: meta\ndata: ' + JSON.stringify({ ...data.collective, model: data.model }) + '\n\n');
        res.write('event: delta\ndata: ' + JSON.stringify({ content: data.choices[0].message.content }) + '\n\n');
        res.write('event: done\ndata: ' + JSON.stringify({ ...data.collective, payment_id: data.id }) + '\n\n');
        return res.end();
    }
    return res.status(200).json(data);
}
