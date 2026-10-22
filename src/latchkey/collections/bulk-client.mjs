import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes, digest, itemKey, seal } from '../crypto/envelope.mjs';

export class BulkClientError extends Error { constructor(code, status = 0) { super(code); this.code = code; this.status = status; } }
const need = (condition, code) => { if (!condition) throw new BulkClientError(code); };
const hash = value => digest(canonicalJson(value));
const normalizeTags = value => {
 need(Array.isArray(value) && value.length <= 100, 'invalid_bulk_tags');
 need(value.every(tag => typeof tag === 'string' && tag.trim().length > 0 && tag.length <= 200), 'invalid_bulk_tags');
 return [...new Set(value.map(tag => tag.trim()))].sort();
};
const binding = (result, object, version) => ({ tenant: result.tenant, vault: result.vault, object, purpose: 'item', epoch: result.epoch, version });

export class BulkClient {
 constructor(client) { this.client = client; }
 async preview({ selection, destination = null, action, tags = [] }) {
  const normalized = action === 'tag' ? normalizeTags(tags) : [];
  need(action !== 'tag' || normalized.length > 0, 'invalid_bulk_tags');
  const result = await this.client.call('bulk/preview', { selection, destination: action === 'move' ? destination : null, action, tagsHash: await hash(normalized) });
  const { planHash, ...plan } = result;
  need(plan.schema === 'latchkey/bulk-plan/v1' && await hash(plan) === planHash && plan.tagsHash === await hash(normalized), 'invalid_bulk_plan');
  return { ...result, tags: normalized };
 }
 async snapshots(ids, work) {
  const unique = [...new Set(ids)], loaded = await Promise.allSettled(unique.map(vault => this.client.snapshot(vault)));
  const snapshots = new Map();
  for (let index = 0; index < loaded.length; index++) if (loaded[index].status === 'fulfilled') snapshots.set(unique[index], loaded[index].value);
  try {
   const failure = loaded.find(result => result.status === 'rejected'); if (failure) throw failure.reason;
   return await work(snapshots);
  } finally { for (const snapshot of snapshots.values()) snapshot.key.fill(0); }
 }
 async encrypt(snapshot, object, version, value) {
  const key = await itemKey(snapshot.key, snapshot.result.tenant, snapshot.result.vault, object), plaintext = bytes(value);
  try { return { vault: snapshot.result.vault, object, version, envelope: await seal(key, plaintext, binding(snapshot.result, object, version)) }; }
  finally { key.fill(0); plaintext.fill(0); }
 }
 async prepare(plan, tags = [], undo = false) {
  if (plan.action === 'archive' || undo && plan.action === 'move') return { writes: [], remembered: [] };
  const sources = [...new Set(plan.selection.map(row => row.vault))];
  const destination = undo ? null : plan.destination?.id ?? null;
  return this.snapshots([...sources, ...(destination ? [destination] : [])], async snapshots => {
   const decoded = new Map(), writes = [], remembered = [];
   await Promise.all(sources.map(async vault => decoded.set(vault, await this.client.decodeVersions(snapshots.get(vault)))));
   for (const selected of plan.selection) {
    const records = decoded.get(selected.vault).filter(row => row.object === selected.object);
    const originalVersion = undo ? selected.restoreVersion : selected.version;
    const current = records.find(row => row.version === originalVersion);
    need(current?.value?.schema === 'latchkey/item/v1', 'bulk_item_required');
    if (plan.action === 'move') {
     need(canonicalJson(records.map(row => row.version).sort((a, b) => a - b)) === canonicalJson(selected.versions), 'bulk_plan_changed');
     for (const row of records) {
      writes.push(await this.encrypt(snapshots.get(destination), row.object, row.version, row.value));
      remembered.push({ vault: destination, object: row.object, version: row.version, hash: await digest(bytes(row.value)) });
     }
    } else {
     need(Array.isArray(current.value.tags), 'invalid_item_tags');
     const value = undo ? current.value : { ...current.value, tags: [...new Set([...current.value.tags, ...tags])] };
     const version = selected.version + 1;
     writes.push(await this.encrypt(snapshots.get(selected.vault), selected.object, version, value));
     remembered.push({ vault: selected.vault, object: selected.object, version, hash: await digest(bytes(value)) });
    }
   }
   return { writes, remembered };
  });
 }
 remember(plan, remembered) {
  for (const vault of plan.vaults) {
   const seen = this.client.profile?.seen?.[vault.id];
   if (!seen) continue;
   seen.revision = Math.max(seen.revision, vault.revision + 1);
   seen.versions = { ...seen.versions };
   for (const row of remembered.filter(row => row.vault === vault.id)) seen.versions[`${row.object}:${row.version}`] = row.hash;
  }
 }
 async commit(preview, { confirmed = false } = {}) {
  need(confirmed === true, 'bulk_confirmation_required');
  const { planHash, tags, ...plan } = preview;
  need(plan.schema === 'latchkey/bulk-plan/v1' && await hash(plan) === planHash, 'bulk_plan_changed');
  need(plan.selection.every(row => row.allowed), 'bulk_selection_denied');
  const normalized = plan.action === 'tag' ? normalizeTags(tags) : [];
  need(plan.tagsHash === await hash(normalized), 'bulk_tags_changed');
  const prepared = await this.prepare(plan, normalized);
  const result = await this.client.call('bulk/commit', { plan, planHash, confirmed: true, writes: prepared.writes });
  need(result.operation === plan.operation, 'invalid_bulk_result');
  this.remember(plan, prepared.remembered);
  return result;
 }
 async undo(operation, { confirmed = false } = {}) {
  need(confirmed === true, 'bulk_confirmation_required');
  const context = await this.client.call('bulk/undo/context', { operation });
  need(context.operation === operation, 'invalid_bulk_result');
  if (context.undone === true) return context;
  const { plan, planHash } = context;
  need(plan?.schema === 'latchkey/bulk-undo/v1' && plan.operation === operation && await hash(plan) === planHash, 'invalid_bulk_plan');
  const prepared = await this.prepare(plan, [], true);
  const result = await this.client.call('bulk/undo', { operation, plan, planHash, confirmed: true, writes: prepared.writes });
  need(result.operation === operation && result.undone === true, 'invalid_bulk_result');
  this.remember(plan, prepared.remembered);
  return result;
 }
}
