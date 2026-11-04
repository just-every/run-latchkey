// Called by the real emitted-Worker journey after Base has completed import and
// the destination owner has independently enrolled/recovered a trusted device.
import assert from 'node:assert/strict';
import {ReportsClient} from '../src/latchkey/reports/client.mjs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planDestinationRewrap, approveDestinationRewrap } from '../src/latchkey/portability/rewrap.mjs';
import { PortabilityClient } from '../src/latchkey/portability/client.mjs';
import { ApiClient } from '../src/latchkey/api/client.mjs';
import {HealthClient} from '../src/latchkey/health/client.mjs';
import {createItem} from '../src/latchkey/items/types.mjs';
import { digest } from '../src/latchkey/crypto/envelope.mjs';

const identity = client => ({ account: client.profile.account, tenant: client.profile.tenant, recipientKey: client.profile.recipientKey, authorityKey: client.profile.authorityKey });
const fingerprint = value => digest(JSON.stringify([value.recipientKey, value.authorityKey]));
const ownerRights = ['read', 'create', 'edit', 'export', 'share', 'rotate','delete','restore'];
const refused = promise => assert.rejects(promise, error => typeof error.code === 'string' && error.status >= 400);

export async function exerciseRecordsRestore({ archive, sourceClient, destinationClient, wrongPersonClient, expectedVersions, healthRestore }) {
 const scratch = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-54-'));
 try {
  const input = join(scratch, 'source.rer'); await writeFile(input, archive, { mode: 0o600 });
  const source = identity(sourceClient), destination = identity(destinationClient);
  assert.notEqual(source.account, destination.account);
  assert.equal(source.tenant, destination.tenant);
  const sourceFingerprint = await fingerprint(source), destinationFingerprint = await fingerprint(destination);
  const { plan, planHash } = await planDestinationRewrap({ input, source, destination, sourceFingerprint, destinationFingerprint });
  assert.ok(plan.vaults.length > 0);
  // Merely recovering/enrolling an installation owner grants no values.
  for (const vault of plan.vaults) await refused(destinationClient.readVault(vault.vault));
  const observations={};for(const vault of plan.vaults)if(vault.reportKey){await refused(new ReportsClient(destinationClient).history(vault.vault));observations[vault.vault]=(await new ReportsClient(sourceClient).history(vault.vault)).observations;}assert.ok(Object.keys(observations).length>0);
  const approval = await approveDestinationRewrap({ input, plan, approvedPlanHash: planHash, client: sourceClient, purpose: 'synthetic-latchkey-55', expiresAt: Date.now() + 300000 });
  // Restore through the published REST aliases while preserving the real
  // destination-side cryptographic preparation and activation client.
  const api = new ApiClient(destinationClient), transport = Object.create(destinationClient);
  transport.call = (route, input) => {
   if (route === 'archive/prepare') return api.prepareImport(input);
   if (route === 'archive/status') return api.operation(input.restore);
   if (route === 'archive/activate') { const { restore, ...body } = input; return api.activateImport(restore, body); }
   return destinationClient.call(route, input);
  };
  const preparedInput = { plan, approval, sourceFingerprint, destinationFingerprint }, portability = new PortabilityClient(transport);
  const tampered = structuredClone(preparedInput); tampered.plan.contentHash = '0'.repeat(64);
  await refused(destinationClient.call('archive/prepare', tampered));
  const prepared = await portability.prepare(preparedInput);
  assert.equal(prepared.phase, 'prepared'); assert.equal(prepared.activeAuthority, false);
  assert.deepEqual(prepared.rights, []);
  assert.equal((await portability.prepare(preparedInput)).restore, prepared.restore);
  for (const vault of plan.vaults) await refused(destinationClient.readVault(vault.vault));
  if (wrongPersonClient) {
   await refused(wrongPersonClient.call('archive/prepare', preparedInput));
   await refused(new PortabilityClient(wrongPersonClient).status(prepared.restore));
  }
  await refused(destinationClient.call('archive/activate', { restore: prepared.restore, approvedPlanHash: 'synthetic-latchkey-56', activation: 'synthetic-latchkey-57', rights: ownerRights, wraps: [] }));
  const activated = await portability.activate({ restore: prepared.restore, approvedPlanHash: planHash, activation: 'synthetic-latchkey-57', rights: ownerRights });
  assert.equal(activated.phase, 'activated'); assert.equal(activated.activeAuthority, true);
  for (const vault of plan.vaults) {
   if(observations[vault.vault])assert.deepEqual((await new ReportsClient(destinationClient).history(vault.vault)).observations,observations[vault.vault]);
   const read = await destinationClient.readVault(vault.vault);
   if (expectedVersions?.[vault.vault]) assert.deepEqual(read.versions, expectedVersions[vault.vault]);
   const exported = await destinationClient.snapshot(vault.vault, 'export'); exported.key.fill(0);
   assert.equal(exported.result.owner, destination.account);
   // Rewrapping vault access cannot transfer the original actor's personal suppression.
   const health=await new HealthClient(destinationClient).inspect(vault.vault);
   const expected=healthRestore?.vault===vault.vault?healthRestore.memberHistory:[];
   assert.deepEqual(health.history.map(row=>({reason:row.reason,observation:row.observation})),expected);
   assert.ok(health.history.every(row=>row.active===false));
   assert.ok(health.findings.every(finding=>finding.suppression===null));
   if(healthRestore?.vault===vault.vault){
    assert.equal(health.riskCount,1);assert.equal(health.findings[0].object,healthRestore.item);
    assert.deepEqual(health.legacyHistory.map(row=>({reason:row.reason,active:row.active})),[{reason:'Synthetic restore legacy',active:false}]);
    const freshHealth=new HealthClient(destinationClient);
    await freshHealth.suppress(vault.vault,health.findings[0],{reason:'Synthetic fresh destination decision'});
    const fresh=await freshHealth.inspect(vault.vault);
    assert.equal(fresh.riskCount,1);assert.equal(fresh.findings[0].suppression.reason,'Synthetic fresh destination decision');
    assert.deepEqual(fresh.history.map(row=>row.active),[false,false,true]);
   }
  }
  const auditBefore = await destinationClient.call('audit', {});
  const repeated = await portability.activate({ restore: prepared.restore, approvedPlanHash: planHash, activation: 'synthetic-latchkey-57', rights: ownerRights });
  assert.equal(repeated.restore, prepared.restore);
  const auditAfter = await destinationClient.call('audit', {});
  assert.equal(auditAfter.filter(event => event.action === 'archive_restore_activated' && event.object_id === prepared.restore).length, 1);
  assert.equal(auditAfter.length, auditBefore.length);
  return { restore: prepared.restore, planHash, vaults: activated.vaults, unapprovedVaults: activated.unapprovedVaults };
 } finally { await rm(scratch, { recursive: true, force: true }); }
}

