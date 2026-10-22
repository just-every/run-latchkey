import { id, validateEnvelope } from '../crypto/envelope.mjs';
import { RuntimeError, access, binding, exact, need, positive, uuid } from './common.mjs';
import { machineAuthority } from './authority.mjs';

export async function runtimePublic(route, input, ctx) {
 if (!['runtime/fetch', 'runtime/write'].includes(route)) return null;
 exact(input, route === 'runtime/fetch' ? ['grant', 'scopes'] : ['grant', 'scope', 'version', 'envelope']);
 const authority = await machineAuthority(input, ctx), { grant, sql, args, now } = authority;
 const db = access({ ...ctx, actor: grant.account_id, device: grant.machine_id, now });
 if (route === 'runtime/fetch') {
  need(Array.isArray(input.scopes) && input.scopes.length > 0 && input.scopes.length <= 100 && new Set(input.scopes).size === input.scopes.length, 'invalid_scopes'); input.scopes.forEach(uuid);
  const scopes = [];
  for (const selected of input.scopes) {
   const scope = await db.first('SELECT * FROM lky_runtime_scopes WHERE id=? AND grant_id=? AND can_read=1', selected, grant.id);
   need(scope, 'permission_denied', 403); scopes.push(scope);
  }
  const snapshots = [];
  // Read guards, use accounting, audit and envelopes share a single transaction.
  const statements = [db.stmt('DELETE FROM lky_runtime_guard'), db.guard(sql, args), db.stmt('UPDATE lky_runtime_grants SET uses=uses+1 WHERE id=?', grant.id)];
  for (const scope of scopes) {
   snapshots.push(statements.length);
   statements.push(scope.kind === 'field'
    ? db.stmt('SELECT ? AS version,? AS envelope', 1, scope.payload)
    : db.stmt('SELECT version,envelope FROM lky_versions WHERE vault_id=? AND object_id=? ORDER BY version DESC LIMIT 1', scope.vault_id, scope.object_id));
  }
  statements.push(db.event('runtime_fetched', grant.id), db.stmt('DELETE FROM lky_runtime_guard'));
  let result;
  try { result = await ctx.db.batch(statements); } catch { throw new RuntimeError('machine_authority_expired', 401); }
  return { grant: grant.id, tenant: grant.tenant, scopes: scopes.map((scope, index) => {
   const row = result[snapshots[index]].results[0];
   need(row, 'not_found', 404);
   return { id: scope.id, kind: scope.kind, vault: scope.vault_id, object: scope.object_id, epoch: scope.epoch, version: row.version, envelope: JSON.parse(row.envelope), wrapped: JSON.parse(scope.wrapped_key) };
  }) };
 }
 uuid(input.scope); positive(input.version);
 const scope = await db.first("SELECT * FROM lky_runtime_scopes WHERE id=? AND grant_id=? AND kind='project' AND can_write=1", input.scope, grant.id);
 need(scope, 'permission_denied', 403);
 validateEnvelope(input.envelope, binding(grant.tenant, scope.vault_id, scope.object_id, 'item', scope.epoch, input.version));
 const mutation = id();
 try {
  await ctx.db.batch([
   db.stmt('DELETE FROM lky_runtime_guard'), db.guard(`${sql} AND (SELECT COALESCE(MAX(version),0) FROM lky_versions WHERE vault_id=? AND object_id=?)=?`, [...args, scope.vault_id, scope.object_id, input.version - 1]),
   db.stmt('UPDATE lky_runtime_grants SET uses=uses+1 WHERE id=?', grant.id),
   db.stmt('INSERT INTO lky_versions VALUES(?,?,?,?)', scope.vault_id, scope.object_id, input.version, JSON.stringify(input.envelope)),
   db.stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?', mutation, scope.vault_id),
   db.event('runtime_written', scope.object_id), db.stmt('DELETE FROM lky_runtime_guard'),
  ]);
 } catch { throw new RuntimeError('runtime_write_conflict', 409); }
 return { object: scope.object_id, version: input.version, providerState: 'unchanged' };
}
