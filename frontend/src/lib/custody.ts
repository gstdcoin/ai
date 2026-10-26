import { Cell, loadTransaction } from '@ton/core';
import { MoneyError, walletId } from './money';
export const PLATFORM_CUSTODY_OWNER = '0:cc1db8988345b901e6eb39bd6fda9350fc6a02b22df7bcb4ac2542a2fdf29931';
export const GSTD_MASTER = '0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2';
async function get(path: string, allowMissing = false) {
    const response = await fetch('https://tonapi.io/v2/' + path,{ signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new MoneyError('chain_snapshot_unavailable');
    return await response.json() as any;
}
async function method(address: string, name: string, args?: string) {
    const data = await get('blockchain/accounts/' + encodeURIComponent(walletId(address)) +
        '/methods/' + name + (args ? '?args=' + encodeURIComponent(args) : ''));
    if (!data.success || !data.decoded) throw new MoneyError('chain_snapshot_unavailable');
    return data.decoded;
}
async function pace() { await new Promise(resolve => setTimeout(resolve,1100)); }
export async function jettonWalletFor(owner: string) {
    const resolved = await method(GSTD_MASTER,'get_wallet_address',walletId(owner));
    return walletId(resolved.jetton_wallet_address || resolved.jettonWalletAddress);
}
/** Read-only mainnet verification; never accepts a caller-supplied token balance. */
export async function custodySnapshot(owner: string) {
    owner = walletId(owner);
    await pace();
    const jettonWallet = await jettonWalletFor(owner);
    await pace(); // Respect the unauthenticated chain provider's free request rate.
    const result = await get('blockchain/accounts/' + encodeURIComponent(jettonWallet) + '/methods/get_wallet_data',true);
    if (result === null) return { owner, jettonWallet, reserve: '0' };
    if (!result.success || !result.decoded) throw new MoneyError('chain_snapshot_unavailable');
    const wallet = result.decoded;
    if (walletId(wallet.owner) !== owner || walletId(wallet.jetton) !== GSTD_MASTER ||
        !/^\d+$/.test(String(wallet.balance))) throw new MoneyError('invalid_custody_wallet');
    return { owner, jettonWallet, reserve: String(wallet.balance) };
}
/** Parse the actual TEP-74 inbound transfer, not indexer UI actions or an asserted amount. */
export async function verifyDeposit(hash: string, sender: string, receiverJettonWallet: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw new MoneyError('invalid_transaction_hash');
    hash = hash.toLowerCase(); sender = walletId(sender); receiverJettonWallet = walletId(receiverJettonWallet);
    await pace();
    const data = await get('blockchain/transactions/' + hash);
    const root = Cell.fromBoc(Buffer.from(data.raw,'hex'))[0];
    if (root.hash().toString('hex') !== hash || walletId(data.account.address) !== receiverJettonWallet)
        throw new MoneyError('invalid_deposit_transaction');
    const tx = loadTransaction(root.beginParse()), msg = tx.inMessage;
    const description = tx.description;
    if (description.type !== 'generic' || description.aborted || description.computePhase.type !== 'vm' ||
        !description.computePhase.success || description.actionPhase?.success === false ||
        !msg || msg.info.type !== 'internal' || msg.info.bounced ||
        msg.info.dest.toRawString() !== receiverJettonWallet) throw new MoneyError('deposit_not_successful');
    const body = msg.body.beginParse();
    if (body.loadUint(32) !== 0x178d4519) throw new MoneyError('not_a_jetton_transfer');
    const queryId = body.loadUintBig(64), amount = body.loadCoins(), from = body.loadAddress().toRawString();
    if (from !== sender || amount <= 0n) throw new MoneyError('deposit_sender_mismatch');
    await pace();
    const senderJettonWallet = await jettonWalletFor(sender);
    if (msg.info.src.toRawString() !== senderJettonWallet) throw new MoneyError('invalid_jetton_sender');
    return { hash, amount: String(amount), sender, queryId: String(queryId), utime: tx.now };
}

/** Reads only public chain state. Standard TON wallet seqno binds the signing window. */
export async function custodyWalletSeqno(owner: string): Promise<string> {
    const data=await get('blockchain/accounts/'+encodeURIComponent(walletId(owner))+'/methods/seqno');
    if(!data.success || !data.stack?.[0]?.num) throw new MoneyError('custody_wallet_not_ready');
    return BigInt(data.stack[0].num).toString();
}
export async function chainHeadTime(): Promise<number> {
    const head=await get('blockchain/masterchain-head');
    if(!Number.isSafeInteger(head.gen_utime)) throw new MoneyError('chain_snapshot_unavailable');
    return head.gen_utime;
}

export async function findWithdrawalReceipt(w: {wallet:string;amount:string;queryId:string;dispatchedAt?:number},owner:string) {
    const receiver=await jettonWalletFor(w.wallet);
    let before='';
    for(let page=0;page<3;page++){
        await pace();
        const data=await get('blockchain/accounts/'+encodeURIComponent(receiver)+'/transactions?limit=20'+
            (before?'&before_lt='+before:''),true);
        if(!data?.transactions?.length)return null;
        for(const item of data.transactions){
            if(!item.raw)continue;
            const root=Cell.fromBoc(Buffer.from(item.raw,'hex'))[0],tx=loadTransaction(root.beginParse());
            before=tx.lt.toString();
            if(tx.now < Math.floor((w.dispatchedAt||0)/1000)-30)return null;
            const msg=tx.inMessage;
            if(!msg||msg.info.type!=='internal'||msg.info.bounced)continue;
            const b=msg.body.beginParse();
            if(b.remainingBits<96||b.loadUint(32)!==0x178d4519)continue;
            const query=b.loadUintBig(64).toString(),amount=b.loadCoins().toString(),from=b.loadAddress().toRawString();
            if(query===w.queryId&&amount===w.amount&&from===walletId(owner))
                return verifyDeposit(root.hash().toString('hex'),owner,receiver);
        }
    }
    return null; // Bounded search is not evidence of failure. A receipt hash can still be supplied.
}
