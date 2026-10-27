import { access } from './common.mjs';

// Every selector enumerates primary keys only. Checking its exact ordered key
// set again inside the commit prevents an intervening link/challenge/grant
// from escaping deletion even when that operation did not bump vault revision.
export async function inventory(ctx, vault, object) {
 const { all } = access(ctx);
 const entries = [
  {table:'lky_report_observations',keys:['id'],select:'SELECT id FROM lky_report_observations WHERE vault_id=?',args:[vault]},
  { table: 'lky_versions', keys: ['vault_id', 'object_id', 'version'], select: 'SELECT vault_id,object_id,version FROM lky_versions WHERE vault_id=? AND object_id=?', args: [vault, object] },
  {table:'lky_checkouts',keys:['vault_id','object_id'],select:'SELECT vault_id,object_id FROM lky_checkouts WHERE vault_id=? AND object_id=?',args:[vault,object]},
  {table:'lky_lifecycle',keys:['vault_id','object_id'],select:'SELECT vault_id,object_id FROM lky_lifecycle WHERE vault_id=? AND object_id=?',args:[vault,object]},
  {table:'lky_bulk_operations',keys:['id'],select:'SELECT id FROM lky_bulk_operations WHERE tenant=? AND instr(plan,?)>0',args:[ctx.tenant,object]},
  { table: 'lky_link_challenges', keys: ['id'], select: 'SELECT c.id FROM lky_link_challenges c JOIN lky_links l ON l.id=c.link_id WHERE l.tenant=? AND l.vault_id=? AND l.object_id=?', args: [ctx.tenant, vault, object] },
  { table: 'lky_links', keys: ['id'], select: 'SELECT id FROM lky_links WHERE tenant=? AND vault_id=? AND object_id=?', args: [ctx.tenant, vault, object] },
  { table: 'lky_share_keys', keys: ['share_id', 'account_id', 'object_id'], select: 'SELECT k.share_id,k.account_id,k.object_id FROM lky_share_keys k JOIN lky_shares s ON s.id=k.share_id WHERE s.tenant=? AND s.vault_id=? AND k.object_id=?', args: [ctx.tenant, vault, object] },
  { table: 'lky_shares', keys: ['id'], select: 'SELECT s.id FROM lky_shares s WHERE s.tenant=? AND s.vault_id=? AND EXISTS(SELECT 1 FROM lky_share_keys k WHERE k.share_id=s.id AND k.object_id=?) AND NOT EXISTS(SELECT 1 FROM lky_share_keys k WHERE k.share_id=s.id AND k.object_id<>?)', args: [ctx.tenant, vault, object, object] },
  { table: 'lky_machines', keys: ['id'], select: 'SELECT id FROM lky_machines WHERE vault_id=? AND object_id=?', args: [vault, object] },
  // All Base transfer jobs are invalidated together, so their destination-local
  // activation preparations are scrubbed together as well.
  { table: 'lky_restore_preparations', keys: ['id'], select: 'SELECT id FROM lky_restore_preparations', args: [] },
 ];
 entries.push({table:'lky_mcp_requests',keys:['id'],select:'SELECT id FROM lky_mcp_requests WHERE tenant=? AND vault_id=? AND instr(objects,?)>0',args:[ctx.tenant,vault,object]});
 const grants=await all('SELECT DISTINCT grant_id AS id FROM lky_runtime_scopes WHERE vault_id=? AND object_id=? UNION SELECT grant_id AS id FROM lky_runtime_dependencies WHERE vault_id=? AND object_id=?',vault,object,vault,object);const grantIds=JSON.stringify(grants.map(r=>r.id));
 entries.push({table:'lky_runtime_scopes',keys:['id'],select:'SELECT id FROM lky_runtime_scopes WHERE grant_id IN(SELECT value FROM json_each(?))',args:[grantIds]},{table:'lky_runtime_dependencies',keys:['grant_id','vault_id','object_id'],select:'SELECT grant_id,vault_id,object_id FROM lky_runtime_dependencies WHERE grant_id IN(SELECT value FROM json_each(?))',args:[grantIds]},{table:'lky_runtime_grants',keys:['id'],select:'SELECT id FROM lky_runtime_grants WHERE id IN(SELECT value FROM json_each(?))',args:[grantIds]});
 const projects=await all('SELECT id FROM lky_projects WHERE vault_id=? AND metadata_object=?',vault,object);const projectIds=JSON.stringify(projects.map(r=>r.id));const envs=await all('SELECT id FROM lky_project_environments WHERE project_id IN(SELECT value FROM json_each(?)) OR catalog_object=?',projectIds,object);const envIds=JSON.stringify(envs.map(r=>r.id));
 entries.push({table:'lky_project_resources',keys:['id'],select:'SELECT id FROM lky_project_resources WHERE (vault_id=? AND object_id=?) OR environment_id IN(SELECT value FROM json_each(?))',args:[vault,object,envIds]},{table:'lky_project_environments',keys:['id'],select:'SELECT id FROM lky_project_environments WHERE id IN(SELECT value FROM json_each(?))',args:[envIds]},{table:'lky_projects',keys:['id'],select:'SELECT id FROM lky_projects WHERE id IN(SELECT value FROM json_each(?))',args:[projectIds]});
 const ruleFilter="SELECT DISTINCT c.id FROM lky_rules c JOIN lky_rule_versions v ON v.rule_id=c.id JOIN json_each(v.definition,'$.targets') t WHERE c.tenant=? AND json_extract(v.definition,'$.vault')=? AND json_extract(t.value,'$.object')=?",ruleArgs=[ctx.tenant,vault,object];
 const runFilter=`SELECT id FROM lky_rule_runs WHERE rule_id IN(${ruleFilter})`,obligationFilter=`SELECT id FROM lky_rule_obligations WHERE run_id IN(${runFilter})`;
 entries.push({table:'lky_rule_reviews',keys:['obligation'],select:`SELECT obligation FROM lky_rule_reviews WHERE obligation IN(${obligationFilter})`,args:ruleArgs},{table:'lky_rule_decisions',keys:['id'],select:`SELECT id FROM lky_rule_decisions WHERE obligation IN(${obligationFilter})`,args:ruleArgs},{table:'lky_rule_obligations',keys:['id'],select:`SELECT id FROM lky_rule_obligations WHERE run_id IN(${runFilter})`,args:ruleArgs},{table:'lky_rule_runs',keys:['id'],select:`SELECT id FROM lky_rule_runs WHERE rule_id IN(${ruleFilter})`,args:ruleArgs},{table:'lky_rule_versions',keys:['rule_id','version'],select:`SELECT rule_id,version FROM lky_rule_versions WHERE rule_id IN(${ruleFilter})`,args:ruleArgs},{table:'lky_rules',keys:['id'],select:`SELECT id FROM lky_rules WHERE id IN(${ruleFilter})`,args:ruleArgs});
 for (const entry of entries) {
  entry.ordered = `SELECT * FROM (${entry.select}) ORDER BY ${entry.keys.join(',')}`;
  entry.rows = await all(entry.ordered, ...entry.args);
 }
 return entries;
}
export function inventoryGuard(ctx, entry) {
 const { guard } = access(ctx);
 return guard(`(SELECT json_group_array(json_array(${entry.keys.join(',')})) FROM (${entry.ordered}))=?`, [...entry.args, JSON.stringify(entry.rows.map(row => entry.keys.map(key => row[key])))]);
}
export function deletionStatements(ctx, entries) {
 const { stmt } = access(ctx);
 // Delete exactly the reviewed key set. The inventory guards have already
 // established that no matching row can be omitted from this transaction.
 return entries.flatMap(entry => entry.rows.map(row => stmt(`DELETE FROM ${entry.table} WHERE ${entry.keys.map(key => `${key}=?`).join(' AND ')}`, ...entry.keys.map(key => row[key]))));
}
