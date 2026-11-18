// Job-scoped credentials only. Does not create or update GitHub repository secrets.
import {createRequire} from 'node:module';
import {appendFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
const require=createRequire(new URL('../frontend/package.json',import.meta.url));
const {createTemporaryRedis}=require('./scripts/temporary-upstash.cjs');
const {Redis}=require('@upstash/redis/cloudflare');
try {
    const env=process.env;
    if (!env.GITHUB_ENV || env.GITHUB_ACTIONS!=='true') throw Error('github_actions_required');
    const configuredUrl=env.CONFIGURED_PREVIEW_REDIS_URL||'',configuredToken=env.CONFIGURED_PREVIEW_REDIS_TOKEN||'';
    if (Boolean(configuredUrl)!==Boolean(configuredToken)) throw Error('incomplete_preview_redis_configuration');
    const temporary=!configuredUrl;
    const {url,token}=temporary?await createTemporaryRedis():{url:configuredUrl,token:configuredToken};
    const preview=new URL(url),production=new URL(env.PROD_REDIS_URL);
    if (preview.protocol!=='https:' || preview.username || preview.password || preview.search || preview.hash
        || preview.origin===production.origin || !token || token===env.PROD_REDIS_TOKEN || /[\r\n]/.test(token)) throw Error('preview_redis_not_isolated');
    // Mask before any SDK call. Exception objects and descriptors are never logged.
    for (const value of [url,token]) process.stdout.write('::add-mask::'+value+'\n');
    const redis=new Redis({url,token,signal:()=>AbortSignal.timeout(10000)});
    if (await redis.ping()!=='PONG') throw Error('preview_redis_unreachable');
    if (temporary && await redis.dbsize()!==0) throw Error('temporary_preview_redis_not_empty');
    const access=randomBytes(32).toString('hex');
    process.stdout.write('::add-mask::'+access+'\n');
    const values={PREVIEW_REDIS_URL:url,PREVIEW_REDIS_TOKEN:token,GSTD_PREVIEW_ACCESS_KEY:access,
        GSTD_PREVIEW_EXPIRES_AT:String(Date.now()+30*60*1000),PREVIEW_REDIS_TEMPORARY:String(temporary)};
    appendFileSync(env.GITHUB_ENV,Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join(''));
    console.log(temporary?'Provisioned empty temporary preview Redis (72-hour provider expiry).':'Verified independently configured preview Redis.');
} catch {
    console.error('Preview Redis provisioning/isolation failed; production deployment remains blocked.');
    process.exitCode=1;
}
