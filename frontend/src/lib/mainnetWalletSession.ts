import {randomBytes,createHash} from 'node:crypto';
import {kvGet,kvSetNX,kvMoneyCAS} from './kv';
import {rawAddress} from './batchEscrow';
import {MAINNET_ESCROW as policy} from './mainnetEscrowManifest';
import {verifyPilotAuthorization} from './escrowJobAuth';
const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const allowedKey=(wallet:string)=>'escrow:mainnet:beneficiary:'+wallet;
async function allowed(wallet:string){return policy.pilotPayers.includes(wallet)||await kvGet(allowedKey(wallet))==='allowed';}
export async function allowMainnetBeneficiary(wallet:string){const key=allowedKey(rawAddress(wallet));await kvMoneyCAS({[key]:null},{[key]:'allowed'});}
export async function mainnetWalletChallenge(value:string){
 const wallet=rawAddress(value);if(!await allowed(wallet))throw Error('mainnet_pilot_wallet_required');
 const nonce=randomBytes(32).toString('hex'),text=['GSTD mainnet: подтверждение кошелька / wallet verification','Network: TON mainnet (-239)','Wallet: '+wallet,'Permission: read chain state and prepare unsigned operations for one hour.','No permission to sign or transfer tokens.','Nonce: '+nonce].join('\n');
 if(!await kvSetNX('escrow:mainnet:wallet-challenge:'+nonce,JSON.stringify({wallet,text}),300))throw Error('mainnet_job_conflict');
 return{nonce,text};
}
export async function authenticateMainnetWallet(value:{wallet:string;nonce:string;authorization:unknown;stateInit:unknown}){
 const wallet=rawAddress(value.wallet);if(!await allowed(wallet)||typeof value.nonce!=='string'||!/^[a-f0-9]{64}$/.test(value.nonce))throw Error('mainnet_wallet_auth_required');
 const raw=await kvGet('escrow:mainnet:wallet-challenge:'+value.nonce),challenge=raw?JSON.parse(raw):null;
 if(!challenge||challenge.wallet!==wallet||!verifyPilotAuthorization(value.authorization,value.stateInit,wallet,challenge.text))throw Error('mainnet_wallet_auth_required');
 if(!await kvSetNX('escrow:mainnet:wallet-challenge-used:'+value.nonce,'1',3600))throw Error('authorization_used');
 const token=randomBytes(32).toString('hex'),validUntil=Date.now()+3600000;
 if(!await kvSetNX('escrow:mainnet:wallet-session:'+digest(token),JSON.stringify({wallet,validUntil}),3600))throw Error('mainnet_job_conflict');
 return{wallet,wallet_token:token,valid_until:validUntil};
}
export async function requireMainnetWalletSession(token:unknown,value:string){
 const wallet=rawAddress(value);if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw Error('mainnet_wallet_auth_required');
 const raw=await kvGet('escrow:mainnet:wallet-session:'+digest(token)),session=raw?JSON.parse(raw):null;
 if(!session||session.wallet!==wallet||session.validUntil<=Date.now()||!await allowed(wallet))throw Error('mainnet_wallet_auth_required');
 return wallet;
}
