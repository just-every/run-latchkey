import { check, validateDefinitions } from './fields.mjs';
import { id } from '../crypto/envelope.mjs';
export function createTemplate(input) {
 check(input && typeof input.name === 'string' && input.name.length > 0 && input.name.length <= 200, 'invalid_template');
 validateDefinitions(input.fields);
 return { ...structuredClone(input), schema: 'latchkey/template/v1', id: input.id ?? id(), fields: input.fields.map((field, order) => ({ ...field, order })) };
}
// Commander record-type --data / record-type-info definitions use $id and $ref.
// https://github.com/Keeper-Security/Commander/blob/master/record_types.md
const keeperFields = {
 login: ['text', false], password: ['secret', true], secret: ['secret', true], pinCode: ['secret', true],
 text: ['text', false], multiline: ['multiline', false], note: ['multiline', true], url: ['url', false], email: ['email', false],
 oneTimeCode: ['otp', true], date: ['number', false], expirationDate: ['number', false], birthDate: ['number', true],
 name: ['json', false], address: ['json', false], phone: ['json', false], host: ['json', false],
 paymentCard: ['json', true], bankAccount: ['json', true], keyPair: ['json', true], securityQuestion: ['json', true],
 accountNumber: ['secret', true], licenseNumber: ['secret', true], passportNumber: ['secret', true],
 fileRef: ['json', true], cardRef: ['json', true], addressRef: ['json', false], recordRef: ['json', true],
 checkbox: ['boolean', false], dropdown: ['text', false], passkey: ['passkey', true],
};
export function importKeeperTemplate(source) {
 if (typeof source === 'string') { try { source = JSON.parse(source); } catch { check(false, 'invalid_keeper_json'); } }
 check(source && typeof source.$id === 'string' && Array.isArray(source.fields), 'invalid_keeper_template');
 const fields = source.fields.map((field, index) => {
  const mapping = keeperFields[field.$ref];
  check(mapping, 'unsupported_keeper_field_type');
  return { id: `keeper:${index}:${field.$ref}`, label: field.label || field.$ref, type: mapping[0], secret: mapping[1], required: field.required === true, sourceType: field.$ref, ...(field.complexity ? { sourceComplexity: structuredClone(field.complexity) } : {}) };
 });
 return createTemplate({ name: source.$id, fields, source: { provider: 'keeper', definition: structuredClone(source) } });
}
export function evolveTemplate(previous, changes) {
 const next = createTemplate({ ...previous, ...changes, id: previous.id });
 for (const old of previous.fields) {
  const field = next.fields.find(field => field.id === old.id);
  // Removing or changing the storage interpretation requires an explicit new
  // field id. Old item snapshots continue to retain their original definition.
  if (field) check(field.type === old.type && field.secret === old.secret, 'template_field_type_change');
 }
 return next;
}
