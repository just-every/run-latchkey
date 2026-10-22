import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest, id, validateEnvelope } from '../crypto/envelope.mjs';
import { access, guarded, has, invalidateObject, vaultFor } from '../lifecycle/common.mjs';
import { erasureKnown } from '../erasure/index.mjs';
import { subjectItemReplayKnown, subjectVaultWriteAllowed } from '../erasure/subject.mjs';

export class BulkError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
const need = (condition, code = 'invalid_bulk_input', status = 400) => { if (!condition) throw new BulkError(code, status); };
const uuid = value => { need(typeof value === 'string' && /^[0-9a-f-]{36}$/.test(value), 'invalid_identifier'); return value; };
const exact = (value, keys) => need(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).sort().join() === [...keys].sort().join(), 'invalid_fields');
const ref = row => `${row.vault}/${row.object}`;
const hash = value => digest(canonicalJson(value));
const freshContext = ctx => ({ ...ctx, fenceArgs: ctx.fenceArgs.map(value => value === ctx.now ? Math.max(ctx.now, Date.now()) : value) });
const binding = (ctx, vault, object, version) => ({ tenant: ctx.tenant, vault: vault.id, object, purpose: 'item', epoch: vault.epoch, version });
const orderedRights = value => [...JSON.parse(value)].sort();
const memberFields = ['account_id', 'rights', 'wrapped_key', 'generation', 'recipient_key', 'authority_key', 'operator_version', 'status'];
const memberSelect = 'SELECT r.account_id,r.rights,r.wrapped_key,a.generation,a.recipient_key,a.authority_key,o.version AS operator_version,o.status FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? ORDER BY r.account_id';
const historySelect = 'SELECT version,envelope FROM lky_versions WHERE vault_id=? AND object_id=? ORDER BY version';
const lifecycleFields = ['state', 'state_version', 'nonce', 'trashed_at', 'expires_at', 'proof', 'retention_active'];

