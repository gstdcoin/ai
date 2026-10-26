/** Read-only legacy inventory. Never prints wallet keys, balances per user or credentials. */
const base = process.env.KV_REST_API_URL || '';
const token = process.env.KV_REST_API_TOKEN || '';
if (!base || !token) throw new Error('Inventory credentials are not configured');
async function redis(command) {
    const response = await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(command),signal:AbortSignal.timeout(15_000)});
    if(!response.ok)throw new Error('Inventory storage request failed');
    const data=await response.json();
    if(data.error)throw new Error('Inventory storage command failed');
    return data.result;
}
function conservativeNano(value) {
    const text=String(value??'0'),m=/^(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text);
    if(!m)throw new Error('Invalid legacy amount');
    const decimals=m[2]||'',exp=Number(m[3]||0)-decimals.length+9;
    if(Math.abs(exp)>100)throw new Error('Invalid legacy amount');
    const integer=BigInt(m[1]+decimals);
    if(exp>=0)return integer*10n**BigInt(exp);
    const divisor=10n**BigInt(-exp);return (integer+divisor-1n)/divisor;
}
async function inspect(pattern,prefix) {
    let cursor='0';const keys=new Set();
    do {
        const result=await redis(['SCAN',cursor,'MATCH',pattern,'COUNT','200']);cursor=String(result[0]);
        for(const key of result[1])keys.add(key);
        if(keys.size>5000)throw new Error('Legacy inventory exceeds the bounded inspection limit');
    }while(cursor!=='0');
    const list=[...keys];let total=0n,invalid=0,rawAddresses=0;
    for(let i=0;i<list.length;i+=100) {
        const batch=list.slice(i,i+100),values=await redis(['MGET',...batch]);
        for(let j=0;j<batch.length;j++) {
            if(/^(-?\d+):[a-fA-F0-9]{64}$/.test(batch[j].slice(prefix.length)))rawAddresses++;
            try{total+=conservativeNano(values[j]);}catch{invalid++;}
        }
    }
    return {records:list.length,total_nano:String(total),invalid_records:invalid,raw_address_records:rawAddresses,
        alias_records_requiring_identity_review:list.length-rawAddresses};
}
try {
    const balances=await inspect('balance:*','balance:'),pending=await inspect('rewards:pending:*','rewards:pending:');
    const funds=await redis(['MGET','treasury:balance','rewards:treasury','rewards:sovereign_pool','rewards:pool']);
    let internalFunds=0n;for(const value of funds)internalFunds+=conservativeNano(value);
    console.log(JSON.stringify({checked_at:new Date().toISOString(),read_only:true,complete:true,balances,pending,
        legacy_internal_funds_nano:String(internalFunds),
        conservative_total_nano:String(BigInt(balances.total_nano)+BigInt(pending.total_nano)+internalFunds),
        note:'Unreconciled records, not verified paid liabilities. No balances migrated; no funds transferred.'},null,2));
} catch {
    console.error('Read-only legacy inventory could not complete; no state was changed.');process.exitCode=1;
}
