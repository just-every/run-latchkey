import { access, configRow, exact, hostname, mailAddress, need, providerId, requireConfigAuthority, aliasRoutes } from './common.mjs';
import { id } from '../reviews/common.mjs';
const providers = ['cloudflare'];
// Provider-reported readiness, recorded as the client observed it; Latchkey does not call the provider itself.
export const domainOutput = row => ({ id: row.id, scope: row.scope, owner: row.owner, provider: row.provider, zone: row.zone, domain: row.domain, providerStatus: row.provider_status, routingEnabled: !!row.routing_enabled, observedAt: row.observed_at, active: !!row.active, revision: row.revision });
export const mailboxOutput = row => ({ id: row.id, scope: row.scope, owner: row.owner, address: row.address, providerRef: row.provider_ref, verifiedAt: row.verified_at, observedAt: row.observed_at, active: !!row.active, revision: row.revision });
const visible = 'tenant=? AND (scope=\'company\' OR owner=?)';
export async function aliasConfigAuthenticated(route, input, ctx) {
 const { all, first, stmt, event } = access(ctx);
 if (route === aliasRoutes.domains) { exact(input, []); return (await all(`SELECT * FROM lky_alias_domains WHERE ${visible} ORDER BY scope,domain`, ctx.tenant, ctx.actor)).map(domainOutput); }
 if (route === aliasRoutes.mailboxes) { exact(input, []); return (await all(`SELECT * FROM lky_alias_mailboxes WHERE ${visible} ORDER BY scope,address`, ctx.tenant, ctx.actor)).map(mailboxOutput); }
 if (route === aliasRoutes.domainSave) {
  exact(input, ['scope', 'provider', 'zone', 'domain', 'observation', 'confirmed']); requireConfigAuthority(ctx, input.scope); need(input.confirmed === true, 'alias_consent_required', 403); need(providers.includes(input.provider), 'invalid_alias_provider');
  const zone = providerId(input.zone), domain = hostname(input.domain), seen = input.observation; exact(seen, ['enabled', 'status']); need(typeof seen.enabled === 'boolean' && typeof seen.status === 'string' && /^[a-z/_-]{1,40}$/.test(seen.status), 'invalid_alias_observation');
  // Forwarding is usable only while the provider reports routing enabled and ready.
  const active = Number(seen.enabled && seen.status === 'ready'), owner = ctx.actor;
  const existing = await first('SELECT id FROM lky_alias_domains WHERE tenant=? AND scope=? AND owner=? AND zone=?', ctx.tenant, input.scope, owner, zone), domainId = existing?.id ?? id();
  const changed = await ctx.db.batch([stmt(`INSERT INTO lky_alias_domains SELECT ?,?,?,?,?,?,?,?,?,?,?,1 WHERE ${ctx.fence} ON CONFLICT(tenant,scope,owner,zone) DO UPDATE SET domain=excluded.domain,provider_status=excluded.provider_status,routing_enabled=excluded.routing_enabled,observed_at=excluded.observed_at,active=excluded.active,revision=revision+1`, domainId, ctx.tenant, owner, input.scope, input.provider, zone, domain, seen.status, Number(seen.enabled), ctx.now, active, ...ctx.fenceArgs), event('alias_domain_observed', domainId)]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return domainOutput(await first('SELECT * FROM lky_alias_domains WHERE id=?', domainId));
 }
 if (route === aliasRoutes.mailboxSave) {
  exact(input, ['scope', 'address', 'providerRef', 'verified', 'confirmed']); requireConfigAuthority(ctx, input.scope); need(input.confirmed === true, 'alias_consent_required', 403); need(typeof input.verified === 'boolean', 'invalid_alias_observation');
  const address = mailAddress(input.address), ref = input.providerRef === null ? null : providerId(input.providerRef);
  const existing = await first('SELECT id FROM lky_alias_mailboxes WHERE tenant=? AND scope=? AND owner=? AND address=?', ctx.tenant, input.scope, ctx.actor, address), mailboxId = existing?.id ?? id();
  const changed = await ctx.db.batch([stmt(`INSERT INTO lky_alias_mailboxes SELECT ?,?,?,?,?,?,?,?,1,1 WHERE ${ctx.fence} ON CONFLICT(tenant,scope,owner,address) DO UPDATE SET provider_ref=excluded.provider_ref,verified_at=excluded.verified_at,observed_at=excluded.observed_at,active=1,revision=revision+1`, mailboxId, ctx.tenant, ctx.actor, input.scope, address, ref, input.verified ? ctx.now : null, ctx.now, ...ctx.fenceArgs), event('alias_mailbox_observed', mailboxId)]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return mailboxOutput(await first('SELECT * FROM lky_alias_mailboxes WHERE id=?', mailboxId));
 }
 if (route === aliasRoutes.domainRevoke || route === aliasRoutes.mailboxRevoke) {
  exact(input, ['id', 'revision', 'confirmed']); need(input.confirmed === true, 'alias_consent_required', 403);
  const domain = route === aliasRoutes.domainRevoke, table = domain ? 'lky_alias_domains' : 'lky_alias_mailboxes', row = await configRow(ctx, table, input.id);
  requireConfigAuthority(ctx, row.scope); need(row.scope === 'company' || row.owner === ctx.actor, 'alias_configuration_not_found', 404); need(row.revision === input.revision, 'alias_configuration_changed', 409);
  // Revoking stops new aliases. Existing aliases are shown as unavailable and are never changed at the provider automatically.
  const changed = await ctx.db.batch([stmt(`UPDATE ${table} SET active=0,revision=revision+1 WHERE id=? AND revision=? AND ${ctx.fence}`, row.id, row.revision, ...ctx.fenceArgs), event(domain ? 'alias_domain_revoked' : 'alias_mailbox_revoked', row.id)]);
  need(changed[0].meta.changes, 'authority_changed', 409);
  return (domain ? domainOutput : mailboxOutput)(await first(`SELECT * FROM ${table} WHERE id=?`, row.id));
 }
 return null;
}
