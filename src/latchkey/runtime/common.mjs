import { id } from '../crypto/envelope.mjs';
export class RuntimeError extends Error {
 constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const need = (value, code = 'invalid_runtime_request', status = 400) => { if (!value) throw new RuntimeError(code, status); };
export const exact = (value, fields) => need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...fields].sort().join(), 'invalid_fields');
export const uuid = value => { need(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'invalid_identifier'); return value; };
export const positive = value => { need(Number.isSafeInteger(value) && value > 0, 'invalid_number'); return value; };
export const binding = (tenant, vault, object, purpose, epoch, version = 1) => ({ tenant, vault, object, purpose, epoch, version });
export const activeObject = (vault = '?', object = '?') => `NOT EXISTS(SELECT 1 FROM lky_lifecycle life WHERE life.vault_id=${vault} AND life.object_id=${object} AND life.state<>'active')`;
export function access(ctx) {
 const stmt = (sql, ...args) => args.length ? ctx.db.prepare(sql).bind(...args) : ctx.db.prepare(sql);
 return { stmt, first: (sql, ...args) => stmt(sql, ...args).first(), all: async (sql, ...args) => (await stmt(sql, ...args).all()).results,
  guard: (sql, args = []) => stmt(`INSERT INTO lky_runtime_guard SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END`, ...args),
  event: (action, object) => stmt('INSERT INTO lky_events VALUES(?,?,?,?,?,?)', id(), ctx.actor, ctx.device, action, object, ctx.now) };
}
export const rightsSql = (alias = 'r', rights = []) => rights.map(() => `EXISTS(SELECT 1 FROM json_each(${alias}.rights) WHERE value=?)`).join(' AND ') || '1';
export async function vaultAccess(ctx, vault, rights = ['read']) {
 const row = await access(ctx).first(`SELECT v.*,r.rights FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND v.kind='company' AND r.account_id=? AND ${rightsSql('r', rights)} AND ${ctx.fence}`, uuid(vault), ctx.tenant, ctx.actor, ...rights, ...(ctx.fenceArgs ?? []));
 need(row, 'not_found', 404); return row;
}
export function vaultPredicate(ctx, vault, rights = ['read']) {
 return { sql: `EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND v.kind='company' AND r.account_id=? AND ${rightsSql('r', rights)})`, args: [vault, ctx.tenant, ctx.actor, ...rights] };
}
