// Browser-safe encrypted-preview review and application. Source readers stay in the CLI.
import { bytes, decode, digest, json, open } from '../crypto/envelope.mjs';
import { check } from '../items/fields.mjs';
import { validateItem } from '../items/types.mjs';
export const migrationBinding = { tenant: 'local', vault: 'migration', object: 'preview', purpose: 'migration', epoch: 1, version: 1 };
const classes = ['records', 'totp', 'attachments', 'history', 'passkeys', 'permissions'];
const code = value => typeof value === 'string' && value.length > 0 && value.length <= 200;
const hash = value => typeof value === 'string' && decode(value, 32).length === 32;

export async function validateMigrationPlan(plan) {
 check(plan?.schema === 'latchkey-migration-preview-v1' && ['bitwarden', 'lastpass'].includes(plan.source) && plan.variant === (plan.source === 'bitwarden' ? 'json' : 'csv') && code(plan.sourceOwner) && plan.cutoverComplete === false, 'invalid_migration_preview');
 let origin; try { origin = new URL(plan.sourceOrigin); } catch {}
 check(origin?.protocol === 'https:' && origin.origin === plan.sourceOrigin && hash(plan.sourceHash), 'invalid_migration_preview');
 check(bytes(plan).length <= 900000 && Array.isArray(plan.rows) && plan.rows.length <= 1000 && Array.isArray(plan.folders) && plan.folders.length <= 1000, 'invalid_migration_preview');
 const folders = new Set();
 for (const folder of plan.folders) { check(code(folder?.id) && typeof folder.name === 'string' && !folders.has(folder.id), 'invalid_migration_preview'); folders.add(folder.id); }
 const seen = new Set();
 for (const row of plan.rows) {
  check(code(row?.source), 'invalid_migration_preview');
  if (row.duplicate === true) { check(seen.has(row.source), 'invalid_migration_preview'); continue; }
  check(!seen.has(row.source) && hash(row.sourceRowHash) && row.sourceRecord?.id === row.source && row.sourceRowHash === await digest(bytes(row.sourceRecord)), 'invalid_migration_preview');
  seen.add(row.source);
  check(Array.isArray(row.gaps) && row.gaps.every(code) && Array.isArray(row.folders) && row.folders.every(code), 'invalid_migration_preview');
  const sourceShared = plan.source === 'bitwarden' ? row.sourceRecord.organizationId || row.sourceRecord.collectionIds?.length : row.sourceRecord.grouping;
  check(!sourceShared || row.gaps.includes('shared_rights_and_owner_mapping_required'), 'invalid_migration_preview');
  check(row.folders.every(id => folders.has(id)) || row.gaps.includes('source_folder_missing'), 'invalid_migration_preview');
  if (row.item) {
   validateItem(row.item);
   check(row.item.ownership === 'personal' && row.item.urls.every(rule => rule.match === 'never-fill') && row.item.attachments.length === 0 && !row.item.migration, 'invalid_migration_preview');
  } else check(row.gaps.length > 0, 'invalid_migration_preview');
 }
 const counts = { source: plan.rows.length, imported: 0, duplicate: plan.rows.filter(row => row.duplicate).length, rejected: plan.rows.filter(row => row.gaps?.length).length, ready: plan.rows.filter(row => !row.duplicate && !row.gaps.length).length };
 check(plan.counts && Object.keys(counts).every(key => plan.counts[key] === counts[key]), 'invalid_migration_preview');
 check(Array.isArray(plan.reconciliation) && plan.reconciliation.length === classes.length && classes.every(name => plan.reconciliation.filter(row => row.class === name).length === 1), 'invalid_migration_preview');
 for (const row of plan.reconciliation) check(row.sourceTotal === null && (row.exported === null || Number.isSafeInteger(row.exported) && row.exported >= 0) && row.imported === 0 && row.owner === plan.sourceOwner && row.unavailable === 'source_inventory_required', 'invalid_migration_preview');
 check(plan.reconciliation.find(row => row.class === 'records').exported === counts.source, 'invalid_migration_preview');
 check(Array.isArray(plan.tasks) && plan.tasks.length === classes.length - 1 && classes.slice(1).every(name => plan.tasks.filter(row => row.class === name).length === 1) && plan.tasks.every(row => row.owner === plan.sourceOwner && row.state === 'unresolved' && typeof row.action === 'string' && row.action.length > 0 && row.action.length <= 1000), 'invalid_migration_preview');
 return { plan, hash: await digest(bytes(plan)) };
}

