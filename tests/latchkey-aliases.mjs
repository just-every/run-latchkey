import assert from 'node:assert/strict';
import { AliasClient } from '../src/latchkey/aliases/client.mjs';
import { createItem } from '../src/latchkey/items/types.mjs';
import { TypedItems } from '../src/latchkey/items/client.mjs';
const refused = (promise, code) => assert.rejects(promise, error => error.code === code, code);
export const aliasToken = 'synthetic-latchkey-2060';
const rulePosts = edge => edge.calls.filter(call => call.startsWith('POST /zones')).length;
// Authority, provider failure, replacement and export separation through the public alias doors.
export async function aliasApiJourney({ owner, member, outsider, edge }) {
 const zoneId = edge.zone, accountId = edge.account;
 const options = { token: aliasToken, fetcher: edge.fetch }, ownerAliases = new AliasClient(owner), memberAliases = new AliasClient(member), outsiderAliases = new AliasClient(outsider);
 const company = (await owner.createVault({ kind: 'company' })).vault, personalVault = (await owner.createVault({ kind: 'private-work' })).vault;
 await owner.share(company, member.profile.account, await member.identity().fingerprint, ['read', 'create', 'edit']); await member.pinAccount(owner.profile.account, await owner.identity().fingerprint);
 const typed = new TypedItems(owner), login = async (vault, title) => (await typed.save(vault, createItem('login', { title, values: { username: 'placeholder@example.test', password: 'synthetic-latchkey-2064' } }))).object;
 // Company configuration belongs to the installation owner; a member cannot approve a domain or mailbox.
 await refused(memberAliases.saveDomain({ scope: 'company', zone: zoneId, ...options }), 'alias_admin_required');
 const domain = await ownerAliases.saveDomain({ scope: 'company', zone: zoneId, ...options });
 assert.equal(domain.active, true); assert.equal(domain.providerStatus, 'ready');
 // A mailbox the provider has not verified cannot receive an alias.
 const unverified = await ownerAliases.saveMailbox({ scope: 'company', account: accountId, address: 'billing@northstar-finance.test', requestVerification: true, ...options });
 assert.equal(unverified.verifiedAt, null);
 await refused(memberAliases.saveMailbox({ scope: 'company', account: accountId, address: 'billing@northstar-finance.test', ...options }), 'alias_admin_required');
 const item = await login(company, 'Fabrikam Marketplace'), before = rulePosts(edge);
 await refused(ownerAliases.create({ vault: company, object: item, domain, mailbox: unverified, ...options }), 'alias_mailbox_unverified'); assert.equal(rulePosts(edge), before);
 edge.verify('billing@northstar-finance.test');
 const mailbox = await ownerAliases.saveMailbox({ scope: 'company', account: accountId, address: 'billing@northstar-finance.test', ...options }); assert.ok(mailbox.verifiedAt);
 edge.destinations.set('ryan.personal@example.test', { id: 'f'.repeat(32), tag: 'f'.repeat(32), email: 'ryan.personal@example.test', verified: new Date().toISOString() });
 const personal = await ownerAliases.saveMailbox({ scope: 'personal', account: accountId, address: 'ryan.personal@example.test', ...options });
 // Work aliases never forward to a personal mailbox, even when the owner asks.
 await refused(ownerAliases.create({ vault: company, object: item, domain, mailbox: personal, ...options }), 'alias_mailbox_scope_refused'); assert.equal(rulePosts(edge), before);
 const personalDomain = await ownerAliases.saveDomain({ scope: 'personal', zone: zoneId, ...options });
 await refused(ownerAliases.create({ vault: company, object: item, domain: personalDomain, mailbox, ...options }), 'alias_configuration_not_found');
 // A member creates a company alias from the approved list; the owner's alias is the member's to leave alone.
 const memberItem = await login(company, 'Contoso Newsletter');
 const mine = await memberAliases.create({ vault: company, object: memberItem, domain, mailbox, ...options });
 assert.equal(mine.alias.state, 'active'); assert.equal(mine.alias.scope, 'company'); assert.equal(mine.alias.delivery, 'unconfirmed');
 const theirs = await ownerAliases.create({ vault: company, object: item, domain, mailbox, ...options });
 const asMember = (await memberAliases.list()).find(row => row.id === theirs.alias.id), calls = edge.calls.length;
 assert.equal(asMember.canManage, false); assert.equal(asMember.canRetarget, false);
 await refused(memberAliases.disable(asMember, options), 'alias_forwarding_change_denied');
 await refused(memberAliases.retarget(asMember, mailbox, options), 'alias_forwarding_change_denied');
 await refused(outsiderAliases.disable(asMember, options), 'alias_not_found'); assert.equal(edge.calls.length, calls); assert.equal(edge.rules.get(theirs.alias.ruleRef).enabled, true);
 // Re-pointing a company alias is the owner's: the member who created it may stop it, not redirect it.
 const second = await ownerAliases.saveMailbox({ scope: 'company', account: accountId, address: 'ap@northstar-finance.test', requestVerification: true, ...options }); edge.verify('ap@northstar-finance.test');
 const approved = await ownerAliases.saveMailbox({ scope: 'company', account: accountId, address: 'ap@northstar-finance.test', ...options });
 await refused(memberAliases.retarget((await memberAliases.list()).find(row => row.id === mine.alias.id), approved, options), 'alias_forwarding_change_denied');
 const moved = await ownerAliases.retarget((await ownerAliases.list()).find(row => row.id === theirs.alias.id), approved, options);
 assert.equal(moved.mailbox.address, 'ap@northstar-finance.test'); assert.equal(edge.rules.get(theirs.alias.ruleRef).actions[0].value[0], 'ap@northstar-finance.test'); assert.equal(second.verifiedAt, null);
 await ownerAliases.retarget(moved, mailbox, options);
 // Delivery is reported by a person, never claimed by the provider adapter.
 assert.equal(edge.deliver(theirs.address, { subject: 'Confirm', text: 'code' }), 'forwarded'); assert.equal(edge.inbox.at(-1).mailbox, 'billing@northstar-finance.test');
 const reported = await ownerAliases.reportDelivery(moved, 'received'); assert.equal(reported.delivery, 'received-reported');
 // Provider failures are shown as they are. A refusal changes nothing; an unanswered write is not called a success.
 const failing = await login(company, 'Wingtip Billing'), rules = edge.rules.size;
 await refused(ownerAliases.create({ vault: company, object: failing, domain, mailbox, token: 'synthetic-latchkey-2065', fetcher: edge.fetch }), 'provider_authorization');
 let row = (await ownerAliases.list()).find(r => r.object === failing); assert.equal(row.state, 'failed'); assert.equal(row.delivery, 'not-configured'); assert.equal(edge.rules.size, rules);
 edge.fault('POST /zones', 429); await refused(ownerAliases.create({ vault: company, object: failing, domain, mailbox, ...options }), 'provider_rate_limited');
 edge.fault('POST /zones', 503);
 const outage = await ownerAliases.create({ vault: company, object: failing, domain, mailbox, ...options }).catch(error => error); assert.equal(outage.code, 'provider_unavailable'); assert.equal(outage.alias.state, 'reconcile'); assert.equal(outage.alias.delivery, 'unconfirmed');
 assert.equal(edge.rules.size, rules, 'the refused write created nothing');
 const unknownAddress = `lk-orphan@${domain.domain}`;
 // The provider performed the write and the answer was lost: the next read finds the rule and settles the alias.
 edge.fault('POST /zones', 'drop', 0, true);
 const lost = await ownerAliases.create({ vault: company, object: await login(company, 'Litware Portal'), domain, mailbox, ...options }).catch(error => error);
 assert.equal(lost.code, 'provider_unreachable'); assert.equal(lost.alias.state, 'reconcile'); assert.equal(edge.rules.size, rules + 1);
 const settled = await ownerAliases.reconcile(lost.alias, { address: [...edge.rules.values()].at(-1).matchers[0].value, ...options }); assert.equal(settled.state, 'active'); assert.equal(settled.failure, null);
 const absent = await ownerAliases.reconcile(outage.alias, { address: unknownAddress, ...options }); assert.equal(absent.state, 'failed'); assert.equal(absent.failure, 'provider_rule_missing');
 // The subscription dependency: a zone the provider no longer reports ready stops new aliases and marks existing ones unavailable.
 edge.routing.status = 'misconfigured'; const degraded = await ownerAliases.saveDomain({ scope: 'company', zone: zoneId, ...options }); assert.equal(degraded.active, false);
 await refused(ownerAliases.create({ vault: company, object: await login(company, 'Adatum Console'), domain, mailbox, ...options }), 'alias_domain_unavailable');
 assert.equal((await ownerAliases.list()).find(r => r.id === theirs.alias.id).forwarding, 'unavailable');
 edge.routing.status = 'ready'; await ownerAliases.saveDomain({ scope: 'company', zone: zoneId, ...options });
 // Disabling stops forwarding at the provider and leaves the saved login in place.
 const live = (await ownerAliases.list()).find(r => r.id === theirs.alias.id), off = await ownerAliases.disable(live, options);
 assert.equal(off.state, 'disabled'); assert.equal(off.delivery, 'forwarding-stopped'); assert.equal(edge.rules.get(theirs.alias.ruleRef).enabled, false);
 const inbox = edge.inbox.length; assert.equal(edge.deliver(theirs.address, { subject: 'Again', text: 'code' }), 'dropped'); assert.equal(edge.inbox.length, inbox);
 assert.equal((await owner.readItem(company, item)).versions.at(-1).value.title, 'Fabrikam Marketplace');
 // Replacement: a new alias for the same login, the old one stopped, the login untouched.
 const replacement = await ownerAliases.replace((await ownerAliases.list()).find(r => r.id === mine.alias.id), options);
 assert.equal(replacement.alias.state, 'active'); assert.equal(replacement.disabled.state, 'disabled'); assert.equal(replacement.disabled.replacedBy, replacement.alias.id); assert.notEqual(replacement.address, mine.address);
 // Personal aliases: separate vault, mailbox and export.
 const diary = await login(personalVault, 'Personal Store'); await refused(memberAliases.create({ vault: personalVault, object: diary, domain, mailbox, ...options }), 'not_found');
 const own = await ownerAliases.create({ vault: personalVault, object: diary, domain: personalDomain, mailbox: personal, ...options }); assert.equal(own.alias.scope, 'personal');
 await refused(ownerAliases.create({ vault: personalVault, object: await login(personalVault, 'Personal Bank'), domain: personalDomain, mailbox, ...options }), 'alias_mailbox_scope_refused');
 const asOwnerPersonal = await ownerAliases.export('personal'), asOwnerCompany = await ownerAliases.export('company');
 assert.ok(asOwnerPersonal.aliases.length === 1 && asOwnerPersonal.aliases.every(r => r.scope === 'personal') && asOwnerPersonal.mailboxes.every(r => r.scope === 'personal') && asOwnerPersonal.domains.every(r => r.scope === 'personal'));
 assert.ok(asOwnerCompany.aliases.length >= 4 && asOwnerCompany.aliases.every(r => r.scope === 'company') && asOwnerCompany.mailboxes.every(r => r.scope === 'company'));
 assert.ok(!JSON.stringify(asOwnerCompany).includes('ryan.personal@example.test') && !JSON.stringify(asOwnerPersonal).includes('billing@northstar-finance.test'));
 await refused(memberAliases.export('company'), 'alias_admin_required'); assert.equal((await memberAliases.export('personal')).aliases.length, 0);
 assert.ok(!(await memberAliases.list()).some(r => r.scope === 'personal'));
 // Nothing but relationships and states is stored by the service; addresses and tokens are not.
 return { company, item, domain, mailbox, personal, personalDomain, mine, theirs };
}
