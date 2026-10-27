import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { recordsCommand } from '../scripts/latchkey/records-commands.mjs';
import { encode, random, id, keypair, digest, wrapSigned, unwrapSigned } from '../src/latchkey/crypto/envelope.mjs';

const fromWrangler = createRequire(import.meta.resolve('wrangler/package.json'));
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = fromWrangler('miniflare');

test('Records commands preserve a real Base archive and reject corrupt, truncated, foreign-key and mismatched-journal output atomically', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-40-'));
 const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-latchkey-41")}}', compatibilityDate: '2026-09-08', d1Databases: { DB: 'synthetic-latchkey-42', OTHER: 'synthetic-latchkey-52' }, log: new Log(LogLevel.ERROR) }));
 try {
  const db = await runtime.getD1Database('DB');
  const { unstable_splitSqlQuery } = await import('wrangler');
  const bookkeeping = await readFile(new URL('../node_modules/@runeditrun/rer/modules/portability/schema/portability.sql', import.meta.url), 'utf8');
  await db.batch(unstable_splitSqlQuery(bookkeeping).map(sql => db.prepare(sql)));
  await db.exec('CREATE TABLE notes (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
  await db.prepare('INSERT INTO notes VALUES (?,?)').bind('synthetic-latchkey-43', 'synthetic-latchkey-44'.repeat(20000)).run();
  const service = await createPortability({ db, policy: { product: 'synthetic-latchkey-45' } });
  const job = await service.exports.create();
  while ((await service.exports.advance(job, { maxParts: 10 })).phase !== 'complete') {}
  const raw = await new Response(await service.exports.download(job)).text();
  const input = join(directory, 'raw.rer'), sealed = join(directory, 'sealed.rer'), output = join(directory, 'opened.rer');
  await writeFile(input, raw, { mode: 0o600 });
  const exportKey = encode(random());
  const exported = await recordsCommand('records-seal', { input, output: sealed, exportKey });
  const imported = await recordsCommand('records-open', { input: sealed, output, exportKey });
  assert.equal(await readFile(output, 'utf8'), raw);
  assert.equal(imported.archiveHash, exported.archiveHash);
  assert.match(imported.erasure.warning, /trusted later journal/);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  assert.ok(!(await readFile(sealed, 'utf8')).includes('synthetic-latchkey-44'));
  await assert.rejects(recordsCommand('records-open', { input: sealed, output, exportKey }));
  const lines = (await readFile(sealed, 'utf8')).trim().split('\n');
  const cases = [
   lines.slice(0, -1).join('\n') + '\n',
   [lines[0], lines[2], lines[1], ...lines.slice(3)].join('\n') + '\n',
   lines.map((line, index) => index === 1 ? line.replace(/"ciphertext":"./, '"ciphertext":"!') : line).join('\n') + '\n',
   lines.join('\n') + '\n' + lines.at(-1) + '\n',
  ];
  for (const [index, damaged] of cases.entries()) {
   const corrupt = join(directory, `corrupt-${index}.rer`), absent = join(directory, `absent-${index}.rer`);
   await writeFile(corrupt, damaged, { mode: 0o600 });
   await assert.rejects(recordsCommand('records-open', { input: corrupt, output: absent, exportKey }));
   await assert.rejects(stat(absent), { code: 'ENOENT' });
  }
  const absent = join(directory, 'wrong-key.rer');
  await assert.rejects(recordsCommand('records-open', { input: sealed, output: absent, exportKey: encode(random()) }));
  await assert.rejects(stat(absent), { code: 'ENOENT' });
  const otherDb = await runtime.getD1Database('OTHER');
  await otherDb.batch(unstable_splitSqlQuery(bookkeeping).map(sql => otherDb.prepare(sql)));
  const other = await createPortability({ db: otherDb, policy: { product: 'synthetic-latchkey-45' } }), otherJob = await other.exports.create();
  while ((await other.exports.advance(otherJob, { maxParts: 10 })).phase !== 'complete') {}
  const laterJournal = join(directory, 'foreign-journal.rer'), journalOutput = join(directory, 'journal-denied.rer');
  await writeFile(laterJournal, await new Response(await other.exports.download(otherJob)).text(), { mode: 0o600 });
  await assert.rejects(recordsCommand('records-open', { input: sealed, output: journalOutput, exportKey, laterJournal }), /later_journal/);
  await assert.rejects(stat(journalOutput), { code: 'ENOENT' });
  const corruptRaw = join(directory, 'corrupt-raw.rer'), refusedSeal = join(directory, 'seal-denied.rer');
  await writeFile(corruptRaw, raw.replace('synthetic-latchkey-44', 'synthetic-latchkey-53'), { mode: 0o600 });
  await assert.rejects(recordsCommand('records-seal', { input: corruptRaw, output: refusedSeal, exportKey }));
  await assert.rejects(stat(refusedSeal), { code: 'ENOENT' });
  assert.ok(!(await readdir(directory)).some(name => name.endsWith('.partial')));
 } finally { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('Records rewrap approval binds the verified owners, destination, archive and vault revision without activating historical grants', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-46-'));
 const runtime = new Miniflare(convertV4MiniflareOptions({ modules: true, script: 'export default {fetch(){return new Response("synthetic-latchkey-47")}}', compatibilityDate: '2026-09-08', d1Databases: { DB: 'synthetic-latchkey-48' }, log: new Log(LogLevel.ERROR) }));
 try {
  const db = await runtime.getD1Database('DB'), { unstable_splitSqlQuery } = await import('wrangler');
  await db.batch(unstable_splitSqlQuery(await readFile(new URL('../node_modules/@runeditrun/rer/modules/portability/schema/portability.sql', import.meta.url), 'utf8')).map(sql => db.prepare(sql)));
  const recipient = await keypair('wrap'), authority = await keypair('sign'), destinationRecipient = await keypair('wrap'), destinationAuthority = await keypair('sign');
  const source = { account: id(), tenant: id(), recipientKey: recipient.publicKey, authorityKey: authority.publicKey };
  const destination = { account: id(), tenant: id(), recipientKey: destinationRecipient.publicKey, authorityKey: destinationAuthority.publicKey };
  const sourceFingerprint = await digest(JSON.stringify([source.recipientKey, source.authorityKey]));
  const destinationFingerprint = await digest(JSON.stringify([destination.recipientKey, destination.authorityKey]));
  const vault = id(), key = random(), context = { tenant: source.tenant, vault, object: source.account, purpose: 'vault-key', epoch: 1, version: 1 };
  const wrapped = await wrapSigned(key, source.recipientKey, context, source.account, authority.privateKey);
  await db.exec('CREATE TABLE lky_accounts (id TEXT PRIMARY KEY, tenant TEXT, recipient_key TEXT, authority_key TEXT); CREATE TABLE lky_vaults (id TEXT PRIMARY KEY, tenant TEXT, owner TEXT, epoch INTEGER, revision INTEGER); CREATE TABLE lky_recipients (vault_id TEXT, account_id TEXT, wrapped_key TEXT, rights TEXT, PRIMARY KEY(vault_id,account_id))');
  await db.batch([
   db.prepare('INSERT INTO lky_accounts VALUES (?,?,?,?)').bind(source.account, source.tenant, source.recipientKey, source.authorityKey),
   db.prepare('INSERT INTO lky_vaults VALUES (?,?,?,?,?)').bind(vault, source.tenant, source.account, 1, 1),
   db.prepare('INSERT INTO lky_recipients VALUES (?,?,?,?)').bind(vault, source.account, JSON.stringify(wrapped), '["read","export"]'),
  ]);
  const service = await createPortability({ db, policy: { product: 'synthetic-latchkey-49' } }), job = await service.exports.create();
  while ((await service.exports.advance(job, { maxParts: 10 })).phase !== 'complete') {}
  const input = join(directory, 'raw.rer');
  await writeFile(input, await new Response(await service.exports.download(job)).text(), { mode: 0o600 });
  const { plan, planHash } = await recordsCommand('records-rewrap-plan', { input, source, destination, sourceFingerprint, destinationFingerprint });
  const client = { profile: { ...source }, bundle: { root: { recipient, authority } } };
  const args = { input, plan, approvedPlanHash: planHash, purpose: 'synthetic-latchkey-50', expiresAt: Date.now() + 60000 };
  const approval = await recordsCommand('records-rewrap-approve', args, { client });
  const verified = await recordsCommand('records-rewrap-verify', { plan, approval, sourceFingerprint, destinationFingerprint });
  assert.equal(verified.activeAuthority, false);
  assert.deepEqual(approval.decision.wraps[0].rights, []);
  const reopened = await unwrapSigned(approval.decision.wraps[0].wrapped, destinationRecipient.privateKey, source.authorityKey, source.account, { ...context, object: destination.account });
  assert.deepEqual(reopened, key); reopened.fill(0); key.fill(0);
  await assert.rejects(recordsCommand('records-rewrap-plan', { input, source, destination, sourceFingerprint, destinationFingerprint: sourceFingerprint }), /recipient_confirmation_required/);
  await assert.rejects(recordsCommand('records-rewrap-approve', { ...args, plan: { ...plan, vaults: [{ ...plan.vaults[0], revision: 2 }] } }, { client }), /approval_plan_changed/);
  await assert.rejects(recordsCommand('records-rewrap-approve', { ...args, approvedPlanHash: 'synthetic-latchkey-51' }, { client }), /approval_plan_changed/);
  await assert.rejects(recordsCommand('records-rewrap-verify', { plan, approval, sourceFingerprint, destinationFingerprint, now: args.expiresAt }), /rewrap_approval_invalid/);
  const changed = structuredClone(approval); changed.decision.destination.tenant = id();
  await assert.rejects(recordsCommand('records-rewrap-verify', { plan, approval: changed, sourceFingerprint, destinationFingerprint }), /rewrap_approval_invalid/);
  const active = structuredClone(approval); active.decision.wraps[0].rights = ['read'];
  await assert.rejects(recordsCommand('records-rewrap-verify', { plan, approval: active, sourceFingerprint, destinationFingerprint }));
 } finally { await runtime.dispose(); await rm(directory, { recursive: true, force: true }); }
});

test('Passbolt CLI keeps a real KDBX preview encrypted and refuses a wrong passphrase without output', async () => {
 const { passboltFixture } = await import('./fixtures/passbolt.mjs');
 const { spawn } = await import('node:child_process');
 const fixture = await passboltFixture(), directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1480-'));
 const cli = (command, input, preload) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [...(preload ? ['--import', preload] : []), 'scripts/latchkey.mjs', command], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify(input));
 });
 try {
  const kdbx = join(directory, 'source.kdbx'), metadata = join(directory, 'metadata.json'), output = join(directory, 'preview.json');
  await writeFile(kdbx, fixture.data, { mode: 0o600 }); await writeFile(metadata, JSON.stringify(fixture.metadata), { mode: 0o600 });
  const input = { kdbx, metadata, output, passphrase: fixture.passphrase, mapping: fixture.mapping, sourceOrigin: fixture.sourceOrigin, sourceUser: fixture.sourceUser, previewKey: encode(random()) };
  const wrong = await cli('passbolt-preview', { ...input, passphrase: 'synthetic-latchkey-1481' });
  assert.equal(wrong.code, 1); assert.deepEqual(JSON.parse(wrong.stderr), { error: 'kdbx_cannot_decrypt' }); await assert.rejects(stat(output), { code: 'ENOENT' });
  const result = await cli('passbolt-preview', input); assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).items, 2); assert.equal(JSON.parse(result.stdout).blocked, 1);
  assert.equal((await stat(output)).mode & 0o777, 0o600);
  const encrypted = await readFile(output, 'utf8');
  for (const secret of [fixture.passphrase, 'synthetic-latchkey-1430', 'synthetic-latchkey-1450', 'synthetic-latchkey-1470', 'synthetic-latchkey-1471']) assert.ok(!(encrypted + result.stdout + result.stderr).includes(secret));
  for (const [index, options] of [{ withKeyfile: true }, { keyfileOnly: true }].entries()) {
   const keyed = await passboltFixture(options), keyedSource = join(directory, `keyed-${index}.kdbx`), keyfile = join(directory, `source-${index}.key`), keyedOutput = join(directory, `keyed-preview-${index}.json`);
   await writeFile(keyedSource, keyed.data, { mode: 0o600 }); await writeFile(keyfile, keyed.keyfile, { mode: 0o600 });
   const keyedInput = { ...input, kdbx: keyedSource, output: keyedOutput, mapping: keyed.mapping, passphrase: keyed.passphrase };
   const missingKey = await cli('passbolt-preview', keyedInput);
   assert.equal(missingKey.code, 1); await assert.rejects(stat(keyedOutput), { code: 'ENOENT' });
   const withKey = await cli('passbolt-preview', { ...keyedInput, keyfile }); assert.equal(withKey.code, 0, withKey.stderr);
  }
  const deniedKeyOutput = join(directory, 'wrong-key.json');
  const wrongPreviewKey = await cli('passbolt-review', { preview: output, previewKey: encode(random()), output: deniedKeyOutput, confirmed: true });
  assert.equal(wrongPreviewKey.code, 1); await assert.rejects(stat(deniedKeyOutput), { code: 'ENOENT' });
  const review = join(directory, 'review.json');
  const denied = await cli('passbolt-review', { preview: output, previewKey: input.previewKey, output: review }); assert.equal(denied.code, 1); await assert.rejects(stat(review), { code: 'ENOENT' });
  const opened = await cli('passbolt-review', { preview: output, previewKey: input.previewKey, output: review, confirmed: true }); assert.equal(opened.code, 0, opened.stderr);
  const report = JSON.parse(await readFile(review)); assert.equal(report.hash, JSON.parse(result.stdout).hash);
  assert.equal(report.plan.rows[0].item.fields.find(field => field.id === 'secretNote').value, 'synthetic-latchkey-1440\nsecond line');
  assert.equal(report.plan.rows[0].item.fields.find(field => field.id === 'description').value, 'synthetic-latchkey-1450');
  assert.ok(!JSON.stringify(report).includes('synthetic-latchkey-1470')); assert.ok(!JSON.stringify(report).includes('synthetic-latchkey-1471'));
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Passbolt preview preserves TOTP and expiry while unresolved source identities and recipients block approval', async () => {
 const { passboltFixture } = await import('./fixtures/passbolt.mjs');
 const { previewPassbolt } = await import('../src/latchkey/migration/passbolt.mjs');
 const { totp } = await import('../src/latchkey/totp/index.mjs');
 const fixture = await passboltFixture(), { plan } = await previewPassbolt(fixture);
 for (const row of plan.rows) {
  assert.equal((await totp(row.item.fields.find(field => field.id === 'totp').value, 59000)).code, '94287082');
  assert.equal(row.item.fields.find(field => field.id === 'expiry').value, '2030-01-02T00:00:00.000Z');
  assert.deepEqual(row.recovered, ['description_recovered_separately_from_secret_note']);
 }
 assert.deepEqual(plan.rows[0].gaps, []); assert.ok(plan.rows[1].gaps.includes('shared_recipient_or_ownership_mapping_required'));
 const unknown = await previewPassbolt({ ...fixture, metadata: undefined, mapping: [] });
 assert.ok(unknown.plan.rows.every(row => row.gaps.includes('source_description_unknown') && row.gaps.includes('source_recipients_unknown')));
 await assert.rejects(previewPassbolt({ ...fixture, mapping: [fixture.mapping[0], fixture.mapping[0]] }), { code: 'ambiguous_source_mapping' });
 const changed = structuredClone(fixture.metadata); changed.body[0].name = 'synthetic-latchkey-1482';
 assert.ok((await previewPassbolt({ ...fixture, metadata: changed })).plan.rows[0].gaps.includes('source_identity_discrepancy'));
});

