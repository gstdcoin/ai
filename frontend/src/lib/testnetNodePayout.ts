import {createHash} from 'node:crypto';
import {kvGet,kvMoneyCAS} from './kv';
import {walletId} from './money';
import {MAX_SKEW_MS,nodeKeyRedisKey} from './nodeAuth';
import {verifyEd25519} from './ed25519';
export interface TestnetPayout{address:string;revision:number;updated_at:string;network:'-3'}
const key=(id:string)=>'node_payout_testnet:'+id;
export const testnetPayoutMessage=(nodeId:string,address:string,revision:number,timestamp:number)=>createHash('sha256').update(JSON.stringify(['gstd:escrow:testnet-payout:v1','-3',nodeId,address,revision,timestamp])).digest();
export async function testnetNodePayout(id:string):Promise<TestnetPayout|null>{const raw=await kvGet(key(id));if(!raw)return null;const value=JSON.parse(raw);if(value.network!=='-3'||!Number.isSafeInteger(value.revision)||value.revision<1)throw Error('invalid_testnet_payout');return{...value,address:walletId(value.address)};}
export async function setTestnetNodePayout(input:{nodeId:string;address:string;revision:number;timestamp:number;signature:string}):Promise<TestnetPayout>{
 const address=walletId(input.address);
 if(!Number.isSafeInteger(input.revision)||input.revision<0||!Number.isSafeInteger(input.timestamp)||Math.abs(Date.now()-input.timestamp)>MAX_SKEW_MS||typeof input.signature!=='string'||!/^[a-f0-9]{128}$/i.test(input.signature))throw Error('invalid_payout_signature');
 const publicKey=await kvGet(nodeKeyRedisKey(input.nodeId));if(!publicKey||!verifyEd25519(testnetPayoutMessage(input.nodeId,address,input.revision,input.timestamp),Buffer.from(input.signature,'hex'),Buffer.from(publicKey,'hex')))throw Error('invalid_payout_signature');
 const name=key(input.nodeId),raw=await kvGet(name),previous=raw?JSON.parse(raw):null;if((previous?.revision||0)!==input.revision)throw Error('payout_revision_conflict');
 const next:TestnetPayout={address,network:'-3',revision:input.revision+1,updated_at:new Date().toISOString()};if(!await kvMoneyCAS({[name]:raw},{[name]:JSON.stringify(next)}))throw Error('payout_revision_conflict');return next;
}
