import type{NextApiRequest,NextApiResponse}from 'next';
import{RELEASE_PUBLIC_KEY,releaseSeed,signApprovedRelease}from '../../../../../lib/nodeRelease';
/** Public release signature only: no caller-selected commit, message or signing key. */
export default function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Access-Control-Allow-Origin','*');
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({error:'method_not_allowed'});}
 try{
  const manifest=signApprovedRelease(releaseSeed());
  res.setHeader('Cache-Control','public, max-age=5, s-maxage=5');
  return res.status(200).json({manifest,public_key:RELEASE_PUBLIC_KEY});
 }catch{
  res.setHeader('Cache-Control','no-store');
  return res.status(503).json({error:'release_signing_unavailable'});
 }
}
