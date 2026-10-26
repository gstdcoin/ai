/** Initialise only an empty monetary ledger, with zero assets and zero liabilities.
 * Does not allocate credits, submit a TON transaction, or read a private key. */
const base=process.env.KV_REST_API_URL,token=process.env.KV_REST_API_TOKEN;
const owner='0:cc1db8988345b901e6eb39bd6fda9350fc6a02b22df7bcb4ac2542a2fdf29931';
const master='0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2';
if(!base||!token)throw Error('Bootstrap storage credentials missing');
async function redis(command) {
    const r=await fetch(base,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify(command),signal:AbortSignal.timeout(15_000)});
    if(!r.ok)throw Error('Bootstrap storage unavailable');
    const data=await r.json();if(data.error)throw Error('Bootstrap command failed');return data.result;
}
if(await redis(['GET','money:v2:system'])) {
    console.log('Money v2 already initialised; no bootstrap changes.');
} else {
    const r=await fetch('https://tonapi.io/v2/blockchain/accounts/'+master+'/methods/get_wallet_address?args='+encodeURIComponent(owner),
        {signal:AbortSignal.timeout(15_000)});
    if(!r.ok)throw Error('Canonical GSTD wallet derivation unavailable');
    const data=await r.json(),wallet=data.decoded?.jetton_wallet_address;
    if(!data.success||!/^0:[a-f0-9]{64}$/.test(wallet))throw Error('Invalid canonical GSTD wallet');
    const now=Date.now();
    // Zero is deliberately conservative: no positive balance is asserted from an indexer miss.
    const state={owner,jettonWallet:wallet,reserve:'0',allocated:'0',legacyHold:'0',openedAt:now,
        checkedAt:now,validUntil:now+15*60_000,migrationReviewed:true,manifest:'empty-ledger-bootstrap-20261026'};
    const script=`
        if redis.call('EXISTS',KEYS[1]) == 1 then return 'already_initialised' end
        for _, pattern in ipairs({'balance:*','rewards:pending:*'}) do
            local cursor = '0'
            local rounds = 0
            repeat
                local page = redis.call('SCAN',cursor,'MATCH',pattern,'COUNT',200)
                cursor = page[1]
                if #page[2] > 0 then return 'nonempty_legacy_requires_review' end
                rounds = rounds + 1
                if rounds > 100 then return 'inventory_limit_requires_review' end
            until cursor == '0'
        end
        for _, key in ipairs({'treasury:balance','rewards:treasury','rewards:sovereign_pool','rewards:pool'}) do
            local value = redis.call('GET',key)
            if value and tonumber(value) ~= 0 then return 'nonempty_legacy_requires_review' end
        end
        local cursor = '0'
        local rounds = 0
        repeat
            local page = redis.call('SCAN',cursor,'MATCH','money:v2:account:*','COUNT',200)
            cursor = page[1]
            for _,key in ipairs(page[2]) do
                local ok,a = pcall(cjson.decode,redis.call('GET',key))
                if not ok or tonumber(a.available) ~= 0 or tonumber(a.pending) ~= 0 or tonumber(a.reserved) ~= 0
                    then return 'nonempty_v2_requires_review' end
            end
            rounds = rounds + 1
            if rounds > 100 then return 'inventory_limit_requires_review' end
        until cursor == '0'
        if redis.call('EXISTS',KEYS[2]) == 1 then return 'inventory_journal_requires_review' end
        redis.call('SET',KEYS[1],ARGV[1])
        redis.call('SET',KEYS[2],ARGV[2])
        return 'initialised_empty'
    `;
    const result=await redis(['EVAL',script,'2','money:v2:system','money:v2:inventory:empty-ledger-bootstrap-20261026',
        JSON.stringify(state),JSON.stringify({kind:'empty-ledger-bootstrap',owner,jettonWallet:wallet,
            reserve:'0',allocated:'0',legacyHold:'0',createdAt:now})]);
    console.log(JSON.stringify({result,reserve_nano:'0',allocated_nano:'0',funds_transferred:false}));
}
