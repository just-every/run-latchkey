import { decode, publicKey, verify } from './envelope.mjs';

const rights = ['read', 'create', 'edit', 'export', 'share', 'rotate', 'delete', 'restore'];
const policyKeys = ['schema', 'purpose', 'tenant', 'vault', 'owner', 'days'];
const capabilityKeys = ['schema', 'purpose', 'tenant', 'vault', 'owner', 'account', 'authorityKey', 'rights', 'epoch', 'generation'];
const trashKeys = ['schema', 'purpose', 'tenant', 'vault', 'object', 'owner', 'actor', 'epoch', 'version', 'revision', 'nonce', 'trashedAt', 'expiresAt'];
const duration = 30 * 24 * 60 * 60 * 1000;
const need = condition => { if (!condition) throw new Error('invalid_deletion_consent'); };
function exact(value, keys) {
 need(value !== null && typeof value === 'object' && !Array.isArray(value));
 const actual = Object.keys(value).sort();
 need(actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]));
}
function base(statement, keys, purpose) {
 exact(statement, keys);
 need(statement.schema === 1 && statement.purpose === purpose);
 for (const key of ['tenant', 'vault', 'owner']) identifier(statement[key]);
}
function identifier(value) { need(typeof value === 'string' && /^[A-Za-z0-9:/._-]{1,200}$/.test(value)); }
function positive(value) { need(Number.isSafeInteger(value) && value > 0); }
function signed(value) {
 exact(value, ['statement', 'signature']);
 need(typeof value.signature === 'string' && decode(value.signature, 64).length === 64);
}

export function policyText(statement) {
 base(statement, policyKeys, 'trash-retention');
 need(statement.days === 30);
 return JSON.stringify(['latchkey/trash-retention/v1', ...policyKeys.map(key => statement[key])]);
}

export function capabilityText(statement) {
 base(statement, capabilityKeys, 'vault-rights');
 identifier(statement.account);
 const key = decode(statement.authorityKey, 65);
 need(key.length === 65 && key[0] === 4);
 positive(statement.epoch); positive(statement.generation);
 need(Array.isArray(statement.rights) && statement.rights.length <= rights.length && new Set(statement.rights).size === statement.rights.length && statement.rights.every(right => rights.includes(right)));
 return JSON.stringify(['latchkey/vault-rights/v1', ...capabilityKeys.map(key => statement[key])]);
}

export function trashText(statement) {
 base(statement, trashKeys, 'trash-item');
 identifier(statement.object); identifier(statement.actor);
 for (const key of ['epoch', 'version', 'revision', 'trashedAt', 'expiresAt']) positive(statement[key]);
 need(typeof statement.nonce === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(statement.nonce));
 need(Number.isSafeInteger(statement.trashedAt + duration) && statement.expiresAt === statement.trashedAt + duration);
 return JSON.stringify(['latchkey/trash-item/v1', ...trashKeys.map(key => statement[key])]);
}

// This validates recorded consent, not current rights, time or restore state.
// The service must check those when accepting trash and fencing its expiry.
export async function validDeletionConsent(proof, expected, ownerAuthorityKey) {
 try {
  exact(proof, ['policy', 'authorization', 'statement', 'signature']);
  signed(proof.policy);
  const text = trashText(proof.statement), statement = proof.statement;
  need(expected !== null && typeof expected === 'object' && !Array.isArray(expected));
  need(Object.keys(expected).every(key => trashKeys.includes(key) && expected[key] === statement[key]));
  need(typeof proof.signature === 'string' && decode(proof.signature, 64).length === 64);
  const policy = proof.policy.statement;
  const policyMessage = policyText(policy);
  need(['tenant', 'vault', 'owner'].every(key => policy[key] === statement[key]));
  need(await verify(ownerAuthorityKey, proof.policy.signature, policyMessage));
  let authority = ownerAuthorityKey;
  if (proof.authorization !== null) {
   signed(proof.authorization);
   const capability = proof.authorization.statement;
   const capabilityMessage = capabilityText(capability);
   need(['tenant', 'vault', 'owner', 'epoch'].every(key => capability[key] === statement[key]));
   need(capability.account === statement.actor && capability.rights.includes('delete'));
   await publicKey(capability.authorityKey, 'sign');
   need(await verify(ownerAuthorityKey, proof.authorization.signature, capabilityMessage));
   authority = capability.authorityKey;
  } else need(statement.actor === statement.owner);
  return await verify(authority, proof.signature, text);
 } catch { return false; }
}
