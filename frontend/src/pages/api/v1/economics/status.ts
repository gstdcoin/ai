import type {NextApiRequest,NextApiResponse} from 'next';
import {currentMarketPrice} from '../../../../lib/workEconomics';
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).end();}
 try{
  const price=await currentMarketPrice();res.setHeader('Cache-Control','public, max-age=30, s-maxage=60');
  return res.status(200).json({pricing_version:1,reference_currency:'USD',settlement_asset:'GSTD',
   token_price_usd:price.price,observed_at:price.observedAt,source:price.source,quote_validity_seconds:90,
   operator_offers:'explicit_payout_owner_opt_in',legacy_tariffs:'unchanged_without_operator_offer',
   stablecoin_payout:false,guaranteed_profit:false,liquidity_execution_enabled:false});
 }catch{res.setHeader('Cache-Control','no-store');return res.status(503).json({error:'market_price_unavailable',stale_price_used:false});}
}
