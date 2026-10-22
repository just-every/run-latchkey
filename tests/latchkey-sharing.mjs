import assert from 'node:assert/strict';
import { SharingClient, PublicLinkClient } from '../src/latchkey/sharing/client.mjs';
import { createAttachment } from '../src/latchkey/items/attachments.mjs';
import { digest } from '../src/latchkey/crypto/envelope.mjs';

// Runs against the parent's emitted Worker, migrated D1 and official-schema
// mail network fixture. No application service or crypto is substituted.
export async function runSharingJourneys({ owner, member, db, mail, fetcher = owner.fetcher }) {
 const sharing = new SharingClient(owner), guest = new SharingClient(member), privateValues = [];
 const rejected = (promise, code) => assert.rejects(promise, error => error.code === code);
 const vault = (await owner.createVault()).vault;
 const secret = 'synthetic-latchkey-910', password = 'synthetic-latchkey-911'; privateValues.push(secret, password);
 const attachment = await createAttachment('synthetic-latchkey-912.txt', new TextEncoder().encode('synthetic-latchkey-913'), 'text/plain'); privateValues.push(attachment.name, attachment.data, 'synthetic-latchkey-913');
 const first = await owner.put(vault, { type: 'note', value: secret, attachments: [attachment] });
 const second = await owner.put(vault, { type: 'note', value: 'synthetic-latchkey-914' });
 const excluded = await owner.put(vault, { type: 'note', value: 'synthetic-latchkey-915' });
 const identity = { account: member.profile.account, fingerprint: await digest(JSON.stringify([member.profile.recipientKey, member.profile.authorityKey])) };
 await member.pinAccount(owner.profile.account, await digest(JSON.stringify([owner.profile.recipientKey, owner.profile.authorityKey])));
 const grant = await sharing.grant(vault, { recipients: [identity], objects: [first.object, second.object], expiresAt: Date.now() + 86400000 });
 assert.equal((await guest.read(grant.share, first.object)).value.value, secret);
 assert.equal((await guest.read(grant.share, second.object)).version, 1);
 await rejected(guest.read(grant.share, excluded.object), 'share_unavailable');
 await rejected(member.readVault(vault), 'not_found');
 await rejected(guest.read(grant.share, first.object, 'export'), 'share_unavailable');
 await rejected(guest.put(grant.share, first.object, { value: 'synthetic-latchkey-916' }), 'share_unavailable');
 const received = await guest.received(); assert.ok(received.some(row => row.id === grant.share));
 await db.prepare('UPDATE lky_shares SET expires_at=? WHERE id=?').bind(Date.now() - 1, grant.share).run();
 await rejected(guest.read(grant.share, first.object), 'share_unavailable');
 assert.ok(!(await guest.received()).some(row => row.id === grant.share));

 const future = await sharing.grant(vault, { recipients: [identity], objects: [first.object], startsAt: Date.now() + 3600000, expiresAt: Date.now() + 7200000 });
 await rejected(guest.read(future.share, first.object), 'share_unavailable');
 await sharing.revoke(future.share);
 const pending = await sharing.grant(vault, { recipients: [identity], objects: [first.object], approvalRequired: true });
 await rejected(guest.read(pending.share, first.object), 'share_unavailable');
 await sharing.approve(pending.share); assert.equal((await guest.read(pending.share, first.object)).value.value, secret);
 await sharing.revoke(pending.share); await rejected(guest.read(pending.share, first.object), 'share_unavailable');
 const group = (await sharing.createGroup([identity.account])).group;
 const grouped = await sharing.grant(vault, { recipients: [identity], objects: [first.object], group });
 assert.equal((await guest.read(grouped.share, first.object)).value.value, secret);
 await sharing.setGroup(group, []); await rejected(guest.read(grouped.share, first.object), 'share_unavailable');
 const emptyGroup = (await sharing.createGroup()).group;
 // New group members receive no unreviewed wraps from an older grant.
 const ownerIdentity = { account: owner.profile.account, fingerprint: await digest(JSON.stringify([owner.profile.recipientKey, owner.profile.authorityKey])) };
 await sharing.setGroup(emptyGroup, [ownerIdentity.account]);
 const oldGroup = await sharing.grant(vault, { recipients: [ownerIdentity], objects: [first.object], group: emptyGroup });
 await sharing.setGroup(emptyGroup, [ownerIdentity.account, identity.account]);
 await rejected(guest.read(oldGroup.share, first.object), 'share_unavailable');
 const editable = await sharing.grant(vault, { recipients: [identity], objects: [second.object], rights: ['read', 'edit'] });
 const edited = await guest.put(editable.share, second.object, { value: 'synthetic-latchkey-921' });
 assert.equal(edited.grantRequiresRenewal, true);
 assert.equal((await owner.readItem(vault, second.object)).versions.at(-1).value.value, 'synthetic-latchkey-921');
 // The original wrap only returns the exact version reviewed at grant time.
 assert.equal((await guest.read(editable.share, second.object)).version, 1);
 await rejected(guest.put(editable.share, second.object, { value: 'synthetic-latchkey-922' }), 'version_conflict');

 const rules = await sharing.policy(); assert.equal(rules.externalEnabled, false);
 await rejected(sharing.createLink(vault, first.object, { recipient: 'synthetic-latchkey-917@example.test', password }), 'external_sharing_blocked');
 await sharing.setPolicy({ externalEnabled: true, domains: ['example.test'], defaultDays: 7, maxDays: 30 });
 const recipientEmail = 'synthetic-latchkey-917@example.test';
 await rejected(sharing.createLink(vault, first.object, { recipient: 'synthetic-latchkey-918@other.test' }), 'external_sharing_blocked');
 await rejected(sharing.createLink(vault, first.object, { recipient: recipientEmail, expiresAt: Date.now() + 31 * 86400000 }), 'invalid_expiry');
 await rejected(guest.history(vault), 'not_found');
 const currentCode = () => {
  const content = mail.at(-1).content.find(value => value.type === 'text/plain').value;
  const match = content.match(/Latchkey verification code: (\d{6})/); assert.ok(match); return match[1];
 };
 const make = async options => { const created = await sharing.createLink(vault, first.object, { recipient: recipientEmail, password, ...options }); privateValues.push(created.url); return created; };
 const once = await make();
 assert.ok(once.expires - Date.now() <= 7 * 86400000 && once.expires - Date.now() > 6.99 * 86400000);
 const publicClient = new PublicLinkClient(once.url, { fetcher });
 for (let index = 0; index < 2; index++) { const preview = await fetcher(owner.origin + '/share', { method: 'GET', redirect: 'manual' }); assert.ok(preview.status < 500); await publicClient.preview(); }
 assert.equal((await db.prepare('SELECT views FROM lky_links WHERE id=?').bind(once.link).first()).views, 0);
 await rejected(publicClient.challenge(recipientEmail, 'synthetic-latchkey-919'), 'link_unavailable');
 await rejected(publicClient.challenge('synthetic-latchkey-920@example.test', password), 'recipient_verification_failed');
 const verification = await publicClient.challenge(recipientEmail, password), code = currentCode();
 const competitor = new PublicLinkClient(once.url, { fetcher }); await competitor.prepare(password);
 const raced = await Promise.allSettled([publicClient.open(verification.challenge, code), competitor.open(verification.challenge, code)]);
 assert.equal(raced.filter(value => value.status === 'fulfilled').length, 1);
 assert.equal(raced.find(value => value.status === 'fulfilled').value.value.value, secret);
 assert.equal((await db.prepare('SELECT views FROM lky_links WHERE id=?').bind(once.link).first()).views, 1);
 await rejected(publicClient.preview(), 'link_unavailable');
 const file = await make({ attachment: attachment.id });
 const fileClient = new PublicLinkClient(file.url, { fetcher }), fileChallenge = await fileClient.challenge(recipientEmail, password);
 assert.deepEqual((await fileClient.open(fileChallenge.challenge, currentCode())).attachment, attachment);
 const revoked = await make({ maxViews: 3 }), cached = new PublicLinkClient(revoked.url, { fetcher });
 const cachedChallenge = await cached.challenge(recipientEmail, password), cachedCode = currentCode();
 await sharing.revokeLink(revoked.link);
 await rejected(cached.open(cachedChallenge.challenge, cachedCode), 'link_unavailable');
 await rejected(cached.preview(), 'link_unavailable');
 const expired = await make(), expiredClient = new PublicLinkClient(expired.url, { fetcher });
 await db.prepare('UPDATE lky_links SET expires_at=? WHERE id=?').bind(Date.now() - 1, expired.link).run();
 await rejected(expiredClient.preview(), 'link_unavailable');
 const bounded = await make({ maxViews: 2 }), openers = [0, 1, 2].map(() => new PublicLinkClient(bounded.url, { fetcher }));
 const codes = [];
 for (const opener of openers) { const challenge = await opener.challenge(recipientEmail, password); codes.push([challenge.challenge, currentCode()]); }
 const boundedRace = await Promise.allSettled(openers.map((opener, index) => opener.open(...codes[index])));
 assert.equal(boundedRace.filter(value => value.status === 'fulfilled').length, 2);
 const history = await sharing.history(vault, first.object); assert.ok(history.links.some(row => row.id === revoked.link && row.revoked_at)); assert.ok(history.links.some(row => row.id === expired.link && row.expires_at < Date.now()));
 assert.ok(!JSON.stringify(history).includes('verifier') && !JSON.stringify(history).includes('wrapped_key'));
 const audit = JSON.stringify((await db.prepare('SELECT * FROM lky_events').all()).results);
 for (const created of [once, file, revoked, expired, bounded]) assert.ok(!audit.includes(created.url.split('#')[1]));
 await sharing.setPolicy({ externalEnabled: true, domains: ['example.test'], defaultDays: 1, maxDays: 2 });
 await rejected(sharing.createLink(vault, first.object, { recipient: recipientEmail, expiresAt: Date.now() + 3 * 86400000 }), 'invalid_expiry');
 const strict = await make(); assert.ok(strict.expires - Date.now() <= 86400000);
 await sharing.setPolicy({ externalEnabled: false, domains: [], defaultDays: 7, maxDays: 30 });
 await rejected(new PublicLinkClient(strict.url, { fetcher }).preview(), 'link_unavailable');
 await owner.rotate(vault);
 await rejected(guest.read(editable.share, second.object), 'share_unavailable');
 console.log('Sharing: exact-item guest expiry, current groups, independent rights, approval, protected secret/file delivery, GET/POST previews, atomic races, recipient/password/domain checks, revoke/expiry, strict policy and redacted authorized history passed');
 return privateValues;
}
