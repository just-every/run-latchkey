import { access, aliasRoutes, exact, isAdmin, need } from './common.mjs';
import { aliasConfigAuthenticated, domainOutput, mailboxOutput } from './config.mjs';
import { aliasAuthenticated, aliasOutput } from './lifecycle.mjs';
// Company and personal aliases are exported separately. A personal export is the caller's own;
// a company export is the installation owner's and never contains a personal alias or mailbox.
async function exportAliases(ctx, input) {
 exact(input, ['scope']); need(['company', 'personal'].includes(input.scope), 'invalid_alias_scope');
 need(input.scope === 'personal' || isAdmin(ctx), 'alias_admin_required', 403);
 const { all, first, event } = access(ctx), personal = input.scope === 'personal';
 const rows = await all(`SELECT * FROM lky_aliases WHERE tenant=? AND scope=? ${personal ? 'AND owner=?' : ''} ORDER BY created_at,id`, ctx.tenant, input.scope, ...(personal ? [ctx.actor] : []));
 const aliases = [];
 for (const row of rows) aliases.push(aliasOutput(row, await first('SELECT * FROM lky_alias_domains WHERE id=?', row.domain_id), await first('SELECT * FROM lky_alias_mailboxes WHERE id=?', row.mailbox_id), ctx));
 const where = `tenant=? AND scope=? ${personal ? 'AND owner=?' : ''}`, args = [ctx.tenant, input.scope, ...(personal ? [ctx.actor] : [])];
 const domains = (await all(`SELECT * FROM lky_alias_domains WHERE ${where} ORDER BY domain`, ...args)).map(domainOutput), mailboxes = (await all(`SELECT * FROM lky_alias_mailboxes WHERE ${where} ORDER BY address`, ...args)).map(mailboxOutput);
 await event('alias_exported', input.scope).run();
 return { schema: 'latchkey/alias-export/v1', scope: input.scope, tenant: ctx.tenant, generatedAt: ctx.now, aliases, domains, mailboxes };
}
export async function aliasesAuthenticated(route, input, ctx) {
 if (!route.startsWith('alias/')) return null;
 const config = await aliasConfigAuthenticated(route, input, ctx); if (config !== null) return config;
 const lifecycle = await aliasAuthenticated(route, input, ctx); if (lifecycle !== null) return lifecycle;
 if (route === aliasRoutes.export) return exportAliases(ctx, input);
 need(false, 'alias_route_not_found', 404);
}
