import { id } from '../crypto/envelope.mjs';
export class SharingError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export const need = (condition, code = 'invalid_sharing_input', status = 400) => { if (!condition) throw new SharingError(code, status); };
export const uuid = value => { need(typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value)); return value; };
export const exact = (value, keys) => need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join(), 'invalid_fields');
export const integer = (value, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) => { need(Number.isSafeInteger(value) && value >= minimum && value <= maximum); return value; };
export const hashString = value => { need(typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)); return value; };
export const binding = (tenant, vault, object, purpose, epoch, version = 1) => ({ tenant, vault, object, purpose, epoch, version });
export const disclosure = 'Revealed material and downloaded files cannot be recalled. Rotate credentials if exposure matters.';
export function access(ctx) {
 const { db, actor, device, now } = ctx;
 const stmt = (sql, ...args) => db.prepare(sql).bind(...args);
 return { stmt, first: (sql, ...args) => stmt(sql, ...args).first(), all: async (sql, ...args) => (await stmt(sql, ...args).all()).results,
  event: (action, object, guard = '1', args = []) => stmt(`INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE ${guard}`, id(), actor ?? 'external-recipient', device ?? 'email-verification', action, object, now, ...args) };
}
// Rechecked inside reads and write transactions, not merely when created.
export const sourceLive = alias => `EXISTS(SELECT 1 FROM lky_accounts sa JOIN oa_operators so ON so.id=sa.operator_id JOIN lky_devices sd ON sd.account_id=sa.id JOIN lky_vaults sv ON sv.id=${alias}.vault_id JOIN lky_recipients sr ON sr.vault_id=sv.id AND sr.account_id=sa.id WHERE sa.id=${alias}.source_account AND sa.tenant=${alias}.tenant AND sa.generation=${alias}.source_generation AND so.status='active' AND so.version=${alias}.source_operator_version AND sd.id=${alias}.source_device AND sd.generation=sa.generation AND sd.revoked_at IS NULL AND sv.tenant=sa.tenant AND sv.epoch=${alias}.epoch AND EXISTS(SELECT 1 FROM json_each(sr.rights) WHERE value='read') AND EXISTS(SELECT 1 FROM json_each(sr.rights) WHERE value='share'))`;
export const memberLive = (alias = 's') => `(${alias}.group_id IS NULL OR EXISTS(SELECT 1 FROM lky_share_group_members gm WHERE gm.group_id=${alias}.group_id AND gm.account_id=k.account_id))`;
export async function sourceVault(ctx, vaultId) {
 const { first } = access(ctx);
 const vault = await first('SELECT v.*,r.rights,a.generation,a.authority_key FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id JOIN lky_accounts a ON a.id=r.account_id WHERE v.id=? AND v.tenant=? AND a.id=?', uuid(vaultId), ctx.tenant, ctx.actor);
 need(vault, 'not_found', 404);
 const rights = JSON.parse(vault.rights); need(rights.includes('read') && rights.includes('share'), 'permission_denied', 403);
 return vault;
}
export const sourceGuard = (ctx, vault) => ({ sql: `${ctx.fence} AND EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE v.id=? AND v.tenant=? AND v.epoch=? AND v.revision=? AND r.account_id=? AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read') AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='share'))`, args: [...ctx.fenceArgs, vault.id, ctx.tenant, vault.epoch, vault.revision, ctx.actor] });
export const email = value => { need(typeof value === 'string' && value.length <= 254 && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,63}$/.test(value), 'invalid_recipient'); return value; };
export async function policy(ctx, tenant = ctx.tenant) {
 const row = await access(ctx).first('SELECT * FROM lky_sharing_policy WHERE tenant=?', tenant);
 return { externalEnabled: row?.external_enabled === 1, domains: row ? JSON.parse(row.domains) : [], defaultDays: row?.default_days ?? 7, maxDays: row?.max_days ?? 30, verifiedRecipientRequired: true };
}
export function times(input, now, rules) {
 const starts = input.startsAt == null ? now : integer(input.startsAt, now);
 const expires = input.expiresAt == null ? now + rules.defaultDays * 86400000 : integer(input.expiresAt, now + 1);
 need(starts < expires && expires <= now + rules.maxDays * 86400000, 'invalid_expiry');
 return { starts, expires };
}
export const domainAllowed = (rules, address) => rules.externalEnabled && rules.domains.includes(address.split('@')[1]);
