import { pathToFileURL } from 'node:url';

export const DOMAIN = 'gstdtoken.xyz';

// Restricted to the owner's requested domain. No registrar, subscription or credential writes.
export async function inspectDomainZone({ token, accountId, createPending = false, request = fetch }) {
  if (!token || !/^[a-f0-9]{32}$/i.test(accountId || '')) throw new Error('missing_cloudflare_configuration');
  const call = async (path, init = {}) => {
    const response = await request(`https://api.cloudflare.com/client/v4${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      redirect: 'manual', signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      const codes = Array.isArray(result?.errors) ? result.errors.map(error => Number(error.code)).filter(Number.isSafeInteger).join(',') : '';
      throw new Error(`cloudflare_http_${response.status}${codes ? '_codes_' + codes : ''}`);
    }
    return result.result;
  };
  const query = new URLSearchParams({ name: DOMAIN, 'account.id': accountId });
  const zones = await call('/zones?' + query);
  if (!Array.isArray(zones) || zones.length > 1) throw new Error('unexpected_zone_response');
  let zone = zones[0];
  if (!zone && createPending) {
    zone = await call('/zones', { method: 'POST', body: JSON.stringify({ name: DOMAIN, account: { id: accountId }, type: 'full' }) });
  }
  if (!zone) return { domain: DOMAIN, status: 'not_added', nameservers: [] };
  if (zone.name !== DOMAIN || zone.account?.id !== accountId) throw new Error('zone_identity_mismatch');
  const nameservers = zone.name_servers;
  if (!Array.isArray(nameservers) || nameservers.length !== 2 || nameservers.some(name => !/^[a-z0-9-]+\.ns\.cloudflare\.com$/.test(name))) {
    throw new Error('unexpected_nameservers');
  }
  return { domain: DOMAIN, status: zone.status, nameservers, plan: zone.plan?.legacy_id || 'unknown' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await inspectDomainZone({ token: process.env.CLOUDFLARE_API_TOKEN,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID, createPending: process.argv.includes('--create-pending-zone') });
    console.log(JSON.stringify(report));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `Domain: ${report.domain}\n\nStatus: ${report.status}\n\nNameservers: ${report.nameservers.join(', ') || 'not assigned'}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(/^(missing_cloudflare_configuration|cloudflare_http_\d+(?:_codes_[\d,]+)?|unexpected_zone_response|zone_identity_mismatch|unexpected_nameservers)$/.test(message) ? message : 'domain_zone_check_failed');
    process.exitCode = 1;
  }
}
