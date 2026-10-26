import type { NextApiRequest, NextApiResponse } from 'next';
export default function handler(_req: NextApiRequest,res: NextApiResponse) {
    return res.status(410).json({ error: 'legacy_settlement_disabled', ledger_version: 2, withdrawal_enabled: false });
}
