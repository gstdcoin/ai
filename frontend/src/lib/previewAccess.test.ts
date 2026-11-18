import {describe,it,expect} from 'vitest';
import {previewAccess} from '../../worker-preview-access';
describe('private preview boundary',()=>{
    const now=1800000000000,key='a'.repeat(64);
    const env={GSTD_PRIVATE_PREVIEW:'true',GSTD_PREVIEW_ACCESS_KEY:key,GSTD_PREVIEW_EXPIRES_AT:String(now+10000)};
    const request=(value?:string)=>new Request('https://preview.workers.dev/api/v1/finance/withdraw',{headers:value?{'x-gstd-preview-key':value}:{}});
    it('denies missing, malformed and incorrect keys before application dispatch',()=>{
        for(const value of [undefined,'short','b'.repeat(64)])expect(previewAccess(request(value),env,now)?.status).toBe(403);
        expect(previewAccess(request(key),env,now)).toBeNull();
    });
    it('fails closed before secret provisioning and after expiry',()=>{
        for(const altered of [{...env,GSTD_PREVIEW_ACCESS_KEY:undefined},{...env,GSTD_PREVIEW_EXPIRES_AT:undefined},
            {...env,GSTD_PREVIEW_EXPIRES_AT:String(now)},{...env,GSTD_PREVIEW_EXPIRES_AT:String(now+1800001)},
            {...env,GSTD_PRIVATE_PREVIEW:'false'}])expect(previewAccess(request(key),altered,now)?.status).toBe(403);
    });
    it('leaves the production environment public',()=>expect(previewAccess(request(),{},now)).toBeNull());
});
