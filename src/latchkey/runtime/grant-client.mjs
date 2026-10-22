import { bytes, digest, encode, id, random, seal } from '../crypto/envelope.mjs';
import { binding, need, positive } from './common.mjs';
import { ProjectResolver } from '../projects/resolve.mjs';
import { parseReference } from '../projects/model.mjs';
import { projectResourceKey } from './keys.mjs';

export class RuntimeGrantClient {
 constructor(client) { this.client = client; }
 async grant(identity, fingerprint, selections, { expiresInSeconds = 3600, maxUses = null } = {}) {
  need(await digest(JSON.stringify([identity.machine, identity.deviceKey, identity.recipientKey])) === fingerprint, 'recipient_mismatch');
  positive(expiresInSeconds); if (maxUses !== null) positive(maxUses);
  need(Array.isArray(selections) && selections.length > 0 && selections.length <= 100 && new Set(selections.map(selection => selection.reference)).size === selections.length, 'invalid_scopes');
  const resolver = new ProjectResolver(this.client), grant = id(), token = encode(random()), scopes = [], descriptors = [], dependencies = new Map();
  for (const selection of selections) {
   const reference = parseReference(selection.reference), scope = id(), read = selection.read ?? true, write = selection.write ?? false;
   need(typeof read === 'boolean' && typeof write === 'boolean' && (read || write), 'invalid_scopes');
   let vault, object, epoch, payload = null, sourceVersion = null, key;
   if (reference.kind === 'project') {
    const target = await resolver.environment(reference.environment);
    need(target.project === reference.project, 'reference_context_mismatch');
    const value = await resolver.resolve(reference.environment, reference.path);
    ({ vault, object, epoch } = value);
    key = await projectResourceKey(this.client, vault, object);
   } else {
    need(read && !write, 'field_grant_read_only');
    vault = reference.vault; object = reference.object;
    await this.client.call('item/authorize', { vault, object, action: 'reveal' });
    const snapshot = await this.client.readItem(vault, object), row = snapshot.versions.at(-1);
    need(row?.value.schema === 'latchkey/item/v1', 'item_not_found');
    const field = row.value.fields?.find(field => field.id === reference.field);
    need(field && field.value !== undefined, 'field_not_found');
    epoch = snapshot.epoch; sourceVersion = row.version;
    // A new independent projection key is essential: never wrap the item key.
    key = random();
    try { payload = await seal(key, bytes({ schema: 'latchkey/runtime-field/v1', value: field.value }), binding(this.client.profile.tenant, vault, scope, 'runtime-field', epoch)); }
    catch (error) { key.fill(0); throw error; }
    dependencies.set(`${vault}/${object}`, { vault, object, epoch, version: sourceVersion });
   }
   let wrapped;
   try { wrapped = await this.client.wrap(key, identity.recipientKey, binding(this.client.profile.tenant, vault, identity.machine, `runtime-key:${scope}`, epoch)); }
   finally { key.fill(0); }
   scopes.push({ id: scope, kind: reference.kind, vault, object, epoch, project: reference.kind === 'project' ? reference.project : null, environment: reference.kind === 'project' ? reference.environment : null, pathHash: await digest(selection.reference), read, write, wrapped, payload, sourceVersion });
   descriptors.push({ id: scope, reference: selection.reference, kind: reference.kind, vault, object, epoch, read, write, wrapped });
  }
  for (const dependency of resolver.dependencies.values()) dependencies.set(`${dependency.vault}/${dependency.object}`, dependency);
  const expiresAt = Date.now() + expiresInSeconds * 1000; positive(expiresAt);
  const result = await this.client.call('runtime/grant', { grant, machine: identity.machine, deviceKey: identity.deviceKey, recipientKey: identity.recipientKey, tokenHash: await digest(token), expiresAt, maxUses, scopes, dependencies: [...dependencies.values()] });
  return { schema: 1, id: grant, origin: this.client.origin, tenant: this.client.profile.tenant, account: this.client.profile.account, authorityKey: this.client.profile.authorityKey, machine: identity.machine, token, expiresAt: result.expiresAt, maxUses, scopes: descriptors };
 }
 revoke(grant) { return this.client.call('runtime/revoke', { grant: typeof grant === 'string' ? grant : grant.id }); }
 list() { return this.client.call('runtime/grants', {}); }
}
