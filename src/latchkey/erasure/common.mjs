import { id } from '../crypto/envelope.mjs';
export class ItemErasureError extends Error {
 constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export const need = (condition, code, status = 400) => { if (!condition) throw new ItemErasureError(code, status); };
export const uuid = value => { need(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value), 'invalid_object'); return value; };
export const exact = (value, fields) => need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...fields].sort().join(), 'invalid_fields');
export function access(ctx) {
 const stmt = (sql, ...args) => args.length ? ctx.db.prepare(sql).bind(...args) : ctx.db.prepare(sql);
 return { stmt, first: (sql, ...args) => stmt(sql, ...args).first(), all: async (sql, ...args) => (await stmt(sql, ...args).all()).results,
  guard: (sql, args = []) => stmt(`INSERT INTO lky_erasure_guard SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END`, ...args),
  event: object => stmt('INSERT INTO lky_events VALUES(?,?,?,?,?,?)', id(), ctx.actor, ctx.device, 'item_erased', object, ctx.now) };
}
export const ownerSql = `EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id JOIN lky_accounts a ON a.id=r.account_id WHERE v.id=? AND v.tenant=? AND v.owner=? AND a.id=v.owner AND a.tenant=v.tenant AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='create') AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='edit') AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='rotate'))`;
export const ownerArgs = (ctx, vault) => [vault, ctx.tenant, ctx.actor];
export const freshFenceArgs = ctx => { const now = Math.max(ctx.now, Date.now()); return ctx.fenceArgs.map(value => value === ctx.now ? now : value); };
export const receipt = row => ({ receipt: row.receipt_id, vault: row.vault_id, object: row.object_id, erased: true, erasedAt: row.erased_at, author: row.erased_by, revision: row.revision, deleted: JSON.parse(row.counts), replayFence: true,
 residualExposure: 'Previously downloaded archives and material already exposed to recipients cannot be recalled. An older archive is refused only where the latest erasure journal is known.' });
