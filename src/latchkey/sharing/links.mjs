import { id, validateEnvelope } from '../crypto/envelope.mjs';
import { access, binding, domainAllowed, email, exact, hashString, integer, need, policy, sourceGuard, sourceVault, times, uuid } from './common.mjs';

export async function links(route, input, ctx) {
 const { first, all, stmt, event } = access(ctx), { db, now, tenant, actor, fence, fenceArgs } = ctx;
 if (route === 'sharing/link/create') {
  exact(input, ['link', 'vault', 'object', 'sourceVersion', 'verifierHash', 'passwordSalt', 'passwordRequired', 'recipient', 'envelope', 'startsAt', 'expiresAt', 'maxViews']);
  const vault = await sourceVault(ctx, input.vault), link = uuid(input.link), object = uuid(input.object), recipient = email(input.recipient);
  const rules = await policy(ctx); need(domainAllowed(rules, recipient), 'external_sharing_blocked', 403);
  need(typeof input.passwordRequired === 'boolean'); hashString(input.passwordSalt); hashString(input.verifierHash); integer(input.maxViews, 1, 1000); integer(input.sourceVersion);
  const latest = await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?', vault.id, object);
  need(latest?.version === input.sourceVersion, 'version_conflict', 409);
  validateEnvelope(input.envelope, binding(tenant, vault.id, link, 'external-link', vault.epoch, input.sourceVersion));
  const { starts, expires } = times(input, now, rules), guard = sourceGuard(ctx, vault), mutation = id();
  const changed = await db.batch([
   stmt(`INSERT INTO lky_links SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,NULL,?,? WHERE ${guard.sql} AND EXISTS(SELECT 1 FROM lky_sharing_policy p WHERE p.tenant=? AND p.external_enabled=1 AND p.max_days*86400000>=?-? AND EXISTS(SELECT 1 FROM json_each(p.domains) WHERE value=?))`, link, tenant, vault.id, object, input.sourceVersion, vault.epoch, actor, ctx.device, vault.generation, ctx.session.operator.version, input.verifierHash, input.passwordSalt, Number(input.passwordRequired), recipient, JSON.stringify(input.envelope), starts, expires, input.maxViews, now, mutation, ...guard.args, tenant, expires, now, recipient.split('@')[1]),
   event('external_link_created', link, 'EXISTS(SELECT 1 FROM lky_links WHERE id=? AND mutation=?)', [link, mutation]),
  ]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return { link, tenant, vault: vault.id, epoch: vault.epoch, sourceVersion: input.sourceVersion, starts, expires, maxViews: input.maxViews, recipient, verifiedRecipientRequired: true };
 }
 if (route === 'sharing/link/revoke') {
  exact(input, ['link']); const link = uuid(input.link);
  const row = await first('SELECT vault_id FROM lky_links WHERE id=? AND tenant=?', link, tenant); need(row, 'not_found', 404);
  const vault = await sourceVault(ctx, row.vault_id), guard = sourceGuard(ctx, vault), mutation = id();
  const changed = await db.batch([
   stmt(`UPDATE lky_links SET revoked_at=?,mutation=? WHERE id=? AND revoked_at IS NULL AND ${guard.sql}`, now, mutation, link, ...guard.args),
   event('external_link_revoked', link, 'EXISTS(SELECT 1 FROM lky_links WHERE id=? AND mutation=?)', [link, mutation]),
  ]);
  need(changed[0].meta.changes, 'not_found', 404); return { link, revoked: true };
 }
 if (route === 'sharing/history') {
  exact(input, ['vault', 'object']); const vault = await sourceVault(ctx, input.vault);
  const object = input.object === null ? null : uuid(input.object);
  return {
   links: await all('SELECT id,object_id,recipient_email,starts_at,expires_at,max_views,views,revoked_at,created_at,password_required FROM lky_links WHERE tenant=? AND vault_id=? AND (? IS NULL OR object_id=?) ORDER BY created_at DESC LIMIT 1000', tenant, vault.id, object, object),
   grants: await all('SELECT DISTINCT s.id,s.scope,s.group_id,s.rights,s.starts_at,s.expires_at,s.approved_at,s.revoked_at,s.created_at,k.account_id,k.object_id FROM lky_shares s JOIN lky_share_keys k ON k.share_id=s.id WHERE s.tenant=? AND s.vault_id=? AND (? IS NULL OR k.object_id=?) ORDER BY s.created_at DESC LIMIT 1000', tenant, vault.id, object, object),
  };
 }
 return null;
}
