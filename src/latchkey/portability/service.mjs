import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest, id, verifyWrapped } from '../crypto/envelope.mjs';
import { RecordsError, requireRecords as need, rewrapBinding, rewrapPlanHash, verifyDestinationRewrap } from './common.mjs';
import { importedArchive } from './import-proof.mjs';
export { RecordsError } from './common.mjs';
export const restoreOwnerRights = Object.freeze(['read', 'create', 'edit', 'export', 'share', 'rotate']);
const exact = (value, fields) => need(value && typeof value === 'object' && Object.keys(value).sort().join() === [...fields].sort().join(), 'invalid_fields');
const uuid = value => { need(typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value), 'invalid_restore'); return value; };
const named = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 500;
function access(ctx) {
 const stmt = (sql, ...args) => ctx.db.prepare(sql).bind(...args);
 return { stmt, first: (sql, ...args) => stmt(sql, ...args).first(), all: async (sql, ...args) => (await stmt(sql, ...args).all()).results,
  guard: (sql, args = []) => stmt(`INSERT INTO lky_restore_guard SELECT CASE WHEN (${sql}) THEN 1 ELSE 0 END`, ...args),
  event: (action, object) => stmt('INSERT INTO lky_events VALUES(?,?,?,?,?,?)', id(), ctx.actor, ctx.device, action, object, ctx.now) };
}
const ownerPredicate = `EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_devices d ON d.account_id=a.id WHERE a.id=? AND a.tenant=? AND o.id=? AND o.role='owner' AND o.status='active' AND d.id=? AND d.revoked_at IS NULL AND d.generation=a.generation)`;
const ownerArgs = ctx => [ctx.actor, ctx.tenant, ctx.session.operator.id, ctx.device];
const freshFenceArgs = ctx => { const now = Math.max(ctx.now, Date.now()); return ctx.fenceArgs.map(value => value === ctx.now ? now : value); };
async function owner(ctx) {
 const { first } = access(ctx);
 need(await first(`SELECT 1 AS allowed WHERE ${ownerPredicate} AND ${ctx.fence}`, ...ownerArgs(ctx), ...ctx.fenceArgs), 'destination_owner_required', 403);
}
const identityPredicate = `EXISTS(SELECT 1 FROM lky_accounts WHERE id=? AND tenant=? AND recipient_key=? AND authority_key=?)`;
const identityArgs = identity => [identity.account, identity.tenant, identity.recipientKey, identity.authorityKey];
function vaultPredicate(vault) {
 return { sql: `EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND tenant=? AND owner=? AND epoch=? AND revision=?) AND EXISTS(SELECT 1 FROM lky_recipients WHERE vault_id=? AND account_id=? AND rights='[]') AND NOT EXISTS(SELECT 1 FROM lky_recipients WHERE vault_id=? AND rights<>'[]')`,
  args: [vault.vault, vault.tenant, vault.owner, vault.epoch, vault.revision, vault.vault, vault.owner, vault.vault] };
}
async function inactiveVaults(ctx, plan) {
 const { first } = access(ctx);
 for (const vault of plan.vaults) {
  const check = vaultPredicate(vault);
  need(await first(`SELECT 1 AS allowed WHERE ${check.sql}`, ...check.args), 'restored_vault_changed', 409);
 }
}
function receipt(row, detailed = false) {
 const plan = JSON.parse(row.plan);
 return { restore: row.id, planHash: row.plan_hash, phase: row.phase, expiresAt: row.expires_at,
  sourceIdentity: plan.sourceIdentity, contentHash: plan.contentHash, destination: plan.destination.account,
  vaults: plan.vaults.map(vault => ({ vault: vault.vault, epoch: vault.epoch, revision: vault.revision + (row.phase === 'activated' ? 1 : 0) })),
  activeAuthority: row.phase === 'activated', rights: row.phase === 'activated' ? [...restoreOwnerRights] : [],
  unapprovedVaults: plan.unapprovedVaults, activation: row.activation, ...(detailed && row.phase === 'prepared' ? { plan, approval: JSON.parse(row.approval) } : {}) };
}
async function preparation(ctx, restore) {
 const row = await access(ctx).first('SELECT * FROM lky_restore_preparations WHERE id=? AND actor=? AND tenant=?', uuid(restore), ctx.actor, ctx.tenant);
 need(row, 'restore_not_found', 404); return row;
}
async function prepare(input, ctx) {
 exact(input, ['plan', 'approval', 'sourceFingerprint', 'destinationFingerprint']);
 const { plan, approval } = input;
 await verifyDestinationRewrap({ ...input, now: ctx.now });
 need(plan.destination.account === ctx.actor && plan.destination.tenant === ctx.tenant && plan.source.tenant === ctx.tenant && plan.source.account !== ctx.actor, 'destination_recipient_mismatch', 403);
 const { first, stmt, guard, event } = access(ctx);
 need(await first(`SELECT 1 AS allowed WHERE ${identityPredicate} AND ${identityPredicate}`, ...identityArgs(plan.source), ...identityArgs(plan.destination)), 'restore_account_key_changed', 409);
 const planHash = await rewrapPlanHash(plan), approvalHash = await digest(canonicalJson(approval));
 const previous = await first('SELECT * FROM lky_restore_preparations WHERE actor=? AND plan_hash=? AND approval_hash=?', ctx.actor, planHash, approvalHash);
 if (previous) return receipt(previous);
 const job = await importedArchive(ctx.db, plan);
 await inactiveVaults(ctx, plan);
 const restore = id();
 need(approval.decision.expiresAt > Math.max(ctx.now, Date.now()), 'approval_expired', 409);
 try {
  await ctx.db.batch([
   stmt('DELETE FROM lky_restore_guard'), guard(`${ctx.fence} AND ${ownerPredicate}`, [...freshFenceArgs(ctx), ...ownerArgs(ctx)]),
   guard(`${identityPredicate} AND ${identityPredicate}`, [...identityArgs(plan.source), ...identityArgs(plan.destination)]),
   guard("EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind='import' AND phase='complete' AND metadata=?) AND EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND source_identity=?)", [job.id, job.metadata, plan.sourceIdentity]),
   ...plan.vaults.map(vault => { const check = vaultPredicate(vault); return guard(check.sql, check.args); }),
   stmt("INSERT INTO lky_restore_preparations VALUES(?,?,?,?,?,?,?,?,?,'prepared',?,NULL,NULL)", restore, ctx.actor, ctx.tenant, job.id, planHash, approvalHash, canonicalJson(plan), canonicalJson(approval), approval.decision.expiresAt, ctx.now),
   event('archive_restore_prepared', restore), stmt('DELETE FROM lky_restore_guard'),
  ]);
 } catch {
  const existing = await first('SELECT * FROM lky_restore_preparations WHERE actor=? AND plan_hash=? AND approval_hash=?', ctx.actor, planHash, approvalHash);
  if (existing) return receipt(existing);
  throw new RecordsError('restore_authority_changed', 409);
 }
 return receipt(await preparation(ctx, restore));
}
async function activate(input, ctx) {
 exact(input, ['restore', 'approvedPlanHash', 'activation', 'rights', 'wraps']);
 need(named(input.activation), 'activation_name_required');
 need(Array.isArray(input.rights) && canonicalJson([...input.rights].sort()) === canonicalJson([...restoreOwnerRights].sort()), 'owner_rights_required');
 const row = await preparation(ctx, input.restore), plan = JSON.parse(row.plan), approval = JSON.parse(row.approval);
 need(row.plan_hash === input.approvedPlanHash, 'approval_plan_changed', 409);
 // A lost acknowledgement is safe to recover after expiry, without repeating
 // the activation or accepting a differently named human decision.
 if (row.phase === 'activated') { need(row.activation === input.activation, 'activation_changed', 409); return receipt(row); }
 need(row.expires_at > ctx.now, 'approval_expired', 409);
 await verifyDestinationRewrap({ plan, approval, sourceFingerprint: plan.sourceFingerprint, destinationFingerprint: plan.destinationFingerprint, now: ctx.now });
 need(plan.destination.account === ctx.actor && plan.destination.tenant === ctx.tenant && plan.source.tenant === ctx.tenant && plan.source.account !== ctx.actor, 'destination_recipient_mismatch', 403);
 need(Array.isArray(input.wraps) && input.wraps.length === plan.vaults.length, 'restore_wrap_inventory');
 for (const [index, vault] of plan.vaults.entries()) {
  const value = input.wraps[index]; exact(value, ['vault', 'epoch', 'revision', 'wrapped']);
  need(value.vault === vault.vault && value.epoch === vault.epoch && value.revision === vault.revision && await verifyWrapped(value.wrapped, plan.destination.authorityKey, ctx.actor, rewrapBinding(vault.tenant, vault.vault, ctx.actor, vault.epoch)), 'destination_signature_required', 403);
 }
 const { stmt, guard, event } = access(ctx);
 const job = await importedArchive(ctx.db, plan); need(job.id === row.import_id, 'restore_source_changed', 409);
 await inactiveVaults(ctx, plan);
 const commitNow = Math.max(ctx.now, Date.now()); need(row.expires_at > commitNow, 'approval_expired', 409);
 try {
  await ctx.db.batch([
   stmt('DELETE FROM lky_restore_guard'), guard(`${ctx.fence} AND ${ownerPredicate}`, [...freshFenceArgs(ctx), ...ownerArgs(ctx)]),
   guard(`${identityPredicate} AND ${identityPredicate}`, [...identityArgs(plan.source), ...identityArgs(plan.destination)]),
   guard("EXISTS(SELECT 1 FROM rer_portability_jobs WHERE id=? AND kind='import' AND phase='complete' AND metadata=?) AND EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND source_identity=?)", [job.id, job.metadata, plan.sourceIdentity]),
   guard("EXISTS(SELECT 1 FROM lky_restore_preparations WHERE id=? AND actor=? AND phase='prepared' AND plan_hash=? AND approval_hash=? AND expires_at>?)", [row.id, ctx.actor, row.plan_hash, row.approval_hash, commitNow]),
   ...plan.vaults.map(vault => { const check = vaultPredicate(vault); return guard(check.sql, check.args); }),
   ...plan.vaults.flatMap((vault, index) => [
    stmt('UPDATE lky_vaults SET owner=?,revision=revision+1,mutation=? WHERE id=?', ctx.actor, row.id, vault.vault),
    stmt('INSERT INTO lky_recipients VALUES(?,?,?,?) ON CONFLICT(vault_id,account_id) DO UPDATE SET rights=excluded.rights,wrapped_key=excluded.wrapped_key', vault.vault, ctx.actor, JSON.stringify(restoreOwnerRights), JSON.stringify(input.wraps[index].wrapped)),
    event('archive_vault_activated', vault.vault),
   ]),
   stmt("UPDATE lky_restore_preparations SET phase='activated',activated_at=?,activation=? WHERE id=?", ctx.now, input.activation, row.id),
   stmt('INSERT INTO lky_restore_history VALUES(?,?,?,?,?,?,?,?,?,?)', row.id, plan.sourceIdentity, plan.contentHash, plan.archiveHash, plan.source.account, ctx.actor, row.plan_hash, canonicalJson(plan.vaults), input.activation, ctx.now),
   event('archive_restore_activated', row.id), stmt('DELETE FROM lky_restore_guard'),
  ]);
 } catch {
  const completed = await preparation(ctx, row.id);
  if (completed.phase === 'activated' && completed.activation === input.activation) return receipt(completed);
  throw new RecordsError('restore_authority_changed', 409);
 }
 return receipt(await preparation(ctx, row.id));
}
export async function portabilityAuthenticated(route, input, ctx) {
 if (!route.startsWith('archive/')) return null;
 await owner(ctx);
 if (route === 'archive/prepare') return prepare(input, ctx);
 if (route === 'archive/activate') return activate(input, ctx);
 if (route === 'archive/status') { exact(input, ['restore']); return receipt(await preparation(ctx, input.restore), true); }
 throw new RecordsError('not_found', 404);
}
export const portabilityResponse = portabilityAuthenticated;
