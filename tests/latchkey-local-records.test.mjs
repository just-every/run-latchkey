import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, writeFile, stat, rm, symlink, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { localOperation } from '@runeditrun/rer/local/operation';
import { loadPolicy } from '@runeditrun/rer/internal/cli/portability-policy.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { configuration, localBindings } from '../scripts/latchkey/records-local-bindings.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
async function checkout(parent, name) {
 const root = join(parent, name); await mkdir(root);
 await Promise.all([
  cp(join(repo, 'migrations'), join(root, 'migrations'), { recursive: true }),
  cp(join(repo, 'package.json'), join(root, 'package.json')),
  cp(join(repo, 'wrangler.jsonc'), join(root, 'wrangler.jsonc')),
  mkdir(join(root, 'scripts/latchkey'), { recursive: true }),
  symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'dir'),
 ]);
 await cp(join(repo, 'scripts/latchkey/archive-policy.mjs'), join(root, 'scripts/latchkey/archive-policy.mjs'));
 return realpath(root);
}
async function withBindings(root, callback) {
 const policy = await loadPolicy(root, undefined, 'scripts/latchkey/archive-policy.mjs');
 const operation = await localOperation(root); let bindings;
 try {
  bindings = await localBindings(root, await configuration(root, policy), policy, operation.token, false);
  const service = await createPortability({ db: bindings.db, buckets: bindings.buckets, policy, migrations: bindings.migrations });
  return await callback(bindings.db, service);
 } finally { try { await bindings?.close(); } finally { await operation.release(); } }
}
async function fixture(parent) {
 const source = await checkout(parent, 'synthetic-latchkey-58');
 const raw = await withBindings(source, async (db, service) => {
  await db.prepare("WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<2101) INSERT INTO lky_events SELECT 'synthetic-latchkey-'||x,'synthetic-latchkey-59','synthetic-latchkey-60','synthetic-latchkey-61','synthetic-latchkey-62',x FROM n").run();
  const job = await service.exports.create('synthetic-latchkey-63');
  while ((await service.exports.advance(job, { maxParts: 100 })).phase !== 'complete') {}
  return new Response(await service.exports.download(job)).text();
 });
 const input = join(parent, 'synthetic-latchkey-64.rer'); await writeFile(input, raw, { mode: 0o600 });
 return { input, raw };
}
async function command(root, input, expectedCode = 0) {
 const child = spawn(process.execPath, [join(repo, 'scripts/latchkey.mjs'), 'records-restore'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
 let stdout = '', stderr = '';
 child.stdout.on('data', value => { stdout += value; }); child.stderr.on('data', value => { stderr += value; });
 child.stdin.end(JSON.stringify(input));
 const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
 assert.equal(code, expectedCode, stderr);
 if (!expectedCode) return JSON.parse(stdout);
 const result = stderr.trim().split('\n').map(line => { try { return JSON.parse(line); } catch { return null; } }).find(value => value?.error);
 assert.ok(result, 'The CLI reports a fixed symbolic error'); return result;
}

test('documented Records CLI resumes the same real Base job across processes and explicitly finalizes inactive data', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-65-'));
 try {
  const { input } = await fixture(directory), root = await checkout(directory, 'synthetic-latchkey-66'), checkpoint = join(directory, 'synthetic-latchkey-67.json');
  const options = { input, checkpoint, confirmed: true, partsPerRun: 1 };
  const first = await command(root, options);
  assert.equal(first.phase, 'staging'); assert.equal(first.completed, 1); assert.ok(first.total >= 3); assert.equal(first.inactive, true);
  const second = await command(root, options);
  assert.equal(second.job, first.job); assert.equal(second.completed, 2); assert.equal(second.phase, 'staging');
  const stored = JSON.parse(await readFile(checkpoint, 'utf8'));
  assert.equal(stored.job, first.job); assert.equal((await stat(checkpoint)).mode & 0o777, 0o600);
  const committed = await command(root, { ...options, partsPerRun: 128, finalize: true });
  assert.equal(committed.job, first.job); assert.equal(committed.phase, 'complete'); assert.equal(committed.completed, committed.total); assert.equal(committed.inactive, true);
  const repeat = await command(root, { ...options, finalize: true }); assert.equal(repeat.job, first.job); assert.equal(repeat.phase, 'complete');
  await withBindings(root, async (db, service) => {
   assert.equal((await service.imports.status(first.job)).phase, 'complete');
   assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM lky_events').first()).count, 2101);
   assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM lky_devices').first()).count, 0);
  });
 } finally { await rm(directory, { recursive: true, force: true }); }
});

test('Records CLI validates before opening D1 and keeps staged status durable when a nonempty destination atomically refuses finalize', async () => {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-68-'));
 try {
  const { input, raw } = await fixture(directory), root = await checkout(directory, 'synthetic-latchkey-69');
  const corrupt = join(directory, 'synthetic-latchkey-70.rer'), checkpoint = join(directory, 'synthetic-latchkey-71.json');
  await writeFile(corrupt, raw.replace('synthetic-latchkey-61', 'synthetic-latchkey-72'), { mode: 0o600 });
  const failed = await command(root, { input: corrupt, checkpoint, confirmed: true }, 1);
  assert.equal(failed.error, 'part_checksum');
  await assert.rejects(stat(join(root, '.wrangler')), { code: 'ENOENT' });
  await assert.rejects(stat(checkpoint), { code: 'ENOENT' });
  const options = { input, checkpoint, confirmed: true, partsPerRun: 1 };
  const staged = await command(root, options);
  const checkpointBefore = await readFile(checkpoint, 'utf8');
  // An external destination write is a real target-eligibility change, not a
  // simulated importer failure. The final transaction must preserve it alone.
  await withBindings(root, async db => {
   await db.prepare('INSERT INTO lky_events VALUES(?,?,?,?,?,?)').bind('synthetic-latchkey-73', 'synthetic-latchkey-74', 'synthetic-latchkey-75', 'synthetic-latchkey-76', 'synthetic-latchkey-77', 1).run();
  });
  const refused = await command(root, { ...options, partsPerRun: 128, finalize: true }, 1);
  assert.equal(refused.error, 'target_not_empty');
  assert.equal(await readFile(checkpoint, 'utf8'), checkpointBefore);
  await withBindings(root, async (db, service) => {
   const status = await service.imports.status(staged.job);
   assert.equal(status.phase, 'staging'); assert.equal(status.completed, status.total);
   const rows = (await db.prepare('SELECT id FROM lky_events').all()).results;
   assert.deepEqual(rows.map(row => row.id), ['synthetic-latchkey-73']);
  });
  // A valid archive with unknown checkpoint contents cannot replace that file.
  const unknown = join(directory, 'synthetic-latchkey-78.json'); await writeFile(unknown, '{}\n', { mode: 0o600 });
  assert.equal((await command(root, { ...options, checkpoint: unknown }, 1)).error, 'records_checkpoint_invalid');
  assert.equal(await readFile(unknown, 'utf8'), '{}\n');
 } finally { await rm(directory, { recursive: true, force: true }); }
});
