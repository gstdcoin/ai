/** Explicit association of a verified TON session and signed Telegram identity. */
import type {NextApiRequest,NextApiResponse} from 'next';
import {linkWithWalletProof} from './bot/link';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 return linkWithWalletProof(req,res);
}
