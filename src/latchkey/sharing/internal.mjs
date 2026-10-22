import { id, validateEnvelope } from '../crypto/envelope.mjs';
import { access, binding, disclosure, exact, integer, memberLive, need, sourceLive, uuid } from './common.mjs';

const live = `NOT EXISTS(SELECT 1 FROM lky_lifecycle lc WHERE lc.vault_id=s.vault_id AND lc.object_id=k.object_id AND lc.state<>'active') AND s.revoked_at IS NULL AND s.approved_at IS NOT NULL AND s.starts_at<=? AND s.expires_at>? AND s.epoch=v.epoch AND a.generation=k.recipient_generation AND ${memberLive()} AND ${sourceLive('s')} AND NOT EXISTS(SELECT 1 FROM json_each(s.rights) granted WHERE NOT EXISTS(SELECT 1 FROM lky_recipients source,json_each(source.rights) current WHERE source.vault_id=s.vault_id AND source.account_id=s.source_account AND current.value=granted.value))`;
const join = `FROM lky_shares s JOIN lky_share_keys k ON k.share_id=s.id JOIN lky_accounts a ON a.id=k.account_id JOIN lky_vaults v ON v.id=s.vault_id JOIN lky_versions x ON x.vault_id=s.vault_id AND x.object_id=k.object_id AND x.version=k.version`;
export async function internal(route, input, ctx) {
 const { first, all, stmt, event } = access(ctx), { now, actor, tenant, db, fence, fenceArgs } = ctx;
 if (route === 'sharing/received') {
  exact(input, []);
  return all(`SELECT DISTINCT s.id,s.vault_id,s.source_account,s.scope,s.group_id,s.rights,s.starts_at,s.expires_at,k.object_id,k.version ${join} WHERE s.tenant=? AND k.account_id=? AND ${live} AND ${fence}`, tenant, actor, now, now, ...fenceArgs);
 }
 if (route === 'sharing/read') {
  exact(input, ['share', 'object', 'action']);
  need(['read', 'export'].includes(input.action), 'invalid_action');
  const rows = await all(`SELECT s.id,s.tenant,s.vault_id,s.epoch,s.source_account,s.rights,k.object_id,k.version,k.wrapped_key,x.envelope,v.revision ${join} WHERE s.id=? AND s.tenant=? AND k.account_id=? AND k.object_id=? AND ${live} AND EXISTS(SELECT 1 FROM json_each(s.rights) WHERE value=?) AND ${fence}`, uuid(input.share), tenant, actor, uuid(input.object), now, now, input.action, ...fenceArgs);
  need(rows.length, 'share_unavailable', 403);
  const result = rows[0]; await event('internal_share_read', result.id, fence, fenceArgs).run();
  return { ...result, wrapped: JSON.parse(result.wrapped_key), envelope: JSON.parse(result.envelope), wrapped_key: undefined, disclosure };
 }
 if (route === 'sharing/put') {
  exact(input, ['share', 'object', 'version', 'envelope']);
  const share = uuid(input.share), object = uuid(input.object), version = integer(input.version);
  const row = await first(`SELECT s.*,k.version ${join} WHERE s.id=? AND s.tenant=? AND k.account_id=? AND k.object_id=? AND ${live} AND EXISTS(SELECT 1 FROM json_each(s.rights) WHERE value='edit')`, share, tenant, actor, object, now, now);
  need(row, 'share_unavailable', 403); need(version === row.version + 1, 'version_conflict', 409);
  validateEnvelope(input.envelope, binding(tenant, row.vault_id, object, 'item', row.epoch, version));
  const mutation = id();
  const result = await db.batch([
   stmt(`UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=? AND (SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=? AND EXISTS(SELECT 1 ${join} WHERE s.id=? AND k.account_id=? AND k.object_id=? AND ${live} AND EXISTS(SELECT 1 FROM json_each(s.rights) WHERE value='edit')) AND ${fence}`, mutation, row.vault_id, row.vault_id, object, row.version, share, actor, object, now, now, ...fenceArgs),
   stmt('INSERT INTO lky_versions SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND mutation=?)', row.vault_id, object, version, JSON.stringify(input.envelope), row.vault_id, mutation),
   event('internal_share_item_written', share, 'EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND mutation=?)', [row.vault_id, mutation]),
  ]);
  need(result[0].meta.changes, 'version_conflict', 409);
  // Existing key wraps bind the reviewed version. A new version requires an
  // explicit new grant; this write cannot silently extend any old grant.
  return { object, version, grantRequiresRenewal: true };
 }
 return null;
}
