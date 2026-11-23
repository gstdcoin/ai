import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectDomainZone } from './domain-zone.mjs';
const accountId = 'a'.repeat(32), token = 'test-only-token';
const zone = { id: 'b'.repeat(32), name: 'gstdtoken.xyz', account: { id: accountId }, status: 'pending',
  name_servers: ['first.ns.cloudflare.com', 'second.ns.cloudflare.com'], plan: { legacy_id: 'free' } };
test('reads only the requested domain in the configured account without a write', async () => {
  let calls = 0;
  const report = await inspectDomainZone({ token, accountId, request: async (url, options) => {
    calls++; assert.equal(new URL(url).searchParams.get('name'), 'gstdtoken.xyz');
    assert.equal(options.redirect, 'manual'); assert.equal(options.method, undefined);
    return Response.json({ success: true, result: [zone] });
  } });
  assert.equal(report.plan, 'free'); assert.equal(calls, 1); assert.equal(JSON.stringify(report).includes(token), false);
});
test('creates only a missing pending full zone; never changes a subscription or registrar', async () => {
  const paths = [];
  const report = await inspectDomainZone({ token, accountId, createPending: true, request: async (url, options) => {
    paths.push(new URL(url).pathname);
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { name: 'gstdtoken.xyz', account: { id: accountId }, type: 'full' });
      return Response.json({ success: true, result: zone });
    }
    return Response.json({ success: true, result: [] });
  } });
  assert.deepEqual(paths, ['/client/v4/zones', '/client/v4/zones']); assert.equal(report.status, 'pending');
});
test('does not create unless explicitly requested and rejects mismatched zones or permissions', async () => {
  const report = await inspectDomainZone({ token, accountId, request: async () => Response.json({ success: true, result: [] }) });
  assert.equal(report.status, 'not_added');
  await assert.rejects(() => inspectDomainZone({ token, accountId, request: async () => Response.json({ success: true, result: [{ ...zone, name: 'other.example' }] }) }), /identity_mismatch/);
  await assert.rejects(() => inspectDomainZone({ token, accountId, request: async () => Response.json({ success: false, errors: [{ code: 10000, message: token }] }, { status: 403 }) }), /cloudflare_http_403_codes_10000/);
});
test('requests one activation check only for the validated pending zone, without changing DNS records', async () => {
  const calls = [];
  const report = await inspectDomainZone({ token, accountId, activate: true, request: async (url, options) => {
    calls.push({ path: new URL(url).pathname, method: options.method });
    return Response.json({ success: true, result: url.includes('?') ? [zone] : options.method === 'PUT' ? { id: zone.id } : { ...zone, status: 'active' } });
  } });
  assert.equal(report.status, 'active'); assert.equal(report.activation_requested, true);
  assert.equal(calls.filter(call => call.method === 'PUT').length, 1);
  assert.equal(calls[1].path, `/client/v4/zones/${zone.id}/activation_check`);
});
