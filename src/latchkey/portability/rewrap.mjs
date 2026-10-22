// Buyer-side key custody only. These decisions/wraps are historical, inactive
// restore material. A destination must separately authorize any activation.
import { readArchive } from '@runeditrun/rer/modules/portability';
import { sign, unwrapSigned, wrapSigned } from '../crypto/envelope.mjs';
import { privateInput, fileStream, requireRecords } from './private-files.mjs';
import { rewrapBinding as binding, decisionText, identities, rewrapPlanHash, verifyDestinationRewrap } from './common.mjs';
export { rewrapPlanHash, verifyDestinationRewrap } from './common.mjs';
async function inventory(input) {
 const handle = await privateInput(input);
 const accounts = [], vaults = [], recipients = [];
 let manifest, closing;
 try {
  for await (const record of readArchive(fileStream(handle))) {
   if (record.kind === 'manifest') manifest = record;
   else if (record.kind === 'closing') closing = record;
   else for (const item of record.items) {
    if (item.kind !== 'row') continue;
    if (item.table === 'lky_accounts') accounts.push(item.row);
    if (item.table === 'lky_vaults') vaults.push(item.row);
    if (item.table === 'lky_recipients') recipients.push(item.row);
   }
  }
  return { manifest, closing, accounts, vaults, recipients };
 } finally { await handle.close(); }
}
async function buildPlan(data, source, destination, sourceFingerprint, destinationFingerprint) {
 ({ source, destination } = await identities(source, destination, sourceFingerprint, destinationFingerprint));
 const account = data.accounts.find(row => row.id === source.account);
 requireRecords(account?.tenant === source.tenant && account.recipient_key === source.recipientKey && account.authority_key === source.authorityKey, 'source_owner_key_mismatch');
 const owned = data.vaults.filter(row => row.owner === source.account);
 requireRecords(owned.every(row => row.tenant === source.tenant), 'source_tenant_mismatch');
 const vaults = owned.map(row => ({ vault: row.id, tenant: row.tenant, owner: row.owner, epoch: row.epoch, revision: row.revision }));
 vaults.sort((a, b) => a.vault.localeCompare(b.vault));
 return {
  schema: 1, kind: 'latchkey-records-rewrap-plan', sourceIdentity: data.manifest.sourceIdentity,
  archiveHash: data.closing.archiveHash, contentHash: data.closing.contentHash, source, destination, sourceFingerprint, destinationFingerprint,
  vaults, unapprovedVaults: data.vaults.filter(row => row.owner !== source.account).map(row => row.id).sort(),
  rights: [], activeAuthority: false, ciphertextTenant: 'preserve-source',
 };
}
export async function planDestinationRewrap({ input, source, destination, sourceFingerprint, destinationFingerprint }) {
 const plan = await buildPlan(await inventory(input), source, destination, sourceFingerprint, destinationFingerprint);
 return { plan, planHash: await rewrapPlanHash(plan) };
}
export async function approveDestinationRewrap({ input, plan, approvedPlanHash, client, purpose, expiresAt, now = Date.now() }) {
 requireRecords(typeof purpose === 'string' && purpose.trim().length > 0 && purpose.length <= 500, 'approval_purpose_required');
 requireRecords(Number.isSafeInteger(now) && Number.isSafeInteger(expiresAt) && expiresAt > now, 'approval_expired');
 const data = await inventory(input);
 const expected = await buildPlan(data, plan.source, plan.destination, plan.sourceFingerprint, plan.destinationFingerprint);
 const planHash = await rewrapPlanHash(expected);
 requireRecords(planHash === approvedPlanHash && planHash === await rewrapPlanHash(plan), 'approval_plan_changed');
 requireRecords(client?.profile?.account === plan.source.account && client.profile.tenant === plan.source.tenant && client.profile.recipientKey === plan.source.recipientKey && client.profile.authorityKey === plan.source.authorityKey && client.bundle?.root?.recipient?.privateKey && client.bundle?.root?.authority?.privateKey, 'source_owner_unlock_required');
 const wraps = [];
 for (const vault of plan.vaults) {
  const recipient = data.recipients.find(row => row.vault_id === vault.vault && row.account_id === plan.source.account);
  requireRecords(recipient, 'source_owner_wrap_missing');
  const original = typeof recipient.wrapped_key === 'string' ? JSON.parse(recipient.wrapped_key) : recipient.wrapped_key;
  const key = await unwrapSigned(original, client.bundle.root.recipient.privateKey, plan.source.authorityKey, plan.source.account, binding(vault.tenant, vault.vault, plan.source.account, vault.epoch));
  try {
   requireRecords(key.length === 32, 'invalid_vault_key');
   wraps.push({ vault: vault.vault, epoch: vault.epoch, revision: vault.revision, rights: [],
    wrapped: await wrapSigned(key, plan.destination.recipientKey, binding(vault.tenant, vault.vault, plan.destination.account, vault.epoch), plan.source.account, client.bundle.root.authority.privateKey) });
  } finally { key.fill(0); }
 }
 const decision = { schema: 1, kind: 'latchkey-records-rewrap-approval', planHash, sourceIdentity: plan.sourceIdentity, archiveHash: plan.archiveHash, contentHash: plan.contentHash,
  sourceAccount: plan.source.account, sourceFingerprint: plan.sourceFingerprint, destination: plan.destination,
  destinationFingerprint: plan.destinationFingerprint, purpose, approvedAt: now, expiresAt, rights: [], activeAuthority: false, wraps };
 const approval = { decision, signature: await sign(client.bundle.root.authority.privateKey, decisionText(decision)) };
 // Detect a wrong private signing key before handing any result to the caller.
 await verifyDestinationRewrap({ plan, approval, sourceFingerprint: plan.sourceFingerprint, destinationFingerprint: plan.destinationFingerprint, now });
 return approval;
}
