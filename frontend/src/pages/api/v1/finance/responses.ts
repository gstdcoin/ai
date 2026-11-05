import type { NextApiRequest, NextApiResponse } from 'next';
import { sessionWallet } from '../../../../lib/walletSession';
import { moneyJob, walletId,digest } from '../../../../lib/money';
import { kvDel,kvGet } from '../../../../lib/kv';
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
    res.setHeader('Cache-Control','private, no-store');
    if(!['GET','DELETE'].includes(req.method||'')){res.setHeader('Allow','GET, DELETE');return res.status(405).json({error:'Method not allowed'});}
    const wallet=await sessionWallet(req.headers);
    if(!wallet)return res.status(401).json({error:'Not authenticated'});
    let id=req.query.id;
    if(req.method==='GET'&&req.query.request_id!==undefined){
        if(typeof req.query.request_id!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(req.query.request_id))return res.status(400).json({error:'invalid_request_id'});
        id='chat:'+digest([walletId(wallet),req.query.request_id]);
    }
    if(typeof id!=='string')return res.status(400).json({error:'payment_id_required'});
    const job=await moneyJob(id);
    if(!job || job.wallet!==walletId(wallet))return res.status(404).json({error:'Not found'});
    if(req.method==='GET'){
        const raw=job.state==='captured'?await kvGet('money:v2:response:'+id):null;
        return res.status(200).json({payment_id:id,state:job.state,amount_nano:job.amount,response:raw?JSON.parse(raw):null,charged_again:false});
    }
    await kvDel('money:v2:response:'+id);
    return res.status(200).json({deleted:true,financial_receipt_retained:true});
}
