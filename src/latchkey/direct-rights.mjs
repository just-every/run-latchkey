import { verifyCapability } from './lifecycle/common.mjs';

export const atomicActions = ['reveal', 'copy', 'history'];
export const directRights = ['read', 'create', 'edit', 'export', 'share', 'rotate', 'delete', 'restore', ...atomicActions];

// Version one retains its documented read bundle. Version two never infers an
// atomic action from read. Empty restored recipients remain inactive in both.
export function effectiveDirectRights(rights, version = 1) {
 return [...new Set([...rights, ...(version === 1 && rights.includes('read') ? atomicActions : [])])];
}
export function directPreview(rights, version, source) {
 const effective = effectiveDirectRights(rights, version);
 return { version, legacy: version === 1, source, rights: effective,
  actions: Object.fromEntries(atomicActions.map(action => [action, effective.includes('read') && effective.includes(action)])) };
}
export async function currentDirectRights(db, vault, actor) {
 const row = await db.prepare('SELECT a.id,a.generation,a.authority_key,r.rights,c.capability FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id LEFT JOIN lky_vault_capabilities c ON c.vault_id=r.vault_id AND c.account_id=r.account_id WHERE r.vault_id=? AND r.account_id=?').bind(vault.id, actor).first();
 if (!row) return directPreview([], 2, 'inactive');
 const rights = JSON.parse(row.rights);
 if (actor === vault.owner) return directPreview(rights, 1, 'vault owner');
 if (!row.capability) return directPreview(rights, 1, 'legacy direct grant');
 const capability = JSON.parse(row.capability);
 const owner = await db.prepare('SELECT authority_key FROM lky_accounts WHERE id=?').bind(vault.owner).first();
 if (!owner || !await verifyCapability(capability, { ...vault, authority_key: owner.authority_key }, { ...row, rights })) return directPreview([], 2, 'invalid or stale direct grant');
 return directPreview(rights, capability.statement.schema, capability.statement.schema === 1 ? 'legacy signed direct grant' : 'owner-selected direct grant');
}
