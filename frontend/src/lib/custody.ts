import { Cell, loadTransaction } from '@ton/core';
import { MoneyError, walletId } from './money';
export const PLATFORM_CUSTODY_OWNER = '0:cc1db8988345b901e6eb39bd6fda9350fc6a02b22df7bcb4ac2542a2fdf29931';
export const GSTD_MASTER = '0:efe9c616f673622a337737097c0fa0018d4887d6061f59519985f3fbfbdb59b2';
async function get(path: string) {
    const response = await fetch('https://tonapi.io/v2/' + path,{ signal: AbortSignal.timeout(10_000), cache: 'no-store' });
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
    const wallet = await method(jettonWallet,'get_wallet_data');
    if (walletId(wallet.owner) !== owner || walletId(wallet.jetton) !== GSTD_MASTER ||
        !/^\d+$/.test(String(wallet.balance))) throw new MoneyError('invalid_custody_wallet');
    return { owner, jettonWallet, reserve: String(wallet.balance) };
}
/** Parse the actual TEP-74 inbound transfer, not indexer UI actions or an asserted amount. */
export async function verifyDeposit(hash: string, sender: string, receiverJettonWallet: string) {
    if (!/^[a-fA-F0-9]{64}$/.test(hash)) throw new MoneyError('invalid_transaction_hash');
    hash = hash.toLowerCase(); sender = walletId(sender); receiverJettonWallet = walletId(receiverJettonWallet);
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