// Called before the existing Records archive, then checked after its real rewrap.
export async function prepareHealthHistoryRestore(client,member){
 const vault=(await client.createVault()).vault,health=new HealthClient(client);
 const item=await client.put(vault,createItem('login',{title:'Synthetic restore health',values:{password:'aaaa'}}));
 const finding=(await health.inspect(vault)).findings.find(r=>r.object===item.object&&r.code==='weak-password');assert.ok(finding);
 await health.suppress(vault,finding,{reason:'Synthetic restore investigation'});
 await health.suppress(vault,finding,{reason:'Synthetic restore dismissal'});
 const history=await health.history(vault);assert.deepEqual(history.map(r=>r.reason),['Synthetic restore investigation','Synthetic restore dismissal']);
 await member.pinAccount(client.profile.account,await client.identity().fingerprint);
 await client.share(vault,member.profile.account,await member.identity().fingerprint,['read']);
 const memberHealth=new HealthClient(member),memberFinding=(await memberHealth.inspect(vault)).findings[0];
 await memberHealth.suppress(vault,memberFinding,{reason:'Synthetic member restore snooze',until:Date.now()+3600000});
 await memberHealth.suppress(vault,memberFinding,{reason:'Synthetic member restore dismissal'});
 await assert.rejects(member.put(vault,createItem('login',{title:'Forbidden restore member edit'}),item.object,1),error=>error.status===403);
 await client.put(vault,{schema:'latchkey/health-suppression/v1',object:item.object,version:1,code:'weak-password',reason:'Synthetic restore legacy',until:null,actor:member.profile.account,observation:finding.observation??{source:finding.source,observedAt:finding.observedAt,code:finding.code,version:finding.version},recordedAt:Date.now()});
 const memberHistory=(await memberHealth.history(vault)).map(row=>({reason:row.reason,observation:row.observation}));
 assert.deepEqual(memberHistory.map(row=>row.reason),['Synthetic member restore snooze','Synthetic member restore dismissal']);
 return {vault,item:item.object,memberHistory,rows:[...(await client.call(['health','history'].join('/'),{vault})).rows,...(await member.call(['health','history'].join('/'),{vault})).rows]};
}

