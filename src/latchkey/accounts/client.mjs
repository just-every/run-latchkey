// Client-owned account links. This module is never imported by the service.
// A separately held key encrypts profiles; no company key, session, password,
// recovery kit or server-side registry participates in opening another account.
import { VaultClient, ClientError } from '../client.mjs';
import { bytes, decode, id, json, open, seal } from '../crypto/envelope.mjs';

const need = (value, code) => { if (!value) throw new ClientError(code); };
const profileFields = ['schema','origin','account','tenant','device','deviceSecret','serverKey','generation','seen','trusted','recipientKey','authorityKey'];
const uuid = value => typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value);
function profileFor(value) {
 need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...profileFields].sort().join(), 'invalid_account_profile');
 need(value.schema === 1 && uuid(value.account) && uuid(value.tenant) && uuid(value.device) && Number.isSafeInteger(value.generation) && value.generation > 0, 'invalid_account_profile');
 const client = new VaultClient(value.origin); client.lock();
 need(typeof value.deviceSecret === 'string' && decode(value.deviceSecret,32).length === 32 && typeof value.serverKey === 'string' && typeof value.recipientKey === 'string' && typeof value.authorityKey === 'string' && value.seen && value.trusted, 'invalid_account_profile');
 return structuredClone(value);
}
function entriesFor(entries) {
 need(Array.isArray(entries) && entries.length <= 20, 'invalid_account_links');
 const names = new Set(), accounts = new Set();
 const result = entries.map(entry => {
  need(entry && Object.keys(entry).sort().join() === 'kind,name,profile' && typeof entry.name === 'string' && /^[^\x00-\x1f\x7f]{1,80}$/.test(entry.name) && entry.name === entry.name.trim(), 'invalid_account_link');
  need(['work','personal','family'].includes(entry.kind), 'invalid_account_kind');
  const profile = profileFor(entry.profile), key = `${profile.origin}/${profile.account}`;
  need(!names.has(entry.name) && !accounts.has(key), 'duplicate_account_link'); names.add(entry.name); accounts.add(key);
  return { name: entry.name, kind: entry.kind, profile };
 });
 for (const work of result.filter(entry => entry.kind === 'work')) for (const independent of result.filter(entry => entry.kind !== 'work')) {
  need(work.profile.origin !== independent.profile.origin && work.profile.tenant !== independent.profile.tenant && work.profile.account !== independent.profile.account && work.profile.recipientKey !== independent.profile.recipientKey && work.profile.authorityKey !== independent.profile.authorityKey, 'independent_account_required');
 }
 return result;
}
const binding = object => ({ tenant:'client', vault:'account-links', object, purpose:'independent-profiles', epoch:1, version:1 });
export class AccountSwitcher {
 constructor(entries = [], { clientFor = profile => new VaultClient(profile.origin) } = {}) {
  this.entries = entriesFor(entries); this.clientFor = clientFor; this.active = null; this.selected = null;
 }
 list() { return this.entries.map(({name,kind,profile}) => ({name,kind,origin:profile.origin})); }
 remember() {
  if (this.active?.profile && this.selected) this.entries.find(entry => entry.name === this.selected).profile = profileFor(this.active.profile);
 }
 lock() { this.remember(); this.active?.lock(); this.active = null; this.selected = null; }
 async link({name,kind,profile}, password, {confirmed = false} = {}) {
  this.lock(); need(confirmed === true, 'account_link_confirmation_required');
  const next = entriesFor([...this.entries,{name,kind,profile}]), checked = next.at(-1), client = this.clientFor(checked.profile);
  try { await client.unlock(checked.profile,password); checked.profile = profileFor(client.profile); this.entries = next; }
  finally { client.lock(); }
  return this.list().at(-1);
 }
 unlink(name,{confirmed = false} = {}) {
  this.lock(); need(confirmed === true,'account_unlink_confirmation_required');
  need(this.entries.some(entry => entry.name === name),'account_link_not_found');
  this.entries = this.entries.filter(entry => entry.name !== name); return this.list();
 }
 async switch(name,password) {
  // Even a failed switch locks the previous account. No fallback to work keys.
  this.lock(); const entry = this.entries.find(entry => entry.name === name); need(entry, 'account_link_not_found');
  const client = this.clientFor(entry.profile);
  try { await client.unlock(profileFor(entry.profile),password); this.active = client; this.selected = name; return client; }
  catch (error) { client.lock(); throw error; }
 }
 async encrypt(registryKey) {
  this.remember(); const key = decode(registryKey,32); need(key.length === 32,'invalid_registry_key');
  const plaintext = bytes({schema:'latchkey/account-links/v1',entries:this.entries});
  try { need(plaintext.length <= 1000000,'account_registry_too_large'); return await seal(key,plaintext,binding(id())); } finally { key.fill(0); plaintext.fill(0); }
 }
 static async decrypt(envelope,registryKey,options) {
  need(uuid(envelope?.context?.object),'invalid_account_registry');
  const key = decode(registryKey,32); need(key.length === 32,'invalid_registry_key'); let plaintext;
  try {
   plaintext = await open(key,envelope,binding(envelope.context.object)); const value = json(plaintext);
   need(value && Object.keys(value).sort().join() === 'entries,schema' && value.schema === 'latchkey/account-links/v1','invalid_account_registry');
   return new AccountSwitcher(value.entries,options);
  } finally { key.fill(0); plaintext?.fill(0); }
 }
}
