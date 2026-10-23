import { id, keypair, publicKey, sign, verify } from '../crypto/envelope.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class FleetError extends Error {
 constructor(code, status = 0) { super(code); this.code = code; this.status = status; }
}
const requireValue = (condition, code) => { if (!condition) throw new FleetError(code); };
function origin(value) {
 let url;
 try { url = new URL(value); } catch { throw new FleetError('invalid_origin'); }
 requireValue(url.origin === value && (url.protocol === 'https:' || url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)), 'https_required');
 return value;
}
export async function createProviderIdentity(consoleOrigin) {
 return { schema: 'latchkey/provider/v1', provider: id(), origin: origin(consoleOrigin), ...await keypair('sign') };
}
export function publicProviderIdentity(identity) {
 return { provider: identity.provider, publicKey: identity.publicKey, consoleOrigin: identity.origin };
}
export async function parsePublicProviderIdentity(value) {
 requireValue(value && Object.keys(value).sort().join() === ['provider', 'publicKey', 'consoleOrigin'].sort().join(), 'invalid_public_identity');
 requireValue(uuid.test(value.provider), 'invalid_provider');
 origin(value.consoleOrigin);
 await publicKey(value.publicKey, 'sign');
 return { provider: value.provider, publicKey: value.publicKey, consoleOrigin: value.consoleOrigin };
}
export async function parseProviderIdentity(value, consoleOrigin) {
 requireValue(value?.schema === 'latchkey/provider/v1' && uuid.test(value.provider), 'invalid_provider_identity');
 requireValue(origin(value.origin) === origin(consoleOrigin), 'console_origin_mismatch');
 const challenge = JSON.stringify(['latchkey/provider-identity/v1', id()]);
 requireValue(await verify(value.publicKey, await sign(value.privateKey, challenge), challenge), 'provider_key_mismatch');
 return { schema: value.schema, provider: value.provider, origin: value.origin, publicKey: value.publicKey, privateKey: value.privateKey };
}
export function parseDelegation(value, identity) {
 requireValue(value?.schema === 'latchkey/delegation/v1' && uuid.test(value.delegation) && uuid.test(value.tenant), 'invalid_delegation');
 origin(value.origin);
 requireValue(value.provider === identity.provider && value.publicKey === identity.publicKey && value.consoleOrigin === identity.origin, 'provider_mismatch');
 requireValue(Array.isArray(value.scopes) && value.scopes.includes('summary') && value.scopes.every(scope => ['summary', 'template'].includes(scope)) && new Set(value.scopes).size === value.scopes.length, 'invalid_scopes');
 requireValue(Number.isSafeInteger(value.expiresAt) && value.expiresAt > Date.now(), 'delegation_expired');
 return { schema: value.schema, origin: value.origin, tenant: value.tenant, delegation: value.delegation, provider: value.provider, publicKey: value.publicKey, consoleOrigin: value.consoleOrigin, scopes: [...value.scopes], expiresAt: value.expiresAt };
}
export class FleetClient {
 constructor(identity, { fetcher = (url, init) => globalThis.fetch(url, init), consoleOrigin = globalThis.location?.origin } = {}) {
  requireValue(identity?.schema === 'latchkey/provider/v1' && uuid.test(identity.provider), 'invalid_provider_identity');
  requireValue(origin(identity.origin) === origin(consoleOrigin), 'console_origin_mismatch');
  this.identity = identity;
  this.fetcher = fetcher;
 }
 async call(delegation, action, input = {}) {
  const grant = parseDelegation(delegation, this.identity);
  requireValue(['summary', 'preview', 'apply'].includes(action), 'invalid_action');
  requireValue(action === 'summary' || grant.scopes.includes('template'), 'scope_denied');
  const body = JSON.stringify({ delegation: grant.delegation, provider: this.identity.provider, nonce: id(), time: Date.now(), action, input });
  const signature = await sign(this.identity.privateKey, JSON.stringify(['latchkey/msp/v1', grant.origin, body]));
  let response;
  try { response = await this.fetcher(grant.origin + '/api/latchkey/msp/provider', { method: 'POST', headers: { origin: this.identity.origin, 'content-type': 'application/json', 'x-latchkey-provider-signature': signature }, body, credentials: 'omit', mode: 'cors', redirect: 'error' }); } catch { throw new FleetError('company_connection_unavailable'); }
  let result;
  try { result = await response.json(); } catch { throw new FleetError('service_unavailable', response.status); }
  if (!response.ok) throw new FleetError(typeof result?.error === 'string' && /^[a-z_]{1,64}$/.test(result.error) ? result.error : 'request_refused', response.status);
  if (action !== 'apply') requireValue(result?.tenant === grant.tenant && result?.delegation === grant.delegation, 'response_context_mismatch');
  if (action === 'preview') requireValue(uuid.test(result.id) && typeof result.hash === 'string' && Number.isSafeInteger(result.expiresAt) && result.expiresAt > Date.now(), 'invalid_preview');
  if (action === 'apply') requireValue(result?.applied === true, 'application_unverified');
  return result;
 }
 summary(delegation) { return this.call(delegation, 'summary'); }
 preview(delegation, policy) { return this.call(delegation, 'preview', { policy }); }
 apply(delegation, preview) {
  requireValue(preview?.tenant === delegation.tenant && preview?.delegation === delegation.delegation && preview.expiresAt > Date.now(), 'preview_expired_or_mismatched');
  return this.call(delegation, 'apply', { preview: preview.id, hash: preview.hash, confirmed: true });
 }
}