test('Passbolt private import binds approval to a reviewed item and refuses company destinations, sharing and replay', async () => {
 const { passboltFixture } = await import('./fixtures/passbolt.mjs');
 const { previewPassbolt, importPassboltItem } = await import('../src/latchkey/migration/passbolt.mjs');
 const { vaultFixture } = await import('./browser/fixture.mjs');
 const { VaultClient } = await import('../src/latchkey/client.mjs');
 const fixture = await passboltFixture(), { plan, hash } = await previewPassbolt(fixture), f = await vaultFixture({ browserEnabled: false });
 try {
  const vault = (await f.owner.createVault({ kind: 'family' })).vault;
  const input = { approvedHash: hash, entry: fixture.entries[0], vault, confirmed: true, ownership: 'personal' };
  await assert.rejects(importPassboltItem(f.owner, plan, { ...input, approvedHash: 'synthetic-latchkey-1483' }), { code: 'migration_approval_mismatch' });
  await assert.rejects(importPassboltItem(f.owner, plan, { ...input, entry: fixture.entries[1] }), { code: 'migration_discrepancies_unresolved' });
  const company = (await f.owner.createVault()).vault;
  await assert.rejects(importPassboltItem(f.owner, plan, { ...input, vault: company }), { code: 'personal_destination_required' });
  assert.equal((await f.owner.readVault(company)).versions.length, 0);
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1491-'));
  let result;
  try {
   const { passboltCommand } = await import('../scripts/latchkey/passbolt-commands.mjs');
   const { spawn } = await import('node:child_process');
   const profile = join(directory, 'profile.json'), source = join(directory, 'source.kdbx'), metadata = join(directory, 'metadata.json'), preview = join(directory, 'preview.json'), previewKey = encode(random());
   await writeFile(profile, JSON.stringify(f.owner.profile), { mode: 0o600 });
   await writeFile(source, fixture.data, { mode: 0o600 }); await writeFile(metadata, JSON.stringify(fixture.metadata), { mode: 0o600 });
   await passboltCommand('passbolt-preview', { ...fixture, data: undefined, kdbx: source, metadata, output: preview, previewKey });
   const invoke = (command, value) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/latchkey.mjs', command], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_EXTRA_CA_CERTS: f.caFile } });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify(value));
   });
   const created = await invoke('vault-create', { profile, password: f.password, kind: 'family' }); assert.equal(created.code, 0, created.stderr);
   const cliVault = JSON.parse(created.stdout).vault;
   assert.equal((await f.owner.call('vaults', {})).find(row => row.id === cliVault).kind, 'family');
   const imported = await invoke('passbolt-import', { profile, password: f.password, preview, previewKey, ...input }); assert.equal(imported.code, 0, imported.stderr);
   for (const secret of [fixture.passphrase, f.password, 'synthetic-latchkey-1430', 'synthetic-latchkey-1470']) assert.ok(!(imported.stdout + imported.stderr).includes(secret));
   result = JSON.parse(imported.stdout);
  } finally { await rm(directory, { recursive: true, force: true }); }

  const read = await f.owner.readVault(vault); assert.equal(read.versions.length, 1); assert.equal(read.versions[0].object, result.object);
  assert.equal(read.versions[0].value.fields.find(field => field.id === 'password').value, 'synthetic-latchkey-1430');
  await assert.rejects(importPassboltItem(f.owner, plan, input), { code: 'empty_destination_required' });
  const archiveKey = encode(random()), archive = await f.owner.exportVault(vault, archiveKey), restored = await VaultClient.openExport(archive, archiveKey);
  assert.equal(restored.versions[0].value.migration.cutoverComplete, false);
  for (const secret of ['synthetic-latchkey-1470', 'synthetic-latchkey-1471']) assert.ok(!JSON.stringify(restored).includes(secret));
  const stored = JSON.stringify((await f.db.prepare('SELECT envelope FROM lky_versions WHERE vault_id=?').bind(vault).all()).results);
  assert.ok(!stored.includes('synthetic-latchkey-1430') && !stored.includes(fixture.passphrase));
 } finally { await f.close(); }
});

