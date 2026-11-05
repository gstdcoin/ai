import{afterEach,expect,it,vi}from 'vitest';
import{createHash}from 'node:crypto';
import{keyPairFromSeed,signVerify}from '@ton/crypto';
vi.mock('@opennextjs/cloudflare',()=>({getCloudflareContext:vi.fn()}));
import{getCloudflareContext}from '@opennextjs/cloudflare';
import{APPROVED_NODE_RELEASE,signApprovedRelease,releaseSeed}from './nodeRelease';
import handler from '../pages/api/v1/nodes/update/manifest';
afterEach(()=>{vi.unstubAllEnvs();vi.resetAllMocks();});
it('signs the exact legacy node protocol, binds the approved commit and rejects tampering',()=>{
 const seed=Buffer.alloc(32,55),pair=keyPairFromSeed(seed),key=pair.publicKey.toString('hex');
 const m=signApprovedRelease(seed.toString('hex'),1800000000000,key);
 expect(m.commit).toBe(APPROVED_NODE_RELEASE.commit);
 const hash=(v:typeof m)=>createHash('sha256').update(`${v.commit}:${v.branch}:${v.version}:${v.timestamp}`).digest();
 expect(signVerify(hash(m),Buffer.from(m.sig,'hex'),pair.publicKey)).toBe(true);
 expect(signVerify(hash({...m,commit:'0'.repeat(40)}),Buffer.from(m.sig,'hex'),pair.publicKey)).toBe(false);
 expect(()=>signApprovedRelease(seed.toString('hex'))).toThrow('release_signing_unavailable');
 for(const invalid of [undefined,'','abc','0'.repeat(63)])expect(()=>signApprovedRelease(invalid)).toThrow('release_signing_unavailable');
});
it('uses authoritative Worker binding and does not fall back to a build secret inside Workers',()=>{
 vi.stubEnv('PLATFORM_RELEASE_SIGNING_SEED','build-fixture');
 vi.mocked(getCloudflareContext).mockReturnValue({env:{}} as any);expect(releaseSeed()).toBeUndefined();
 vi.mocked(getCloudflareContext).mockReturnValue({env:{PLATFORM_RELEASE_SIGNING_SEED:' runtime-fixture '}} as any);expect(releaseSeed()).toBe('runtime-fixture');
});
it('fails closed without a matching key and never echoes a secret or signs caller-selected input',()=>{
 const secret='1'.repeat(64);vi.mocked(getCloudflareContext).mockReturnValue({env:{PLATFORM_RELEASE_SIGNING_SEED:secret}} as any);
 const r={status:vi.fn().mockReturnThis(),json:vi.fn(),setHeader:vi.fn()};
 handler({method:'GET',query:{commit:'0'.repeat(40)}}as any,r as any);
 expect(r.status).toHaveBeenCalledWith(503);expect(JSON.stringify(r.json.mock.calls)).not.toContain(secret);
 expect(r.json).toHaveBeenCalledWith({error:'release_signing_unavailable'});
});
