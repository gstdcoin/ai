import{randomBytes,createPrivateKey,createPublicKey,createHash}from 'node:crypto';
export const WORKER='gstd-ai-platform',SECRET='PLATFORM_RELEASE_SIGNING_SEED';
export function validateRecoveryRequest(request,expectedPublicKey,now=Date.now()){
 if(!request||Object.keys(request).sort().join(',')!=='action,expectedPublicKey,expiresAt,id,issuedAt,worker'||request.action!=='rotate-node-release-key'||request.worker!==WORKER||
 !/^[a-f0-9]{64}$/.test(expectedPublicKey)||request.expectedPublicKey!==expectedPublicKey||
 !/^[a-f0-9-]{36}$/.test(request.id)||!Number.isSafeInteger(request.issuedAt)||!Number.isSafeInteger(request.expiresAt)||
 request.issuedAt>now+5000||request.issuedAt<now-3600000||request.expiresAt<=now||request.expiresAt>request.issuedAt+3600000)throw Error('Release recovery approval is missing, stale or does not match the current trust root');
 return request;
}
/** The uploader receives the seed only in process memory. The artifact is public data only. */
export async function provisionReleaseKey({putSecret,writePublicArtifact,random=randomBytes,request,now=Date.now()}){
 const seed=random(32);if(!Buffer.isBuffer(seed)||seed.length!==32)throw Error('Invalid key generator');
 const encoded=Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]);
 try{
  const key=createPrivateKey({key:encoded,format:'der',type:'pkcs8'}),publicKey=createPublicKey(key).export({format:'der',type:'spki'}).subarray(-32);
  const artifact={worker:WORKER,secret:SECRET,request_id:request.id,public_key:publicKey.toString('hex'),fingerprint_sha256:createHash('sha256').update(publicKey).digest('hex'),created_at:new Date(now).toISOString()};
  await writePublicArtifact({...artifact,upload_status:'prepared'});
  try{await putSecret(seed);}catch(error){await writePublicArtifact({...artifact,upload_status:'failed_or_uncertain'});throw error;}
  const uploaded={...artifact,upload_status:'uploaded'};await writePublicArtifact(uploaded);
  return uploaded;
 }finally{seed.fill(0);encoded.fill(0);}
}
