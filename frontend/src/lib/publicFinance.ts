import { kvMGet } from './kv';
import { SPLIT, units } from './money';
export async function publicFinance() {
    const [protocol,reserve] = await kvMGet(['money:v2:fund:protocol','money:v2:fund:reserve']);
    const amount = (raw:string|null) => {
        const nano = raw ? JSON.parse(raw).nano : '0';
        if(typeof nano!=='string'||!/^\d+$/.test(nano))throw new Error('invalid_fund_record');
        return {nano,gstd:Number(units(nano))};
    };
    const p=amount(protocol),r=amount(reserve);
    return {ledger_version:2,treasury_gstd:p.gstd,protocol_treasury_gstd:p.gstd,protocol_nano:p.nano,
        reserve_gstd:r.gstd,reserve_nano:r.nano,
        fee_split:{node_operators_pct:SPLIT.executor,protocol_treasury_pct:SPLIT.protocol,reserve_pct:SPLIT.reserve},
        automatic_distribution_enabled:false,withdrawal_mode:'owner_signed',
        note:'Fund balances are allocations in the backed ledger. They are not separate contract wallets. No automatic buybacks or liquidity distribution.',
        timestamp:Date.now()};
}
