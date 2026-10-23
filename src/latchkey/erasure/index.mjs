import { validDeletionConsent } from '../crypto/lifecycle.mjs';
import { createPortability, excludedTable } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../../../scripts/latchkey/archive-policy.mjs';
import { validErasureProof } from '../crypto/erasure.mjs';
import { id } from '../crypto/envelope.mjs';
import { access, exact, freshFenceArgs, ItemErasureError, need, ownerArgs, ownerSql, receipt, uuid } from './common.mjs';
import { deletionStatements, inventory, inventoryGuard } from './inventory.mjs';
export { ItemErasureError } from './common.mjs';

export async function erasureKnown(ctx, vault, object) {
 return !!await access(ctx).first('SELECT 1 AS erased FROM lky_erased_items WHERE tenant=? AND vault_id=? AND object_id=?', ctx.tenant, vault, object);
}
async function owned(ctx, vault) {
 const { first } = access(ctx);
 const row = await first(`SELECT v.* FROM lky_vaults v WHERE v.id=? AND v.tenant=? AND ${ownerSql} AND ${ctx.fence}`, vault, ctx.tenant, ...ownerArgs(ctx, vault), ...freshFenceArgs(ctx));
 need(row, 'not_found', 404); return row;
}
async function known(ctx, vault, object) { return access(ctx).first('SELECT * FROM lky_erased_items WHERE tenant=? AND vault_id=? AND object_id=?', ctx.tenant, vault, object); }
async function erase(input, ctx, retention = null) {
 need(input && Object.keys(input).every(key => ['vault','object','confirmed','revision','proof'].includes(key)), 'invalid_fields');
 const vaultId = uuid(input.vault), object = uuid(input.object);
 need(input.confirmed === true, 'erasure_confirmation_required');
 need(Number.isSafeInteger(input.revision) && input.revision >= 1, 'invalid_revision');
 const vault = await owned(ctx, vaultId), already = await known(ctx, vaultId, object);
 if (already) return receipt(already);
 need(vault.revision === input.revision, 'version_conflict', 409);
 const authority = await access(ctx).first('SELECT authority_key FROM lky_accounts WHERE id=?', ctx.actor);
 need(retention ? await validDeletionConsent(input.proof,{tenant:ctx.tenant,vault:vaultId,object,owner:ctx.actor},authority.authority_key) : await validErasureProof(input.proof, { tenant: ctx.tenant, vault: vaultId, object, owner: ctx.actor, revision: input.revision }, authority.authority_key), 'invalid_erasure_proof', 403);
 const entries = await inventory(ctx, vaultId, object);
 need(entries[0].rows.length > 0, 'not_found', 404);
 const portability = await createPortability({ db: ctx.db, policy: archivePolicy });
 const { stmt, first, all, guard, event } = access(ctx);
 const state = await first('SELECT source_identity,epoch,applying FROM rer_portability_state WHERE id=1');
 // erasureStatements initializes a never-used Records state on demand.
 if (!state) await portability.erasureStatements('lky_versions', entries[0].rows[0]);
 const checkpoint = state ?? await first('SELECT source_identity,epoch,applying FROM rer_portability_state WHERE id=1');
 need(checkpoint?.applying === 0, 'restore_in_progress', 409);
 const journal = [];
 for (const entry of entries.filter(entry => !excludedTable(entry.table, archivePolicy))) {
  for (const row of entry.rows) journal.push(...await portability.erasureStatements(entry.table, row));
 }
 const transferSelect = "SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*') ORDER BY name";
 const transferTables = await all(transferSelect), transfers = await portability.invalidateTransfersStatements(), operation = id();
 // A vault owner receives only that object's counts, never another owner's
 // destination-local preparation inventory from the global transfer scrub.
 const counts = Object.fromEntries(entries.filter(entry => entry.table !== 'lky_restore_preparations').map(entry => [entry.table, entry.rows.length]));
 try {
  await ctx.db.batch([
   stmt('DELETE FROM lky_erasure_guard'),
   guard(`${ctx.fence} AND ${ownerSql} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=? AND revision=?) AND NOT EXISTS(SELECT 1 FROM lky_erased_items WHERE vault_id=? AND object_id=?)`, [...freshFenceArgs(ctx), ...ownerArgs(ctx, vaultId), vaultId, vault.epoch, input.revision, vaultId, object]),
   guard('EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND source_identity=? AND epoch=? AND applying=0)', [checkpoint.source_identity, checkpoint.epoch]),
   guard(`(SELECT json_group_array(name) FROM (${transferSelect}))=?`, [JSON.stringify(transferTables.map(row => row.name))]),
   ...entries.map(entry => inventoryGuard(ctx, entry)),
   ...deletionStatements(ctx, entries),
   stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?', operation, vaultId),
   ...journal, ...transfers,
   stmt('INSERT INTO lky_erased_items(vault_id,object_id,tenant,receipt_id,erased_by,erased_device,erased_at,revision,counts,proof) VALUES(?,?,?,?,?,?,?,?,?,?)', vaultId, object, ctx.tenant, operation, ctx.actor, ctx.device, ctx.now, input.revision + 1, JSON.stringify(counts), JSON.stringify(input.proof)),
   ...(retention?[stmt("UPDATE lky_events SET actor='retention-policy',device='scheduled',object_id=? WHERE object_id=? AND action IN('item_written','item_erased','item_trash','item_archived','item_active','runtime_read','runtime_written','project_resource_created')",operation,object),stmt("INSERT INTO lky_events VALUES(?,?,?,?,?,?)",id(),'retention-policy','scheduled','item_retention_erased',operation,ctx.now)]:[event(object)]), stmt('DELETE FROM lky_erasure_guard'),
  ]);
 } catch {
  // A lost acknowledgement can safely return the original durable result;
  // all other transactional failures stay visible and never report erasure.
  await owned(ctx, vaultId);
  const completed = await known(ctx, vaultId, object);
  if (completed) return receipt(completed);
  throw new ItemErasureError('erasure_conflict', 409);
 }
 return receipt(await known(ctx, vaultId, object));
}
export async function erasureAuthenticated(route, input, ctx) {
 if (route === 'item/erase') return erase(input, ctx);
 if (route === 'item/erasure-status') {
  exact(input, ['vault', 'object']); const vault = uuid(input.vault), object = uuid(input.object);
  await owned(ctx, vault); const row = await known(ctx, vault, object);
  return row ? receipt(row) : { vault, object, erased: false };
 }
 return null;
}

export async function eraseRetainedItem(row,ctx){const proof=JSON.parse(row.proof);need(row.state==='trash'&&row.retention_active===1&&row.expires_at<=ctx.now,'invalid_retention_state',409);need(proof.statement.nonce===row.nonce&&proof.statement.expiresAt===row.expires_at,'invalid_erasure_proof',403);return erase({vault:row.vault_id,object:row.object_id,confirmed:true,revision:row.revision,proof},ctx,row)}
