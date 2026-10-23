import kdbx from 'kdbxweb';
import { readPassboltCsv } from './passbolt-csv.mjs';
import { createItem } from '../items/types.mjs';
import { check } from '../items/fields.mjs';
import { validateTotp, parseTotpUri } from '../totp/index.mjs';
import { bytes, digest } from '../crypto/envelope.mjs';

const text = value => value instanceof kdbx.ProtectedValue ? value.getText() : value ?? '';
const known = new Set(['Title', 'UserName', 'Password', 'URL', 'Notes', 'otp', 'TimeOtp-Secret-Base32', 'TimeOtp-Algorithm', 'TimeOtp-Length', 'TimeOtp-Period']);
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// All source bytes stay in the caller's client. An export does not prove source
// authorization, complete history, policy parity or successful native cutover.
export async function previewPassbolt({ data, passphrase, metadata, mapping = [], sourceOrigin, sourceUser, format = 'kdbx', keyfile }) {
 check(data instanceof Uint8Array && data.byteLength > 0 && data.byteLength <= 8388608, 'invalid_kdbx_size');
 check(['kdbx', 'csv-kdbx'].includes(format), 'unsupported_passbolt_format');
 if (format === 'kdbx') {
  check(passphrase == null || typeof passphrase === 'string' && passphrase.length <= 1024, 'invalid_kdbx_passphrase');
  check(passphrase?.length || keyfile, 'kdbx_credentials_required');
 }
 check(keyfile == null || keyfile instanceof Uint8Array && keyfile.length > 0 && keyfile.length <= 1048576, 'invalid_kdbx_keyfile');
 let origin; try { origin = new URL(sourceOrigin); } catch {}
 check(origin?.protocol === 'https:' && origin.origin === sourceOrigin, 'source_origin_required');
 check(typeof sourceUser === 'string' && uuid.test(sourceUser), 'source_user_required');
 check(Array.isArray(mapping) && mapping.length <= 1000, 'invalid_source_mapping');
 const mapped = new Map(), resourcesUsed = new Set();
 for (const pair of mapping) {
  check(pair && typeof pair.entry === 'string' && uuid.test(pair.resource) && !mapped.has(pair.entry) && !resourcesUsed.has(pair.resource), 'ambiguous_source_mapping');
  mapped.set(pair.entry, pair.resource); resourcesUsed.add(pair.resource);
 }
 const resources = metadata?.body ?? [];
 check(Array.isArray(resources) && resources.length <= 1000, 'invalid_source_metadata');
 const byId = new Map();
 for (const resource of resources) {
  check(resource && uuid.test(resource.id) && !byId.has(resource.id), 'invalid_source_metadata');
  byId.set(resource.id, resource);
 }
 let db;
 if (format === 'csv-kdbx') db = readPassboltCsv(data);
 else try { db = await kdbx.Kdbx.load(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), new kdbx.Credentials(passphrase ? kdbx.ProtectedValue.fromString(passphrase) : null, keyfile)); }
 catch { check(false, 'kdbx_cannot_decrypt'); }
 const rows = [], seen = new Set();
 function visit(group, folders) {
  check(folders.length < 50, 'kdbx_nesting_limit');
  const path = [...folders, group.name];
  for (const entry of group.entries) {
   check(rows.length < 1000, 'kdbx_item_limit');
   const entryId = entry.uuid.toString();
   check(!seen.has(entryId), 'duplicate_kdbx_entry'); seen.add(entryId);
   const value = name => text(entry.fields.get(name));
   const resourceId = mapped.get(entryId), resource = byId.get(resourceId);
   const gaps = [], recovered = [], permissions = [];
   if (!resource) gaps.push('source_metadata_and_explicit_id_mapping_required');
   if (resource && (resource.name !== value('Title') || (resource.username ?? '') !== value('UserName'))) gaps.push('source_identity_discrepancy');
   const fields = [];
   if (value('Notes')) fields.push({ id: 'secretNote', label: 'Secret note', type: 'multiline', secret: true, value: value('Notes') });
   if (!resource || !Object.hasOwn(resource, 'description') || typeof resource.description !== 'string') gaps.push('source_description_unknown');
   else {
    fields.push({ id: 'description', label: 'Source description', type: 'multiline', secret: false, value: resource.description });
    if (resource.description !== value('Notes')) recovered.push('description_recovered_separately_from_secret_note');
   }
   if (!Array.isArray(resource?.permissions) || !resource.permissions.length) gaps.push('source_recipients_unknown');
   else for (const permission of resource.permissions) {
    if (!['User', 'Group'].includes(permission.aro) || !uuid.test(permission.aro_foreign_key) || ![1, 7, 15].includes(permission.type) || permission.aco_foreign_key !== resourceId) { gaps.push('invalid_source_permission'); continue; }
    permissions.push({ kind: permission.aro, source: permission.aro_foreign_key, type: permission.type });
   }
   if (permissions.length !== 1 || permissions[0]?.kind !== 'User' || permissions[0]?.source !== sourceUser || permissions[0]?.type !== 15) gaps.push('shared_recipient_or_ownership_mapping_required');
   if (entry.binaries.size) gaps.push('attachments_require_separate_reconciliation');
   if (entry.history.length) gaps.push('history_requires_separate_reconciliation');
   for (const name of entry.fields.keys()) if (!known.has(name) && !/^KP2A_URL(?:_\d+)?$/.test(name)) gaps.push('custom_fields_require_separate_reconciliation');
   const values = { username: value('UserName'), password: value('Password') };
   if (value('otp')) values.totp = parseTotpUri(value('otp'));
   else if (value('TimeOtp-Secret-Base32')) values.totp = validateTotp({ secret: value('TimeOtp-Secret-Base32'), issuer: sourceOrigin, account: value('UserName') || value('Title'), algorithm: (value('TimeOtp-Algorithm') || 'HMAC-SHA-1').replace('HMAC-', ''), digits: Number(value('TimeOtp-Length') || 6), period: Number(value('TimeOtp-Period') || 30) });
   let expires = entry.times.expires ? entry.times.expiryTime?.toISOString() : null;
   if (format === 'csv-kdbx') {
    if (resource && Object.hasOwn(resource, 'expired')) { expires = resource.expired ? new Date(resource.expired).toISOString() : null; recovered.push('expiry_recovered_from_source_metadata'); }
    else gaps.push('source_expiry_unknown');
   }
   if (resource && Object.hasOwn(resource, 'expired') && (resource.expired ? new Date(resource.expired).toISOString() : null) !== expires) gaps.push('expiry_discrepancy');
   if (expires) fields.push({ id: 'expiry', label: 'Source expiry', type: 'date', secret: false, value: expires });
   const urls = [...entry.fields.keys()].filter(name => name === 'URL' || /^KP2A_URL(?:_\d+)?$/.test(name)).map(value).filter(Boolean);
   const rules = [];
   for (const url of urls) {
    let parsed; try { parsed = new URL(url); } catch {}
    if (parsed?.protocol === 'https:' && !parsed.username && !parsed.password) rules.push({ match: 'never-fill', url });
    else gaps.push('unsupported_url_requires_review');
   }
   const tags = [];
   for (const tag of resource?.tags ?? []) {
    if (typeof tag?.slug === 'string') tags.push(tag.slug); else gaps.push('source_tag_discrepancy');
   }
   const item = createItem('login', { title: value('Title'), values, fields, tags, urls: rules, ownership: 'personal' });
   rows.push({ entry: entryId, source: resourceId ?? null, folders: entry.sourceFolder ? [...path, entry.sourceFolder] : path, recipients: permissions, recovered, gaps: [...new Set(gaps)], item });
  }
  for (const child of group.groups) visit(child, path);
 }
 for (const group of db.groups) visit(group, []);
 check([...mapped.keys()].every(key => seen.has(key)), 'mapping_entry_missing');
 const plan = { schema: 'latchkey-passbolt-preview-v1', format, sourceOrigin, sourceUser, sourceHash: await digest(data), rows, unmatchedResources: [...byId.keys()].filter(key => !resourcesUsed.has(key)), obligations: ['source_authorization_and_metadata_freshness', 'recovery_admin_and_directory_policy_review', 'history_and_omitted_source_class_reconciliation', 'shared_recipient_key_review', 'extension_and_phone_use', 'owner_approved_final_cutover'] };
 check(bytes(plan).length <= 900000, 'migration_preview_too_large');
 return { plan, hash: await digest(bytes(plan)) };
}

