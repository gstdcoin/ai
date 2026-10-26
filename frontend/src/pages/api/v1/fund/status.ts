import type { NextApiRequest,NextApiResponse } from 'next';
import { publicFinance } from '../../../../lib/publicFinance';
export default async function handler(req:NextApiRequest,res:NextApiResponse) {
    if(req.method==='POST')return res.status(410).json({error:'legacy_distribution_retired',payments:'/payments'});
    if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
    res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=60');
    try{return res.status(200).json(await publicFinance());}
    catch{return res.status(503).json({error:'finance_unavailable'});}
}
