import { digest, id, verifyWrapped } from '../crypto/envelope.mjs';
import { access, binding, exact, integer, need, policy, sourceGuard, sourceVault, times, uuid } from './common.mjs';

export async function management(route, input, ctx) {
 const { stmt, first, all, event } = access(ctx), { actor, tenant, now, db, fence, fenceArgs } = ctx;
 if (route === 'sharing/policy') { exact(input, []); return policy(ctx); }
 if (route === 'sharing/policy/set') {
  exact(input, ['externalEnabled', 'domains', 'defaultDays', 'maxDays']);
  need(ctx.session.operator.role === 'owner', 'owner_required', 403);
  need(typeof input.externalEnabled === 'boolean' && Array.isArray(input.domains) && input.domains.length <= 100);
  const domains = [...new Set(input.domains)];
  need(domains.every(domain => typeof domain === 'string' && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(domain)));
  integer(input.maxDays, 1, 30); integer(input.defaultDays, 1, Math.min(7, input.maxDays));
  need(!input.externalEnabled || domains.length > 0, 'approved_domains_required');
  const mutation = id();
  const result = await db.batch([
   stmt(`INSERT INTO lky_sharing_policy SELECT ?,?,?,?,?,? WHERE ${fence} ON CONFLICT(tenant) DO UPDATE SET external_enabled=excluded.external_enabled,domains=excluded.domains,default_days=excluded.default_days,max_days=excluded.max_days,mutation=excluded.mutation`, tenant, Number(input.externalEnabled), JSON.stringify(domains), input.defaultDays, input.maxDays, mutation, ...fenceArgs),
   event('sharing_policy_changed', tenant, 'EXISTS(SELECT 1 FROM lky_sharing_policy WHERE tenant=? AND mutation=?)', [tenant, mutation]),
  ]);
  need(result[0].meta.changes, 'authority_changed', 409); return policy(ctx);
 }
 if (route === 'sharing/group/create') {
  exact(input, ['group']); need(['owner', 'admin'].includes(ctx.session.operator.role), 'permission_denied', 403);
  const group = uuid(input.group);
  const changed = await db.batch([stmt(`INSERT INTO lky_share_groups SELECT ?,?,? WHERE ${fence}`, group, tenant, actor, ...fenceArgs), event('sharing_group_created', group, 'EXISTS(SELECT 1 FROM lky_share_groups WHERE id=? AND tenant=?)', [group, tenant])]);
  need(changed[0].meta.changes, 'authority_changed', 409); return { group };
 }
 if (route === 'sharing/group/set' || route === 'sharing/group/members') {
  exact(input, route.endsWith('/set') ? ['group', 'accounts'] : ['group']);
  need(['owner', 'admin'].includes(ctx.session.operator.role), 'permission_denied', 403);
  const group = uuid(input.group); need(await first('SELECT id FROM lky_share_groups WHERE id=? AND tenant=?', group, tenant), 'not_found', 404);
  if (route.endsWith('/set')) {
   need(Array.isArray(input.accounts) && input.accounts.length <= 100 && new Set(input.accounts).size === input.accounts.length);
   for (const account of input.accounts) need(await first("SELECT a.id FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'", uuid(account), tenant), 'recipient_mismatch', 409);
   // Membership changes never manufacture a recipient key wrap.
   const changed = await db.batch([stmt(`DELETE FROM lky_share_group_members WHERE group_id=? AND ${fence}`, group, ...fenceArgs), ...input.accounts.map(account => stmt(`INSERT INTO lky_share_group_members SELECT ?,? WHERE ${fence}`, group, account, ...fenceArgs)), event('sharing_group_members_changed', group, fence, fenceArgs)]);
   need(changed.at(-1).meta.changes, 'authority_changed', 409);
  }
  return { group, accounts: (await all('SELECT account_id FROM lky_share_group_members WHERE group_id=? ORDER BY account_id', group)).map(row => row.account_id) };
 }
 if (route === 'sharing/grant') {
  exact(input, ['share', 'vault', 'scope', 'group', 'rights', 'startsAt', 'expiresAt', 'approvalRequired', 'recipients']);
  const vault = await sourceVault(ctx, input.vault), share = uuid(input.share), guard = sourceGuard(ctx, vault);
  need(['items', 'vault'].includes(input.scope) && typeof input.approvalRequired === 'boolean');
  need(Array.isArray(input.rights) && input.rights.length > 0 && new Set(input.rights).size === input.rights.length && input.rights.every(right => ['read', 'edit', 'export'].includes(right) && JSON.parse(vault.rights).includes(right)), 'permission_denied', 403);
  need(input.rights.includes('read'), 'invalid_rights');
  const { starts, expires } = times(input, now, await policy(ctx));
  const group = input.group === null ? null : uuid(input.group);
  if (group) need(await first('SELECT id FROM lky_share_groups WHERE id=? AND tenant=?', group, tenant), 'recipient_mismatch', 409);
  need(Array.isArray(input.recipients) && input.recipients.length > 0 && input.recipients.length <= 100);
  const accounts = new Set(), rows = [];
  const current = await all('SELECT object_id,MAX(version) AS version FROM lky_versions WHERE vault_id=? GROUP BY object_id', vault.id);
  for (const recipient of input.recipients) {
   exact(recipient, ['account', 'fingerprint', 'items']); const account = uuid(recipient.account);
   need(!accounts.has(account)); accounts.add(account);
   const target = await first("SELECT a.*,o.status FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'", account, tenant);
   need(target && recipient.fingerprint === await digest(JSON.stringify([target.recipient_key, target.authority_key])), 'recipient_mismatch', 409);
   if (group) need(await first('SELECT account_id FROM lky_share_group_members WHERE group_id=? AND account_id=?', group, account), 'recipient_mismatch', 409);
   need(Array.isArray(recipient.items) && recipient.items.length > 0 && recipient.items.length <= 200);
   const objects = new Set();
   if (input.scope === 'vault') need(recipient.items.length === current.length, 'incomplete_share', 409);
   for (const item of recipient.items) {
    exact(item, ['object', 'version', 'wrapped']); const object = uuid(item.object); integer(item.version);
    need(!objects.has(object) && current.some(row => row.object_id === object && row.version === item.version), 'version_conflict', 409); objects.add(object);
    need(await verifyWrapped(item.wrapped, vault.authority_key, actor, binding(tenant, vault.id, share, `share-key:${object}:${account}`, vault.epoch, item.version)), 'invalid_key_signature', 403);
    rows.push([share, account, target.generation, object, item.version, JSON.stringify(item.wrapped)]);
   }
  }
  const mutation = id(), active = 'EXISTS(SELECT 1 FROM lky_shares WHERE id=? AND mutation=?)', args = [share, mutation];
  const changed = await db.batch([
   stmt(`INSERT INTO lky_shares SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,? WHERE ${guard.sql}`, share, tenant, vault.id, actor, ctx.device, vault.generation, ctx.session.operator.version, vault.epoch, input.scope, group, JSON.stringify(input.rights), starts, expires, input.approvalRequired ? null : now, now, mutation, ...guard.args),
   ...rows.map(row => stmt(`INSERT INTO lky_share_keys SELECT ?,?,?,?,?,? WHERE ${active}`, ...row, ...args)),
   event('internal_share_created', share, active, args),
  ]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return { share, starts, expires, approvalPending: input.approvalRequired, rights: input.rights };
 }
 if (route === 'sharing/approve' || route === 'sharing/revoke') {
  exact(input, ['share']); const share = uuid(input.share);
  const row = await first('SELECT s.*,v.owner FROM lky_shares s JOIN lky_vaults v ON v.id=s.vault_id WHERE s.id=? AND s.tenant=?', share, tenant);
  need(row, 'not_found', 404); const vault = await sourceVault(ctx, row.vault_id), guard = sourceGuard(ctx, vault);
  const approve = route.endsWith('/approve');
  if (approve) need(row.owner === actor, 'owner_approval_required', 403);
  const mutation = id(), result = await db.batch([
   stmt(`UPDATE lky_shares SET ${approve ? 'approved_at' : 'revoked_at'}=?,mutation=? WHERE id=? AND revoked_at IS NULL AND expires_at>? AND ${guard.sql}`, now, mutation, share, now, ...guard.args),
   event(approve ? 'internal_share_approved' : 'internal_share_revoked', share, 'EXISTS(SELECT 1 FROM lky_shares WHERE id=? AND mutation=?)', [share, mutation]),
  ]);
  need(result[0].meta.changes, 'not_found', 404); return { share, [approve ? 'approved' : 'revoked']: true };
 }
 return null;
}
