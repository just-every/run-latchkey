export class ItemError extends Error {
 constructor(code) { super(code); this.code = code; }
}
export const check = (condition, code) => { if (!condition) throw new ItemError(code); };
export const fieldTypes = Object.freeze(['text', 'secret', 'multiline', 'url', 'email', 'number', 'date', 'boolean', 'otp', 'passkey', 'json']);
const identifier = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
export function validateField(field, definition = field) {
 check(field && typeof field === 'object' && identifier.test(field.id), 'invalid_field');
 check(typeof definition.label === 'string' && definition.label.length > 0 && definition.label.length <= 200 && fieldTypes.includes(definition.type) && typeof definition.secret === 'boolean', 'invalid_field_definition');
 check(field.type === definition.type && field.secret === definition.secret, 'field_definition_mismatch');
 const value = field.value;
 if (value == null || value === '') { check(!definition.required, 'required_field'); return; }
 if (['number', 'boolean'].includes(field.type)) check(typeof value === field.type && (field.type !== 'number' || Number.isFinite(value)), 'invalid_field_value');
 else if (['json', 'otp', 'passkey'].includes(field.type)) {
  check(typeof value === 'object' && !Array.isArray(value), 'invalid_field_value');
  if (field.type === 'otp') check(typeof value.secret === 'string' && typeof value.account === 'string' && typeof value.issuer === 'string', 'invalid_otp');
  if (field.type === 'passkey') check(typeof value.credentialId === 'string' && typeof value.rpId === 'string', 'invalid_passkey');
 } else {
  check(typeof value === 'string' && value.length <= 262144, 'invalid_field_value');
  if (field.type === 'url') { let url; try { url = new URL(value); } catch {} check(url && ['https:', 'http:', 'ssh:'].includes(url.protocol), 'invalid_url'); }
  if (field.type === 'email') check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), 'invalid_email');
  if (field.type === 'date') check(/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value) && Number.isFinite(Date.parse(value)), 'invalid_date');
 }
 check(!['secret', 'otp', 'passkey'].includes(field.type) || field.secret, 'secret_field_required');
}
export function validateDefinitions(fields) {
 check(Array.isArray(fields) && fields.length <= 200, 'invalid_fields');
 const seen = new Set();
 for (const field of fields) {
  check(field && identifier.test(field.id) && !seen.has(field.id), 'duplicate_or_invalid_field'); seen.add(field.id);
  validateField({ ...field, value: undefined }, { ...field, required: false });
  check(field.required == null || typeof field.required === 'boolean', 'invalid_required');
 }
 return fields;
}
