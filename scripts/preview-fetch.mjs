// CI capability headers may follow redirects only within the exact preview origin.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function previewFetch(base,path,{method='GET',headers={}}={}) {
    const origin=new URL(base),key=process.env.GSTD_PREVIEW_ACCESS_KEY;
    if(origin.protocol!=='https:' || origin.username || origin.password || origin.port
        || !origin.hostname.endsWith('.workers.dev') || !/^[a-f0-9]{64}$/.test(key||''))throw Error('invalid_private_preview_request');
    let target=new URL(path,origin);
    const signal=AbortSignal.timeout(30000);
    for(let count=0;count<6;count++){
        if(target.origin!==origin.origin)throw Error('preview_cross_origin_redirect_blocked');
        const response=await fetch(target,{method,headers:{...headers,'x-gstd-preview-key':key},redirect:'manual',signal});
        if(![301,302,303,307,308].includes(response.status))return response;
        const location=response.headers.get('location');await response.body?.cancel();
        if(!location)throw Error('preview_redirect_without_location');
        target=new URL(location,target);
        if(response.status===303)method='GET';
    }
    throw Error('preview_redirect_limit');
}
export async function boundedBody(response){
    const chunks=[];let size=0;
    for await(const chunk of response.body||[]){size+=chunk.length;if(size>8*1024*1024)throw Error('preview_body_too_large');chunks.push(chunk);}
    return Buffer.concat(chunks);
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
    const [base,path,output,method='GET']=process.argv.slice(2);
    try{if(!output)throw Error('output_required');const response=await previewFetch(base,path,{method});
        writeFileSync(output,await boundedBody(response));console.log(response.status);
    }catch{console.error('Private preview request failed.');process.exitCode=1;}
}
