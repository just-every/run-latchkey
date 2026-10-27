import { reportKeyContext } from '../reports/history.mjs';
import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest, publicKey, verify, verifyWrapped } from '../crypto/envelope.mjs';
export class RecordsError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }
export function requireRecords(condition, code, status = 400) { if (!condition) throw new RecordsError(code, status); }
export const rewrapBinding = (tenant, vault, account, epoch) => ({ tenant, vault, object: account, purpose: 'vault-key', epoch, version: 1 });
export const decisionText = decision => canonicalJson(['latchkey/records-rewrap-approval/v1', decision]);
export const rewrapPlanHash = plan => digest(canonicalJson(plan));
const fingerprint = identity => digest(JSON.stringify([identity.recipientKey, identity.authorityKey]));
function identityShape(value) {
 requireRecords(value && ['account', 'tenant', 'recipientKey', 'authorityKey'].every(key => typeof value[key] === 'string' && value[key].length > 0), 'records_identity_required');
 requireRecords(/^[0-9a-f-]{36}$/.test(value.account) && /^[0-9a-f-]{36}$/.test(value.tenant), 'records_identity_required');
 return { account: value.account, tenant: value.tenant, recipientKey: value.recipientKey, authorityKey: value.authorityKey };
}
export async function identities(source, destination, sourceFingerprint, destinationFingerprint) {
 source = identityShape(source); destination = identityShape(destination);
 await Promise.all([publicKey(source.recipientKey, 'wrap'), publicKey(source.authorityKey, 'sign'), publicKey(destination.recipientKey, 'wrap'), publicKey(destination.authorityKey, 'sign')]);
 requireRecords(await fingerprint(source) === sourceFingerprint && await fingerprint(destination) === destinationFingerprint, 'recipient_confirmation_required');
 return { source, destination };
}
export async function verifyDestinationRewrap({ plan, approval, sourceFingerprint, destinationFingerprint, now = Date.now() }) {
 requireRecords(plan?.schema === 1 && plan.kind === 'latchkey-records-rewrap-plan' && /^[a-f0-9]{64}$/.test(plan.archiveHash) && /^[a-f0-9]{64}$/.test(plan.contentHash)
  && typeof plan.sourceIdentity === 'string' && Array.isArray(plan.vaults) && Array.isArray(plan.unapprovedVaults)
  && plan.activeAuthority === false && Array.isArray(plan.rights) && plan.rights.length === 0 && plan.ciphertextTenant === 'preserve-source', 'rewrap_plan_invalid');
 const { source, destination } = await identities(plan.source, plan.destination, sourceFingerprint, destinationFingerprint);
 const decision = approval?.decision;
 requireRecords(decision?.schema === 1 && decision.kind === 'latchkey-records-rewrap-approval' && decision.planHash === await rewrapPlanHash(plan)
  && decision.sourceIdentity === plan.sourceIdentity && decision.archiveHash === plan.archiveHash && decision.contentHash === plan.contentHash && decision.sourceAccount === source.account
  && decision.sourceFingerprint === sourceFingerprint && decision.destinationFingerprint === destinationFingerprint
  && canonicalJson(decision.destination) === canonicalJson(destination) && decision.activeAuthority === false
  && Array.isArray(decision.rights) && decision.rights.length === 0 && typeof decision.purpose === 'string' && decision.purpose.trim().length > 0
  && Number.isSafeInteger(decision.approvedAt) && decision.approvedAt <= now && Number.isSafeInteger(decision.expiresAt) && decision.expiresAt > now
  && Array.isArray(decision.wraps) && decision.wraps.length === plan.vaults.length, 'rewrap_approval_invalid');
 requireRecords(await verify(source.authorityKey, approval.signature, decisionText(decision)), 'source_owner_signature_required');
 const seen = new Set();
 for (const [index, vault] of plan.vaults.entries()) {
  requireRecords(vault.owner === source.account && vault.tenant === source.tenant && /^[0-9a-f-]{36}$/.test(vault.vault) && !seen.has(vault.vault)
   && Number.isSafeInteger(vault.epoch) && vault.epoch > 0 && Number.isSafeInteger(vault.revision) && vault.revision > 0, 'rewrap_plan_invalid'); seen.add(vault.vault);
  const wrapped = decision.wraps[index];
  requireRecords(!vault.reportKey&&!wrapped.reportWrapped||vault.reportKey&&await verifyWrapped(wrapped.reportWrapped,source.authorityKey,source.account,reportKeyContext(vault.tenant,vault.vault,destination.account)),'rewrap_approval_invalid');
  requireRecords(wrapped.vault === vault.vault && wrapped.epoch === vault.epoch && wrapped.revision === vault.revision && Array.isArray(wrapped.rights) && wrapped.rights.length === 0
   && await verifyWrapped(wrapped.wrapped, source.authorityKey, source.account, rewrapBinding(vault.tenant, vault.vault, destination.account, vault.epoch)), 'rewrap_approval_invalid');
 }
 return { valid: true, activeAuthority: false, unapprovedVaults: [...plan.unapprovedVaults] };
}
