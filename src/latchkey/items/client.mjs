import { id } from '../crypto/envelope.mjs';
import { check } from './fields.mjs';
import { validateItem, nonSecretView } from './types.mjs';
import { attachmentBytes } from './attachments.mjs';
import { createTemplate, evolveTemplate } from './templates.mjs';
import { bytes } from '../crypto/envelope.mjs';

// This is a client boundary over VaultClient, never a service-side decryptor.
export class TypedItems {
 constructor(client, { now = () => Date.now() } = {}) { this.client = client; this.now = now; }
 authorize(vault, object, action) { return this.client.call('item/authorize', { vault, object, action }); }
 async records(vault) { return (await this.client.readVault(vault)).versions; }
 async itemRecords(vault, object, history = false) { return (await this.client.readItem(vault, object, history)).versions; }
 async current(vault, object) {
  const versions = await this.itemRecords(vault, object);
  check(versions.length, 'item_not_found');
  return versions.reduce((latest, row) => row.version > latest.version ? row : latest);
 }
 async save(vault, item, object = id()) {
  const value = validateItem(item, item.template?.definition);
  for (const attachment of value.attachments) await attachmentBytes(attachment);
  value.change = { author: this.client.profile.account, time: new Date(this.now()).toISOString(), action: 'edit' };
  check(bytes(value).length <= 1000000, 'item_too_large');
  return this.client.put(vault, value, object);
 }
 async history(vault, object) {
  await this.authorize(vault, object, 'history');
  return (await this.itemRecords(vault, object, true)).sort((a, b) => a.version - b.version);
 }
 async previewRestore(vault, object, version) {
  const versions = await this.history(vault, object), selected = versions.find(row => row.version === version);
  check(selected?.value?.schema === 'latchkey/item/v1', 'version_not_found');
  const current = versions.at(-1);
  return { object, version, currentVersion: current.version, value: structuredClone(selected.value), warning: 'Restoring vault history does not change the provider password or verified rotation state.' };
 }
 async restore(vault, object, version, { confirmed = false, expectedVersion } = {}) {
  check(confirmed, 'restore_confirmation_required');
  await this.authorize(vault, object, 'restore');
  const preview = await this.previewRestore(vault, object, version);
  if (expectedVersion != null) check(preview.currentVersion === expectedVersion, 'restore_conflict');
  const current = await this.current(vault, object);
  check(current.version === preview.currentVersion, 'restore_conflict');
  const restored = validateItem(preview.value, preview.value.template?.definition);
  // Provider verification is never rolled back with item content.
  delete restored.providerRotation;
  if (current.value.providerRotation != null) restored.providerRotation = structuredClone(current.value.providerRotation);
  restored.change = { author: this.client.profile.account, time: new Date(this.now()).toISOString(), action: 'restore', restoredFrom: version };
  return this.client.put(vault, restored, object, preview.currentVersion);
 }
 async attachment(vault, object, attachmentId, version) {
  await this.authorize(vault, object, 'attachment');
  const row = version == null ? await this.current(vault, object) : (await this.history(vault, object)).find(row => row.version === version);
  const file = row?.value.attachments?.find(file => file.id === attachmentId);
  check(file, 'attachment_not_found');
  return { name: file.name, mediaType: file.mediaType, data: await attachmentBytes(file) };
 }
 async field(vault, object, fieldId, action = 'reveal') {
  check(['reveal', 'copy', 'fill'].includes(action), 'invalid_item_action');
  await this.authorize(vault, object, action);
  const field = (await this.current(vault, object)).value.fields?.find(field => field.id === fieldId);
  check(field, 'field_not_found'); return structuredClone(field.value);
 }
 async search(vault, query = '') {
  check(typeof query === 'string' && query.length <= 500, 'invalid_query');
  const latest = new Map();
  for (const row of await this.records(vault)) if (!latest.has(row.object) || latest.get(row.object).version < row.version) latest.set(row.object, row);
  return [...latest.values()].filter(row => row.value?.schema === 'latchkey/item/v1').map(row => ({ object: row.object, version: row.version, ...nonSecretView(row.value) })).filter(view => JSON.stringify(view).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
 }
 async saveTemplate(vault, input, object = input.id ?? id()) {
  await this.authorize(vault, object, 'template-author');
  const previous = (await this.records(vault)).filter(row => row.object === object).sort((a,b) => a.version-b.version).at(-1);
  check(!previous || previous.value?.schema === 'latchkey/template/v1', 'template_object_type_conflict');
  const template = previous ? evolveTemplate(previous.value, input) : createTemplate({ ...input, id: object });
  template.change = { author: this.client.profile.account, time: new Date(this.now()).toISOString(), action: 'template-edit' };
  return this.client.put(vault, template, object);
 }
 async template(vault, object, version) {
  const rows = (await this.itemRecords(vault, object, version != null)).filter(row => row.value?.schema === 'latchkey/template/v1');
  const row = version == null ? rows.sort((a,b) => a.version-b.version).at(-1) : rows.find(row => row.version === version);
  check(row, 'template_not_found'); return structuredClone(row);
 }
 async useTemplate(vault, object, item) {
  const row = await this.template(vault, object);
  return validateItem({ ...item, template: { object, version: row.version, definition: row.value } }, row.value);
 }
}
