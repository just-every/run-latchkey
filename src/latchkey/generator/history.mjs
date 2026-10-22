import { bytes, json, open, seal, id, derive } from '../crypto/envelope.mjs';
import { check } from '../items/fields.mjs';
import { effectivePolicy } from './policy.mjs';
export async function generatorHistoryKey(client) {
 const profile = client?.profile, privateKey = client?.bundle?.root?.recipient?.privateKey;
 check(typeof privateKey === 'string' && profile?.tenant && profile?.account, 'unlocked_client_required');
 const secret = bytes(['latchkey/local-generator-root/v1', privateKey]);
 try { return await derive(secret, `${profile.tenant}/${profile.account}`, 'generator-history'); } finally { secret.fill(0); }
}

// Storage is a local-only read/write interface. No request/fetch/telemetry hook
// is accepted. The encryption key is supplied by the unlocked client and never
// persisted beside the encrypted history.
export class GeneratorHistory {
 constructor({ storage, key, tenant, account, now = () => Date.now(), policy = {} }) {
  check(storage && typeof storage.read === 'function' && typeof storage.write === 'function', 'local_storage_required');
  check(key instanceof Uint8Array && key.length === 32, 'invalid_history_key');
  this.storage = storage; this.key = key.slice(); this.now = now; this.policy = effectivePolicy(policy);
  this.context = { tenant, vault: 'local-generator', object: account, purpose: 'generator-history', epoch: 1, version: 1 };
  this.queue = Promise.resolve();
 }
 retention() { return { days: this.policy.historyDays, localOnly: true, encrypted: true }; }
 async read() {
  check(this.key, 'locked');
  const encrypted = await this.storage.read();
  if (!encrypted) return [];
  const data = json(await open(this.key, encrypted, this.context));
  check(data?.schema === 1 && Array.isArray(data.entries), 'invalid_generator_history');
  for (const entry of data.entries) check(typeof entry.id === 'string' && typeof entry.value === 'string' && Number.isSafeInteger(entry.created) && Number.isSafeInteger(entry.expires), 'invalid_generator_history');
  // A shortened company policy also shortens previously generated entries.
  const now = this.now(), period = this.policy.historyDays * 86400000;
  return data.entries.filter(entry => entry.created <= now && Math.min(entry.expires, entry.created + period) > now);
 }
 async write(entries) {
  check(this.key, 'locked');
  await this.storage.write(await seal(this.key, bytes({ schema: 1, entries }), this.context));
 }
 update(operation) {
  const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result;
 }
 async list() { return this.update(async () => { const entries = await this.read(); await this.write(entries); return entries; }); }
 async add(generated) {
  check(typeof generated?.value === 'string' && ['password', 'passphrase'].includes(generated.kind), 'invalid_generated_value');
  return this.update(async () => {
   const entries = await this.read(), created = this.now(), entry = { id: id(), value: generated.value, kind: generated.kind, created, expires: created + Math.floor(this.policy.historyDays * 86400000) };
   if (this.policy.historyDays > 0) entries.push(entry);
   await this.write(entries); return { id: entry.id, created, expires: entry.expires, retained: this.policy.historyDays > 0 };
  });
 }
 async clear(entryId) { return this.update(async () => { const entries = await this.read(); await this.write(entryId == null ? [] : entries.filter(entry => entry.id !== entryId)); }); }
 async export() { return this.list(); }
 lock() { this.key?.fill(0); this.key = null; }
}

export class BrowserHistoryStorage {
 constructor(storage, name) { check(storage && typeof name === 'string' && name.length > 0, 'local_storage_required'); this.storage = storage; this.name = name; }
 async read() { const value = this.storage.getItem(this.name); return value == null ? null : JSON.parse(value); }
 async write(value) { this.storage.setItem(this.name, JSON.stringify(value)); }
}
