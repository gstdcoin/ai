import { createHash } from 'node:crypto';
import { kvGet, kvMoneyCAS } from './kv';
import { walletId } from './money';
import { nodeKeyRedisKey, MAX_SKEW_MS } from './nodeAuth';
import { verifyEd25519 } from './ed25519';
export interface NodePayout { address: string; revision: number; updated_at: string }
const key=(nodeId:string)=>'node_payout:'+nodeId;
export function payoutMessage(nodeId:string,address:string,revision:number,timestamp:number) {
    return createHash('sha256').update(JSON.stringify(['gstd:payout:v1',nodeId,address,revision,timestamp])).digest();
}
export async function nodePayout(nodeId:string):Promise<NodePayout|null>{
    const raw=await kvGet(key(nodeId));if(!raw)return null;
    const value=JSON.parse(raw);
    return {...value,address:walletId(value.address)};
}
export async function executorPayout(nodeId:string,fallback:string):Promise<string>{
    return (await nodePayout(nodeId))?.address || walletId(fallback);
}
export async function setNodePayout(input:{nodeId:string;address:string;revision:number;timestamp:number;signature:string}):Promise<NodePayout>{
    const address=walletId(input.address);
    if(!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isSafeInteger(input.timestamp)||
       Math.abs(Date.now()-input.timestamp)>MAX_SKEW_MS||!/^([a-f0-9]{2}){64}$/i.test(input.signature))throw Error('invalid_payout_signature');
    const publicKey=await kvGet(nodeKeyRedisKey(input.nodeId));
    if(!publicKey||!verifyEd25519(payoutMessage(input.nodeId,address,input.revision,input.timestamp),Buffer.from(input.signature,'hex'),Buffer.from(publicKey,'hex')))
        throw Error('invalid_payout_signature');
    const name=key(input.nodeId),raw=await kvGet(name),previous:NodePayout|null=raw?JSON.parse(raw):null;
    if((previous?.revision||0)!==input.revision)throw Error('payout_revision_conflict');
    const next={address,revision:input.revision+1,updated_at:new Date().toISOString()};
    if(!await kvMoneyCAS({[name]:raw},{[name]:JSON.stringify(next)}))throw Error('payout_revision_conflict');
    return next;
}
