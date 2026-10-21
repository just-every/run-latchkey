import { SharingClient, PublicLinkClient } from '../../src/latchkey/sharing/client.mjs';
import { need } from '../../src/latchkey/sharing/common.mjs';
export const sharingCommands = Object.freeze(['sharing-policy', 'sharing-policy-set', 'sharing-group-create', 'sharing-group-set', 'sharing-group-members', 'sharing-grant', 'sharing-received', 'sharing-read', 'sharing-put', 'sharing-approve', 'sharing-revoke', 'sharing-history', 'sharing-link-create', 'sharing-link-revoke', 'sharing-link-preview', 'sharing-link-challenge', 'sharing-link-open']);
export async function runSharingCommand(command, input, { client, writePrivate, fetcher }) {
 need(sharingCommands.includes(command), 'unknown_sharing_command');
 const sharing = new SharingClient(client);
 const output = async value => { need(input.output, 'private_output_required'); await writePrivate(input.output, value); return { written: true }; };
 switch (command) {
  case 'sharing-policy': return sharing.policy();
  case 'sharing-policy-set': return sharing.setPolicy(input.policy);
  case 'sharing-group-create': return sharing.createGroup(input.accounts);
  case 'sharing-group-set': return sharing.setGroup(input.group, input.accounts);
  case 'sharing-group-members': return sharing.groupMembers(input.group);
  case 'sharing-grant': return sharing.grant(input.vault, input.options);
  case 'sharing-received': return sharing.received();
  case 'sharing-read': return output(await sharing.read(input.share, input.object, input.action));
  case 'sharing-put': return sharing.put(input.share, input.object, input.value);
  case 'sharing-approve': return sharing.approve(input.share);
  case 'sharing-revoke': return sharing.revoke(input.share);
  case 'sharing-history': return output(await sharing.history(input.vault, input.object));
  case 'sharing-link-create': return output(await sharing.createLink(input.vault, input.object, input.options));
  case 'sharing-link-revoke': return sharing.revokeLink(input.link);
 }
 const recipient = new PublicLinkClient(input.url, { fetcher });
 if (command === 'sharing-link-preview') return recipient.preview();
 if (command === 'sharing-link-challenge') { const challenge = await recipient.challenge(input.recipient, input.password ?? null); recipient.lock(); return challenge; }
 // A separate invocation derives the key without issuing another challenge.
 await recipient.prepare(input.password ?? null);
 try { return await output(await recipient.open(input.challenge, input.code)); } finally { recipient.lock(); }
}
