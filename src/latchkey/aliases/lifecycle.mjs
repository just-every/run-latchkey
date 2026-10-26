import { access, aliasRoutes, aliasRow, canManage, canRetarget, configRow, exact, need, scopeOf, uuid } from './common.mjs';
import { activeItem } from '../lifecycle/common.mjs';
const outcomes = ['ok', 'rejected', 'ambiguous'];
const failureCode = value => { need(value === null || typeof value === 'string' && /^[a-z0-9_]{1,64}$/.test(value), 'invalid_alias_result'); return value; };
export const aliasOutput = (row, domain, mailbox, ctx) => ({
 id: row.id, scope: row.scope, owner: row.owner, vault: row.vault_id, object: row.object_id, state: row.state, intent: row.intent, ruleRef: row.rule_ref,
 replaces: row.replaces, replacedBy: row.replaced_by, delivery: row.delivery, failure: row.failure, revision: row.revision, createdAt: row.created_at, updatedAt: row.updated_at, deliveryReportedAt: row.delivery_reported_at,
 domain: domain && { id: domain.id, zone: domain.zone, domain: domain.domain, providerStatus: domain.provider_status, active: !!domain.active },
 mailbox: mailbox && { id: mailbox.id, address: mailbox.address, verifiedAt: mailbox.verified_at, active: !!mailbox.active, scope: mailbox.scope },
 // "configured" is the provider's rule and the approved mailbox being usable now. It never means mail arrived.
 forwarding: row.state === 'active' ? (domain?.active && mailbox?.active ? 'configured' : 'unavailable') : row.state,
 canManage: canManage(ctx, row), canRetarget: canRetarget(ctx, row),
});
async function usable(ctx, table, value, scope, label) {
 const row = await configRow(ctx, table, value, scope);
 need(row.active, `alias_${label}_unavailable`, 409); need(row.scope === 'company' || row.owner === ctx.actor, 'alias_configuration_not_found', 404);
 return row;
}
async function itemVault(ctx, vault, object) {
 const { first } = access(ctx), row = await first('SELECT v.id,v.kind,v.owner,r.rights FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND r.account_id=?', uuid(vault), ctx.tenant, ctx.actor);
 need(row, 'not_found', 404); need(JSON.parse(row.rights).includes('edit'), 'permission_denied', 403);
 need(await first('SELECT 1 AS present FROM lky_versions WHERE vault_id=? AND object_id=?', row.id, uuid(object)), 'not_found', 404);
 await activeItem(ctx, row.id, object);
 return row;
}
export async function aliasAuthenticated(route, input, ctx) {
 const { all, first, stmt, event } = access(ctx);
 if (route === aliasRoutes.list) {
  exact(input, []);
  const rows = await all(`SELECT a.* FROM lky_aliases a WHERE a.tenant=? AND (a.owner=? OR a.scope='company' AND (?=1 OR EXISTS(SELECT 1 FROM lky_recipients r WHERE r.vault_id=a.vault_id AND r.account_id=?))) ORDER BY a.created_at,a.id`, ctx.tenant, ctx.actor, Number(ctx.session.operator.role === 'owner'), ctx.actor);
  const out = [];
  for (const row of rows) out.push(aliasOutput(row, await first('SELECT * FROM lky_alias_domains WHERE id=?', row.domain_id), await first('SELECT * FROM lky_alias_mailboxes WHERE id=?', row.mailbox_id), ctx));
  return out;
 }
 if (route === aliasRoutes.createBegin) {
  exact(input, ['alias', 'vault', 'object', 'domain', 'mailbox', 'replaces', 'confirmed']); need(input.confirmed === true, 'alias_consent_required', 403);
  const vault = await itemVault(ctx, input.vault, input.object), scope = scopeOf(vault.kind);
  need(scope === 'company' || vault.owner === ctx.actor, 'alias_scope_mismatch', 403);
  const domain = await usable(ctx, 'lky_alias_domains', input.domain, scope, 'domain'), mailbox = await usable(ctx, 'lky_alias_mailboxes', input.mailbox, undefined, 'mailbox');
  // Work mail never forwards to a personal mailbox, and personal aliases never to a company mailbox.
  need(mailbox.scope === scope, 'alias_mailbox_scope_refused', 403); need(mailbox.verified_at, 'alias_mailbox_unverified', 409);
  let replaces = null;
  if (input.replaces !== null) { const old = await aliasRow(ctx, input.replaces); need(canManage(ctx, old) && old.vault_id === vault.id && old.object_id === input.object && old.state === 'active' && !old.replaced_by, 'alias_replacement_refused', 403); replaces = old.id; }
  else need(!await first("SELECT 1 AS live FROM lky_aliases WHERE vault_id=? AND object_id=? AND state IN ('pending','active','reconcile')", vault.id, input.object), 'alias_exists', 409);
  const alias = uuid(input.alias), changed = await ctx.db.batch([stmt(`INSERT INTO lky_aliases SELECT ?,?,?,?,?,?,?,?,NULL,'pending','create',NULL,?,NULL,'unconfirmed',NULL,1,?,?,NULL WHERE ${ctx.fence}`, alias, ctx.tenant, ctx.actor, scope, vault.id, input.object, domain.id, mailbox.id, replaces, ctx.now, ctx.now, ...ctx.fenceArgs), event('alias_create_authorized', alias)]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return { alias, scope, domain: { id: domain.id, zone: domain.zone, domain: domain.domain }, mailbox: { id: mailbox.id, address: mailbox.address } };
 }
 if (route === aliasRoutes.disableBegin || route === aliasRoutes.retargetBegin) {
  const retarget = route === aliasRoutes.retargetBegin; exact(input, retarget ? ['alias', 'mailbox', 'confirmed'] : ['alias', 'confirmed']); need(input.confirmed === true, 'alias_consent_required', 403);
  const row = await aliasRow(ctx, input.alias);
  need(retarget ? canRetarget(ctx, row) : canManage(ctx, row), 'alias_forwarding_change_denied', 403);
  need(row.state === 'active', 'alias_not_active', 409);
  let next = null;
  if (retarget) { const mailbox = await usable(ctx, 'lky_alias_mailboxes', input.mailbox, undefined, 'mailbox'); need(mailbox.scope === row.scope && (row.scope === 'company' || mailbox.owner === row.owner), 'alias_mailbox_scope_refused', 403); need(mailbox.verified_at, 'alias_mailbox_unverified', 409); need(mailbox.id !== row.mailbox_id, 'alias_mailbox_unchanged', 409); next = mailbox; }
  const changed = await ctx.db.batch([stmt(`UPDATE lky_aliases SET state='pending',intent=?,next_mailbox=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state='active' AND ${ctx.fence}`, retarget ? 'retarget' : 'disable', next?.id ?? null, ctx.now, row.id, row.revision, ...ctx.fenceArgs), event(retarget ? 'alias_retarget_authorized' : 'alias_disable_authorized', row.id)]);
  need(changed[0].meta.changes, 'alias_changed', 409);
  const domain = await first('SELECT zone,domain FROM lky_alias_domains WHERE id=?', row.domain_id);
  return { alias: row.id, intent: retarget ? 'retarget' : 'disable', ruleRef: row.rule_ref, domain, mailbox: next && { id: next.id, address: next.address } };
 }
 if (route === aliasRoutes.result) {
  exact(input, ['alias', 'outcome', 'ruleRef', 'failure', 'status', 'observed']); need(outcomes.includes(input.outcome), 'invalid_alias_result');
  const row = await aliasRow(ctx, input.alias); need(['pending', 'reconcile'].includes(row.state), 'alias_result_not_expected', 409);
  need(row.intent === 'create' ? row.owner === ctx.actor : row.intent === 'retarget' ? canRetarget(ctx, row) : canManage(ctx, row), 'alias_forwarding_change_denied', 403);
  need(input.status === null || Number.isSafeInteger(input.status) && input.status >= 100 && input.status <= 599, 'invalid_alias_result');
  const failure = failureCode(input.failure), seen = input.observed;
  if (seen !== null) { exact(seen, ['enabled', 'forwardTo']); need(typeof seen.enabled === 'boolean' && (seen.forwardTo === null || typeof seen.forwardTo === 'string' && seen.forwardTo.length <= 254), 'invalid_alias_result'); }
  const ruleRef = input.ruleRef === null ? row.rule_ref : (need(typeof input.ruleRef === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(input.ruleRef), 'invalid_alias_result'), input.ruleRef);
  const want = row.intent === 'retarget' ? row.next_mailbox : row.mailbox_id, mailbox = await first('SELECT address FROM lky_alias_mailboxes WHERE id=?', want);
  let state, delivery = row.delivery, mailboxId = row.mailbox_id, kept = null, reason = failure, settled = false;
  if (input.outcome === 'ok') {
   need(seen, 'alias_provider_observation_required');
   // The provider's own read-back decides what is true, not the caller's claim.
   const wantsEnabled = row.intent !== 'disable', matches = seen.enabled === wantsEnabled && (!wantsEnabled || seen.forwardTo?.toLowerCase() === mailbox?.address);
   if (matches) { settled = true; state = wantsEnabled ? 'active' : 'disabled'; if (row.intent === 'retarget') mailboxId = row.next_mailbox; if (!wantsEnabled) delivery = 'forwarding-stopped'; if (row.intent === 'create') need(ruleRef, 'alias_provider_observation_required'); }
   else { state = 'reconcile'; reason = wantsEnabled && seen.enabled ? 'provider_target_mismatch' : 'provider_state_mismatch'; }
  } else if (input.outcome === 'rejected') { state = row.intent === 'create' ? 'failed' : 'active'; reason ??= 'provider_rejected'; if (row.intent === 'create') delivery = 'not-configured'; }
  else { state = 'reconcile'; reason ??= 'provider_outcome_unknown'; }
  if (state === 'active' && row.intent === 'create') kept = row.replaces;
  const statements = [stmt(`UPDATE lky_aliases SET state=?,rule_ref=?,mailbox_id=?,intent=?,next_mailbox=?,delivery=?,failure=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND state IN ('pending','reconcile') AND ${ctx.fence}`, state, ruleRef, mailboxId, state === 'reconcile' ? row.intent : null, state === 'reconcile' ? row.next_mailbox : null, delivery, settled ? null : reason, ctx.now, row.id, row.revision, ...ctx.fenceArgs)];
  if (kept) statements.push(stmt('UPDATE lky_aliases SET replaced_by=? WHERE id=? AND changes()=1', row.id, kept));
  statements.push(event('alias_provider_' + state, row.id));
  const changed = await ctx.db.batch(statements); need(changed[0].meta.changes, 'alias_changed', 409);
  const saved = await first('SELECT * FROM lky_aliases WHERE id=?', row.id);
  return aliasOutput(saved, await first('SELECT * FROM lky_alias_domains WHERE id=?', saved.domain_id), await first('SELECT * FROM lky_alias_mailboxes WHERE id=?', saved.mailbox_id), ctx);
 }
 if (route === aliasRoutes.delivery) {
  exact(input, ['alias', 'state', 'confirmed']); need(input.confirmed === true && ['received', 'not-received'].includes(input.state), 'alias_consent_required', 403);
  const row = await aliasRow(ctx, input.alias); need(canManage(ctx, row), 'alias_forwarding_change_denied', 403); need(row.state === 'active', 'alias_not_active', 409);
  // A person reports what reached the approved mailbox. The provider gives no delivery receipt, so this stays reported, never verified.
  const delivery = input.state === 'received' ? 'received-reported' : 'not-received-reported';
  const changed = await ctx.db.batch([stmt(`UPDATE lky_aliases SET delivery=?,delivery_reported_at=?,updated_at=?,revision=revision+1 WHERE id=? AND state='active' AND ${ctx.fence}`, delivery, ctx.now, ctx.now, row.id, ...ctx.fenceArgs), event('alias_delivery_reported', row.id)]);
  need(changed[0].meta.changes, 'alias_changed', 409);
  const saved = await first('SELECT * FROM lky_aliases WHERE id=?', row.id);
  return aliasOutput(saved, await first('SELECT * FROM lky_alias_domains WHERE id=?', saved.domain_id), await first('SELECT * FROM lky_alias_mailboxes WHERE id=?', saved.mailbox_id), ctx);
 }
 return null;
}
