import type { NextApiRequest, NextApiResponse } from 'next';
import { sessionWallet } from '../../../../lib/walletSession';
import { moneyJob, walletId } from '../../../../lib/money';
import { kvDel } from '../../../../lib/kv';
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
    if(req.method!=='DELETE')return res.status(405).json({error:'Method not allowed'});
    const wallet=await sessionWallet(req.headers);
    if(!wallet)return res.status(401).json({error:'Not authenticated'});
    const id=req.query.id;
    if(typeof id!=='string')return res.status(400).json({error:'payment_id_required'});
    const job=await moneyJob(id);
    if(!job || job.wallet!==walletId(wallet))return res.status(404).json({error:'Not found'});
    await kvDel('money:v2:response:'+id);
    return res.status(200).json({deleted:true,financial_receipt_retained:true});
}
