import { check, validateDefinitions, validateField } from './fields.mjs';
const field = (id, type = 'text', secret = false) => ({ id, label: id.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), type, secret, required: false });
const secret = id => field(id, 'secret', true);
export const itemTypes = Object.freeze({
 login: [field('username'), secret('password'), field('totp', 'otp', true), field('passkey', 'passkey', true)],
 'secure-note': [field('note', 'multiline', true)],
 card: [field('cardholder'), secret('number'), secret('verificationCode'), field('expiry'), secret('pin')],
 identity: [field('name'), field('email', 'email'), field('phone'), field('address', 'multiline'), secret('governmentId')],
 'bank-account': [field('bank'), field('accountHolder'), secret('accountNumber'), secret('routingNumber'), secret('iban'), secret('swift')],
 'ssh-key': [field('publicKey', 'multiline'), secret('privateKey'), secret('passphrase')],
 'api-credential': [field('username'), secret('token'), field('endpoint', 'url')],
 database: [field('engine'), field('host'), field('port', 'number'), field('database'), field('username'), secret('password'), secret('connectionString')],
 server: [field('host'), field('port', 'number'), field('username'), secret('password'), secret('privateKey')],
 wifi: [field('ssid'), field('security'), secret('password')],
 'software-license': [field('product'), field('licensedTo'), secret('licenseKey'), field('expiry', 'date')],
 document: [field('description', 'multiline')],
});
for (const definitions of Object.values(itemTypes)) { for (const definition of definitions) Object.freeze(definition); Object.freeze(definitions); }
export function createItem(type, input = {}) {
 check(Object.hasOwn(itemTypes, type) || type === 'custom', 'unknown_item_type');
 const values = input.values ?? {};
 const definitions = type === 'custom' ? input.definitions ?? [] : itemTypes[type];
 check(Object.keys(values).every(id => definitions.some(def => def.id === id)), 'unknown_item_field');
 const fields = definitions.filter(def => Object.hasOwn(values, def.id)).map(def => ({ ...def, value: values[def.id] }));
 const item = { ...input, schema: 'latchkey/item/v1', type, title: input.title ?? '', fields: [...fields, ...(input.fields ?? [])], labels: input.labels ?? [], tags: input.tags ?? [], favorite: input.favorite ?? false, ownership: input.ownership ?? 'company', urls: input.urls ?? [], attachments: input.attachments ?? [] };
 delete item.values; delete item.definitions;
 return validateItem(item);
}
export function validateItem(item, template) {
 check(item?.schema === 'latchkey/item/v1' && (Object.hasOwn(itemTypes, item.type) || item.type === 'custom'), 'invalid_item');
 check(typeof item.title === 'string' && item.title.length > 0 && item.title.length <= 500, 'invalid_title');
 check(['company', 'personal'].includes(item.ownership) && typeof item.favorite === 'boolean', 'invalid_item_metadata');
 for (const list of [item.tags, item.labels]) check(Array.isArray(list) && list.length <= 100 && list.every(v => typeof v === 'string' && v.length > 0 && v.length <= 200), 'invalid_item_metadata');
 check(Array.isArray(item.fields) && item.fields.length <= 200, 'invalid_fields');
 validateDefinitions(item.fields);
 const defs = template?.fields ?? (item.type === 'custom' ? [] : itemTypes[item.type]);
 for (const field of item.fields) validateField(field, defs.find(def => def.id === field.id) ?? field);
 for (const def of defs.filter(def => def.required)) check(item.fields.some(field => field.id === def.id && field.value != null && field.value !== ''), 'required_field');
 check(Array.isArray(item.urls) && item.urls.length <= 100, 'invalid_url_rules');
 for (const rule of item.urls) {
  check(['registrable-domain', 'exact-host', 'starts-with-path', 'never-fill', 'native-app'].includes(rule.match), 'invalid_url_rule');
  if (rule.match === 'native-app') { check(typeof rule.appId === 'string' && typeof rule.association === 'string', 'invalid_app_association'); continue; }
  let url; try { url = new URL(rule.url); } catch {}
  check(url && url.protocol === 'https:' && !url.username && !url.password, 'https_url_required');
 }
 check(Array.isArray(item.attachments) && item.attachments.length <= 100, 'invalid_attachments');
 const attachments = new Set();
 for (const file of item.attachments) { check(file && typeof file.id === 'string' && !attachments.has(file.id) && typeof file.name === 'string' && file.name.length > 0 && typeof file.data === 'string' && Number.isSafeInteger(file.size) && file.size >= 0 && typeof file.digest === 'string', 'invalid_attachment'); attachments.add(file.id); }
 return structuredClone(item);
}
export function nonSecretView(item) {
 validateItem(item);
 return { type: item.type, title: item.title, labels: [...item.labels], tags: [...item.tags], favorite: item.favorite, ownership: item.ownership, fields: item.fields.filter(field => !field.secret).map(field => ({ ...field })) };
}
