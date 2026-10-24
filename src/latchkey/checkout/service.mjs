import { access, activeItem, exact, guarded, has, id, need, uuid, vaultFor } from '../lifecycle/common.mjs';

// Checkout coordinates a human ceremony. It cannot recall already copied values.
export async function checkoutAuthenticated(route, input, ctx) {
 if (!route.startsWith('checkout/')) return null;
 const vault = await vaultFor(ctx, input.vault), object = uuid(input.object);
 need(vault.owner === ctx.actor && vault.kind === 'company', 'checkout_owner_required', 403);
 need(has(vault, 'read') && has(vault, 'edit') && has(vault, 'rotate'), 'permission_denied', 403);
 await activeItem(ctx, vault.id, object);
 const { first, stmt, event, guard } = access(ctx);
 const latest = await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?', vault.id, object);
 need(latest?.version, 'not_found', 404);
 const current = await first('SELECT * FROM lky_checkouts WHERE vault_id=? AND object_id=?', vault.id, object);
 const view = row => row ? { checkout: row.id, holder: row.holder, version: row.version, expiresAt: row.expires_at, state: row.expires_at <= ctx.now ? 'expired-rotation-required' : 'checked-out', providerState: 'unchanged', pastCopies: 'cannot-be-recalled' } : { state: 'available', providerState: 'unchanged' };
 if (route === 'checkout' + '/status') { exact(input, ['vault', 'object']); return view(current); }
 need(input.confirmed === true, 'checkout_confirmation_required', 403);
 if (route === 'checkout' + '/acquire') {
  exact(input, ['vault', 'object', 'expiresAt', 'confirmed']);
  need(!current, current?.expires_at <= ctx.now ? 'checkout_rotation_required' : 'checkout_busy', 409);
  need(Number.isSafeInteger(input.expiresAt) && input.expiresAt > ctx.now && input.expiresAt <= ctx.now + 3600000, 'invalid_checkout_expiry');
  const row = { id: id(), holder: ctx.actor, version: latest.version, expires_at: input.expiresAt };
  await guarded(ctx, [vault], [stmt('INSERT INTO lky_checkouts VALUES(?,?,?,?,?,?)', vault.id, object, row.id, ctx.actor, latest.version, row.expires_at), event('credential_checked_out', object)], [guard('NOT EXISTS(SELECT 1 FROM lky_checkouts WHERE vault_id=? AND object_id=?)', [vault.id, object])]);
  return view(row);
 }
 if (route === 'checkout' + '/complete') {
  exact(input, ['vault', 'object', 'checkout', 'version', 'confirmed']);
  need(current && current.id === uuid(input.checkout) && current.holder === ctx.actor, 'checkout_changed', 409);
  need(Number.isSafeInteger(input.version) && input.version === latest.version && input.version > current.version, 'checkout_rotation_required', 409);
  await guarded(ctx, [vault], [stmt('DELETE FROM lky_checkouts WHERE vault_id=? AND object_id=?', vault.id, object), event('checkout_vault_rotation_recorded', object)], [guard('EXISTS(SELECT 1 FROM lky_checkouts WHERE vault_id=? AND object_id=? AND id=?)', [vault.id, object, current.id])]);
  return { state: 'available', providerState: 'unchanged', verification: 'owner-attested-vault-version', version: latest.version };
 }
 need(false, 'checkout_route_not_found', 404);
}