function request(value) {
 exact(value, ['selection', 'destination', 'action', 'tagsHash']);
 need(['move', 'tag', 'archive'].includes(value.action), 'invalid_bulk_action');
 need(Array.isArray(value.selection) && value.selection.length > 0 && value.selection.length <= 10000, 'invalid_bulk_selection');
 const selection = value.selection.map(row => { exact(row, ['vault', 'object']); return { vault: uuid(row.vault), object: uuid(row.object) }; }).sort((a, b) => ref(a).localeCompare(ref(b)));
 need(new Set(selection.map(ref)).size === selection.length, 'duplicate_bulk_selection');
 need(typeof value.tagsHash === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value.tagsHash), 'invalid_tags_hash');
 need(value.action === 'move' ? value.destination !== null : value.destination === null, 'invalid_bulk_destination');
 return { selection, action: value.action, destination: value.destination === null ? null : uuid(value.destination), tagsHash: value.tagsHash };
}
function windowFor(ctx, value) {
 need(Number.isSafeInteger(value.createdAt) && Number.isSafeInteger(value.expiresAt) && value.createdAt <= ctx.now && value.expiresAt > ctx.now && value.expiresAt - value.createdAt === 300000, 'bulk_preview_expired', 409);
 return { createdAt: value.createdAt, expiresAt: value.expiresAt };
}
async function loadVault(ctx, vault) {
 const row = await vaultFor(ctx, vault), members = await access(ctx).all(memberSelect, row.id);
 row.members = members;
 row.descriptor = { id: row.id, kind: row.kind, owner: row.owner, epoch: row.epoch, revision: row.revision, rights: orderedRights(row.rights), recipients: members.map(member => ({ account: member.account_id, rights: orderedRights(member.rights), generation: member.generation, recipientKey: member.recipient_key, authorityKey: member.authority_key, operatorVersion: member.operator_version, status: member.status, keyHash: null })) };
 for (let index = 0; index < members.length; index++) row.descriptor.recipients[index].keyHash = await digest(members[index].wrapped_key);
 return row;
}
async function history(ctx, vault, object) {
 const { all, first } = access(ctx);
 const [versions, lifecycle] = await Promise.all([all(historySelect, vault, object), first('SELECT * FROM lky_lifecycle WHERE vault_id=? AND object_id=?', vault, object)]);
 return { vault, object, versions, lifecycle, view: { vault, object, version: versions.at(-1)?.version ?? null, versions: versions.map(row => row.version), state: lifecycle?.state ?? 'active', stateVersion: lifecycle?.state_version ?? 0, historyHash: await hash(versions.map(row => [row.version, row.envelope])), lifecycleHash: await hash(lifecycle ? lifecycleFields.map(key => lifecycle[key]) : null) } };
}
async function replayFree(ctx, vault, object, fenceCount) {
 if (await erasureKnown(ctx, vault, object)) return false;
 return !fenceCount || !await subjectItemReplayKnown(ctx, vault, object);
}
async function fenceCount(ctx) { return (await access(ctx).first('SELECT COUNT(*) AS count FROM lky_subject_fences WHERE tenant=?', ctx.tenant)).count; }
function sourceReason(vault, row, action) {
 if (!has(vault, 'read') || !has(vault, 'edit')) return 'read_and_edit_required';
 if (action === 'move' && !has(vault, 'share')) return 'share_required_for_move';
 if (!row.version) return 'not_found';
 if (row.state !== 'active') return 'item_not_active';
 return null;
}
async function buildPlan(ctx, input, stamp = { operation: id(), createdAt: ctx.now, expiresAt: ctx.now + 300000 }) {
 const normalized = request(input), vaults = new Map(), histories = [], count = await fenceCount(ctx);
 await Promise.all([...new Set(normalized.selection.map(row => row.vault).concat(normalized.destination ?? []))].map(async key => {
  try { vaults.set(key, await loadVault(ctx, key)); }
  catch (error) { if (error.code !== 'not_found') throw error; vaults.set(key, null); }
 }));
 const destination = normalized.destination ? vaults.get(normalized.destination) : null;
 if (normalized.destination) {
  need(destination && has(destination, 'read') && has(destination, 'create'), 'destination_read_and_create_required', 403);
  await subjectVaultWriteAllowed(ctx, destination.id);
 }
 const selection = [];
 for (const selected of normalized.selection) {
  const vault = vaults.get(selected.vault);
  if (!vault || !has(vault, 'read')) { selection.push({ ...selected, version: null, versions: [], state: 'unavailable', stateVersion: null, rights: [], allowed: false, reason: 'not_found' }); continue; }
  const current = await history(ctx, selected.vault, selected.object); histories.push(current);
  let reason = sourceReason(vault, current.view, normalized.action);
  if (!reason && !await replayFree(ctx, vault.id, selected.object, count)) reason = 'item_erased';
  if (!reason) { try { await subjectVaultWriteAllowed(ctx, vault.id); } catch (error) { reason = error.code ?? 'vault_write_refused'; } }
  if (!reason && destination) {
   if (vault.kind === 'family' && vault.owner !== ctx.actor) reason = 'personal_owner_required';
   else if (destination.id === vault.id) reason = 'destination_is_source';
   else if (normalized.selection.filter(row => row.object === selected.object).length !== 1) reason = 'destination_collision';
   else {
    const target = await history(ctx, destination.id, selected.object); histories.push(target);
    if (target.versions.length || target.lifecycle || !await replayFree(ctx, destination.id, selected.object, count)) reason = 'destination_collision';
   }
  }
  selection.push({ ...current.view, rights: orderedRights(vault.rights), allowed: !reason, ...(reason ? { reason } : {}) });
 }
 const readable = [...vaults.values()].filter(vault => vault && has(vault, 'read')).sort((a, b) => a.id.localeCompare(b.id));
 const ownershipTransfers = destination && destination.kind !== 'family' ? selection.filter(row => vaults.get(row.vault)?.kind === 'family').map(row => ({ vault: row.vault, object: row.object, sourceOwner: vaults.get(row.vault).owner, destinationOwner: destination.owner })) : [];
 const plan = { schema: 'latchkey/bulk-plan/v1', tenant: ctx.tenant, actor: ctx.actor, operation: uuid(stamp.operation), createdAt: stamp.createdAt, expiresAt: stamp.expiresAt, action: normalized.action, selection, ownershipTransfers, destination: destination?.descriptor ?? null, recipients: destination?.descriptor.recipients ?? [], vaults: readable.map(vault => vault.descriptor), tagsHash: normalized.tagsHash, subjectFenceCount: count };
 return { plan, vaults: readable, histories, fenceCount: count };
}
function stateWrite(ctx, row, state, nonce) {
 return access(ctx).stmt('INSERT INTO lky_lifecycle(vault_id,object_id,state,state_version,nonce,trashed_at,expires_at,proof,retention_active) VALUES(?,?,?,?,?,NULL,NULL,NULL,0) ON CONFLICT(vault_id,object_id) DO UPDATE SET state=excluded.state,state_version=excluded.state_version,nonce=excluded.nonce,trashed_at=NULL,expires_at=NULL,proof=NULL,retention_active=0', row.vault, row.object, state, row.stateVersion + 1, nonce);
}
function revokeObject(ctx, vault, object) {
 const { stmt } = access(ctx);
 return [stmt('UPDATE lky_shares SET revoked_at=?,mutation=? WHERE vault_id=? AND revoked_at IS NULL AND EXISTS(SELECT 1 FROM lky_share_keys k WHERE k.share_id=lky_shares.id AND k.object_id=?) AND NOT EXISTS(SELECT 1 FROM lky_share_keys k WHERE k.share_id=lky_shares.id AND k.object_id<>?)', ctx.now, id(), vault, object, object), ...invalidateObject(ctx, vault, object)];
}
function guards(ctx, loaded) {
 const { guard } = access(ctx), statements = [guard('(SELECT COUNT(*) FROM lky_subject_fences WHERE tenant=?)=?', [ctx.tenant, loaded.fenceCount]), guard('NOT EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND applying<>0)')];
 for (const vault of loaded.vaults) {
  statements.push(guard(`(SELECT json_group_array(json_array(${memberFields.join(',')})) FROM (${memberSelect}))=?`, [vault.id, JSON.stringify(vault.members.map(row => memberFields.map(key => row[key])))]));
  statements.push(guard('NOT EXISTS(SELECT 1 FROM lky_subject_invalidations WHERE tenant=? AND vault_id=? AND status=\'pending\')', [ctx.tenant, vault.id]));
 }
 for (const row of loaded.histories) {
  statements.push(guard(`(SELECT json_group_array(json_array(version,envelope)) FROM (${historySelect}))=?`, [row.vault, row.object, JSON.stringify(row.versions.map(version => [version.version, version.envelope]))]));
  statements.push(guard(`COALESCE((SELECT json_array(${lifecycleFields.join(',')}) FROM lky_lifecycle WHERE vault_id=? AND object_id=?),'null')=?`, [row.vault, row.object, JSON.stringify(row.lifecycle ? lifecycleFields.map(key => row.lifecycle[key]) : null)]));
  statements.push(guard('NOT EXISTS(SELECT 1 FROM lky_erased_items WHERE tenant=? AND vault_id=? AND object_id=?)', [ctx.tenant, row.vault, row.object]));
 }
 return statements;
}
function encryptedWrites(ctx, input, expected, vaults) {
 need(Array.isArray(input), 'invalid_bulk_writes');
 const keys = input.map(row => { exact(row, ['vault', 'object', 'version', 'envelope']); uuid(row.vault); uuid(row.object); need(Number.isSafeInteger(row.version) && row.version > 0, 'invalid_version'); return [row.vault, row.object, row.version]; });
 need(canonicalJson(keys.sort()) === canonicalJson(expected.sort()), 'incomplete_bulk_writes', 409);
 return input.map(row => {
  const vault = vaults.find(value => value.id === row.vault); need(vault, 'invalid_bulk_destination');
  try { validateEnvelope(row.envelope, binding(ctx, vault, row.object, row.version)); } catch { need(false, 'invalid_envelope'); }
  return access(ctx).stmt('INSERT INTO lky_versions(vault_id,object_id,version,envelope) VALUES(?,?,?,?)', row.vault, row.object, row.version, JSON.stringify(row.envelope));
 });
}
async function resultFor(loaded, writes) {
 const items = [];
 for (const entry of loaded.histories) {
  const appended = writes.filter(row => row.vault === entry.vault && row.object === entry.object).map(row => ({ version: row.version, envelope: JSON.stringify(row.envelope) }));
  const versions = [...entry.versions, ...appended].sort((a, b) => a.version - b.version);
  const movedTarget = loaded.plan.action === 'move' && entry.vault === loaded.plan.destination.id;
  const archived = loaded.plan.action === 'archive' || loaded.plan.action === 'move' && !movedTarget;
  items.push({ ...entry.view, version: versions.at(-1)?.version ?? null, versions: versions.map(row => row.version), historyHash: await hash(versions.map(row => [row.version, row.envelope])), state: archived ? 'archived' : 'active', stateVersion: entry.view.stateVersion + Number(archived || movedTarget) });
 }
 return { schema: 'latchkey/bulk-result/v1', items };
}
async function operation(ctx, key) {
 const row = await access(ctx).first('SELECT * FROM lky_bulk_operations WHERE id=? AND tenant=? AND actor=?', uuid(key), ctx.tenant, ctx.actor);
 need(row, 'bulk_operation_not_found', 404); return row;
}
async function commit(ctx, input) {
 exact(input, ['plan', 'planHash', 'confirmed', 'writes', ...(Object.hasOwn(input, 'ownershipApproval') ? ['ownershipApproval'] : [])]); need(input.confirmed === true, 'bulk_confirmation_required', 403);
 need(input.plan?.schema === 'latchkey/bulk-plan/v1' && input.plan.actor === ctx.actor && input.plan.tenant === ctx.tenant, 'invalid_bulk_plan');
 need(await hash(input.plan) === input.planHash, 'bulk_plan_changed', 409);
 if (input.plan.ownershipTransfers?.length) need(input.ownershipApproval === input.planHash, 'ownership_confirmation_required', 403);
 const existing = await access(ctx).first('SELECT * FROM lky_bulk_operations WHERE id=? AND tenant=? AND actor=?', uuid(input.plan.operation), ctx.tenant, ctx.actor);
 if (existing) { need(existing.active === 1 && !existing.undone_at && existing.plan === canonicalJson(input.plan), 'bulk_operation_inactive', 409); return { operation: existing.id }; }
 const stamp = { operation: input.plan.operation, ...windowFor(ctx, input.plan) };
 const loaded = await buildPlan(ctx, { selection: input.plan.selection.map(({ vault, object }) => ({ vault, object })), destination: input.plan.destination?.id ?? null, action: input.plan.action, tagsHash: input.plan.tagsHash }, stamp);
 need(await hash(loaded.plan) === input.planHash, 'bulk_plan_changed', 409);
 need(loaded.plan.selection.every(row => row.allowed), 'bulk_selection_denied', 403);
 const plan = loaded.plan, expected = plan.action === 'tag' ? plan.selection.map(row => [row.vault, row.object, row.version + 1]) : plan.action === 'move' ? plan.selection.flatMap(row => row.versions.map(version => [plan.destination.id, row.object, version])) : [];
 const { stmt, event } = access(ctx), writes = encryptedWrites(ctx, input.writes, expected, loaded.vaults), changes = [...writes];
 for (const row of plan.selection) if (plan.action !== 'tag') {
  changes.push(stateWrite(ctx, row, 'archived', plan.operation), ...revokeObject(ctx, row.vault, row.object));
  if (plan.action === 'move') changes.push(stateWrite(ctx, { ...row, vault: plan.destination.id, stateVersion: 0 }, 'active', plan.operation));
 }
 for (const vault of loaded.vaults) changes.push(stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?', plan.operation, vault.id));
 const result = await resultFor(loaded, input.writes);
 changes.push(stmt('INSERT INTO lky_bulk_operations(id,tenant,actor,plan,result,active,undone_at,created_at) VALUES(?,?,?,?,?,1,NULL,?)', plan.operation, ctx.tenant, ctx.actor, canonicalJson(plan), canonicalJson(result), ctx.now), event('bulk_' + plan.action, plan.operation), ...(plan.ownershipTransfers.length ? [event('personal_ownership_transferred', plan.operation)] : []));
 await guarded(freshContext(ctx), loaded.vaults, changes, guards(ctx, loaded));
 return { operation: plan.operation };
}
function noBroader(vault, original) {
 return vault.descriptor.recipients.every(member => {
  if (!member.rights.length) return true;
  const prior = original.recipients.find(row => row.account === member.account);
  return prior && member.rights.every(right => prior.rights.includes(right)) && member.generation === prior.generation && member.recipientKey === prior.recipientKey && member.authorityKey === prior.authorityKey;
 });
}
async function buildUndo(ctx, stored, stamp = { createdAt: ctx.now, expiresAt: ctx.now + 300000 }) {
 need(stored.active === 1 && !stored.undone_at, 'bulk_operation_inactive', 409);
 const original = JSON.parse(stored.plan), result = JSON.parse(stored.result);
 need(original.schema === 'latchkey/bulk-plan/v1' && result.schema === 'latchkey/bulk-result/v1', 'invalid_bulk_operation');
 const vaults = await Promise.all([...new Set(result.items.map(row => row.vault))].sort().map(vault => loadVault(ctx, vault))), histories = [], count = await fenceCount(ctx);
 for (const vault of vaults) { need(has(vault, 'read'), 'permission_denied', 403); await subjectVaultWriteAllowed(ctx, vault.id); }
 for (const expected of result.items) {
  const current = await history(ctx, expected.vault, expected.object), vault = vaults.find(row => row.id === expected.vault);
  need(current.view.historyHash === expected.historyHash && current.view.state === expected.state && current.view.stateVersion === expected.stateVersion, 'bulk_undo_conflict', 409);
  need(await replayFree(ctx, vault.id, expected.object, count), 'item_erased', 409);
  const restores = original.action === 'archive' || original.action === 'move' && expected.vault !== original.destination.id;
  if (restores) {
   need(has(vault, 'restore') && has(vault, 'create'), 'restore_and_create_required', 403);
   need(vault.kind !== 'family' || vault.owner === ctx.actor, 'family_restore_forbidden', 403);
   need(noBroader(vault, original.vaults.find(row => row.id === vault.id)), 'bulk_undo_recipients_changed', 409);
  } else need(has(vault, 'edit'), 'permission_denied', 403);
  const prior = original.selection.find(row => row.vault === current.vault && row.object === current.object);
  histories.push({ ...current, view: { ...current.view, restoreVersion: original.action === 'tag' ? prior.version : null } });
 }
 const plan = { schema: 'latchkey/bulk-undo/v1', operation: stored.id, originalPlanHash: await hash(original), tenant: ctx.tenant, actor: ctx.actor, action: original.action, destination: original.destination?.id ?? null, ...stamp, selection: histories.map(row => row.view), vaults: vaults.map(row => row.descriptor), subjectFenceCount: count };
 return { plan, vaults, histories, fenceCount: count };
}
async function undo(ctx, input) {
 exact(input, ['operation', 'plan', 'planHash', 'confirmed', 'writes']); need(input.confirmed === true, 'bulk_confirmation_required', 403);
 const stored = await operation(ctx, input.operation);
 if (stored.undone_at && stored.active === 0) return { operation: stored.id, undone: true, undoneAt: stored.undone_at };
 need(input.plan?.operation === stored.id && await hash(input.plan) === input.planHash, 'bulk_plan_changed', 409);
 const loaded = await buildUndo(ctx, stored, windowFor(ctx, input.plan)); need(await hash(loaded.plan) === input.planHash, 'bulk_plan_changed', 409);
 const { stmt, guard, event } = access(ctx), plan = loaded.plan;
 const expected = plan.action === 'tag' ? plan.selection.map(row => [row.vault, row.object, row.version + 1]) : [];
 const changes = encryptedWrites(ctx, input.writes, expected, loaded.vaults);
 for (const row of plan.selection) if (plan.action !== 'tag') {
  const state = plan.action === 'move' && row.vault === plan.destination ? 'archived' : 'active';
  changes.push(stateWrite(ctx, row, state, stored.id));
  if (state === 'archived') changes.push(...revokeObject(ctx, row.vault, row.object));
 }
 for (const vault of loaded.vaults) changes.push(stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?', id(), vault.id));
 changes.push(stmt('UPDATE lky_bulk_operations SET active=0,undone_at=? WHERE id=?', ctx.now, stored.id), event('bulk_undone', stored.id));
 await guarded(freshContext(ctx), loaded.vaults, changes, [...guards(ctx, loaded), guard('EXISTS(SELECT 1 FROM lky_bulk_operations WHERE id=? AND tenant=? AND actor=? AND active=1 AND undone_at IS NULL AND plan=? AND result=?)', [stored.id, ctx.tenant, ctx.actor, stored.plan, stored.result])]);
 return { operation: stored.id, undone: true, undoneAt: ctx.now };
}
export async function bulkAuthenticated(route, input, ctx) {
 if (!route.startsWith('bulk/')) return null;
 try {
  if (route === 'bulk/preview') { const loaded = await buildPlan(ctx, input); return { ...loaded.plan, planHash: await hash(loaded.plan) }; }
  if (route === 'bulk/commit') return await commit(ctx, input);
  if (route === 'bulk/undo/context') {
   exact(input, ['operation']); const stored = await operation(ctx, input.operation);
   if (stored.undone_at && stored.active === 0) return { operation: stored.id, undone: true, undoneAt: stored.undone_at };
   const loaded = await buildUndo(ctx, stored); return { operation: stored.id, plan: loaded.plan, planHash: await hash(loaded.plan) };
  }
  if (route === 'bulk/undo') return await undo(ctx, input);
  need(false, 'bulk_route_not_found', 404);
 } catch (error) {
  if (error instanceof BulkError) throw error;
  if (typeof error.code === 'string') throw new BulkError(error.code === 'lifecycle_changed' ? 'bulk_changed' : error.code, error.status ?? 409);
  throw new BulkError('bulk_request_refused', 400);
 }
}
