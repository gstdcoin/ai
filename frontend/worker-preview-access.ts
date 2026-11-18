import {timingSafeEqual} from 'node:crypto';
export type PreviewEnvironment={GSTD_PRIVATE_PREVIEW?:unknown;GSTD_PREVIEW_ACCESS_KEY?:unknown;GSTD_PREVIEW_EXPIRES_AT?:unknown};
export function previewAccess(request:Request,env:PreviewEnvironment,now=Date.now()):Response|null {
    if (env.GSTD_PRIVATE_PREVIEW===undefined) return null;
    const expected=env.GSTD_PREVIEW_ACCESS_KEY,provided=request.headers.get('x-gstd-preview-key');
    const expiry=Number(env.GSTD_PREVIEW_EXPIRES_AT);
    if (env.GSTD_PRIVATE_PREVIEW!=='true' || typeof expected!=='string' || !/^[a-f0-9]{64}$/.test(expected)
        || !provided || !/^[a-f0-9]{64}$/.test(provided) || !Number.isSafeInteger(expiry) || now>=expiry
        || expiry-now>30*60*1000 || !timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(provided,'hex'))) {
        return new Response('Private CI preview',{status:403,headers:{'Cache-Control':'private, no-store'}});
    }
    return null;
}
