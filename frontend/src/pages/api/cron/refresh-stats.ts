/** Retired legacy backfill. Real accounting is maintained by the funded v2 ledger. */
import type { NextApiRequest,NextApiResponse } from 'next';
export default function handler(_req:NextApiRequest,res:NextApiResponse) {
    res.setHeader('Cache-Control','no-store');
    return res.status(410).json({error:'legacy_stats_backfill_retired',
        stats_url:'/api/v1/network/stats',note:'No legacy balances or rewards are recreated. Finance maintenance uses the authenticated scheduled v2 handler.'});
}
