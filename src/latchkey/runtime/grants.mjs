import { publicKey, validateEnvelope, verifyWrapped } from '../crypto/envelope.mjs';
import { RuntimeError, access, activeObject, binding, exact, need, positive, uuid, vaultAccess, vaultPredicate } from './common.mjs';

async function sourceGuard(ctx, scope) {
 const required = scope.write ? ['read', 'share', 'edit'] : ['read', 'share'];
 const { first } = access(ctx), vault = await vaultAccess(ctx, scope.vault, required);
 need(vault.epoch === scope.epoch, 'version_conflict', 409);
 const current = await first(`SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=? AND ${activeObject()}`, scope.vault, scope.object, scope.vault, scope.object);
 need(current?.version, 'not_found', 404);
 if (scope.kind === 'field') need(current.version === scope.sourceVersion, 'version_conflict', 409);
 else {
  need(await first('SELECT 1 AS yes FROM lky_project_resources r JOIN lky_project_environments e ON e.id=r.environment_id JOIN lky_projects p ON p.id=e.project_id WHERE r.vault_id=? AND r.object_id=? AND p.tenant=?', scope.vault, scope.object, ctx.tenant), 'not_found', 404);
  need(await first('SELECT 1 AS yes FROM lky_project_environments e JOIN lky_projects p ON p.id=e.project_id WHERE e.id=? AND p.id=? AND p.tenant=?', scope.environment, scope.project, ctx.tenant), 'not_found', 404);
 }
 const allowed = vaultPredicate(ctx, scope.vault, required);
 const projectSql = `EXISTS(SELECT 1 FROM lky_project_resources resource JOIN lky_project_environments environment ON environment.id=resource.environment_id JOIN lky_projects project ON project.id=environment.project_id WHERE resource.vault_id=? AND resource.object_id=? AND project.tenant=? AND ${activeObject('project.vault_id', 'project.metadata_object')}) AND EXISTS(SELECT 1 FROM lky_project_environments environment JOIN lky_projects project ON project.id=environment.project_id WHERE environment.id=? AND project.id=? AND project.tenant=? AND ${activeObject('project.vault_id', 'project.metadata_object')})`;
 return { sql: `${allowed.sql} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=?) AND EXISTS(SELECT 1 FROM lky_versions WHERE vault_id=? AND object_id=?) AND ${activeObject()}${scope.kind === 'field' ? ' AND (SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=?' : ` AND ${projectSql}`}`, args: [...allowed.args, scope.vault, scope.epoch, scope.vault, scope.object, scope.vault, scope.object, ...(scope.kind === 'field' ? [scope.vault, scope.object, scope.sourceVersion] : [scope.vault, scope.object, ctx.tenant, scope.environment, scope.project, ctx.tenant])] };
}
async function grant(input, ctx) {
 exact(input, ['grant', 'machine', 'deviceKey', 'recipientKey', 'tokenHash', 'expiresAt', 'maxUses', 'scopes', 'dependencies']);
 uuid(input.grant); uuid(input.machine); positive(input.expiresAt);
 need(input.expiresAt > ctx.now, 'invalid_expiry');
 if (input.maxUses !== null) positive(input.maxUses);
 need(typeof input.tokenHash === 'string' && /^[A-Za-z0-9_-]{43}$/.test(input.tokenHash), 'invalid_token_hash');
 await publicKey(input.deviceKey, 'sign'); await publicKey(input.recipientKey, 'wrap');
 need(Array.isArray(input.scopes) && input.scopes.length > 0 && input.scopes.length <= 100 && new Set(input.scopes.map(scope => scope.id)).size === input.scopes.length, 'invalid_scopes');
 need(Array.isArray(input.dependencies) && input.dependencies.length <= 200, 'invalid_dependencies');
 const { first, stmt, guard, event } = access(ctx), account = await first('SELECT a.generation,a.authority_key,o.version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status=\'active\'', ctx.actor, ctx.tenant);
 need(account, 'authority_expired', 401);
 const predicates = [], scopeRows = [], dependencies = new Map();
 for (const scope of input.scopes) {
  exact(scope, ['id', 'kind', 'vault', 'object', 'epoch', 'project', 'environment', 'pathHash', 'read', 'write', 'wrapped', 'payload', 'sourceVersion']);
  uuid(scope.id); uuid(scope.vault); uuid(scope.object); positive(scope.epoch);
  need(['project', 'field'].includes(scope.kind) && typeof scope.read === 'boolean' && typeof scope.write === 'boolean' && (scope.read || scope.write), 'invalid_scopes');
  need(typeof scope.pathHash === 'string' && /^[A-Za-z0-9_-]{43}$/.test(scope.pathHash), 'invalid_scopes');
  if (scope.kind === 'project') { uuid(scope.project); uuid(scope.environment); need(scope.payload === null && scope.sourceVersion === null, 'invalid_scopes'); }
  else {
   need(scope.project === null && scope.environment === null && scope.read && !scope.write, 'invalid_scopes'); positive(scope.sourceVersion);
   validateEnvelope(scope.payload, binding(ctx.tenant, scope.vault, scope.id, 'runtime-field', scope.epoch));
   dependencies.set(`${scope.vault}/${scope.object}`, { vault: scope.vault, object: scope.object, epoch: scope.epoch, version: scope.sourceVersion });
  }
  need(await verifyWrapped(scope.wrapped, account.authority_key, ctx.actor, binding(ctx.tenant, scope.vault, input.machine, `runtime-key:${scope.id}`, scope.epoch)), 'invalid_key_signature', 403);
  predicates.push(await sourceGuard(ctx, scope));
  scopeRows.push(stmt('INSERT INTO lky_runtime_scopes VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)', scope.id, input.grant, scope.kind, scope.vault, scope.object, scope.epoch, scope.project, scope.environment, scope.pathHash, Number(scope.read), Number(scope.write), JSON.stringify(scope.wrapped), scope.payload === null ? null : JSON.stringify(scope.payload), scope.sourceVersion));
 }
 for (const dependency of input.dependencies) {
  exact(dependency, ['vault', 'object', 'epoch', 'version']); uuid(dependency.vault); uuid(dependency.object); positive(dependency.epoch); positive(dependency.version);
  const key = `${dependency.vault}/${dependency.object}`, existing = dependencies.get(key);
  need(!existing || existing.epoch === dependency.epoch && existing.version === dependency.version, 'invalid_dependencies'); dependencies.set(key, dependency);
 }
 for (const scope of input.scopes.filter(scope => scope.kind === 'project')) {
  const catalogs = await access(ctx).all('SELECT p.vault_id AS vault,e.catalog_object AS object FROM lky_project_environments e JOIN lky_projects p ON p.id=e.project_id WHERE e.id=? UNION SELECT r.vault_id AS vault,e.catalog_object AS object FROM lky_project_resources r JOIN lky_project_environments e ON e.id=r.environment_id WHERE r.vault_id=? AND r.object_id=?', scope.environment, scope.vault, scope.object);
  need(catalogs.length && catalogs.every(row => dependencies.has(`${row.vault}/${row.object}`)), 'catalog_dependency_required');
 }
 for (const dependency of dependencies.values()) {
  await vaultAccess(ctx, dependency.vault, ['read', 'share']);
  const allowed = vaultPredicate(ctx, dependency.vault, ['read', 'share']);
  predicates.push({ sql: `${allowed.sql} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=?) AND (SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=? AND ${activeObject()}`, args: [...allowed.args, dependency.vault, dependency.epoch, dependency.vault, dependency.object, dependency.version, dependency.vault, dependency.object] });
 }
 try {
  await ctx.db.batch([
   stmt('DELETE FROM lky_runtime_guard'), guard(`${ctx.fence} AND EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND a.authority_key=? AND o.version=? AND o.status='active')`, [...(ctx.fenceArgs ?? []), ctx.actor, account.generation, account.authority_key, account.version]),
   ...predicates.map(predicate => guard(predicate.sql, predicate.args)),
   stmt('INSERT INTO lky_runtime_grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?)', input.grant, ctx.tenant, ctx.actor, ctx.device, input.machine, input.tokenHash, input.deviceKey, input.recipientKey, account.authority_key, account.generation, account.version, input.expiresAt, input.maxUses, ctx.now),
   ...scopeRows, ...[...dependencies.values()].map(dependency => stmt('INSERT INTO lky_runtime_dependencies VALUES(?,?,?,?,?)', input.grant, dependency.vault, dependency.object, dependency.epoch, dependency.version)),
   event('runtime_granted', input.grant), stmt('DELETE FROM lky_runtime_guard'),
  ]);
 } catch { throw new RuntimeError('runtime_authority_changed', 409); }
 return { grant: input.grant, expiresAt: input.expiresAt, maxUses: input.maxUses };
}
export async function runtimeAuthenticated(route, input, ctx) {
 if (route === 'runtime/grant') return grant(input, ctx);
 const { first, all, stmt, event, guard } = access(ctx);
 if (route === 'runtime/grants') {
  exact(input, []);
  return { grants: await all(`SELECT id,machine_id,expires_at,max_uses,uses,revoked_at FROM lky_runtime_grants WHERE tenant=? AND account_id=? AND ${ctx.fence} ORDER BY created_at,id`, ctx.tenant, ctx.actor, ...(ctx.fenceArgs ?? [])) };
 }
 if (route !== 'runtime/revoke') return null;
 exact(input, ['grant']); uuid(input.grant);
 need(await first('SELECT id FROM lky_runtime_grants WHERE id=? AND tenant=? AND account_id=?', input.grant, ctx.tenant, ctx.actor), 'not_found', 404);
 try { await ctx.db.batch([stmt('DELETE FROM lky_runtime_guard'), guard(ctx.fence, ctx.fenceArgs ?? []), stmt('UPDATE lky_runtime_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id=? AND tenant=? AND account_id=?', ctx.now, input.grant, ctx.tenant, ctx.actor), event('runtime_revoked', input.grant), stmt('DELETE FROM lky_runtime_guard')]); }
 catch { throw new RuntimeError('runtime_authority_changed', 409); }
 return { revoked: input.grant };
}
