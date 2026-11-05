import {RESERVE_LIQUIDITY} from './reserveLiquidity';
import { kvMGet } from './kv';
import {MAINNET_ESCROW} from './mainnetEscrowManifest';
import { SPLIT, units } from './money';
export async function publicFinance() {
    const [protocol,reserve] = await kvMGet(['money:v2:fund:protocol','money:v2:fund:reserve']);
    const amount = (raw:string|null) => {
        const nano = raw ? JSON.parse(raw).nano : '0';
        if(typeof nano!=='string'||!/^\d+$/.test(nano))throw new Error('invalid_fund_record');
        return {nano,gstd:Number(units(nano))};
    };
    const p=amount(protocol),r=amount(reserve);
    const credited=protocol?JSON.parse(protocol).creditedNano??'0':'0';
    if(typeof credited!=='string'||!/^\d+$/.test(credited))throw Error('invalid_fund_record');
    return {ledger_version:2,treasury_gstd:p.gstd,protocol_treasury_gstd:p.gstd,protocol_nano:p.nano,
        reserve_gstd:r.gstd,reserve_nano:r.nano,
        fee_split:{node_operators_pct:SPLIT.executor,protocol_treasury_pct:SPLIT.protocol,reserve_pct:SPLIT.reserve},
        automatic_distribution_enabled:false,withdrawal_mode:'owner_signed',
        protocol_beneficiary:MAINNET_ESCROW.protocol,protocol_ledger_credit_enabled:true,
        protocol_credited_nano:credited,protocol_credited_gstd:Number(units(credited)),
        reserve_purpose:'GSTD/XAUt0 liquidity',reserve_target:RESERVE_LIQUIDITY,reserve_auto_lp_enabled:false,
        reserve_blocker:'liquidity_executor_not_deployed',reserve_observation:'/api/v1/treasury/liquidity',
        note:'Protocol revenue is automatically credited to the confirmed beneficiary in the backed ledger. Credited totals are not wallet balances or chain payouts. Reserve remains a separate backed allocation; liquidity execution is not active.',
        timestamp:Date.now()};
}
