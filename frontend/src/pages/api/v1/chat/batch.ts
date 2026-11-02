/**
 * Bounded batch facade over the canonical completion handler.
 * Each item keeps the same model permissions, quota and funded accounting.
 */
export const config = { maxDuration: 115 };
import type { NextApiRequest,NextApiResponse } from 'next';
import { createHash } from 'crypto';
import completions from './completions';
import { sessionWallet } from '../../../../lib/walletSession';
const MAX_PROMPTS=3;
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
    if(req.method!=='POST')return res.status(405).json({error:'Method not allowed'});
    const bearer=req.headers.authorization;
    if(typeof bearer!=='string' || !/^Bearer gstd_\S+$/.test(bearer)) {
        try { if(!await sessionWallet(req.headers))return res.status(401).json({error:'Verified wallet session or enterprise key required'}); }
        catch { return res.status(503).json({error:'Authentication unavailable'}); }
    }
    const {prompts,system,model,max_tokens=256}=req.body||{};
    if(!Array.isArray(prompts)||prompts.length<1||prompts.length>MAX_PROMPTS||
        prompts.some(p=>typeof p!=='string'||!p.trim()||p.length>16000)||
        (system!==undefined&&(typeof system!=='string'||system.length>16000)))
        return res.status(400).json({error:'Provide 1–3 nonempty text prompts (max 16000 characters each).'});
    const id=req.headers['idempotency-key'];
    if(typeof id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(id))
        return res.status(400).json({error:'idempotency_key_required'});
    const fingerprint=createHash('sha256').update(JSON.stringify({prompts,system,model,max_tokens})).digest('hex');
    const started=Date.now();
    const results=await Promise.all(prompts.map(async(prompt:string,index:number)=>{
        const t=Date.now();let status=200;let value:any;
        const itemKey=createHash('sha256').update(id+':'+index).digest('hex');
        const subreq=Object.create(req,{
            headers:{value:{...req.headers,'idempotency-key':itemKey}},
            body:{value:{model,max_tokens:Math.max(1,Math.min(Number(max_tokens)||256,512)),stream:false,
                messages:[...(system?[{role:'system',content:system}]:[]),{role:'user',content:prompt}]}},
        });
        const response:any={status(n:number){status=n;return this;},json(v:any){value=v;return this;},setHeader(){return this;}};
        try{
            await completions(subreq,response);
            const content=status===200?value?.choices?.[0]?.message?.content:null;
            return{index,content:typeof content==='string'&&content.trim()?content:null,latency_ms:Date.now()-t,
                status,error:status!==200?value?.error:undefined,node_id:value?._gstd?.node_id || value?._gstd?.routed_via,payment_id:value?._gstd?.payment_id};
        }catch{return{index,content:null,latency_ms:Date.now()-t,status:503,error:'completion_unavailable'};}
    }));
    const succeeded=results.filter(r=>r.content!==null),failed=results.filter(r=>r.content===null);
    return res.status(succeeded.length?200:(failed[0]?.status||503)).json({
        results:succeeded,nodes_used:new Set(succeeded.map(r=>r.node_id).filter(Boolean)).size,
        total_ms:Date.now()-started,failed:failed.length,failed_indices:failed.map(r=>r.index),
        errors:failed.map(({index,status,error})=>({index,status,error})),batch_fingerprint:fingerprint,
        note:'Each item uses the canonical completion permissions and accounting. Reuse the same key and body to retry paid requests.',
    });
}
