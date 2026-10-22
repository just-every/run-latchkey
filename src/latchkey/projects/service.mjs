import { RuntimeError, access, activeObject, exact, need, uuid, vaultAccess, vaultPredicate } from '../runtime/common.mjs';

async function project(ctx, projectId, rights = ['read']) {
 const row = await access(ctx).first('SELECT * FROM lky_projects WHERE id=? AND tenant=?', uuid(projectId), ctx.tenant);
 need(row, 'not_found', 404); await vaultAccess(ctx, row.vault_id, rights);
 need(await access(ctx).first(`SELECT 1 AS yes WHERE ${activeObject()}`, row.vault_id, row.metadata_object), 'not_found', 404); return row;
}
async function commit(ctx, check, args, statements) {
 const { stmt, guard } = access(ctx);
 try { await ctx.db.batch([stmt('DELETE FROM lky_runtime_guard'), guard(`${ctx.fence} AND ${check}`, [...(ctx.fenceArgs ?? []), ...args]), ...statements, stmt('DELETE FROM lky_runtime_guard')]); }
 catch { throw new RuntimeError('project_changed', 409); }
}
export async function projectsAuthenticated(route, input, ctx) {
 if (!route.startsWith('project/')) return null;
 const { first, all, stmt, event } = access(ctx);
 if (route === 'project/list') {
  exact(input, []);
  return { projects: await all(`SELECT p.id,p.vault_id AS vault,p.metadata_object AS object,p.owner FROM lky_projects p JOIN lky_vaults v ON v.id=p.vault_id JOIN lky_recipients r ON r.vault_id=v.id WHERE p.tenant=? AND v.tenant=p.tenant AND v.kind='company' AND r.account_id=? AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') AND ${ctx.fence} ORDER BY p.created_at,p.id`, ctx.tenant, ctx.actor, ...(ctx.fenceArgs ?? [])) };
 }
 if (route === 'project/create') {
  exact(input, ['project', 'vault', 'object']); uuid(input.project); uuid(input.object);
  const vault = await vaultAccess(ctx, input.vault, ['read', 'create', 'share']);
  need(vault.owner === ctx.actor, 'owner_required', 403);
  const allowed = vaultPredicate(ctx, vault.id, ['read', 'create', 'share']);
  await commit(ctx, `${allowed.sql} AND EXISTS(SELECT 1 FROM lky_versions WHERE vault_id=? AND object_id=?)`, [...allowed.args, vault.id, input.object], [stmt('INSERT INTO lky_projects VALUES(?,?,?,?,?,?)', input.project, ctx.tenant, vault.id, ctx.actor, input.object, ctx.now), event('project_created', input.project)]);
  return { project: input.project, vault: vault.id, object: input.object };
 }
 if (route === 'project/environment/read') {
  exact(input, ['environment']);
  const row = await first(`SELECT e.id,e.project_id AS project,e.catalog_object AS object,p.vault_id AS vault,p.tenant,p.owner FROM lky_project_environments e JOIN lky_projects p ON p.id=e.project_id WHERE e.id=? AND p.tenant=? AND ${activeObject('p.vault_id', 'p.metadata_object')} AND ${activeObject('p.vault_id', 'e.catalog_object')}`, uuid(input.environment), ctx.tenant);
  need(row, 'not_found', 404); await vaultAccess(ctx, row.vault); return row;
 }
 if (route === 'project/resource/read') {
  exact(input, ['environment', 'object']);
  const row = await first(`SELECT r.object_id AS object,r.vault_id AS vault FROM lky_project_resources r JOIN lky_project_environments e ON e.id=r.environment_id JOIN lky_projects p ON p.id=e.project_id WHERE e.id=? AND r.object_id=? AND p.tenant=? AND ${activeObject('p.vault_id', 'p.metadata_object')} AND ${activeObject('p.vault_id', 'e.catalog_object')} AND ${activeObject('r.vault_id', 'r.object_id')}`, uuid(input.environment), uuid(input.object), ctx.tenant);
  need(row, 'reference_missing', 404); await vaultAccess(ctx, row.vault); return row;
 }
 if (route === 'project/environments') {
  exact(input, ['project']); const row = await project(ctx, input.project);
  return { environments: await all('SELECT id,catalog_object AS object FROM lky_project_environments WHERE project_id=? ORDER BY created_at,id', row.id) };
 }
 if (route === 'project/environment/create') {
  exact(input, ['project', 'environment', 'object']); uuid(input.environment); uuid(input.object);
  const row = await project(ctx, input.project, ['read', 'create']), allowed = vaultPredicate(ctx, row.vault_id, ['read', 'create']);
  await commit(ctx, `${allowed.sql} AND EXISTS(SELECT 1 FROM lky_projects WHERE id=? AND tenant=?) AND EXISTS(SELECT 1 FROM lky_versions WHERE vault_id=? AND object_id=?)`, [...allowed.args, row.id, ctx.tenant, row.vault_id, input.object], [stmt('INSERT INTO lky_project_environments VALUES(?,?,?,?)', input.environment, row.id, input.object, ctx.now), event('project_environment_created', input.environment)]);
  return { environment: input.environment, project: row.id, vault: row.vault_id, object: input.object };
 }
 if (route === 'project/resource/create') {
  exact(input, ['environment', 'object']); uuid(input.object);
  const env = await first('SELECT e.*,p.vault_id,p.tenant FROM lky_project_environments e JOIN lky_projects p ON p.id=e.project_id WHERE e.id=? AND p.tenant=?', uuid(input.environment), ctx.tenant);
  need(env, 'not_found', 404); await vaultAccess(ctx, env.vault_id, ['read', 'create']);
  const allowed = vaultPredicate(ctx, env.vault_id, ['read', 'create']);
  await commit(ctx, `${allowed.sql} AND EXISTS(SELECT 1 FROM lky_versions WHERE vault_id=? AND object_id=?)`, [...allowed.args, env.vault_id, input.object], [stmt('INSERT INTO lky_project_resources VALUES(?,?,?,?)', input.object, env.id, env.vault_id, input.object), event('project_resource_created', input.object)]);
  return { resource: input.object };
 }
 return null;
}
