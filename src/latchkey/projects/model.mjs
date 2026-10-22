import { exact, need, uuid } from '../runtime/common.mjs';
export function pathValue(value) {
 need(typeof value === 'string' && value.length > 0 && value.length <= 500 && /^[A-Za-z0-9_./-]+$/.test(value) && value.split('/').every(part => part && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(part)), 'invalid_secret_path');
 return value;
}
export function title(value) { need(typeof value === 'string' && value.trim() && value.length <= 200, 'invalid_project_name'); return value.trim(); }
export function connection(value) {
 need(value && typeof value === 'object' && !Array.isArray(value), 'invalid_connection');
 need(Object.keys(value).every(key => ['type', 'driver', 'host', 'port', 'database', 'username', 'password', 'options'].includes(key)), 'invalid_connection');
 need(value.type === 'connection' && typeof value.driver === 'string' && value.driver && typeof value.host === 'string' && value.host, 'invalid_connection');
 for (const key of ['driver', 'host', 'database', 'username', 'password']) if (value[key] !== undefined) need(typeof value[key] === 'string' && value[key].length <= 10000, 'invalid_connection');
 if (value.port !== undefined) need(Number.isInteger(value.port) && value.port > 0 && value.port <= 65535, 'invalid_connection');
 if (value.options !== undefined) need(value.options && typeof value.options === 'object' && !Array.isArray(value.options) && Object.entries(value.options).every(([key, entry]) => key.length <= 200 && typeof entry === 'string' && entry.length <= 10000), 'invalid_connection');
 return structuredClone(value);
}
export function secretValue(value) {
 if (typeof value === 'string') { need(value.length <= 100000, 'secret_too_large'); return value; }
 return connection(value);
}
export function catalog(value) {
 exact(value, ['schema', 'project', 'environment', 'name', 'shared', 'inherits', 'entries']);
 need(value.schema === 'latchkey/environment/v1', 'invalid_environment'); uuid(value.project); uuid(value.environment); title(value.name);
 for (const list of [value.shared, value.inherits]) { need(Array.isArray(list) && list.length <= 100 && new Set(list).size === list.length, 'invalid_inheritance'); list.forEach(uuid); }
 need(value.entries && typeof value.entries === 'object' && !Array.isArray(value.entries) && Object.keys(value.entries).length <= 10000, 'invalid_environment');
 for (const [path, entry] of Object.entries(value.entries)) {
  pathValue(path);
  if (entry?.kind === 'resource') { exact(entry, ['kind', 'object']); uuid(entry.object); }
  else { exact(entry, ['kind', 'project', 'environment', 'path']); need(entry.kind === 'reference', 'invalid_reference'); uuid(entry.project); uuid(entry.environment); pathValue(entry.path); }
 }
 return structuredClone(value);
}
export function projectReference(project, environment, path) { uuid(project); uuid(environment); pathValue(path); return `latchkey://project/${project}/environment/${environment}/${path.split('/').map(encodeURIComponent).join('/')}`; }
export function fieldReference(vault, object, field) { uuid(vault); uuid(object); need(typeof field === 'string' && field.length > 0 && field.length <= 200, 'invalid_field'); return `latchkey://vault/${vault}/item/${object}/field/${encodeURIComponent(field)}`; }
export function parseReference(reference) {
 need(typeof reference === 'string' && reference.length <= 1500, 'invalid_reference');
 let url; try { url = new URL(reference); } catch { need(false, 'invalid_reference'); }
 need(url.protocol === 'latchkey:' && !url.username && !url.password && !url.port && !url.search && !url.hash, 'invalid_reference');
 const parts = url.pathname.slice(1).split('/').map(part => decodeURIComponent(part));
 if (url.hostname === 'project') {
  need(parts.length >= 4 && parts[1] === 'environment', 'invalid_reference');
  const result = { kind: 'project', project: uuid(parts[0]), environment: uuid(parts[2]), path: pathValue(parts.slice(3).join('/')) };
  need(projectReference(result.project, result.environment, result.path) === reference, 'invalid_reference'); return result;
 }
 need(url.hostname === 'vault' && parts.length === 5 && parts[1] === 'item' && parts[3] === 'field', 'invalid_reference');
 const result = { kind: 'field', vault: uuid(parts[0]), object: uuid(parts[2]), field: parts[4] };
 need(fieldReference(result.vault, result.object, result.field) === reference, 'invalid_reference'); return result;
}
