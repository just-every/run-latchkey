import { reportKeyContext } from '../reports/history.mjs';
import { unwrapSigned } from '../crypto/envelope.mjs';
import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { requireRecords as need, rewrapBinding, verifyDestinationRewrap } from './common.mjs';
const ownerRights = ['read', 'create', 'edit', 'export', 'share', 'rotate','delete','restore'];
export class PortabilityClient {
 constructor(client) { this.client = client; }
 async prepare({ plan, approval, sourceFingerprint, destinationFingerprint }) {
  await verifyDestinationRewrap({ plan, approval, sourceFingerprint, destinationFingerprint });
  const profile = this.client.profile;
  need(profile && plan.destination.account === profile.account && plan.destination.tenant === profile.tenant && plan.source.tenant === profile.tenant
   && plan.destination.recipientKey === profile.recipientKey && plan.destination.authorityKey === profile.authorityKey, 'destination_recipient_mismatch');
  return this.client.call('archive/prepare', { plan, approval, sourceFingerprint, destinationFingerprint });
 }
 status(restore) { return this.client.call('archive/status', { restore }); }
 async activate({ restore, approvedPlanHash, activation, rights }) {
  need(typeof activation === 'string' && activation.trim().length > 0 && Array.isArray(rights)
   && canonicalJson([...rights].sort()) === canonicalJson([...ownerRights].sort()), 'explicit_activation_required');
  const state = await this.status(restore);
  need(state.planHash === approvedPlanHash, 'approval_plan_changed');
  if (state.phase === 'activated') { need(state.activation === activation, 'activation_changed'); return state; }
  const { plan, approval } = state, client = this.client;
  await verifyDestinationRewrap({ plan, approval, sourceFingerprint: plan.sourceFingerprint, destinationFingerprint: plan.destinationFingerprint });
  need(plan.destination.account === client.profile.account && plan.destination.recipientKey === client.profile.recipientKey && plan.destination.authorityKey === client.profile.authorityKey && plan.source.tenant === client.profile.tenant, 'destination_recipient_mismatch');
  const wraps = [];
  for (const [index, vault] of plan.vaults.entries()) {
   const binding = rewrapBinding(vault.tenant, vault.vault, client.profile.account, vault.epoch);
   const key = await unwrapSigned(approval.decision.wraps[index].wrapped, client.bundle.root.recipient.privateKey, plan.source.authorityKey, plan.source.account, binding);
   try {
    need(key.length === 32, 'invalid_vault_key');
    let reportWrapped;
    if(vault.reportKey){const reportKey=await unwrapSigned(approval.decision.wraps[index].reportWrapped,client.bundle.root.recipient.privateKey,plan.source.authorityKey,plan.source.account,reportKeyContext(vault.tenant,vault.vault,client.profile.account));try{reportWrapped=await client.wrap(reportKey,client.profile.recipientKey,reportKeyContext(vault.tenant,vault.vault,client.profile.account));}finally{reportKey.fill(0);}}
    wraps.push({ ...(reportWrapped?{reportWrapped}:{}),vault: vault.vault, epoch: vault.epoch, revision: vault.revision, wrapped: await client.wrap(key, client.profile.recipientKey, binding) });
   } finally { key.fill(0); }
  }
  const result = await client.call('archive/activate', { restore, approvedPlanHash, activation, rights, wraps });
  // Historical source-owner pins/checkpoints cannot authenticate a newly owned
  // vault. The signed activation response binds the intentional owner change.
  for (const vault of plan.vaults) {
   delete client.profile.seen[vault.vault];
   client.profile.erasureAuthorities ??= {};
   client.profile.erasureAuthorities[vault.vault] = { ...client.profile.erasureAuthorities[vault.vault], [plan.source.account]: plan.source.authorityKey };
  }
  client.profile.trusted[client.profile.account] = { recipientKey: client.profile.recipientKey, authorityKey: client.profile.authorityKey };
  return result;
 }
}