test('Passbolt CSV command preserves quoted multiline values and recovers omitted expiry without accepting malformed rows', async () => {
 const { passboltCsvFixture } = await import('./fixtures/passbolt.mjs');
 const { passboltCommand } = await import('../scripts/latchkey/passbolt-commands.mjs');
 const { totp } = await import('../src/latchkey/totp/index.mjs');
 const fixture = await passboltCsvFixture(), directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1490-'));
 try {
  const csv = join(directory, 'source.csv'), metadata = join(directory, 'metadata.json'), output = join(directory, 'preview.json'), review = join(directory, 'review.json'), previewKey = encode(random());
  await writeFile(csv, fixture.data, { mode: 0o600 }); await writeFile(metadata, JSON.stringify(fixture.metadata), { mode: 0o600 });
  const receipt = await passboltCommand('passbolt-preview', { ...fixture, data: undefined, csv, metadata, output, previewKey });
  assert.equal(receipt.items, 2); assert.equal(receipt.blocked, 1);
  await passboltCommand('passbolt-review', { preview: output, previewKey, output: review, confirmed: true });
  const { plan } = JSON.parse(await readFile(review));
  assert.equal(plan.rows[0].item.fields.find(field => field.id === 'secretNote').value, 'synthetic-latchkey-1440\nsecond line, with "quotes"');
  assert.equal(plan.rows[0].item.fields.find(field => field.id === 'expiry').value, '2030-01-02T00:00:00.000Z');
  assert.equal((await totp(plan.rows[0].item.fields.find(field => field.id === 'totp').value, 59000)).code, '94287082');
  await writeFile(csv, 'Title,Username,URL,Password,Notes,Group,TOTP\n"unclosed', { mode: 0o600 });
  await assert.rejects(passboltCommand('passbolt-preview', { ...fixture, data: undefined, csv, metadata, output: join(directory, 'bad.json'), previewKey }), { code: 'invalid_passbolt_csv' });
  await assert.rejects(stat(join(directory, 'bad.json')), { code: 'ENOENT' });
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Posture inspection reads official inventory edges without confusing missing controls, identity or freshness with health', async () => {
 const { readPosture } = await import('../src/latchkey/posture/read.mjs');
 const now = Date.parse('2026-10-25T12:00:00Z'), at = '2026-10-25T11:59:00Z';
 const device = 'synthetic-latchkey-2602', serial = 'synthetic-latchkey-2603', token = 'synthetic-latchkey-2601';
 const cases = [
  ['jamf', 'https://synthetic-latchkey-2604.jamfcloud.com', `/api/v3/computers-inventory-detail/${device}`, {id:device,hardware:{serialNumber:serial},general:{reportDate:at,remoteManagement:{managed:true}},diskEncryption:{fileVault2Enabled:true},operatingSystem:{version:'15.1'},security:{autoLoginDisabled:true,activationLockEnabled:true}}],
  ['kandji', 'https://synthetic-latchkey-2604.api.kandji.io', `/api/v1/devices/${device}/details`, {general:{device_id:device,os_version:'15.1'},hardware_overview:{serial_number:serial},mdm:{mdm_enabled:'True',last_check_in:at},kandji_agent:{last_check_in:at},filevault:{filevault_enabled:true},recovery_information:{recovery_lock_enabled:true}}],
  ['intune', 'https://graph.microsoft.com', `/v1.0/deviceManagement/managedDevices/${device}?$select=id,serialNumber,lastSyncDateTime,isEncrypted,osVersion,managementAgent`, {id:device,serialNumber:serial,lastSyncDateTime:at,isEncrypted:true,osVersion:'15.1',managementAgent:'mdm',complianceState:'compliant'}],
 ];
 for (const [source,origin,path,payload] of cases) {
  const input = {source,origin,token,device,serial,maxAgeMs:3600000};
  let calls = 0;
  const edge = body => ({now,fetcher:async(url,options)=>{
   calls++; assert.equal(url,origin+path); assert.equal(options.method,'GET'); assert.equal(options.redirect,'error');
   assert.equal(options.credentials,'omit'); assert.equal(options.headers.authorization,`Bearer ${token}`);
   return Response.json({...body,unrelatedSecret:token,ownerEmail:'synthetic-latchkey-2605@example.test'});
  }});
  const healthy = await readPosture(input,edge(payload));
  assert.equal(healthy.matched,true); assert.equal(healthy.freshness,'fresh');
  assert.deepEqual(healthy.controls,{encrypted:true,osVersion:'15.1',managed:true,screenLock:null});
  assert.equal(healthy.observedAt,Date.parse(at));
  assert.ok(!JSON.stringify(healthy).includes(token)); assert.ok(!JSON.stringify(healthy).includes('ownerEmail'));
  const mismatch = await readPosture({...input,serial:'synthetic-latchkey-2606'},edge(payload));
  assert.equal(mismatch.matched,false);assert.equal(mismatch.freshness,'unknown');assert.deepEqual(Object.values(mismatch.controls),[null,null,null,null]);assert.equal(mismatch.observedAt,null);
  const stale = await readPosture(input,{...edge(payload),now:now+3600000});assert.equal(stale.freshness,'stale');
  const future = await readPosture(input,{...edge(payload),now:now-120000});assert.equal(future.freshness,'unknown');
  const absent = await readPosture(input,edge({}));assert.equal(absent.matched,false);assert.equal(absent.freshness,'unknown');
  const unhealthy = structuredClone(payload);
  if(source==='jamf'){unhealthy.diskEncryption.fileVault2Enabled=false;unhealthy.general.remoteManagement.managed=false;}
  if(source==='kandji'){unhealthy.filevault.filevault_enabled=false;unhealthy.mdm.mdm_enabled='False';}
  if(source==='intune'){unhealthy.isEncrypted=false;unhealthy.managementAgent='eas';}
  assert.equal((await readPosture(input,edge(unhealthy))).controls.encrypted,false);
  assert.equal((await readPosture(input,edge(unhealthy))).controls.managed,false);
  for(const status of [302,401,403,429,503])await assert.rejects(readPosture(input,{now,fetcher:async()=>new Response(token,{status})}),error=>error.code.startsWith('posture_')&&!error.message.includes(token));
  await assert.rejects(readPosture(input,{now,fetcher:async()=>{throw Error(token)}}),{code:'posture_source_unavailable'});
  await assert.rejects(readPosture(input,{now,fetcher:async()=>new Response('x'.repeat(262145))}),{code:'posture_response_too_large'});
  await assert.rejects(readPosture(input,{now,fetcher:async()=>new Response('{')}),{code:'posture_source_unavailable'});
  const directory = await mkdtemp(join(tmpdir(), 'latchkey-posture-cli-'));
  try {
   const preload = join(directory, 'edge.mjs');
   await writeFile(preload, `globalThis.fetch=async(url,options)=>{if(url!==${JSON.stringify(origin+path)}||options.method!=='GET'||options.redirect!=='error')throw Error('unexpected edge');return Response.json(${JSON.stringify(payload)})};`);
   const { spawnSync } = await import('node:child_process');
   const run = input => spawnSync(process.execPath, ['--import', preload, 'scripts/latchkey.mjs', 'posture-inspect'], {input:JSON.stringify(input),encoding:'utf8'});
   const accepted = run(input); assert.equal(accepted.status,0,accepted.stderr);
   assert.equal(JSON.parse(accepted.stdout).matched,true);assert.ok(!accepted.stdout.includes(token));
   const refused = run({...input,origin:'https://unapproved.example.test'});assert.equal(refused.status,1);assert.equal(JSON.parse(refused.stderr).error,'unapproved_posture_origin');
  } finally { await rm(directory,{recursive:true,force:true}); }
  const before = calls;
  await assert.rejects(readPosture({...input,origin:'https://unapproved.example.test'},edge(payload)),{code:'unapproved_posture_origin'});
  await assert.rejects(readPosture({...input,device:'../other'},edge(payload)),{code:'posture_identifier_required'});
  await assert.rejects(readPosture({...input,token:'synthetic-latchkey-2601\n'},edge(payload)),{code:'posture_credential_required'});
  assert.equal(calls,before);
 }
 await assert.rejects(readPosture({source:'linen'},{fetcher:()=>{throw Error('must not call')}}),{code:'linen_posture_schema_unavailable'});
});

test('Bitwarden CLI decrypts portable exports locally and stages only encrypted previews with explicit plaintext review', async () => {
 const { spawn } = await import('node:child_process');
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1610-'));
 const cli = (command, input, preload) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [...(preload ? ['--import', preload] : []), 'scripts/latchkey.mjs', command], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify(input));
 });
 const previewKey = encode(random()), base = { source: 'bitwarden', sourceOrigin: 'https://vault.bitwarden.example.test', sourceOwner: 'synthetic-latchkey-1600', previewKey };
 try {
  for (const variant of ['plain', 'portable', 'argon2', 'argon2-alternate']) {
   const input = join(directory, `${variant}.json`), output = join(directory, `${variant}-preview.json`), review = join(directory, `${variant}-review.json`);
   await writeFile(input, await readFile(new URL(`./fixtures/migration/bitwarden-${variant}.json`, import.meta.url)), { mode: 0o600 });
   if (variant !== 'plain') {
    const denied = await cli('migration-preview', { ...base, input, output, passphrase: 'synthetic-latchkey-1611' });
    assert.equal(denied.code, 1); assert.match(denied.stderr, /bitwarden_cannot_decrypt/); await assert.rejects(stat(output), { code: 'ENOENT' });
   }
   const receipt = await cli('migration-preview', { ...base, input, output, passphrase: 'synthetic-latchkey-1607' });
   assert.equal(receipt.code, 0, receipt.stderr); assert.equal(JSON.parse(receipt.stdout).counts.ready, 1);
   assert.equal((await stat(output)).mode & 0o777, 0o600);
   for (const secret of ['synthetic-latchkey-1604', 'synthetic-latchkey-1606', 'synthetic-latchkey-1607']) assert.ok(!(await readFile(output, 'utf8') + receipt.stdout + receipt.stderr).includes(secret));
   assert.equal((await cli('migration-review', { preview: output, previewKey, output: review })).code, 1); await assert.rejects(stat(review), { code: 'ENOENT' });
   assert.equal((await cli('migration-review', { preview: output, previewKey, output: review, confirmed: true })).code, 0);
   const { plan, hash } = JSON.parse(await readFile(review));
   assert.equal(hash, JSON.parse(receipt.stdout).hash); assert.equal(plan.rows[0].item.fields.find(field => field.id === 'sourceNote').value, 'synthetic-latchkey-1602\n日本語');
   const { totp } = await import('../src/latchkey/totp/index.mjs');
   assert.equal((await totp(plan.rows[0].item.fields.find(field => field.id === 'totp').value, 59000)).code, '287082');
   assert.equal(plan.rows[0].item.urls[0].match, 'never-fill'); assert.equal(plan.tasks.length, 5);
   assert.equal(plan.reconciliation.find(row => row.class === 'totp').exported, 1);
   assert.ok(plan.reconciliation.every(row => row.sourceTotal === null && row.imported === 0));
  }
  const { previewMigration } = await import('../src/latchkey/migration/core.mjs');
  const organized = JSON.parse(await readFile(new URL('./fixtures/migration/bitwarden-plain.json', import.meta.url)));
  organized.folders = [{ id: 'synthetic-latchkey-1640', name: ['synthetic-latchkey-1641', 'synthetic-latchkey-1642'].join('/') }];
  organized.collections = [{ id: 'synthetic-latchkey-1643', name: 'synthetic-latchkey-1644' }];
  organized.items[0].folderId = organized.folders[0].id; organized.items[0].collectionIds = [];
  const folderPreview = await previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(organized)) });
  assert.equal(folderPreview.plan.folders.length, 2); assert.deepEqual(folderPreview.plan.rows[0].folders, ['synthetic-latchkey-1640']);
  organized.items[0].reprompt = 1;
  assert.ok((await previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(organized)) })).plan.rows[0].gaps.includes('source_reprompt_requires_review'));
  for (const [source, error] of [[{ encrypted: true, passwordProtected: false }, 'bitwarden_account_restricted_export'], [{ encrypted: true, passwordProtected: true, kdfType: 2 }, 'unsupported_bitwarden_kdf']]) await assert.rejects(previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(source)) }), { code: error });
  for (const variant of ['portable', 'argon2', 'argon2-alternate']) {
   const portable = JSON.parse(await readFile(new URL(`./fixtures/migration/bitwarden-${variant}.json`, import.meta.url)));
   for (const field of ['data', 'encKeyValidation_DO_NOT_EDIT']) {
    const changed = structuredClone(portable), parts = changed[field].slice(2).split('|');
    const ciphertext = Buffer.from(parts[1], 'base64'); ciphertext[0] ^= 1; parts[1] = ciphertext.toString('base64'); changed[field] = '2.' + parts.join('|');
    const input = join(directory, 'tampered.json'), output = join(directory, 'tampered-preview.json');
    await writeFile(input, JSON.stringify(changed), { mode: 0o600 });
    const refused = await cli('migration-preview', { ...base, input, output, passphrase: 'synthetic-latchkey-1607' });
    assert.equal(refused.code, 1); assert.match(refused.stderr, /bitwarden_cannot_decrypt/); await assert.rejects(stat(output), { code: 'ENOENT' });
   }
  }
  // The loader records and forwards every invocation to the real KDF so
  // hostile export metadata must refuse before allocation, independently of time.
  const marker = join(directory, 'kdf-called'), preload = join(directory, 'kdf-loader.mjs');
  await writeFile(join(directory, 'kdf-recorder.mjs'), `import { argon2id as derive } from ${JSON.stringify(import.meta.resolve('hash-wasm'))}; export async function argon2id(...args) { (await import('node:fs')).appendFileSync(${JSON.stringify(marker)}, 'called'); return derive(...args); }`);
  await writeFile(preload, `import { registerHooks } from 'node:module'; const url = new URL('./kdf-recorder.mjs', import.meta.url).href; registerHooks({ resolve(specifier, context, next) { return specifier === 'hash-wasm' ? { url, shortCircuit: true } : next(specifier, context); } });`);
  const portable = JSON.parse(await readFile(new URL('./fixtures/migration/bitwarden-argon2.json', import.meta.url)));
  const input = join(directory, 'bounded.json'), output = join(directory, 'bounded-preview.json');
  await writeFile(input, JSON.stringify(portable), { mode: 0o600 });
  const valid = await cli('migration-preview', { ...base, input, output, passphrase: 'synthetic-latchkey-1607' }, preload);
  assert.equal(valid.code, 0, valid.stderr); assert.equal(JSON.parse(valid.stdout).counts.ready, 1); assert.equal(await readFile(marker, 'utf8'), 'called'); await rm(marker); await rm(output);
  const invalid = [];
  for (const field of ['kdfIterations', 'kdfMemory', 'kdfParallelism']) {
   for (const value of [undefined, null, 0, -1, 1.5, '3', Number.MAX_SAFE_INTEGER, 1e100]) invalid.push({ ...portable, [field]: value });
  }
  invalid.push({ ...portable, kdfIterations: 11 }, { ...portable, kdfMemory: 257 }, { ...portable, kdfParallelism: 17 }, { ...portable, kdfMemory: 256, kdfIterations: 5 });
  for (const source of invalid) {
   await writeFile(input, JSON.stringify(source), { mode: 0o600 });
   const refused = await cli('migration-preview', { ...base, input, output, passphrase: 'synthetic-latchkey-1607' }, preload);
   assert.equal(refused.code, 1); assert.match(refused.stderr, /invalid_bitwarden_kdf/);
   await assert.rejects(stat(output), { code: 'ENOENT' }); await assert.rejects(stat(marker), { code: 'ENOENT' });
   assert.ok(!(refused.stdout + refused.stderr).includes('synthetic-latchkey-1607'));
  }
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('LastPass 40-folder CSV preview reconciles duplicates and omissions without inferring shared permissions', async () => {
 const Papa = (await import('papaparse')).default;
 const { migrationCommand } = await import('../scripts/latchkey/migration-commands.mjs');
 const { previewMigration } = await import('../src/latchkey/migration/core.mjs');
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1620-'));
 const records = Array.from({ length: 40 }, (_, index) => ({ url: 'https://synthetic-latchkey.example.test', username: `synthetic-latchkey-${1700 + index}`, password: `synthetic-latchkey-${1800 + index}`, extra: '日本語\nsecond line, "quoted"', name: `synthetic-latchkey-${1900 + index}`, grouping: `synthetic-latchkey-${2000 + index}`, fav: '0' }));
 records.push({ ...records[0] });
 const mapping = records.map((row, index) => ({ row: index + 1, id: `synthetic-latchkey-${index === 40 ? 2100 : 2100 + index}` }));
 const base = { source: 'lastpass', sourceOrigin: 'https://lastpass.example.test', sourceOwner: 'synthetic-latchkey-1621', mapping };
 try {
  const input = join(directory, 'source.csv'), output = join(directory, 'preview.json'), review = join(directory, 'review.json'), previewKey = encode(random());
  const csv = Papa.unparse(records, { quotes: true }); await writeFile(input, csv, { mode: 0o600 });
  const receipt = await migrationCommand('migration-preview', { ...base, input, output, previewKey });
  assert.equal(receipt.folders, 40); assert.deepEqual(receipt.counts, { source: 41, imported: 0, duplicate: 1, rejected: 40, ready: 0 });
  await migrationCommand('migration-review', { preview: output, previewKey, output: review, confirmed: true });
  const { plan } = JSON.parse(await readFile(review));
  assert.equal(plan.rows[0].item.fields.find(field => field.id === 'sourceNote').value, records[0].extra);
  assert.ok(plan.rows.filter(row => !row.duplicate).every(row => row.gaps.includes('shared_rights_and_owner_mapping_required')));
  assert.ok(plan.tasks.every(task => task.owner === base.sourceOwner && task.state === 'unresolved')); assert.equal(plan.cutoverComplete, false);
  assert.equal((await stat(output)).mode & 0o777, 0o600); assert.ok(!(await readFile(output, 'utf8')).includes(records[0].password));
  const data = new TextEncoder().encode(csv);
  await assert.rejects(previewMigration({ ...base, data, mapping: [] }), { code: 'lastpass_stable_id_mapping_required' });
  await assert.rejects(previewMigration({ ...base, data: new TextEncoder().encode(csv + '\n"malformed') }), { code: 'invalid_lastpass_csv' });
  const conflicting = [...records]; conflicting[40] = { ...records[0], password: 'synthetic-latchkey-1622' };
  await assert.rejects(previewMigration({ ...base, data: new TextEncoder().encode(Papa.unparse(conflicting)) }), { code: 'conflicting_source_identity' });
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Migration personal batches resume and apply deltas without overwriting a destination correction or widening authority', async () => {
 const { previewMigration, importMigration } = await import('../src/latchkey/migration/core.mjs');
 const { vaultFixture } = await import('./browser/fixture.mjs');
 const encrypted = new Uint8Array(await readFile(new URL('./fixtures/migration/bitwarden-argon2.json', import.meta.url)));
 const { readBitwarden } = await import('../src/latchkey/migration/bitwarden.mjs');
 const data = new TextEncoder().encode(JSON.stringify(await readBitwarden(encrypted, 'synthetic-latchkey-1607')));
 const base = { source: 'bitwarden', sourceOrigin: 'https://vault.bitwarden.example.test', sourceOwner: 'synthetic-latchkey-1600' };
 const { plan, hash } = await previewMigration({ ...base, data: encrypted, passphrase: 'synthetic-latchkey-1607' }), f = await vaultFixture({ browserEnabled: false });
 try {
  const vault = (await f.owner.createVault({ kind: 'family' })).vault, input = { vault, confirmed: true, ownership: 'personal', sourceOwner: base.sourceOwner, approvedHash: hash };
  await assert.rejects(importMigration(f.owner, plan, { ...input, confirmed: false }), { code: 'personal_import_confirmation_required' });
  await assert.rejects(importMigration(f.owner, plan, { ...input, approvedHash: 'synthetic-latchkey-1630' }), { code: 'migration_approval_mismatch' });
  const company = (await f.owner.createVault()).vault;
  await assert.rejects(importMigration(f.owner, plan, { ...input, vault: company }), { code: 'personal_destination_required' });
  const { ApiClient } = await import('../src/latchkey/api/client.mjs'), { VaultClient } = await import('../src/latchkey/client.mjs');
  await new ApiClient(f.owner).inviteUser({ email: 'synthetic-latchkey-1647@example.test', displayName: 'Migration recipient', role: 'member' });
  const link = f.mail.at(-1).content.find(row => row.type.endsWith('plain')).value.match(/https:\/\/[^\s<>]+/)[0];
  const member = new VaultClient(f.origin, { fetcher: f.fetcher });
  try {
   await member.confirmIdentity(new URL(link).searchParams.get('token'));
   const enrolled = await member.register('synthetic-latchkey-1648'); await member.unlock(enrolled.profile, 'synthetic-latchkey-1648');
   const sharedVault = (await f.owner.createVault({ kind: 'family' })).vault, identity = member.identity();
   await f.owner.share(sharedVault, identity.account, await identity.fingerprint, ['read']);
   await assert.rejects(importMigration(f.owner, plan, { ...input, vault: sharedVault }), { code: 'private_destination_required' });
   assert.equal((await f.owner.readVault(sharedVault)).versions.length, 0);
  } finally { member.lock(); }
  const shared = JSON.parse(new TextDecoder().decode(data)); shared.items[0].organizationId = 'synthetic-latchkey-1631';
  const sharedPreview = await previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(shared)) });
  await assert.rejects(importMigration(f.owner, sharedPreview.plan, { ...input, approvedHash: sharedPreview.hash }), { code: 'migration_discrepancies_unresolved' });
  assert.equal((await f.owner.readVault(vault)).versions.length, 0);
  const batchSource = JSON.parse(new TextDecoder().decode(data)); batchSource.items.push({ ...batchSource.items[0], id: 'synthetic-latchkey-1634', name: 'synthetic-latchkey-1635' });
  const batch = await previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(batchSource)) }), batchVault = (await f.owner.createVault({ kind: 'family' })).vault;
  const batchInput = { ...input, vault: batchVault, approvedHash: batch.hash }, put = f.owner.put.bind(f.owner); let attempted = 0;
  f.owner.put = async (...args) => { if (++attempted === 2) throw Error('synthetic-latchkey-1636'); return put(...args); };
  await assert.rejects(importMigration(f.owner, batch.plan, batchInput), /synthetic-latchkey-1636/); f.owner.put = put;
  assert.equal((await f.owner.readVault(batchVault)).versions.length, 1);
  const resumed = await importMigration(f.owner, batch.plan, batchInput); assert.equal(resumed.imported, 1); assert.equal(resumed.unchanged, 1);
  assert.equal((await f.owner.readVault(batchVault)).versions.length, 2);
  const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1645-'));
  try {
   const { migrationCommand } = await import('../scripts/latchkey/migration-commands.mjs'), { spawn } = await import('node:child_process');
   const source = join(directory, 'source.json'), profile = join(directory, 'profile.json'), preview = join(directory, 'preview.json'), previewKey = encode(random());
   await writeFile(source, encrypted, { mode: 0o600 }); await writeFile(profile, JSON.stringify(f.owner.profile), { mode: 0o600 });
   await migrationCommand('migration-preview', { ...base, input: source, output: preview, previewKey, passphrase: 'synthetic-latchkey-1607' });
   const receipt = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/latchkey.mjs', 'migration-import'], { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, NODE_EXTRA_CA_CERTS: f.caFile } });
    let stdout = '', stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk); child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr })); child.stdin.end(JSON.stringify({ ...input, profile, password: f.password, preview, previewKey }));
   });
   assert.equal(receipt.code, 0, receipt.stderr); assert.equal(JSON.parse(receipt.stdout).imported, 1);
   assert.ok(!(receipt.stdout + receipt.stderr).includes('synthetic-latchkey-1604'));
  } finally { await rm(directory, { recursive: true, force: true }); }
  assert.equal((await importMigration(f.owner, plan, input)).unchanged, 1);
  let rows = await f.owner.readVault(vault); assert.equal(rows.versions.length, 1);
  const changed = JSON.parse(new TextDecoder().decode(data)); changed.items[0].login.password = 'synthetic-latchkey-1632';
  const delta = await previewMigration({ ...base, data: new TextEncoder().encode(JSON.stringify(changed)) });
  assert.equal((await importMigration(f.owner, delta.plan, { ...input, approvedHash: delta.hash })).imported, 1);
  rows = await f.owner.readVault(vault); assert.equal(new Set(rows.versions.map(row => row.object)).size, 1); assert.equal(rows.versions.length, 2);
  const current = rows.versions.find(row => row.version === 2); current.value.fields.find(field => field.id === 'password').value = 'synthetic-latchkey-1633';
  await f.owner.put(vault, current.value, current.object, 2, rows.revision);
  assert.equal((await importMigration(f.owner, delta.plan, { ...input, approvedHash: delta.hash })).unchanged, 1);
  await assert.rejects(importMigration(f.owner, plan, input), { code: 'migration_destination_changed' });
  rows = await f.owner.readVault(vault); assert.equal(rows.versions.length, 3); assert.equal(rows.versions.find(row => row.version === 3).value.fields.find(field => field.id === 'password').value, 'synthetic-latchkey-1633');
  const audit = JSON.stringify(await f.owner.call('audit', {})); assert.ok(!audit.includes('synthetic-latchkey-1604')); assert.ok(!audit.includes('synthetic-latchkey-1633'));
 } finally { await f.close(); }
});
