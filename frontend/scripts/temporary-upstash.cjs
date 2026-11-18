'use strict';
// Official, account-free scratch storage. Never use this for production backing.
function descriptorCredentials(text) {
    if (typeof text !== 'string' || text.length > 65536) throw Error('invalid_temporary_redis_descriptor');
    const url = text.match(/https:\/\/[a-z\d-]+\.upstash\.io(?=[\s`"'/]|$)/i)?.[0];
    const token = text.match(/(?:\*\*(?:REST (?:API )?)?Token:\*\*\s*`?|REST_TOKEN\s*["']?\s*[:=]\s*["'`]?|Authorization:\s*Bearer\s+)([\w+=/-]{24,})/i)?.[1];
    if (!url || !token) throw Error('temporary_redis_credentials_missing');
    return {url, token};
}
async function createTemporaryRedis() {
    const response = await fetch('https://upstash.com/start-redis', {
        method:'POST', headers:{'User-Agent':'codex-gstd-preview'},
        signal:AbortSignal.timeout(20000), redirect:'error',
    });
    if (!response.ok) throw Error('temporary_redis_provision_http_'+response.status);
    return descriptorCredentials(await response.text());
}
module.exports = {descriptorCredentials, createTemporaryRedis};
