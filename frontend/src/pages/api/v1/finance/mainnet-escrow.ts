import type {NextApiRequest,NextApiResponse} from 'next';
import {requireNodeSignature} from '../../../../lib/nodeAuth';
import {mainnetWalletChallenge,authenticateMainnetWallet,requireMainnetWalletSession,allowMainnetBeneficiary} from '../../../../lib/mainnetWalletSession';
import {randomBytes} from 'node:crypto';
import {kvGet,kvSetNX,kvRateLimit} from '../../../../lib/kv';
import {getClientIp} from '../../../../lib/ratelimit';
import {rawAddress,type BatchAction} from '../../../../lib/batchEscrow';
import {mainnetPreview,mainnetStatus,mainnetTransaction,withMainnetRpc,mainnetPreflight} from '../../../../lib/mainnetEscrow';
import {MAINNET_ESCROW} from '../../../../lib/mainnetEscrowManifest';
import {mainnetCatalog,mainnetRpcConfigured,prepareMainnetJob,authorizedMainnetJob,readMainnetJob,hasMainnetAccess,privateMainnetJobView,queueMainnetJob,requireMainnetReceipt,requirePilotPayer} from '../../../../lib/mainnetJobs';
import {verifyPilotAuthorization} from '../../../../lib/escrowJobAuth';
export const config={api:{bodyParser:{sizeLimit:'32kb'}}};
const financial=new Set(['deploy','fund','accept','expire','sync','withdraw','refund','reclaim','report']);
export default async function handler(req:NextApiRequest,res:NextApiResponse){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 try{
  if(req.body?.network!=='-239')return res.status(409).json({error:'wrong_network'});
  if(!await kvRateLimit('escrow:mainnet:api:'+getClientIp(req.headers),12,60000))return res.status(429).json({error:'rate_limited'});
  const {action,input,access_token,actor,role=0}=req.body;
  if(action==='catalog')return res.status(200).json({manifest:MAINNET_ESCROW,rpc_configured:mainnetRpcConfigured(),offers:await mainnetCatalog()});
  if(action==='wallet-challenge')return res.status(200).json(await mainnetWalletChallenge(actor));
  if(action==='wallet-auth')return res.status(200).json(await authenticateMainnetWallet({wallet:actor,nonce:req.body.nonce,authorization:req.body.authorization,stateInit:req.body.stateInit}));
  if(action==='preflight'){
   if(req.body.node_id===MAINNET_ESCROW.bootstrapNode){const auth=await requireNodeSignature(MAINNET_ESCROW.bootstrapNode,req.headers as any);if(!auth.ok)return res.status(auth.status).json({error:auth.error});}
   else await requireMainnetWalletSession(req.body.wallet_token,actor);
   if(!mainnetRpcConfigured())throw Error('mainnet_rpc_not_configured');
   if(!await kvRateLimit('escrow:mainnet:chain',2,60000))return res.status(429).json({error:'rate_limited'});
   return res.status(200).json({preflight:await withMainnetRpc(mainnetPreflight)});
  }
  if(action==='prepare'){
   await requireMainnetWalletSession(req.body.wallet_token,req.body.payer);
   if(!await kvRateLimit('escrow:mainnet:prepare',5,60000))return res.status(429).json({error:'rate_limited'});
   const prepared=await prepareMainnetJob(req.body);await allowMainnetBeneficiary(prepared.input.worker);
   return res.status(200).json(prepared);
  }
  const preview=await mainnetPreview(input);
  if(action==='preview')return res.status(200).json({preview});
  if(action==='job-status'){const found=await authorizedMainnetJob(input,access_token);return res.status(200).json({job:privateMainnetJobView(found.record)});}
  if(action==='challenge'){
   await requireMainnetWalletSession(req.body.wallet_token,input.payer);
   const found=await authorizedMainnetJob(input,access_token);
   if(found.record.state!=='prepared')return res.status(200).json({job:privateMainnetJobView(found.record)});
   if(input.deadline*1000-Date.now()<MAINNET_ESCROW.minExecutionWindowSeconds*1000)throw Error('mainnet_job_expired');
   const nonce=randomBytes(32).toString('hex'),text=['GSTD: разрешение вычисления / computation permission','Network: TON mainnet (-239)','Task: '+input.taskId,'Node: '+input.execution.node_id,'Model: '+input.execution.model,'Reserved budget: '+input.budget+' GSTD','Prompt SHA256: '+input.execution.prompt_hash,'One funded inference only. No token transfer.','Nonce: '+nonce].join('\n');
   if(!await kvSetNX('escrow:mainnet:challenge:'+nonce,JSON.stringify({task:input.taskId,payer:input.payer,text}),300))throw Error('mainnet_job_conflict');
   return res.status(200).json({nonce,text});
  }
  if(action==='execute'){
   await requireMainnetWalletSession(req.body.wallet_token,input.payer);
   const found=await authorizedMainnetJob(input,access_token);
   if(found.record.state!=='prepared')return res.status(200).json({job:privateMainnetJobView(found.record)});
   requirePilotPayer(input.payer);
   if(!mainnetRpcConfigured())throw Error('mainnet_rpc_not_configured');
   const nonce=req.body.nonce;if(typeof nonce!=='string'||!/^[a-f0-9]{64}$/.test(nonce))throw Error('invalid_authorization');
   const raw=await kvGet('escrow:mainnet:challenge:'+nonce),challenge=raw?JSON.parse(raw):null;
   if(!challenge||challenge.task!==input.taskId||challenge.payer!==input.payer||!verifyPilotAuthorization(req.body.authorization,req.body.stateInit,challenge.payer,challenge.text))throw Error('invalid_authorization');
   if(!await kvRateLimit('escrow:mainnet:chain',2,60000))return res.status(429).json({error:'rate_limited'});
   const status=await withMainnetRpc(rpc=>mainnetStatus(input,rpc));
   if(!status.deployed||status.state!==0||status.mask!==7||status.shares.length!==3||status.shares.some(s=>BigInt(s.missing_nano)!==0n))throw Error('state_not_ready');
   if(!await kvSetNX('escrow:mainnet:authorization-used:'+nonce,'1',3600))throw Error('authorization_used');
   return res.status(200).json({job:await queueMainnetJob(input,Date.now()),network:'-239',ledger_credited:false});
  }
  if(action!=='status'&&!financial.has(action))throw Error('invalid_action');
  await requireMainnetWalletSession(req.body.wallet_token,actor);
  if(![input.payer,input.worker,input.protocol,input.reserve].includes(rawAddress(actor)))throw Error('wrong_signer');
  if(!mainnetRpcConfigured())throw Error('mainnet_rpc_not_configured');
  if(financial.has(action)){
   const expected=action==='withdraw'?preview.shares[role]?.owner:preview.payer;
   if(!expected||rawAddress(actor)!==expected)throw Error('wrong_signer');
   if(['deploy','fund','accept'].includes(action))requirePilotPayer(input.payer);
  }
  if(!await kvRateLimit('escrow:mainnet:chain',2,60000))return res.status(429).json({error:'rate_limited'});
  const status=await withMainnetRpc(rpc=>mainnetStatus(input,rpc));
  if(action==='status'){
   const found=await readMainnetJob(input),job=found&&hasMainnetAccess(found.record,access_token)?privateMainnetJobView(found.record):undefined;
   return res.status(200).json({status,job});
  }
  if(action==='deploy'){
   await authorizedMainnetJob(input,access_token);
   if(status.deployed||BigInt(status.payer_balance)<BigInt(preview.budget_nano)||Date.now()>=input.deadline*1000)throw Error('state_not_ready');
  }
  if(action==='fund'){
   await authorizedMainnetJob(input,access_token);
   if(!status.deployed||status.state!==0||status.shares.length!==3||Date.now()+MAINNET_ESCROW.minExecutionWindowSeconds*1000>=input.deadline*1000)throw Error('state_not_ready');
   if(BigInt(status.payer_balance)<status.shares.reduce((sum,s)=>sum+BigInt(s.missing_nano),0n))throw Error('insufficient_gstd');
  }
  if(action==='accept'){
   if(!status.deployed||status.state!==0||status.mask!==7||Date.now()>=input.deadline*1000)throw Error('state_not_ready');
   await requireMainnetReceipt(input,access_token);
  }
  if(action==='expire'&&(!status.deployed||status.state!==0||Date.now()<=input.deadline*1000))throw Error('state_not_ready');
  if(action==='withdraw'&&(status.state!==1||status.shares[role]?.state!==1||BigInt(status.shares[role]?.balance_nano||'0')<=0n))throw Error('state_not_ready');
  if(action==='refund'&&(status.state!==2||status.shares.length!==3||status.shares.some(s=>s.state!==2)||!status.shares.some(s=>BigInt(s.balance_nano)>0n)))throw Error('state_not_ready');
  if(['sync','report','reclaim'].includes(action)&&!status.deployed)throw Error('state_not_ready');
  if(action==='report'&&(status.state!==0||status.mask===7))throw Error('state_not_ready');
  if(action==='reclaim'&&BigInt(status.native_nano)+status.shares.reduce((sum,s)=>sum+BigInt(s.native_nano),0n)<=100000000n)throw Error('state_not_ready');
  const transaction=await mainnetTransaction(input,action as BatchAction,actor,role,action==='fund'?status.shares.map(s=>BigInt(s.missing_nano)):undefined,action==='withdraw'?BigInt(status.shares[role].balance_nano):undefined,action==='refund'?status.shares.map(s=>BigInt(s.balance_nano)):undefined);
  return res.status(200).json({preview,transaction,network:'-239',test_only:false});
 }catch(e:any){
  const allowed=['invalid_address','invalid_mainnet_job','invalid_mainnet_recipients','mainnet_budget_limit','mainnet_pilot_wallet_required','mainnet_wallet_auth_required','unsupported_mainnet_wallet','mainnet_job_access_denied','mainnet_job_expired','mainnet_executor_unavailable','mainnet_job_conflict','mainnet_job_not_completed','mainnet_rpc_not_configured','mainnet_rpc_busy','mainnet_master_unverified','mainnet_master_mismatch','mainnet_state_mismatch','mainnet_unavailable','wrong_signer','invalid_role','invalid_action','invalid_authorization','authorization_used','state_not_ready','insufficient_gstd','already_funded'];
  return res.status(allowed.includes(e?.message)?409:503).json({error:allowed.includes(e?.message)?e.message:'mainnet_unavailable',...(e?.message==='mainnet_unavailable'&&typeof e.provider_diagnostic==='string'?{provider_diagnostic:e.provider_diagnostic.slice(0,300)}:{})});
 }
}
