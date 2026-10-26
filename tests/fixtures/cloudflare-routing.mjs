// Network-edge fake of Cloudflare Email Routing, following the published v4 schema: the
// { success, errors, messages, result } envelope, zone routing settings, account destination
// addresses and literal forward rules. It also models what the provider does with mail, so a test can
// see forwarding start and stop. It is a bounded fake, not a live connection.
import assert from 'node:assert/strict';
export const zoneId = 'a1b2c3d4e5f60718293a4b5c6d7e8f90', accountId = '0f9e8d7c6b5a49382716f5e4d3c2b1a0';
const hex = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
const envelope = (result, status = 200, extra = {}) => Response.json({ success: true, errors: [], messages: [], result, ...extra }, { status });
const refusal = (status, code, message) => Response.json({ success: false, errors: [{ code, message }], messages: [], result: null }, { status });
export function cloudflareEdge({ token, domain = 'mail.northstar-finance.test', zone = zoneId, account = accountId }) {
 const edge = { zone, account, calls: [], rules: new Map(), destinations: new Map(), inbox: [], dropped: [], faults: [], routing: { enabled: true, status: 'ready', name: domain } };
 edge.verify = email => { edge.destinations.get(email).verified = new Date().toISOString(); };
 // A fault is used once by the next call whose "method path" contains the pattern.
 // With after, the provider performs the call and then the answer is lost.
 edge.fault = (pattern, status, code = 1000, after = false) => edge.faults.push({ pattern, status, code, after });
 edge.fetch = async (url, init = {}) => {
  const request = new Request(url, init), path = new URL(url).pathname.replace('/client/v4', ''), key = `${request.method} ${path}`;
  assert.equal(new URL(url).origin, 'https://api.cloudflare.com'); assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
  edge.calls.push(key);
  if (request.headers.get('authorization') !== `Bearer ${token}`) return refusal(403, 10000, 'Authentication error');
  const fault = edge.faults.findIndex(row => key.includes(row.pattern)), lost = fault >= 0 ? edge.faults.splice(fault, 1)[0] : null;
  if (lost && !lost.after) return lost.status === 'drop' ? Promise.reject(new TypeError('network')) : refusal(lost.status, lost.code, 'provider fault');
  const answer = await edge.handle(request, path, key);
  return lost ? (lost.status === 'drop' ? Promise.reject(new TypeError('network')) : refusal(lost.status, lost.code, 'provider fault')) : answer;
 };
 edge.handle = async (request, path, key) => {
  const body = ['POST', 'PUT'].includes(request.method) ? await request.json() : null;
  if (body) assert.match(request.headers.get('content-type'), /^application\/json/);
  if (key === `GET /zones/${zone}/email/routing`) return envelope({ id: zone, tag: zone, name: edge.routing.name, enabled: edge.routing.enabled, status: edge.routing.status, created: '2026-01-01T00:00:00Z', modified: '2026-01-01T00:00:00Z', skip_wizard: true });
  if (key === `GET /accounts/${account}/email/routing/addresses`) { const all = [...edge.destinations.values()]; return envelope(all, 200, { result_info: { page: 1, per_page: 50, count: all.length, total_count: all.length } }); }
  if (key === `POST /accounts/${account}/email/routing/addresses`) {
   assert.deepEqual(Object.keys(body), ['email']); const existing = edge.destinations.get(body.email);
   if (existing) return refusal(409, 2007, 'Destination address already exists');
   const row = { id: hex(), tag: hex(), email: body.email, verified: null, created: new Date().toISOString(), modified: new Date().toISOString() }; edge.destinations.set(body.email, row); return envelope(row);
  }
  if (key === `POST /zones/${zone}/email/routing/rules`) {
   assert.ok(Array.isArray(body.matchers) && body.matchers.length === 1 && body.matchers[0].type === 'literal' && body.matchers[0].field === 'to'); assert.ok(Array.isArray(body.actions) && body.actions.length === 1 && body.actions[0].type === 'forward' && body.actions[0].value.length === 1);
   if (![...edge.rules.values()].every(rule => rule.matchers[0].value !== body.matchers[0].value)) return refusal(409, 2002, 'Rule already exists');
   const destination = edge.destinations.get(body.actions[0].value[0]); if (!destination?.verified) return refusal(400, 2020, 'Destination address is not verified');
   const rule = { id: hex(), tag: hex(), name: body.name, enabled: body.enabled, priority: 0, matchers: body.matchers, actions: body.actions }; edge.rules.set(rule.id, rule); return envelope(rule);
  }
  if (key === `GET /zones/${zone}/email/routing/rules`) { const all = [...edge.rules.values()]; return envelope(all, 200, { result_info: { page: 1, per_page: 50, count: all.length, total_count: all.length } }); }
  const rule = path.match(new RegExp(`^/zones/${zone}/email/routing/rules/([0-9a-f]{32})$`));
  if (rule) {
   const row = edge.rules.get(rule[1]); if (!row) return refusal(404, 2001, 'Rule not found');
   if (request.method === 'GET') return envelope(row);
   if (request.method === 'PUT') { assert.deepEqual(Object.keys(body).sort(), ['actions', 'enabled', 'matchers', 'name', 'priority']); Object.assign(row, body); return envelope(row); }
  }
  return refusal(404, 7003, 'No route for the requested URL');
 };
 // The provider's behaviour on inbound mail for an address.
 edge.deliver = (to, message) => {
  const rule = [...edge.rules.values()].find(row => row.matchers[0].value === to.toLowerCase());
  if (!rule) { edge.dropped.push({ to, reason: 'no-rule' }); return 'dropped'; }
  if (!rule.enabled) { edge.dropped.push({ to, reason: 'rule-disabled' }); return 'dropped'; }
  const destination = edge.destinations.get(rule.actions[0].value[0]);
  if (!destination?.verified) { edge.dropped.push({ to, reason: 'destination-unverified' }); return 'dropped'; }
  edge.inbox.push({ mailbox: destination.email, alias: to, ...message }); return 'forwarded';
 };
 return edge;
}