export async function openMigrationPreview(data, previewKey) {
 check(data instanceof Uint8Array && data.length > 0 && data.length <= 1500000, 'invalid_migration_size');
 const key = decode(previewKey, 32);
 let plain;
 try {
  check(key.length === 32, 'preview_key_required');
  const stored = json(data);
  check(stored?.schema === 'latchkey-migration-envelope-v1', 'invalid_migration_preview');
  plain = await open(key, stored.envelope, migrationBinding);
  return await validateMigrationPlan(json(plain));
 } finally { key.fill(0); plain?.fill(0); }
}

// Restricted initial import follows the owner-confirmed LKY-045 ruling.
// Every row is checked before the first write; interruption leaves deterministic
// source identities that a repeat can resume. Writes use the vault's CAS fence.
export async function importMigration(client, plan, { approvedHash, vault, confirmed, ownership, sourceOwner }) {
 await validateMigrationPlan(plan);
 check(confirmed === true && ownership === 'personal' && sourceOwner === plan.sourceOwner, 'personal_import_confirmation_required');
 check(plan?.schema === 'latchkey-migration-preview-v1' && approvedHash === await digest(bytes(plan)), 'migration_approval_mismatch');
 check(plan.rows.length > 0 && plan.rows.every(row => row.duplicate || row.item && !row.gaps.length), 'migration_discrepancies_unresolved');
 check((await client.call('vaults', {})).find(row => row.id === vault)?.kind === 'family', 'personal_destination_required');
 const snapshot = await client.snapshot(vault);
 try {
  check(snapshot.result.owner === client.profile.account && snapshot.result.recipients.length === 1 && snapshot.result.recipients[0].account_id === client.profile.account, 'private_destination_required');
  const versions = await client.decodeVersions(snapshot), latest = new Map();
  for (const row of versions) if (!latest.has(row.object) || latest.get(row.object).version < row.version) latest.set(row.object, row);
  const namespace = [plan.source, plan.sourceOrigin, plan.sourceOwner];
  check([...latest.values()].every(row => row.value.schema === 'latchkey/vault-meta/v1' || JSON.stringify(row.value.migration?.namespace) === JSON.stringify(namespace)), 'empty_destination_required');
  const writes = []; let unchanged = 0;
  for (const row of plan.rows.filter(row => !row.duplicate)) {
   const raw = decode(await digest(bytes([...namespace, row.source]))).slice(0, 16); raw[6] = raw[6] & 15 | 64; raw[8] = raw[8] & 63 | 128;
   const hex = [...raw].map(n => n.toString(16).padStart(2, '0')).join('');
   const object = `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`, old = latest.get(object);
   check(!client.profile.seen[vault]?.erased?.[object], 'item_erased');
   if (old?.value.migration.sourceRowHash === row.sourceRowHash) { unchanged++; continue; }
   if (old) {
    const current = { ...old.value }; delete current.migration; delete current.change;
    check(await digest(bytes(current)) === old.value.migration.itemHash, 'migration_destination_changed');
   }
   const item = structuredClone(row.item);
   writes.push({ object, version: old?.version ?? 0, value: { ...item, migration: { namespace, source: row.source, sourceRowHash: row.sourceRowHash, itemHash: await digest(bytes(item)), approvedHash, cutoverComplete: false }, change: { author: client.profile.account, time: new Date().toISOString(), action: 'edit' } } });
  }
  let revision = snapshot.result.revision;
  for (const row of writes) revision = (await client.put(vault, row.value, row.object, row.version, revision)).revision;
  return { imported: writes.length, unchanged, duplicate: plan.counts.duplicate, cutoverComplete: false };
 } finally { snapshot.key.fill(0); }
}
