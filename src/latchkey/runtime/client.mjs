import { RuntimeTransport } from './transport.mjs';
import { bytes, json, open, seal, unwrapSigned } from '../crypto/envelope.mjs';
import { binding, need, positive } from './common.mjs';
import { parseReference, secretValue } from '../projects/model.mjs';
import { machineKeys } from './keys.mjs';

function scopeFor(grant, reference, right) {
 parseReference(reference);
 const scope = grant.scopes?.find(scope => scope.reference === reference);
 need(scope?.[right] === true, 'permission_denied', 403); return scope;
}
async function session({ profile, grant, runtimeKey, fetcher }) {
 need(profile?.origin === grant?.origin && profile?.machine === grant?.machine && grant.schema === 1, 'profile_mismatch');
 const keys = await machineKeys(profile, runtimeKey);
 const client = new RuntimeTransport(profile.origin, grant.token, fetcher ? { fetcher } : {});
 return { keys, client };
}
async function unwrap(grant, scope, keys, wrapped = scope.wrapped) {
 return unwrapSigned(wrapped, keys.recipient.privateKey, grant.authorityKey, grant.account, binding(grant.tenant, scope.vault, grant.machine, `runtime-key:${scope.id}`, scope.epoch));
}

export async function resolveRuntime(input) {
 const { grant, references } = input;
 need(references && typeof references === 'object' && !Array.isArray(references) && Object.keys(references).length > 0 && Object.keys(references).length <= 100, 'invalid_references');
 const selected = Object.entries(references).map(([name, reference]) => { need(typeof name === 'string' && name.length > 0 && name.length <= 200, 'invalid_reference_name'); return { name, scope: scopeFor(grant, reference, 'read') }; });
 const { keys, client } = await session(input);
 try {
  const result = await client.request('runtime/fetch', { grant: grant.id, scopes: [...new Set(selected.map(({ scope }) => scope.id))] }, keys.signing.privateKey);
  need(result.grant === grant.id && result.tenant === grant.tenant && Array.isArray(result.scopes), 'context_mismatch');
  const values = Object.create(null), decoded = new Map();
  for (const { name, scope } of selected) {
   if (!decoded.has(scope.id)) {
    const row = result.scopes.find(row => row.id === scope.id);
    need(row && row.kind === scope.kind && row.vault === scope.vault && row.object === scope.object && row.epoch === scope.epoch, 'context_mismatch');
    positive(row.version);
    const key = await unwrap(grant, scope, keys, row.wrapped);
    try {
     const context = scope.kind === 'field' ? binding(grant.tenant, scope.vault, scope.id, 'runtime-field', scope.epoch) : binding(grant.tenant, scope.vault, scope.object, 'item', scope.epoch, row.version);
     const value = json(await open(key, row.envelope, context));
     need(value.schema === (scope.kind === 'field' ? 'latchkey/runtime-field/v1' : 'latchkey/project-value/v1') && value.value !== undefined, 'invalid_runtime_value');
     if (scope.kind === 'project') secretValue(value.value);
     decoded.set(scope.id, typeof value.value === 'string' ? value.value : JSON.stringify(value.value));
    } finally { key.fill(0); }
   }
   values[name] = decoded.get(scope.id);
  }
  return values;
 } finally { client.lock(); }
}

export async function writeRuntime(input, reference, value, { expectedVersion } = {}) {
 positive(expectedVersion); const scope = scopeFor(input.grant, reference, 'write');
 need(scope.kind === 'project', 'permission_denied', 403);
 const normalized = secretValue(value), { keys, client } = await session(input);
 let key;
 try {
  key = await unwrap(input.grant, scope, keys);
  const version = expectedVersion + 1; positive(version);
  const envelope = await seal(key, bytes({ schema: 'latchkey/project-value/v1', value: normalized }), binding(input.grant.tenant, scope.vault, scope.object, 'item', scope.epoch, version));
  return await client.request('runtime/write', { grant: input.grant.id, scope: scope.id, version, envelope }, keys.signing.privateKey);
 } finally { key?.fill(0); client.lock(); }
}
