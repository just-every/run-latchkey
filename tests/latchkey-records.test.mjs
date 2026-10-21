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
