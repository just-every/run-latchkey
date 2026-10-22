import { id } from '../crypto/envelope.mjs';

const states = ['active', 'archived', 'trash'];
const fail = (condition, code) => { if (!condition) { const error = new Error(code); error.code = code; throw error; } };
const name = value => fail(typeof value === 'string' && value.trim().length > 0 && value.length <= 200, 'invalid_name');
const identifier = value => fail(typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value), 'invalid_identifier');
function criteriaValue(value = {}) {
 fail(value && typeof value === 'object' && !Array.isArray(value), 'invalid_filter');
 const allowed = ['query', 'type', 'tag', 'favorite', 'owner', 'expiryBefore', 'health', 'state'];
 fail(Object.keys(value).every(key => allowed.includes(key)), 'invalid_filter');
 for (const key of ['query', 'type', 'tag', 'owner', 'health']) if (value[key] !== undefined) fail(typeof value[key] === 'string' && value[key].length <= (key === 'query' ? 500 : 200), 'invalid_filter');
 if (value.favorite !== undefined) fail(typeof value.favorite === 'boolean', 'invalid_filter');
 if (value.state !== undefined) fail(states.includes(value.state), 'invalid_filter');
 if (value.expiryBefore !== undefined) fail((typeof value.expiryBefore === 'number' && Number.isFinite(value.expiryBefore)) || (typeof value.expiryBefore === 'string' && Number.isFinite(Date.parse(value.expiryBefore))), 'invalid_filter');
 return structuredClone(value);
}
function latest(records) {
 const rows = new Map();
 for (const row of records) if (!rows.has(row.object) || rows.get(row.object).version < row.version) rows.set(row.object, row);
 return [...rows.values()];
}
function matchesHealth(value, health) {
 const findings = value.healthFindings;
 if (health === 'unknown') return !Array.isArray(findings);
 if (!Array.isArray(findings)) return false;
 if (health === 'healthy') return findings.length === 0;
 if (health === 'findings') return findings.length > 0;
 return findings.some(finding => typeof finding === 'string' ? finding === health : finding && ['code', 'id', 'type', 'severity', 'status'].some(key => finding[key] === health));
}

// Every predicate runs on already decrypted, permitted records in this client.
export function filterRecords(records, criteria = {}, { lifecycle = [], owner, now = Date.now() } = {}) {
 const selected = criteriaValue(criteria), byObject = new Map(lifecycle.map(entry => [entry.object, entry]));
 fail(Number.isFinite(typeof now === 'function' ? now() : now), 'invalid_time');
 const query = selected.query?.toLocaleLowerCase();
 const limit = typeof selected.expiryBefore === 'number' ? selected.expiryBefore : Date.parse(selected.expiryBefore);
 return latest(records).filter(row => row.value?.schema === 'latchkey/item/v1').map(row => ({
  ...row, lifecycle: byObject.get(row.object) ?? { object: row.object, state: 'active', expiresAt: null },
 })).filter(row => {
  const value = row.value;
  if (row.lifecycle.state !== (selected.state ?? 'active')) return false;
  if (selected.type !== undefined && value.type !== selected.type) return false;
  if (selected.tag !== undefined && !value.tags?.includes(selected.tag)) return false;
  if (selected.favorite !== undefined && value.favorite !== selected.favorite) return false;
  if (selected.owner !== undefined && (value.owner ?? owner) !== selected.owner) return false;
  if (selected.health !== undefined && !matchesHealth(value, selected.health)) return false;
  if (selected.expiryBefore !== undefined && !value.fields?.some(field => field.type === 'date' && !field.secret && Number.isFinite(Date.parse(field.value)) && Date.parse(field.value) <= limit)) return false;
  if (query) {
   const searchable = { title: value.title, type: value.type, tags: value.tags, labels: value.labels, fields: value.fields?.filter(field => !field.secret).map(field => field.value) };
   if (!JSON.stringify(searchable).toLocaleLowerCase().includes(query)) return false;
  }
  return true;
 }).sort((a, b) => String(a.value.title).localeCompare(String(b.value.title)) || a.object.localeCompare(b.object));
}

export class OrganizationClient {
 constructor(client) { this.client = client; }
 async load(vault) {
  const snapshot = await this.client.readVault(vault);
  const lifecycle = await this.client.call('lifecycle/list', { vault });
  fail(Array.isArray(lifecycle.items) && lifecycle.vault?.id === vault, 'invalid_lifecycle');
  fail(lifecycle.items.every(entry => typeof entry.object === 'string' && states.includes(entry.state)), 'invalid_lifecycle');
  return { records: latest(snapshot.versions), lifecycle: lifecycle.items, vault: {...lifecycle.vault,revision:snapshot.revision} };
 }
 async search(vault, criteria = {}) {
  const validated = criteriaValue(criteria), loaded = await this.load(vault);
  return filterRecords(loaded.records, validated, { lifecycle: loaded.lifecycle, owner: loaded.vault.owner });
 }
 async filters(vault) {
  return (await this.load(vault)).records.filter(row => row.value?.schema === 'latchkey/saved-filter/v1');
 }
 async saveFilter(vault, { name: title, criteria }, object) {
  name(title); const validated = criteriaValue(criteria);
  const existing = object ? (await this.load(vault)).records.find(row => row.object === object) : null;
  if (object) { identifier(object); fail(existing?.value.schema === 'latchkey/saved-filter/v1', 'filter_not_found'); }
  return this.client.put(vault, { schema: 'latchkey/saved-filter/v1', name: title.trim(), criteria: validated }, object ?? id(), existing?.version);
 }
 async collections(vault) {
  return (await this.load(vault)).records.filter(row => row.value?.schema === 'latchkey/collection/v1');
 }
 async collection(vault, { name: title, parent = null, items = [] }, object) {
  name(title); if (object) identifier(object); if (parent !== null) identifier(parent);
  fail(Array.isArray(items) && items.length <= 10000 && new Set(items).size === items.length, 'invalid_collection_items');
  items.forEach(identifier);
  const loaded = await this.load(vault), rows = new Map(loaded.records.map(row => [row.object, row]));
  const current = object ? rows.get(object) : null;
  if (object) fail(current?.value.schema === 'latchkey/collection/v1', 'collection_not_found');
  fail(items.every(item => rows.get(item)?.value.schema === 'latchkey/item/v1'), 'collection_item_not_found');
  const target = object ?? id(), visited = new Set([target]);
  let ancestor = parent;
  while (ancestor !== null) {
   fail(!visited.has(ancestor), 'collection_cycle'); visited.add(ancestor);
   const row = rows.get(ancestor);
   fail(row?.value.schema === 'latchkey/collection/v1', 'collection_parent_not_found');
   ancestor = row.value.parent;
   fail(ancestor === null || typeof ancestor === 'string', 'invalid_collection_parent');
  }
  return this.client.put(vault, { schema: 'latchkey/collection/v1', name: title.trim(), parent, items: [...items] }, target, current?.version,loaded.vault.revision);
 }
}
