import { access, exact, need, uuid } from '../reviews/common.mjs';
export { access, exact, need, uuid };
export const aliasRoutes = Object.freeze({
 domains: 'alias/domains', domainSave: 'alias/domain/save', domainRevoke: 'alias/domain/revoke',
 mailboxes: 'alias/mailboxes', mailboxSave: 'alias/mailbox/save', mailboxRevoke: 'alias/mailbox/revoke',
 list: 'alias/list', createBegin: 'alias/create/begin', disableBegin: 'alias/disable/begin', retargetBegin: 'alias/retarget/begin',
 result: 'alias/result', delivery: 'alias/delivery', export: 'alias/export',
});
export const scopeOf = kind => kind === 'company' ? 'company' : 'personal';
export const isAdmin = ctx => ctx.session.operator.role === 'owner';
// Company configuration is administered by the installation owner alone; a person's own configuration is theirs alone.
export function requireConfigAuthority(ctx, scope) {
 need(['company', 'personal'].includes(scope), 'invalid_alias_scope');
 need(scope === 'personal' || isAdmin(ctx), 'alias_admin_required', 403);
}
const address = value => { need(typeof value === 'string' && value.length <= 254 && /^[a-z0-9._%+-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(value), 'invalid_alias_address'); return value.toLowerCase(); };
export const mailAddress = address;
export const hostname = value => { need(typeof value === 'string' && value.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value), 'invalid_alias_domain'); return value; };
export const providerId = value => { need(typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value), 'invalid_alias_provider_reference'); return value; };
export async function configRow(ctx, table, value, scope) {
 const row = await access(ctx).first(`SELECT * FROM ${table} WHERE id=? AND tenant=?`, uuid(value), ctx.tenant);
 need(row && (row.scope === 'company' || row.owner === ctx.actor) && (!scope || row.scope === scope), 'alias_configuration_not_found', 404);
 return row;
}
// Who may change an alias's provider state: the person who made it, or the installation owner for company aliases.
export const canManage = (ctx, alias) => alias.owner === ctx.actor || alias.scope === 'company' && isAdmin(ctx);
// Re-pointing forwarding is stricter: only the owner of the scope's policy.
export const canRetarget = (ctx, alias) => alias.scope === 'company' ? isAdmin(ctx) : alias.owner === ctx.actor;
export async function aliasRow(ctx, value) {
 const row = await access(ctx).first('SELECT * FROM lky_aliases WHERE id=? AND tenant=?', uuid(value), ctx.tenant);
 need(row && (row.owner === ctx.actor || row.scope === 'company' && (isAdmin(ctx) || await access(ctx).first('SELECT 1 AS member FROM lky_recipients WHERE vault_id=? AND account_id=?', row.vault_id, ctx.actor))), 'alias_not_found', 404);
 return row;
}
