// Invoked only by the manual recovery workflow. No secret is printed or written to a file.
import{readFile,writeFile}from 'node:fs/promises';
import{fileURLToPath}from 'node:url';
import{resolve,dirname}from 'node:path';
import{spawn}from 'node:child_process';
import{validateRecoveryRequest,provisionReleaseKey,WORKER,SECRET}from './release-recovery-core.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
async function main(){
 if(process.env.GITHUB_ACTIONS!=='true'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_RUN_ATTEMPT!=='1')throw Error('Recovery requires a first-attempt owner-authorized main-branch workflow run');
 if(!process.env.CLOUDFLARE_ACCOUNT_ID||!process.env.CLOUDFLARE_API_TOKEN||!process.env.RUNNER_TEMP)throw Error('Existing deployment access is unavailable');
 const source=await readFile(resolve(root,'frontend/src/lib/nodeRelease.ts'),'utf8'),key=source.match(/RELEASE_PUBLIC_KEY='([a-f0-9]{64})'/)?.[1];
 const request=validateRecoveryRequest(JSON.parse(await readFile(resolve(root,'.github/release-recovery-approval.json'),'utf8')),key);
 const config=await readFile(resolve(root,'frontend/wrangler.production.jsonc'),'utf8');
 if(config.match(/"name"\s*:\s*"([^"]+)"/)?.[1]!==WORKER)throw Error('Recovery target is not the approved production Worker');
 let artifactWritten=false;
 const artifact=await provisionReleaseKey({request,
  putSecret:seed=>new Promise((accept,reject)=>{
   const child=spawn(process.execPath,[resolve(root,'frontend/node_modules/wrangler/bin/wrangler.js'),'secret','put',SECRET,'--config','wrangler.production.jsonc'],
    {cwd:resolve(root,'frontend'),env:{...process.env,CI:'true',WRANGLER_SEND_METRICS:'false'},stdio:['pipe','pipe','pipe']});
   // Never forward Wrangler output: unexpected output must not reveal generated credentials.
   child.stdout.resume();child.stderr.resume();child.on('error',()=>reject(Error('Release-key upload could not start')));
   child.stdin.on('error',()=>reject(Error('Release-key upload input failed')));
   child.on('close',code=>code===0?accept():reject(Error('Release-key upload failed; inspect access, not secret values')));
   child.stdin.end(seed.toString('hex'));
  }),
  writePublicArtifact:async artifact=>{await writeFile(resolve(process.env.RUNNER_TEMP,'public-release-key.json'),JSON.stringify(artifact,null,2)+'\n',{mode:0o600,flag:artifactWritten?'w':'wx'});artifactWritten=true;},
 });
 console.log(JSON.stringify(artifact)); // Public key and operation identity only.
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
