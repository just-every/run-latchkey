import { id, sign, verify } from '../crypto/envelope.mjs';
import { TypedItems, createItem } from '../items/index.mjs';
import { check } from '../items/fields.mjs';
import { filterRecords } from '../collections/client.mjs';

const providers = Object.freeze({ pki: ['venafi', 'keyfactor', 'infisical'], session: ['cyberark', 'delinea', 'strongdm', 'teleport'], mdm: ['jamf', 'kandji', 'intune'], spend: ['zylo', 'productiv'], tls: ['uptime'], workforce: ['willow', 'auth'], ticket: ['linen'], audit: ['porthole'], review: ['evidence'], incident: ['oncall'], task: ['pegboard'], payroll: ['envelope'] });
const uuid = value => check(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'opaque_reference_required');
const fields = value => Object.fromEntries(value.fields.map(field => [field.id, field.value]));
const referenceKeys = ['category','provider','source','destination','owner','origin'];
function reference(input) {
 check(input && Object.keys(input).sort().join() === [...referenceKeys].sort().join(), 'invalid_handoff_fields');
 check(Object.hasOwn(providers,input.category) && providers[input.category].includes(input.provider), 'unsupported_handoff_provider');
 for (const key of ['source','destination','owner']) uuid(input[key]);
 let url; try { url = new URL(input.origin); } catch {}
 check(url && url.protocol === 'https:' && !url.username && !url.password && url.origin === input.origin, 'handoff_origin_required');
 return Object.fromEntries(referenceKeys.map(key => [key,input[key]]));
}

const confirmationText = (tenant, vault, object, owner, input) => JSON.stringify(['latchkey-handoff-confirmation-v1', tenant, vault, object, owner, ...referenceKeys.map(key => input[key])]);

// No connector is inferred from a link. This door never sends a network request
// to a specialist and never records a successful provider response on its own.
export class HandoffClient {
 constructor(client) { this.client = client; this.items = new TypedItems(client); }
 async record(vault, input, { confirmed = false } = {}) {
  check(confirmed === true, 'handoff_confirmation_required');
  input = reference(input);
  const descriptor = (await this.client.call('vaults', {})).find(row => row.id === vault);
  check(descriptor?.owner === this.client.profile.account && descriptor.kind === 'company', 'handoff_owner_required');
  const object = id(), confirmation = await sign(this.client.bundle.root.authority.privateKey, confirmationText(this.client.profile.tenant, vault, object, descriptor.owner, input));
  const value = createItem('custom', { title: 'Handoff to ' + input.provider, fields: Object.entries({ ...input, confirmation, state: 'unresolved', result: 'adapter-unavailable', acknowledgement: 'none' }).map(([id, value]) => ({ id, label: id, type: 'text', secret: true, value })) });
  return this.items.save(vault, value, object);
 }
 async open(vault, object) {
  const row = await this.items.current(vault, object), value = fields(row.value);
  check(row.value.title === 'Handoff to ' + value.provider && Object.keys(value).sort().join() === [...referenceKeys,'confirmation','state','result','acknowledgement'].sort().join() && value.state === 'unresolved' && value.result === 'adapter-unavailable' && value.acknowledgement === 'none', 'handoff_not_found');
  const descriptor = (await this.client.call('vaults', {})).find(row => row.id === vault);
  const input = reference(Object.fromEntries(referenceKeys.map(key => [key,value[key]])));
  const authority = this.client.profile.trusted[descriptor?.owner]?.authorityKey;
  check(descriptor?.kind === 'company' && authority && await verify(authority, value.confirmation, confirmationText(this.client.profile.tenant, vault, object, descriptor.owner, input)), 'handoff_not_found');
  return { object, ...input, state:'unresolved', result:'adapter-unavailable', acknowledgement:'none', url:value.origin, authority:'reference-only', providerVerified:false };
 }
 async expiry(vault, { now = Date.now(), withinDays = 30 } = {}) {
  check(Number.isSafeInteger(now) && Number.isSafeInteger(withinDays) && withinDays >= 0 && withinDays <= 365, 'invalid_expiry_window');
  const lifecycle = await this.client.call('lifecycle' + '/list', { vault });
  const rows = filterRecords((await this.client.readVault(vault)).versions, { state: 'active' }, { lifecycle: lifecycle.items });
  const alerts = [];
  for (const row of rows) for (const field of row.value.fields) {
   if (field.id !== 'expiry' || field.type !== 'date' || !field.value) continue;
   const expiresAt = Date.parse(field.value);
   if (Number.isFinite(expiresAt) && expiresAt <= now + withinDays * 86400000) alerts.push({ object: row.object, version: row.version, expiresAt, state: expiresAt <= now ? 'expired' : 'expiring', delivery: 'received-in-client' });
  }
  return { alerts, coverage: 'currently-readable-active-items', externalDelivery: 'not-configured' };
 }
}
