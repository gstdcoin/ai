import {kvGet,kvSetNX} from './kv';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {AgentGrant,GrantPolicy,digest,getAgentGrant,validateGrantPolicy,walletId,MoneyError} from './money';
export function grantAuthorizationText(wallet:string,policy:GrantPolicy,nonce:string){
 return ['GSTD paid inference allowance / Разрешение платных запросов','Domain: app.gstdtoken.com',
 'Network: TON mainnet (-239)','Owner: '+wallet,'Policy: '+JSON.stringify(policy),
 'Authorize automatic acceptance and 85/10/5 settlement for nonempty exact-model responses within this policy.',
 'Prompts are sent to the listed executors. This is a platform balance allowance, not a TON transfer or withdrawal.',
 'Revoke blocks new reservations. Already reserved requests may finish. No private keys are shared.',
 'Nonce: '+nonce].join('\n');
}
export async function grantChallenge(wallet:string,input:unknown){
 wallet=walletId(wallet);const policy=validateGrantPolicy(input),nonce=randomBytes(32).toString('hex');
 const text=grantAuthorizationText(wallet,policy,nonce),value={wallet,policy,text};
 if(!await kvSetNX('agent-grant:challenge:'+nonce,JSON.stringify(value),300))throw new MoneyError('grant_challenge_failed');
 return {nonce,text,policy};
}
export async function authenticateAgent(headers:Record<string,string|string[]|undefined>):Promise<AgentGrant>{
 const h=headers.authorization;
 if(typeof h!=='string'||!/^Bearer gstd_agent_[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(h))throw new MoneyError('agent_auth_required');
 const token=h.slice(7),id=token.slice('gstd_agent_'.length).split('.')[0],g=await getAgentGrant(id);
 const hash=digest(token);
 if(!g||typeof g.tokenHash!=='string'||g.tokenHash.length!==hash.length||
 !timingSafeEqual(Buffer.from(g.tokenHash),Buffer.from(hash)))throw new MoneyError('agent_auth_required');
 return g;
}
export async function readGrantChallenge(nonce:unknown,wallet:string){
 if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce))throw new MoneyError('grant_challenge_invalid');
 const raw=await kvGet('agent-grant:challenge:'+nonce);
 const value=raw&&raw!=='used'?JSON.parse(raw):null;
 if(!value||value.wallet!==walletId(wallet))throw new MoneyError('grant_challenge_invalid');
 return {raw:raw!,value};
}
