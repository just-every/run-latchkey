// Client-side transport for Cloudflare Email Routing (buyer-controlled forwarding on the buyer's own zone).
// Never expose this as a server fetch proxy. The host and paths are fixed here; a token, zone, account or rule
// reference can only select a resource under api.cloudflare.com. Nothing is persisted, retried or logged.
const origin = 'https://api.cloudflare.com/client/v4', deadlineMs = 15000;
const identifier = /^[0-9a-f]{32}$/, mail = /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
const fail = code => { const error = new Error(code); error.code = code; return error; };
const need = (condition, code) => { if (!condition) throw fail(code); };
const token = value => { need(typeof value === 'string' && value.length > 0 && value.length <= 4000 && !/\s/.test(value), 'invalid_alias_provider_token'); return value; };
const zoneId = value => { need(identifier.test(value), 'invalid_alias_zone'); return value; };
const accountId = value => { need(identifier.test(value), 'invalid_alias_account'); return value; };
const ruleId = value => { need(identifier.test(value), 'invalid_alias_rule'); return value; };
const address = value => { need(typeof value === 'string' && mail.test(value), 'invalid_alias_address'); return value.toLowerCase(); };
const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
// An unguessable local part that reveals nothing about the person or the site.
export function generateLocalPart(random = globalThis.crypto) {
 const values = random.getRandomValues(new Uint8Array(14));
 return 'lk-' + Array.from(values, value => alphabet[value % alphabet.length]).join('');
}
async function call(fetcher, credential, method, path, body) {
 const controller = new AbortController(), timer = setTimeout(() => controller.abort(), deadlineMs);
 try {
  const response = await (fetcher ?? globalThis.fetch)(origin + path, { method, redirect: 'error', credentials: 'omit', signal: controller.signal, headers: { authorization: `Bearer ${credential}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  let envelope = null;
  try { envelope = await response.json(); } catch { /* an unreadable body is judged by status below */ }
  return { status: response.status, envelope };
 } catch { return { transport: true }; } finally { clearTimeout(timer); }
}
const code = envelope => Array.isArray(envelope?.errors) && envelope.errors.length && Number.isSafeInteger(envelope.errors[0]?.code) ? envelope.errors[0].code : null;
// What a failed provider call lets the caller honestly claim: a refusal changed nothing; an outage or malformed answer may have.
function failure(reply, write) {
 if (reply.transport) return { outcome: write ? 'ambiguous' : 'unknown', status: null, failure: 'provider_unreachable', retryable: false, providerCode: null };
 const { status, envelope } = reply, providerCode = code(envelope);
 if (status === 401 || status === 403) return { outcome: 'rejected', status, failure: 'provider_authorization', retryable: false, providerCode };
 if (status === 429) return { outcome: 'rejected', status, failure: 'provider_rate_limited', retryable: true, providerCode };
 if (status >= 500 || status < 200) return { outcome: write ? 'ambiguous' : 'unknown', status, failure: 'provider_unavailable', retryable: false, providerCode };
 if (status >= 400) return { outcome: 'rejected', status, failure: 'provider_rejected', retryable: false, providerCode };
 return { outcome: write ? 'ambiguous' : 'unknown', status, failure: 'provider_response_malformed', retryable: false, providerCode };
}
const succeeded = reply => !reply.transport && reply.status >= 200 && reply.status < 300 && reply.envelope?.success === true;
// Reduce a rule to what Latchkey cares about: is it on, and where does it send mail for exactly this address.
export function observeRule(rule, alias) {
 const matchers = Array.isArray(rule?.matchers) ? rule.matchers : [], actions = Array.isArray(rule?.actions) ? rule.actions : [];
 const exact = matchers.length === 1 && matchers[0]?.type === 'literal' && matchers[0]?.field === 'to' && (alias === undefined || String(matchers[0]?.value).toLowerCase() === alias);
 const forward = actions.length === 1 && actions[0]?.type === 'forward' && Array.isArray(actions[0].value) && actions[0].value.length === 1 ? String(actions[0].value[0]).toLowerCase() : null;
 return { enabled: rule?.enabled === true && exact, forwardTo: exact ? forward : null, address: exact ? String(matchers[0].value).toLowerCase() : null };
}
const ruleResult = (rule, alias, reference) => rule && typeof rule === 'object' && identifier.test(String(rule.id ?? rule.tag ?? '')) && (reference === undefined || (rule.id ?? rule.tag) === reference) ? { ref: rule.id ?? rule.tag, observed: observeRule(rule, alias) } : null;

/** Read the zone's routing state. A zone is usable only while routing is enabled and its status is ready. */
export async function observeDomain({ zone, token: credential, fetcher }) {
 const reply = await call(fetcher, token(credential), 'GET', `/zones/${zoneId(zone)}/email/routing`);
 if (!succeeded(reply)) return failure(reply, false);
 const result = reply.envelope.result;
 if (typeof result?.enabled !== 'boolean' || typeof result?.status !== 'string' || typeof result?.name !== 'string') return failure({ status: reply.status, envelope: null }, false);
 return { outcome: 'ok', observation: { enabled: result.enabled, status: result.status, domain: result.name } };
}
/** Find a destination address on the account and report whether the provider has verified it. */
export async function observeMailbox({ account, address: mailbox, token: credential, fetcher }) {
 const wanted = address(mailbox);
 for (let page = 1; page <= 10; page++) {
  const reply = await call(fetcher, token(credential), 'GET', `/accounts/${accountId(account)}/email/routing/addresses?page=${page}&per_page=50`);
  if (!succeeded(reply)) return failure(reply, false);
  const rows = reply.envelope.result;
  if (!Array.isArray(rows)) return failure({ status: reply.status, envelope: null }, false);
  const found = rows.find(row => typeof row?.email === 'string' && row.email.toLowerCase() === wanted);
  if (found) return { outcome: 'ok', observation: { found: true, verified: typeof found.verified === 'string' && found.verified.length > 0, providerRef: String(found.id ?? found.tag ?? '').match(/^[A-Za-z0-9_-]{1,64}$/)?.[0] ?? null } };
  const info = reply.envelope.result_info;
  if (!rows.length || !info || page * (info.per_page ?? 50) >= (info.total_count ?? 0)) break;
 }
 return { outcome: 'ok', observation: { found: false, verified: false, providerRef: null } };
}
/** Ask the provider to send its own verification message to a destination address. Nothing is verified until the owner confirms there. */
export async function requestMailbox({ account, address: mailbox, token: credential, fetcher }) {
 const reply = await call(fetcher, token(credential), 'POST', `/accounts/${accountId(account)}/email/routing/addresses`, { email: address(mailbox) });
 if (!succeeded(reply)) return failure(reply, true);
 const result = reply.envelope.result;
 if (typeof result?.email !== 'string' || result.email.toLowerCase() !== address(mailbox)) return failure({ status: reply.status, envelope: null }, true);
 return { outcome: 'ok', observation: { found: true, verified: typeof result.verified === 'string' && result.verified.length > 0, providerRef: String(result.id ?? result.tag ?? '').match(/^[A-Za-z0-9_-]{1,64}$/)?.[0] ?? null } };
}
/** Create one literal rule: mail for the alias is forwarded to the approved destination. */
export async function createAlias({ zone, alias, destination, name, token: credential, fetcher }) {
 const wanted = address(alias), target = address(destination);
 const reply = await call(fetcher, token(credential), 'POST', `/zones/${zoneId(zone)}/email/routing/rules`, { name: String(name ?? 'Latchkey alias').slice(0, 64), enabled: true, matchers: [{ type: 'literal', field: 'to', value: wanted }], actions: [{ type: 'forward', value: [target] }] });
 if (!succeeded(reply)) return failure(reply, true);
 const result = ruleResult(reply.envelope.result, wanted);
 // A success that does not describe the requested rule is not evidence of it.
 if (!result) return failure({ status: reply.status, envelope: null }, true);
 return { outcome: 'ok', status: reply.status, ruleRef: result.ref, observed: { enabled: result.observed.enabled, forwardTo: result.observed.forwardTo } };
}
/** Read the rule back from the provider. */
export async function readAlias({ zone, ruleRef, alias, token: credential, fetcher }) {
 const reply = await call(fetcher, token(credential), 'GET', `/zones/${zoneId(zone)}/email/routing/rules/${ruleId(ruleRef)}`);
 if (!succeeded(reply)) { if (!reply.transport && reply.status === 404) return { outcome: 'rejected', status: 404, failure: 'provider_rule_missing', retryable: false, providerCode: code(reply.envelope) }; return failure(reply, false); }
 const result = ruleResult(reply.envelope.result, alias, ruleRef);
 if (!result) return failure({ status: reply.status, envelope: null }, false);
 return { outcome: 'ok', status: reply.status, ruleRef: result.ref, observed: { enabled: result.observed.enabled, forwardTo: result.observed.forwardTo }, address: result.observed.address, rule: reply.envelope.result };
}
/** Find the rule for exactly this address, for settling an outcome the provider never confirmed. */
export async function findAlias({ zone, alias, token: credential, fetcher }) {
 const wanted = address(alias);
 for (let page = 1; page <= 20; page++) {
  const reply = await call(fetcher, token(credential), 'GET', `/zones/${zoneId(zone)}/email/routing/rules?page=${page}&per_page=50`);
  if (!succeeded(reply)) return failure(reply, false);
  const rows = reply.envelope.result;
  if (!Array.isArray(rows)) return failure({ status: reply.status, envelope: null }, false);
  for (const rule of rows) { const found = ruleResult(rule, wanted); if (found && found.observed.address === wanted) return { outcome: 'ok', status: reply.status, ruleRef: found.ref, observed: { enabled: found.observed.enabled, forwardTo: found.observed.forwardTo } }; }
  const info = reply.envelope.result_info;
  if (!rows.length || !info || page * (info.per_page ?? 50) >= (info.total_count ?? 0)) break;
 }
 return { outcome: 'rejected', status: 200, failure: 'provider_rule_missing', retryable: false, providerCode: null };
}
async function change({ zone, ruleRef, token: credential, fetcher }, edit) {
 const current = await readAlias({ zone, ruleRef, token: credential, fetcher });
 if (current.outcome !== 'ok') return { ...current, outcome: current.outcome === 'unknown' ? 'rejected' : current.outcome };
 const rule = current.rule, body = { name: rule.name, priority: rule.priority, enabled: rule.enabled, matchers: rule.matchers, actions: rule.actions };
 const reply = await call(fetcher, credential, 'PUT', `/zones/${zoneId(zone)}/email/routing/rules/${ruleId(ruleRef)}`, edit(body));
 if (!succeeded(reply)) return failure(reply, true);
 // The write response is not trusted for the outcome. The caller reads the provider state back.
 const back = await readAlias({ zone, ruleRef, token: credential, fetcher });
 return back.outcome === 'ok' ? back : { ...back, outcome: 'ambiguous' };
}
/** Disable (or re-enable) forwarding at the provider and read the rule back. */
export const setAliasEnabled = ({ enabled, ...options }) => change(options, body => ({ ...body, enabled: !!enabled }));
/** Point the alias at another approved destination and read the rule back. */
export const retargetAlias = ({ destination, ...options }) => change(options, body => ({ ...body, actions: [{ type: 'forward', value: [address(destination)] }] }));
