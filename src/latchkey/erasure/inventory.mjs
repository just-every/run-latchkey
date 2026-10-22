import { access } from './common.mjs';

// Every selector enumerates primary keys only. Checking its exact ordered key
// set again inside the commit prevents an intervening link/challenge/grant
// from escaping deletion even when that operation did not bump vault revision.
export async function inventory(ctx, vault, object) {
 const { all } = access(ctx);
 const entries = [
  { table: 'lky_versions', keys: ['vault_id', 'object_id', 'version'], select: 'SELECT vault_id,object_id,version FROM lky_versions WHERE vault_id=? AND object_id=?', args: [vault, object] },
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
