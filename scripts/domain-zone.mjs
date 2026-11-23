import { pathToFileURL } from 'node:url';

export const DOMAIN = 'gstdtoken.xyz';

export async function bindDomainWorkers({ token, accountId, request = fetch }) {
  if (!token || !/^[a-f0-9]{32}$/i.test(accountId || '')) throw new Error('missing_cloudflare_configuration');
  const call = async (path, init = {}) => {
    const response = await request(`https://api.cloudflare.com/client/v4${path}`, { ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      redirect: 'manual', signal: AbortSignal.timeout(15_000) });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true) {
      const codes = Array.isArray(result?.errors) ? result.errors.map(error => Number(error.code)).filter(Number.isSafeInteger).join(',') : '';
      throw new Error(`cloudflare_http_${response.status}${codes ? '_codes_' + codes : ''}`);
    }
    return result.result;
  };
  const zones = await call('/zones?' + new URLSearchParams({ name: DOMAIN, 'account.id': accountId }));
  if (!Array.isArray(zones) || zones.length !== 1) throw new Error('unexpected_zone_response');
  const zone = zones[0];
  if (zone.name !== DOMAIN || zone.account?.id !== accountId || !/^[a-f0-9]{32}$/i.test(zone.id || '')) throw new Error('zone_identity_mismatch');
  if (zone.status !== 'active') return { domain: DOMAIN, status: zone.status, bound: [] };
  const bindings = [[DOMAIN, 'gstd-web'], ['www.' + DOMAIN, 'gstd-web'], ['app.' + DOMAIN, 'gstd-ai-platform']];
  const existing = await call(`/accounts/${accountId}/workers/domains`);
  if (!Array.isArray(existing)) throw new Error('unexpected_zone_response');
  const bound = [];
  for (const [hostname, service] of bindings) {
    const current = existing.find(domain => domain.hostname === hostname);
    if (current && (current.service !== service || current.zone_id !== zone.id)) throw new Error('worker_domain_conflict');
    if (!current) {
      const attached = await call(`/accounts/${accountId}/workers/domains`, { method: 'PUT',
        body: JSON.stringify({ hostname, service, environment: 'production', zone_id: zone.id }) });
      if (attached.hostname !== hostname || attached.service !== service) throw new Error('worker_domain_conflict');
    }
    bound.push({ hostname, service });
  }
  return { domain: DOMAIN, status: zone.status, bound };
}

// Restricted to the owner's requested domain. No registrar, subscription or credential writes.
export async function inspectDomainZone({ token, accountId, createPending = false, activate = false, request = fetch }) {
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
  let activationRequested = false;
  if (activate && zone.status === 'pending') {
    if (!/^[a-f0-9]{32}$/i.test(zone.id || '')) throw new Error('unexpected_zone_response');
    await call(`/zones/${zone.id}/activation_check`, { method: 'PUT' });
    activationRequested = true;
    zone = await call(`/zones/${zone.id}`);
    if (zone.name !== DOMAIN || zone.account?.id !== accountId) throw new Error('zone_identity_mismatch');
  }
  return { domain: DOMAIN, status: zone.status, nameservers, plan: zone.plan?.legacy_id || 'unknown', activation_requested: activationRequested };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const config = { token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      createPending: process.argv.includes('--create-pending-zone'), activate: process.argv.includes('--activate') };
    const report = process.argv.includes('--bind-workers') ? await bindDomainWorkers(config) : await inspectDomainZone(config);
    console.log(JSON.stringify(report));
    if (process.env.GITHUB_STEP_SUMMARY) {
      const { appendFile } = await import('node:fs/promises');
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `Domain: ${report.domain}\n\nStatus: ${report.status}\n\nNameservers: ${report.nameservers?.join(', ') || 'see zone setup'}\n\nBound hosts: ${report.bound?.map(item => item.hostname).join(', ') || 'not bound by this check'}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    console.error(/^(missing_cloudflare_configuration|cloudflare_http_\d+(?:_codes_[\d,]+)?|unexpected_zone_response|zone_identity_mismatch|unexpected_nameservers|worker_domain_conflict)$/.test(message) ? message : 'domain_zone_check_failed');
    process.exitCode = 1;
  }
}
