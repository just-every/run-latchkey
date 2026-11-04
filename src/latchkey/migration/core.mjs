import Papa from 'papaparse';
import { readBitwarden } from './bitwarden.mjs';
import { bytes, digest } from '../crypto/envelope.mjs';
import { createItem } from '../items/types.mjs';
import { check } from '../items/fields.mjs';
import { parseTotpUri, validateTotp } from '../totp/index.mjs';
const text = new TextDecoder('utf-8', { fatal: true });
const classes = ['records', 'totp', 'attachments', 'history', 'passkeys', 'permissions'];
const code = value => typeof value === 'string' && value.length > 0 && value.length <= 200;

export async function previewMigration({ data, source, sourceOrigin, sourceOwner, passphrase, mapping = [] }) {
 check(data instanceof Uint8Array && data.length > 0 && data.length <= 8388608, 'invalid_migration_size');
 check(['bitwarden', 'lastpass'].includes(source), 'unsupported_migration_source');
 let origin; try { origin = new URL(sourceOrigin); } catch {}
 check(origin?.protocol === 'https:' && origin.origin === sourceOrigin, 'source_origin_required');
 check(code(sourceOwner), 'source_owner_required');
 let records, folders, variant;
 if (source === 'bitwarden') {
  const raw = await readBitwarden(data, passphrase);
  records = raw.items;
  check([raw.collections, raw.folders].every(value => value == null || Array.isArray(value)), 'invalid_source_folders');
  folders = [...(raw.folders ?? []), ...(raw.collections ?? [])]; variant = 'json';
  check(Array.isArray(folders) && folders.length <= 1000, 'invalid_source_folders');
 } else {
  let parsed; try { parsed = Papa.parse(text.decode(data), { header: true, skipEmptyLines: true }); } catch { check(false, 'invalid_lastpass_csv'); }
  const headers = ['url', 'username', 'password', 'extra', 'name', 'grouping', 'fav'];
  check(!parsed.errors.length && !Object.keys(parsed.meta.renamedHeaders ?? {}).length && parsed.meta.fields?.length === headers.length && headers.every(key => parsed.meta.fields.includes(key)), 'invalid_lastpass_csv');
  check(parsed.data.length <= 1000 && Array.isArray(mapping) && mapping.length === parsed.data.length, 'lastpass_stable_id_mapping_required');
  const ids = new Map();
  for (const pair of mapping) { check(Number.isInteger(pair?.row) && pair.row >= 1 && pair.row <= parsed.data.length && code(pair.id) && !ids.has(pair.row), 'ambiguous_source_mapping'); ids.set(pair.row, pair.id); }
  records = parsed.data.map((row, index) => ({ ...row, id: ids.get(index + 1) }));
  folders = [...new Set(records.map(row => row.grouping).filter(Boolean))].map(name => ({ id: name, name })); variant = 'csv';
 }
 const folderIds = new Set();
 for (const folder of folders) { check(code(folder.id) && typeof folder.name === 'string' && !folderIds.has(folder.id), 'ambiguous_source_folders'); folderIds.add(folder.id); }
 const rows = [], seen = new Map();
 for (const record of records) {
  check(record && code(record.id), 'stable_source_id_required');
  const sourceRowHash = await digest(bytes(record));
  if (seen.has(record.id)) { check(seen.get(record.id) === sourceRowHash, 'conflicting_source_identity'); rows.push({ source: record.id, duplicate: true }); continue; }
  seen.set(record.id, sourceRowHash);
  const gaps = [], fields = [], urls = [];
  let item;
  const name = record.name;
  const shared = source === 'bitwarden' ? Boolean(record.organizationId || record.collectionIds?.length) : Boolean(record.grouping);
  if (shared) gaps.push('shared_rights_and_owner_mapping_required');
  if (record.deletedDate) gaps.push('deleted_source_item_requires_review');
  if (record.reprompt) gaps.push('source_reprompt_requires_review');
  const associations = source === 'bitwarden' ? [...(record.collectionIds ?? []), ...(record.folderId ? [record.folderId] : [])] : record.grouping ? [record.grouping] : [];
  check(Array.isArray(associations), 'invalid_source_folders');
  if (associations.some(id => !folderIds.has(id))) gaps.push('source_folder_missing');
  const linkValues = source === 'bitwarden' ? record.login?.uris?.map(row => row.uri) ?? [] : record.url === 'http://sn' ? [] : [record.url];
  for (const value of linkValues.filter(Boolean)) {
   let url; try { url = new URL(value); } catch {}
   if (url?.protocol === 'https:' && !url.username && !url.password) urls.push({ url: value, match: 'never-fill' });
   else gaps.push('unsupported_url_requires_review');
  }
  const note = source === 'bitwarden' ? record.notes : record.extra;
  if (note) fields.push({ id: 'sourceNote', label: 'Source note', type: 'multiline', secret: true, value: note });
  for (const [index, field] of (record.fields ?? []).entries()) {
   if (![0, 1, 2].includes(field.type) || !field.name || typeof field.value !== 'string') { gaps.push('custom_field_mapping_required'); continue; }
   fields.push({ id: `sourceField${index}`, label: field.name, type: 'multiline', secret: true, value: field.value });
  }
  try {
   const secureNote = source === 'bitwarden' ? record.type === 2 : record.url === 'http://sn';
   if (source === 'bitwarden' && ![1, 2].includes(record.type)) gaps.push('source_item_type_mapping_required');
   const values = secureNote ? { note: note ?? '' } : { username: record.login?.username ?? record.username ?? '', password: record.login?.password ?? record.password ?? '' };
   if (!secureNote && record.login?.totp) values.totp = record.login.totp.startsWith('otpauth:') ? parseTotpUri(record.login.totp) : validateTotp({ secret: record.login.totp, issuer: sourceOrigin, account: name, algorithm: 'SHA1', digits: 6, period: 30 });
   item = createItem(secureNote ? 'secure-note' : 'login', { title: name, values, fields, urls, ownership: 'personal', favorite: record.favorite === true || record.fav === '1' });
  } catch { gaps.push('invalid_source_item'); }
  if (record.attachments?.length) gaps.push('attachments_require_separate_reconciliation');
  if (record.passwordHistory?.length) gaps.push('history_requires_separate_reconciliation');
  if (record.login?.fido2Credentials?.length) gaps.push('passkeys_require_reenrollment');
  rows.push({ source: record.id, sourceRowHash, folders: associations, gaps: [...new Set(gaps)], item: item ?? null, sourceRecord: record });
 }
 const tasks = classes.filter(name => name !== 'records').map(name => ({ class: name, owner: sourceOwner, state: 'unresolved', action: name === 'permissions' ? 'Review separately authorized effective source rights; never infer membership from CSV' : 'Obtain authorized source extraction or record approved unavailability and re-enrollment' }));
 const reconciliation = classes.map(name => ({ class: name, sourceTotal: null, exported: name === 'records' ? records.length : name === 'totp' ? records.filter(row => row.login?.totp).length : name === 'attachments' ? records.reduce((n, row) => n + (row.attachments?.length ?? 0), 0) : name === 'history' ? records.reduce((n, row) => n + (row.passwordHistory?.length ?? 0), 0) : name === 'passkeys' ? records.reduce((n, row) => n + (row.login?.fido2Credentials?.length ?? 0), 0) : null, imported: 0, unavailable: 'source_inventory_required', owner: sourceOwner }));
 const plan = { schema: 'latchkey-migration-preview-v1', source, variant, sourceOrigin, sourceOwner, sourceHash: await digest(data), folders, rows, tasks, reconciliation, counts: { source: records.length, imported: 0, duplicate: rows.filter(row => row.duplicate).length, rejected: rows.filter(row => row.gaps?.length).length, ready: rows.filter(row => !row.duplicate && !row.gaps.length).length }, cutoverComplete: false };
 check(bytes(plan).length <= 900000, 'migration_preview_too_large');
 return { plan, hash: await digest(bytes(plan)) };
}

export { importMigration } from './plan.mjs';