// This limited door imports one explicitly owned private item. Shared and
// ambiguous source rights remain blocked, with no inferred destination grant.
export async function importPassboltItem(client, plan, { approvedHash, entry, vault, confirmed, ownership }) {
 check(confirmed === true && ownership === 'personal', 'personal_import_confirmation_required');
 check(plan?.schema === 'latchkey-passbolt-preview-v1' && approvedHash === await digest(bytes(plan)), 'migration_approval_mismatch');
 const row = plan.rows.find(row => row.entry === entry);
 check(row && row.source && row.gaps.length === 0, 'migration_discrepancies_unresolved');
 const destination = (await client.call('vaults', {})).find(row => row.id === vault);
 check(destination?.kind === 'family', 'personal_destination_required');
 const snapshot = await client.snapshot(vault);
 try {
  check(snapshot.result.owner === client.profile.account && snapshot.result.recipients.length === 1 && snapshot.result.recipients[0].account_id === client.profile.account, 'private_destination_required');
  check(snapshot.result.versions.length === 0, 'empty_destination_required');
  const object = crypto.randomUUID();
  const item = { ...row.item, change: { author: client.profile.account, time: new Date().toISOString(), action: 'edit' }, migration: { source: 'passbolt', sourceOrigin: plan.sourceOrigin, resource: row.source, sourceHash: plan.sourceHash, approvedHash, cutoverComplete: false } };
  return await client.put(vault, item, object, 0, snapshot.result.revision);
 } finally { snapshot.key.fill(0); }
}
