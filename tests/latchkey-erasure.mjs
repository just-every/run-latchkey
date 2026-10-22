import assert from 'node:assert/strict';
import { VaultClient } from '../src/latchkey/client.mjs';
import { SharingClient, PublicLinkClient } from '../src/latchkey/sharing/client.mjs';
import { MachineClient } from '../src/latchkey/machine.mjs';
import { createAttachment } from '../src/latchkey/items/attachments.mjs';
import { digest, encode, random } from '../src/latchkey/crypto/envelope.mjs';

const code = mail => { const match = mail.at(-1).content.find(part => part.type === 'text/plain').value.match(/Latchkey verification code: (\d{6})/); assert.ok(match); return match[1]; };
const rejects = (promise, expected) => assert.rejects(promise, error => error.code === expected);
async function archive(records) {
 const job = await records.exports.create('synthetic-latchkey-950');
 for (;;) { if ((await records.exports.advance(job, { maxParts: 100 })).phase === 'complete') break; }
 const text = await new Response(await records.exports.download(job)).text();
 return { job, text, lines: text.trim().split('\n').map(line => JSON.parse(line)) };
}

// Called with actual emitted-Worker clients, its D1 binding and real Base
// Records service. Only the pre-existing mail provider edge is substituted.
export async function runItemErasureJourneys({ owner, member, db, records, mail, ownerPassword, fetcher = owner.fetcher }) {
 const vault = (await owner.createVault()).vault, sharing = new SharingClient(owner), recipient = new SharingClient(member);
 const privateValues = ['synthetic-latchkey-951', 'synthetic-latchkey-952', 'synthetic-latchkey-953', 'synthetic-latchkey-954'];
 const attachment = await createAttachment('synthetic-latchkey-952', new TextEncoder().encode('synthetic-latchkey-953'));
 const original = { title: 'synthetic-latchkey-951', secret: 'synthetic-latchkey-954', attachments: [attachment] };
 const created = await owner.put(vault, original), object = created.object;
 await owner.put(vault, { ...original, secret: 'synthetic-latchkey-955' }, object); privateValues.push('synthetic-latchkey-955');
 const kept = await owner.put(vault, { secret: 'synthetic-latchkey-956' }); privateValues.push('synthetic-latchkey-956');
 const identity = { account: member.profile.account, fingerprint: await digest(JSON.stringify([member.profile.recipientKey, member.profile.authorityKey])) };
 await member.pinAccount(owner.profile.account, await digest(JSON.stringify([owner.profile.recipientKey, owner.profile.authorityKey])));
 const exclusive = await sharing.grant(vault, { recipients: [identity], objects: [object], rights: ['read', 'edit'] });
 const mixed = await sharing.grant(vault, { recipients: [identity], objects: [object, kept.object] });
 assert.equal((await recipient.read(exclusive.share, object)).value.secret, 'synthetic-latchkey-955');
 await sharing.setPolicy({ externalEnabled: true, domains: ['example.test'], defaultDays: 7, maxDays: 30 });
 const address = 'synthetic-latchkey-957@example.test';
 const link = await sharing.createLink(vault, object, { recipient: address, maxViews: 3 }), fileLink = await sharing.createLink(vault, object, { recipient: address, attachment: attachment.id });
 privateValues.push(link.url, fileLink.url);
 const publicLink = new PublicLinkClient(link.url, { fetcher }), challenge = await publicLink.challenge(address), verification = code(mail);
 const runtimeKey = encode(random()); privateValues.push(runtimeKey);
 const machine = await MachineClient.create(owner.origin, runtimeKey), machineIdentity = await MachineClient.identity(machine);
 const grant = await owner.grantMachine(vault, object, machineIdentity, machineIdentity.fingerprint);
 assert.equal((await MachineClient.read(machine, grant, runtimeKey, { fetcher })).secret, 'synthetic-latchkey-955');
 const before = await archive(records), journalBefore = (await db.prepare('SELECT COUNT(*) AS n FROM rer_portability_journal').first()).n;
 const revision = (await owner.readVault(vault)).revision;
 assert.equal((await owner.call('item/erasure-status', { vault, object })).erased, false);
 await rejects(owner.call('item/erase', { vault, object, confirmed: false, revision }), 'erasure_confirmation_required');
 await rejects(member.call('item/erase', { vault, object, confirmed: true, revision }), 'not_found');
 await rejects(member.call('item/erasure-status', { vault, object }), 'not_found');
 await rejects(owner.call('item/erase', { vault, object, confirmed: true, revision: revision - 1 }), 'version_conflict');
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=? AND object_id=?').bind(vault, object).first()).n, 2);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM rer_portability_journal').first()).n, journalBefore);
 assert.equal((await records.exports.status(before.job)).phase, 'complete');
 await rejects(owner.call('item/erase', { vault, object, confirmed: true, revision }), 'invalid_erasure_proof');
 const connected = new VaultClient(owner.origin, { fetcher });
 await connected.unlock(structuredClone(owner.profile), ownerPassword);
 await connected.readVault(vault);
 assert.ok(Object.keys(connected.profile.seen[vault].versions).some(name => name.startsWith(object + ':')));
 const erased = await owner.eraseItem(vault, object, { confirmed: true, revision });
 assert.ok(!(await connected.readVault(vault)).versions.some(row => row.object === object));
 assert.equal(connected.profile.seen[vault].erased[object], true);
 await rejects(connected.put(vault, original, object), 'item_erased');
 const savedProof = await db.prepare('SELECT proof FROM lky_erased_items WHERE vault_id=? AND object_id=?').bind(vault, object).first();
 const forged = JSON.parse(savedProof.proof); forged.signature = encode(random(64));
 await db.prepare('UPDATE lky_erased_items SET proof=? WHERE vault_id=? AND object_id=?').bind(JSON.stringify(forged), vault, object).run();
 await rejects(connected.readVault(vault), 'invalid_erasure_proof');
 await db.prepare('UPDATE lky_erased_items SET proof=? WHERE vault_id=? AND object_id=?').bind(savedProof.proof, vault, object).run(); connected.lock();
 assert.equal(erased.erased, true); assert.equal(erased.replayFence, true);
 assert.equal(erased.deleted.lky_versions, 2); assert.equal(erased.deleted.lky_links, 2); assert.equal(erased.deleted.lky_link_challenges, 1); assert.equal(erased.deleted.lky_share_keys, 2); assert.equal(erased.deleted.lky_shares, 1); assert.equal(erased.deleted.lky_machines, 1);
 assert.equal((await owner.call('item/erasure-status', { vault, object })).receipt, erased.receipt);
 assert.equal((await owner.eraseItem(vault, object, { confirmed: true, revision })).receipt, erased.receipt);
 await rejects(records.exports.status(before.job), 'job_not_found');
 for (const [table, sql, args] of [
  ['versions', 'SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=? AND object_id=?', [vault, object]],
  ['links', 'SELECT COUNT(*) AS n FROM lky_links WHERE vault_id=? AND object_id=?', [vault, object]],
  ['challenges', 'SELECT COUNT(*) AS n FROM lky_link_challenges WHERE link_id=?', [link.link]],
  ['keys', 'SELECT COUNT(*) AS n FROM lky_share_keys WHERE object_id=?', [object]],
  ['machines', 'SELECT COUNT(*) AS n FROM lky_machines WHERE vault_id=? AND object_id=?', [vault, object]],
  ['copies', "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*')", []],
 ]) assert.equal((await (args.length ? db.prepare(sql).bind(...args) : db.prepare(sql)).first()).n, 0, table);
 assert.equal((await owner.readItem(vault, kept.object)).versions[0].value.secret, 'synthetic-latchkey-956');
 assert.equal((await owner.readVault(vault)).versions.length, 1);
 assert.equal((await recipient.read(mixed.share, kept.object)).value.secret, 'synthetic-latchkey-956');
 await rejects(owner.readItem(vault, object, true), 'not_found');
 await rejects(owner.put(vault, original, object), 'item_erased');
 await rejects(recipient.read(exclusive.share, object), 'share_unavailable');
 await rejects(recipient.read(mixed.share, object), 'share_unavailable');
 await rejects(publicLink.preview(), 'link_unavailable');
 await rejects(publicLink.open(challenge.challenge, verification), 'link_unavailable'); publicLink.lock();
 await rejects(MachineClient.read(machine, grant, runtimeKey, { fetcher }), 'machine_authority_expired');
 const events = (await owner.call('audit', {})).filter(event => event.action === 'item_erased' && event.object_id === object);
 assert.equal(events.length, 1); assert.equal(events[0].actor, owner.profile.account);
 for (const secret of privateValues) assert.ok(!JSON.stringify(events).includes(secret));
 const after = await archive(records), laterJournal = { sourceIdentity: after.lines[0].sourceIdentity, epoch: after.lines[0].epoch, journal: after.lines[0].journal };
 assert.ok(laterJournal.epoch > before.lines[0].epoch && laterJournal.journal.length > before.lines[0].journal.length);
 const archiveRows = after.lines.filter(line => line.kind === 'part').flatMap(part => part.items).filter(item => item.kind === 'row');
 assert.ok(!archiveRows.some(item => item.table === 'lky_versions' && item.row.object_id === object));
 assert.ok(!archiveRows.some(item => item.table === 'lky_links' && item.row.object_id === object));
 assert.ok(archiveRows.some(item => item.table === 'lky_erased_items' && item.row.object_id === object));
 console.log('Item erasure: explicit owner confirmation, stale-revision refusal, all histories/attachments/link copies/wraps/runtime deletion, value-free attributed receipt, idempotency, same-object replay fence and in-flight Base transfer invalidation passed');
 return { privateValues, erasedArchive: before.text, laterJournal, vault, object };
}

// A fresh, real Base destination must get a trusted latest journal. Without
// that independently retained journal it cannot discover later source erasure.
export async function refuseErasedArchive({ destination, erasedArchive, laterJournal, subjectRedaction = false }) {
 const lines = erasedArchive.trim().split('\n').map(line => JSON.parse(line)), manifest = lines[0], closing = lines.at(-1);
 const imported = await destination.imports.create(manifest, 'synthetic-latchkey-959');
 for (const part of lines.slice(1, -1)) await destination.imports.uploadPart(imported, part.index, part);
 await assert.rejects(destination.imports.finalize(imported, { archiveHash: closing.archiveHash, contentHash: closing.contentHash, laterJournal }), error => subjectRedaction ? error.code === 'erasure_epoch' : /^erased_row:/.test(error.code));
 await destination.imports.abort(imported);
 console.log(`Records ${subjectRedaction ? 'person redaction' : 'item erasure'} replay: the actual Base fence refuses a downloaded pre-erasure archive with the trusted later journal; it does not silently prune erased records`);
}
