/** Signed node shutdown. Public wallet addresses never authorize deletion. */
import type { NextApiRequest, NextApiResponse } from 'next';
import { kvGet, kvDel } from '../../../../lib/kv';
import { requireNodeSignature } from '../../../../lib/nodeAuth';
export default async function handler(req: NextApiRequest,res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({error:'Method not allowed'});
    const nodeId=req.body?.node_id ?? req.headers['x-node-id'];
    if(typeof nodeId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(nodeId)) return res.status(400).json({error:'Invalid node_id'});
    try {
        const auth=await requireNodeSignature(nodeId,req.headers);
        if(!auth.ok)return res.status(auth.status).json({error:auth.error});
        const raw=await kvGet('node:'+nodeId);
        if(raw){
            const node=JSON.parse(raw);
            const provided=req.headers['x-wallet-address'];
            if(node.wallet_address && (typeof provided!=='string' || node.wallet_address.toLowerCase()!==provided.trim().toLowerCase()))
                return res.status(403).json({error:'Wallet mismatch'});
        }
        await kvDel('node:'+nodeId);
        return res.status(200).json({ok:true});
    } catch { return res.status(503).json({error:'Node registry unavailable'}); }
}
