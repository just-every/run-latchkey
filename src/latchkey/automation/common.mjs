import { id } from '../crypto/envelope.mjs';
export class AutomationError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export const need = (condition, code = 'invalid_automation_input', status = 400) => { if (!condition) throw new AutomationError(code, status); };
export const exact = (input, keys) => need(input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).sort().join() === [...keys].sort().join(), 'invalid_fields');
export const uuid = value => { need(typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value), 'invalid_identifier'); return value; };
export function access(ctx) {
 const stmt = (sql, ...args) => ctx.db.prepare(sql).bind(...args);
 return { stmt, first: (sql, ...args) => stmt(sql, ...args).first(), all: async (sql, ...args) => (await stmt(sql, ...args).all()).results,
  event: (action, object) => stmt('INSERT INTO lky_events VALUES(?,?,?,?,?,?)', id(), ctx.actor, ctx.device, action, object, ctx.now) };
}
export const credentialLive = alias => `EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.account_id=a.id JOIN lky_vaults v ON v.id=${alias}.vault_id WHERE a.id=${alias}.owner AND a.tenant=${alias}.tenant AND a.generation=${alias}.generation AND o.version=${alias}.operator_version AND o.status='active' AND d.id=${alias}.source_device AND d.generation=a.generation AND d.revoked_at IS NULL AND v.tenant=a.tenant AND v.owner=a.id)`;
export async function human(ctx) {
 need(!ctx.machine && ctx.principal?.kind !== 'machine' && ctx.session?.operator?.id && typeof ctx.fence === 'string' && Array.isArray(ctx.fenceArgs), 'human_approval_required', 403);
 need(await access(ctx).first(`SELECT 1 AS allowed FROM lky_accounts a JOIN lky_devices d ON d.account_id=a.id JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.operator_id=? AND d.id=? AND d.revoked_at IS NULL AND d.generation=a.generation AND o.status='active' AND ${ctx.fence}`, ctx.actor, ctx.tenant, ctx.session.operator.id, ctx.device, ...ctx.fenceArgs), 'human_approval_required', 403);
}
export async function vaultOwner(ctx, vault) {
 await human(ctx);
 const row = await access(ctx).first('SELECT * FROM lky_vaults WHERE id=? AND tenant=? AND owner=?', uuid(vault), ctx.tenant, ctx.actor);
 need(row, 'vault_owner_required', 403); return row;
}
export async function transact(ctx, statements, extraSql = '1', extraArgs = []) {
 const { stmt } = access(ctx);
 try {
  await ctx.db.batch([stmt('DELETE FROM lky_automation_guard'), stmt(`INSERT INTO lky_automation_guard SELECT CASE WHEN (${ctx.fence}) AND (${extraSql}) THEN 1 ELSE 0 END`, ...ctx.fenceArgs, ...extraArgs), ...statements, stmt('DELETE FROM lky_automation_guard')]);
 } catch { throw new AutomationError('automation_authority_changed', 409); }
}