// One installation-scale sanity journey. Every person is invited, confirms the
// native identity link and enrolls through the emitted Worker's public doors.
export async function serviceRecoveryRehearsal({ directory, checkout, command, withBindings }) {
 const { readFile, stat } = await import('node:fs/promises');
 const { createServer } = await import('node:net');
 const { vaultFixture } = await import('./browser/fixture.mjs');
 const { VaultClient } = await import('../src/latchkey/client.mjs');
 const { createPortability } = await import('@runeditrun/rer/modules/portability');
 const { default: policy } = await import('../scripts/latchkey/archive-policy.mjs');
 const { sealRecordsArchive, openRecordsArchive } = await import('../src/latchkey/portability/archive.mjs');
 const { createAttachment, attachmentBytes } = await import('../src/latchkey/items/attachments.mjs');
 const { bytes, encode, random, id, itemKey, seal } = await import('../src/latchkey/crypto/envelope.mjs');
 const { SharingClient, PublicLinkClient } = await import('../src/latchkey/sharing/client.mjs');
 const { AutomationClient } = await import('../src/latchkey/automation/client.mjs');
 const route = (...parts) => parts.join('/');
 const source = await vaultFixture({ browserEnabled: false, webhook: true });
 let destination, sourceClosed = false, second;
 try {
  // Distinct source members have distinct edge addresses; ordinary invitation
  // and confirmation limits stay enabled rather than deleting limiter records.
  let requestNumber = 0;
  const sourceFetcher = (url, init = {}) => source.fetcher(url, { ...init, headers: { ...init.headers,
   'cf-connecting-ip': `192.0.${Math.floor(requestNumber / 250)}.${++requestNumber % 250 + 1}` } });
  const owner = source.owner; owner.fetcher = sourceFetcher;
  const owners = [{ name: 'Synthetic primary owner', kit: structuredClone(source.enrolled.kit), password: source.password }];
  let secondEnrollment;
  for (let index = 1; index < 1000; index++) {
   const email = [`synthetic-latchkey-rehearsal-${index}`, 'example.test'].join('@');
   await owner.call(route('api', 'users', 'invite'), { email, displayName: `Synthetic member ${index}`, role: 'member', returnTo: '/app/vault' });
   const token = new URL(source.mail.at(-1).content.find(part => part.type === ['text', 'plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
   const member = new VaultClient(source.origin, { fetcher: sourceFetcher });
   await member.confirmIdentity(token);
   const password = `synthetic-latchkey-password-${index}`, enrolled = await member.register(password);
   if (index === 1) {
    second = member; secondEnrollment = enrolled;
    owners.push({ name: 'Synthetic continuity owner', kit: structuredClone(enrolled.kit), password });
   } else member.lock();
   if (index % 100 === 0) console.log(`Recovery source: ${index + 1} real enrolled members`);
  }
  const roster = await owner.call(route('api', 'users', 'list'), {});
  assert.equal(roster.length, 1000); assert.ok(roster.every(person => person.status === 'active'));
  const nativePost = (path, input) => sourceFetcher(source.origin + path, { method: 'POST', headers: { origin: source.origin,
   'content-type': 'application/json', cookie: owner.cookie }, body: JSON.stringify(input), redirect: 'manual' });
  assert.equal((await nativePost('/auth/step-up', { action: 'owner:transfer', returnTo: '/app' })).status, 202);
  const stepToken = new URL(source.mail.at(-1).content.find(part => part.type === ['text', 'plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  assert.equal((await nativePost('/auth/confirm', { token: stepToken })).status, 303);
  const continuity = roster.find(person => person.email === ['synthetic-latchkey-rehearsal-1', 'example.test'].join('@'));
  assert.equal((await nativePost('/auth/operator/role', { operatorId: continuity.id, role: 'owner' })).status, 200);
  await second.unlock(secondEnrollment.profile, owners[1].password);
  const automation = new AutomationClient(owner);
  const subscription = await automation.subscribe({ endpoint: 'https://receiver.example.test/hook', events: ['vault_created'], secret: encode(random()), confirmed: true });
  const vault = (await owner.createVault()).vault;
  // Capture the real event before the bulk writes fill the legacy audit window.
  const event = (await owner.call('audit', {})).find(row => row.action === 'vault_created' && row.object_id === vault); assert.ok(event);
  const delivery = await automation.enqueue(subscription.id, subscription.revision, event.id, true);
  assert.match(delivery.id, /^[0-9a-f-]{36}$/);
  for (let attempt = 0; attempt < 3; attempt++) {
   const sent = await automation.dispatch(subscription.id, subscription.revision, delivery.id, true);
   assert.equal(sent.phase, attempt === 2 ? 'accepted' : 'backlog');
  }
  assert.equal(source.webhooks.length, 3);
  const expected = [], attachmentInventory = [], snapshot = await owner.snapshot(vault);
  let revision = snapshot.result.revision;
  try {
   for (let index = 0; index < 1000; index++) {
    const object = id(), attachment = await createAttachment(`Synthetic attachment ${index}`, new TextEncoder().encode(`synthetic-latchkey-content-${index}`));
    const key = await itemKey(snapshot.key, owner.profile.tenant, vault, object);
    try {
     for (let version = 1; version <= (index < 100 ? 2 : 1); version++) {
      const value = createItem('secure-note', { title: `Synthetic item ${index}`, values: { note: `synthetic-latchkey-value-${index}-${version}` }, attachments: [attachment] });
      const envelope = await seal(key, bytes(value), { tenant: owner.profile.tenant, vault, object, purpose: 'item', epoch: snapshot.result.epoch, version });
      const result = await owner.call(route('item', 'put'), { vault, object, version, revision, envelope });
      revision = result.revision;
      expected.push({ object, version, value }); attachmentInventory.push({ object, version, digest: attachment.digest, size: attachment.size });
     }
    } finally { key.fill(0); }
   }
  } finally { snapshot.key.fill(0); }
  assert.equal(expected.length, 1100); assert.equal(new Set(expected.map(row => row.object)).size, 1000);
  const secondFingerprint = await second.identity().fingerprint;
  await second.pinAccount(owner.profile.account, await owner.identity().fingerprint);
  await owner.share(vault, second.profile.account, secondFingerprint, ['read']);
  const sharing = new SharingClient(owner), share = await sharing.grant(vault, { recipients: [{ account: second.profile.account, fingerprint: secondFingerprint }], objects: [expected[0].object] });
  assert.match(share.share ?? share.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual((await new SharingClient(second).read(share.share ?? share.id, expected[0].object)).value, expected[1].value);
  await sharing.setPolicy({ externalEnabled: true, domains: ['example.test'], defaultDays: 7, maxDays: 30 });
  const link = await sharing.createLink(vault, expected[0].object, { recipient: ['synthetic-latchkey-recipient', 'example.test'].join('@') });
  const scheduledAt = Date.now(), definition = { title: 'Synthetic continuity rotation', kind: 'rotation', vault,
   targets: [{ object: expected[0].object, version: 2, dueAt: scheduledAt }], severity: 'critical', recipients: [owner.profile.account],
   startAt: scheduledAt, intervalMs: 86400000, windowMs: 3600000, maxEffects: 1 };
  const rule = (await owner.call(route('rules', 'save'), { rule: null, version: 0, definition })).id;
  const preview = await owner.call(route('rules', 'preview'), { definition });
  await owner.call(route('rules', 'activate'), { rule, version: 1, previewHash: preview.hash, confirmed: true });
  await source.schedule(scheduledAt);
  const obligation = (await owner.call(route('rules', 'get'), { rule })).obligations[0]; assert.ok(obligation);
  const decided = await owner.call(route('rules', 'decide'), { rule, version: 1, obligation: obligation.id, decision: 'approve', confirmed: true });
  assert.equal(decided.obligations.find(row => row.id === obligation.id).phase, 'approved');
  const records = await createPortability({ db: source.db, policy }), job = await records.exports.create('synthetic-latchkey-rehearsal');
  while ((await records.exports.advance(job, { maxParts: 100 })).phase !== 'complete') {}
  const raw = await new Response(await records.exports.download(job)).text(), archive = join(directory, 'archive.rer'), encrypted = join(directory, 'archive.lky');
  await writeFile(archive, raw, { mode: 0o600 });
  const manifest = JSON.parse(raw.split('\n')[0]), exportKey = encode(random());
  const sealed = await sealRecordsArchive({ input: archive, output: encrypted, exportKey });
  assert.equal(sealed.tables.find(row => row.name === 'lky_accounts').count, 1000);
  assert.equal(sealed.tables.find(row => row.name === 'lky_versions').count, 1100);
  const socket = createServer(); await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const approvedOrigin = `https://127.0.0.1:${port}`;
  const variables = { LATCHKEY_ERASURE_SECRET: source.erasureSecret, OWNER_EMAIL: roster.find(person => person.role === 'owner').email,
   SESSION_SECRET: 'synthetic-latchkey-fresh-session'.repeat(3), SETUP_TOKEN: 'synthetic-latchkey-fresh-setup'.repeat(3),
   AUTH_ORIGIN: approvedOrigin, MAIL_PROVIDER: 'sendgrid', MAIL_FROM: ['synthetic-latchkey-mail', 'example.test'].join('@') };
  const restoreConfiguration = join(directory, 'configuration.json');
  await writeFile(restoreConfiguration, JSON.stringify({ schema: 1, sourceIdentity: manifest.sourceIdentity, variables }), { mode: 0o600 });
  for (const [index, material] of owners.entries()) {
   const path = join(directory, `kit-${index}.json`); await writeFile(path, JSON.stringify(material.kit), { mode: 0o600 }); material.kit = path;
  }
  // Destroy the source installation and all unlocked original clients. Only the
  // separately retained encrypted archive, factors, configuration and inventory
  // cross this boundary; no old device profile is passed to the destination.
  const oldToken = second.token, sourceOrigin = source.origin;
  second.lock(); secondEnrollment.profile = null; source.enrolled.profile = null;
  await source.close(); sourceClosed = true;
  await rm(archive);
  await assert.rejects(fetch(sourceOrigin + '/health'), 'the source service is stopped');
  const root = await checkout(directory, 'fresh-installation'), checkpoint = join(directory, 'restore-checkpoint.json');
  const input = { input: encrypted, exportKey, owners, restoreConfiguration, approvedOrigin }, restoreInput = { ...input, checkpoint, confirmed: true, partsPerRun: 128, finalize: true };
  const failures = [
   { ...restoreInput, owners: owners.slice(0, 1) },
   { ...restoreInput, exportKey: encode(random()) },
   { ...restoreInput, owners: owners.map((owner, index) => index ? { ...owner, password: 'synthetic-latchkey-wrong-password' } : owner) },
   { ...restoreInput, owners: owners.map((owner, index) => index ? { ...owner, kit: owners[0].kit } : owner) },
   { ...restoreInput, restoreConfiguration: join(directory, 'missing-configuration.json') },
  ];
  for (const invalid of failures) {
   await command(root, invalid, 1, 'records-recovery-restore');
   await assert.rejects(stat(join(root, '.wrangler')), { code: 'ENOENT' });
   await assert.rejects(stat(checkpoint), { code: 'ENOENT' });
  }
  const wrongKit = join(directory, 'wrong-kit.json');
  await writeFile(wrongKit, JSON.stringify({ ...JSON.parse(await readFile(owners[1].kit, 'utf8')), recoverySecret: encode(random()) }), { mode: 0o600 });
  const wrong = await command(root, { ...restoreInput, owners: [owners[0], { ...owners[1], kit: wrongKit }] }, 1, 'records-recovery-restore');
  assert.equal(wrong.error, 'recovery_material_invalid'); await assert.rejects(stat(join(root, '.wrangler')), { code: 'ENOENT' });
  const wrongConfiguration = join(directory, 'wrong-configuration.json');
  await writeFile(wrongConfiguration, JSON.stringify({ schema: 1, sourceIdentity: 'synthetic-latchkey-foreign-installation', variables }), { mode: 0o600 });
  assert.equal((await command(root, { ...restoreInput, restoreConfiguration: wrongConfiguration }, 1, 'records-recovery-restore')).error, 'restore_configuration_invalid');
  await assert.rejects(stat(join(root, '.wrangler')), { code: 'ENOENT' });
  const checked = await command(root, input, 0, 'records-recovery-check');
  assert.deepEqual([checked.members, checked.enrolledAccounts, checked.owners, checked.items, checked.versions], [1000, 1000, 2, 1000, 1100]);
  for (const secret of [exportKey, ...owners.map(owner => owner.password)]) assert.ok(!JSON.stringify(checked).includes(secret));
  for (const owner of owners) assert.ok(!JSON.stringify(checked).includes(JSON.parse(await readFile(owner.kit, 'utf8')).recoverySecret));
  await assert.rejects(stat(join(root, '.wrangler')), { code: 'ENOENT' });
  const restored = await command(root, restoreInput, 0, 'records-recovery-restore');
  assert.equal(restored.phase, 'complete'); assert.equal(restored.inactive, true);
  const repeat = await command(root, restoreInput, 0, 'records-recovery-restore'); assert.equal(repeat.job, restored.job);
  await withBindings(root, async db => {
   for (const [table, count] of [['oa_operators', 1000], ['lky_accounts', 1000], ['lky_versions', 1100]]) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, count);
   for (const table of ['lky_devices', 'lky_grants']) assert.equal((await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n, 0);
   assert.ok((await db.prepare('SELECT rights FROM lky_recipients').all()).results.every(row => row.rights === '[]'));
   assert.equal((await db.prepare('SELECT active FROM lky_rules WHERE id=?').bind(rule).first()).active, 0);
   assert.equal((await db.prepare('SELECT phase FROM lky_rule_obligations WHERE id=?').bind(obligation.id).first()).phase, 'inactive');
  });
  destination = await vaultFixture({ browserEnabled: false, webhook: true, enrollOwner: false, localRoot: root, port, restoreVariables: variables });
  assert.equal(destination.origin, approvedOrigin);
  assert.equal((await destination.fetcher(approvedOrigin + '/api/latchkey/vaults', { method: 'POST', headers: { origin: approvedOrigin,
   'content-type': 'application/json', 'x-latchkey-grant': oldToken }, body: '{}' })).status, 401);
  const recovered = [];
  for (const material of owners) {
   const client = new VaultClient(approvedOrigin, { fetcher: destination.fetcher }), kit = { ...JSON.parse(await readFile(material.kit, 'utf8')), origin: approvedOrigin };
   await assert.rejects(client.recover({ ...kit, recoverySecret: encode(random()) }, material.password));
   const enrollment = await client.recover(kit, material.password);
   assert.equal(enrollment.profile.generation, kit.generation + 1);
   await client.unlock(enrollment.profile, material.password);
   await refused(client.readVault(vault)); recovered.push(client);
  }
  const opened = join(directory, 'opened.rer'); await openRecordsArchive({ input: encrypted, output: opened, exportKey });
  const from = identity(recovered[0]), to = identity(recovered[1]), sourceFingerprint = await fingerprint(from), destinationFingerprint = await fingerprint(to);
  const { plan, planHash } = await planDestinationRewrap({ input: opened, source: from, destination: to, sourceFingerprint, destinationFingerprint });
  const approval = await approveDestinationRewrap({ input: opened, plan, approvedPlanHash: planHash, client: recovered[0], purpose: 'Synthetic offline service recovery', expiresAt: Date.now() + 300000 });
  const portability = new PortabilityClient(recovered[1]);
  const prepared = await portability.prepare({ plan, approval, sourceFingerprint, destinationFingerprint });
  await refused(recovered[1].readVault(vault));
  await assert.rejects(portability.activate({ restore: prepared.restore, approvedPlanHash: planHash, activation: '', rights: ownerRights }));
  const activated = await portability.activate({ restore: prepared.restore, approvedPlanHash: planHash, activation: 'Synthetic explicit fresh authority', rights: ownerRights });
  assert.equal(activated.activeAuthority, true);
  await refused(recovered[0].readVault(vault));
  const actual = (await recovered[1].readVault(vault)).versions;
  const order = (a, b) => a.object.localeCompare(b.object) || a.version - b.version;
  assert.deepEqual(actual.toSorted(order), expected.toSorted(order));
  assert.equal(new Set(actual.map(row => row.object)).size, 1000); assert.equal(actual.length, 1100);
  const attachments = [];
  for (const row of actual) for (const file of row.value.attachments) {
   const content = await attachmentBytes(file);
   attachments.push({ object: row.object, version: row.version, digest: await digest(content), size: content.length });
  }
  assert.deepEqual(attachments.toSorted(order), attachmentInventory.toSorted(order)); assert.equal(attachments.length, 1100);
  const recipient = recovered[1], restoredSharing = new SharingClient(recipient);
  await refused(restoredSharing.read(share.share ?? share.id, expected[0].object));
  const restoredLink = new PublicLinkClient(link.url.replace(sourceOrigin, approvedOrigin), { fetcher: destination.fetcher });
  await assert.rejects(restoredLink.preview());
  await assert.rejects(new AutomationClient(recovered[0]).dispatch(subscription.id, subscription.revision, delivery.id, true));
  await assert.rejects(recovered[0].call(route('rules', 'complete'), { rule, version: 1, obligation: obligation.id, resultVersion: 2, confirmed: true }));
  const runsBefore = (await destination.db.prepare('SELECT COUNT(*) AS n FROM lky_rule_runs').first()).n;
  await destination.schedule(scheduledAt + 86400000);
  assert.equal((await destination.db.prepare('SELECT COUNT(*) AS n FROM lky_rule_runs').first()).n, runsBefore);
  assert.equal(destination.webhooks.length, 0); assert.equal(destination.mail.length, 0);
  const current = await recipient.readVault(vault); assert.deepEqual(current.versions.toSorted(order), expected.toSorted(order));
  for (const client of recovered) client.lock();
  await destination.close(); destination = null;
  assert.equal((await command(root, restoreInput, 0, 'records-recovery-restore')).job, restored.job);
  await withBindings(root, async db => {
   for (const account of [from.account, to.account]) assert.equal((await db.prepare('SELECT generation FROM lky_accounts WHERE id=?').bind(account).first()).generation, 2);
   assert.equal((await db.prepare('SELECT owner FROM lky_vaults WHERE id=?').bind(vault).first()).owner, to.account);
  });
  console.log('PROBE LKY-056 independent materials: stopped source and unavailable original profiles -> two retained owner kits checked without source requests; missing and wrong material refused before destination writes');
  console.log('PROBE LKY-056 clean-machine restore: real Base export and local CLI import -> two fresh recovered owners, exact explicit rewrap and activation');
  console.log('PROBE LKY-056 scale reconciliation: 1000 real enrolled people, 1000 items, 1100 versions -> every value and 1100 attachment digests matched');
  console.log('PROBE LKY-056 inactive operations: old token, direct grant, link, send, schedule and approved rotation -> refused or no effects after restore and after fresh vault activation');
 } finally {
  second?.lock(); if (!sourceClosed) await source.close(); await destination?.close();
 }
}
