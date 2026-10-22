import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SharingClient } from '../src/latchkey/sharing/client.mjs';
import { runItemCommand } from '../scripts/latchkey/items-commands.mjs';
import { GeneratorHistory, generatorHistoryKey } from '../src/latchkey/generator/index.mjs';

// Called from the real Worker journey after both account clients are unlocked.
export async function runGeneratorPolicyJourneys({ owner, member, db }) {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1300-')), privateValues = [];
 const sharing = new SharingClient(owner), groups = [];
 const readPrivate = async path => JSON.parse(await readFile(path, 'utf8'));
 const writePrivate = async (path, value, replace = false) => writeFile(path, JSON.stringify(value), { mode: 0o600, flag: replace ? 'w' : 'wx' });
 const context = { client: member, readPrivate, writePrivate };
 const call = (client = member) => client.call('generator/policy', {});
 const set = (policy, group = null, reason = 'synthetic-latchkey-1301') => owner.call('generator/policy/set', { group, policy, reason });
 const reject = (operation, code) => assert.rejects(operation, error => error.code === code);
 const history = join(directory, 'history.json'), output = join(directory, 'generated.json');
 let key, reopened;
 try {
  assert.equal((await call(owner)).canManage, true); assert.equal((await call()).canManage, false);
  await reject(member.call('generator/policy/set', { group: null, policy: { historyDays: 0 }, reason: 'synthetic-latchkey-1302' }), 'owner_required');
  const company = { minLength: 28, maxLength: 100, minEntropyBits: 100, historyDays: 20 };
  await set(company);
  const effective = await call();
  assert.ok(effective.policy.minLength >= company.minLength && effective.policy.maxLength <= company.maxLength && effective.policy.historyDays <= company.historyDays);
  await reject(runItemCommand('generate', { history, output, policy: { minLength: 1, historyDays: 30 }, acknowledgedRetentionDays: effective.policy.historyDays, options: { length: company.minLength - 1 } }, context), 'password_length_policy');
  const generated = await runItemCommand('generate', { history, output, acknowledgedRetentionDays: effective.policy.historyDays, options: { length: 32 } }, context);
  assert.equal(generated.retention.days, effective.policy.historyDays);
  const value = (await readPrivate(output)).value; privateValues.push(value);
  assert.ok(!(await readFile(history, 'utf8')).includes(value));
  await set({ ...company, historyDays: 0 }, null, 'synthetic-latchkey-1303');
  const purged = join(directory, 'purged.json');
  await runItemCommand('generator-history', { history, output: purged, policy: { historyDays: 30 } }, context);
  assert.equal((await readPrivate(purged)).length, 0);
  key = await generatorHistoryKey(member);
  const storage = { read: () => readPrivate(history), write: value => writePrivate(history, value, true) };
  reopened = new GeneratorHistory({ storage, key, tenant: member.profile.tenant, account: member.profile.account });
  assert.equal((await reopened.list()).length, 0); reopened.lock();

  await set({ ...company, historyDays: 10 });
  const a = (await sharing.createGroup([member.profile.account])).group, b = (await sharing.createGroup([member.profile.account])).group; groups.push(a, b);
  const first = { minLength: 40, maxLength: 80, historyDays: 5 }, second = { minLength: 48, maxLength: 64, historyDays: 2 };
  await set(first, a, 'synthetic-latchkey-1304'); await set(second, b, 'synthetic-latchkey-1305');
  const joined = await call();
  assert.ok(joined.policy.minLength >= second.minLength && joined.policy.maxLength <= second.maxLength && joined.policy.historyDays <= second.historyDays);
  assert.ok(joined.sources.some(source => source.group === a) && joined.sources.some(source => source.group === b));
  assert.ok(!(await call(owner)).sources.some(source => source.scope === 'group'));
  assert.ok(!JSON.stringify(joined.sources).includes(member.profile.account));
  await sharing.setGroup(b, []);
  const removed = await call();
  assert.ok(removed.policy.minLength < joined.policy.minLength && removed.policy.maxLength > joined.policy.maxLength && removed.policy.historyDays > joined.policy.historyDays);
  assert.ok(!removed.sources.some(source => source.group === b));
  await sharing.setGroup(b, [member.profile.account]);
  const rejoined = await call(); assert.deepEqual(rejoined.policy, joined.policy);
  const local = await runItemCommand('generator-policy', { policy: { minLength: 1, maxLength: 256, historyDays: 30 } }, context);
  assert.deepEqual(local.policy, joined.policy);
  const stricter = await runItemCommand('generator-policy', { policy: { historyDays: 0 } }, context);
  assert.ok(stricter.history.days < local.history.days);

  const before = (await db.prepare('SELECT * FROM lky_generator_policies WHERE tenant=? ORDER BY scope').bind(owner.profile.tenant).all()).results;
  const auditBefore = (await db.prepare('SELECT * FROM lky_generator_policy_changes WHERE tenant=? ORDER BY id').bind(owner.profile.tenant).all()).results;
  await reject(set({ minLength: second.minLength, maxLength: second.minLength - 1 }, b), 'conflicting_generator_policy');
  await reject(set({ ...company, minLength: first.maxLength + 1 }), 'conflicting_generator_policy');
  assert.deepEqual((await db.prepare('SELECT * FROM lky_generator_policies WHERE tenant=? ORDER BY scope').bind(owner.profile.tenant).all()).results, before);
  assert.deepEqual((await db.prepare('SELECT * FROM lky_generator_policy_changes WHERE tenant=? ORDER BY id').bind(owner.profile.tenant).all()).results, auditBefore);
  assert.ok(auditBefore.some(change => change.reason === 'synthetic-latchkey-1305' && change.actor === owner.profile.account && change.group_id === b));
  const event = await db.prepare("SELECT e.object_id FROM lky_events e JOIN lky_generator_policy_changes c ON c.id=e.object_id WHERE e.action='generator_policy_changed' AND c.tenant=? LIMIT 1").bind(owner.profile.tenant).first(); assert.ok(event);
  assert.ok(!JSON.stringify(auditBefore).includes(value));

  const secondHistory = join(directory, 'second-history.json'), secondOutput = join(directory, 'second-generated.json');
  await runItemCommand('generate', { history: secondHistory, output: secondOutput, acknowledgedRetentionDays: joined.policy.historyDays, options: { length: joined.policy.minLength } }, context);
  privateValues.push((await readPrivate(secondOutput)).value);
  await set({ ...company, historyDays: 0 });
  await runItemCommand('generator-clear', { history: secondHistory, entry: 'synthetic-latchkey-1306', policy: { historyDays: 30 } }, context);
  reopened = new GeneratorHistory({ storage: { read: () => readPrivate(secondHistory), write: value => writePrivate(secondHistory, value, true) }, key, tenant: member.profile.tenant, account: member.profile.account });
  assert.equal((await reopened.list()).length, 0);
  console.log('Generator policy: live company and group intersections, membership changes, owner-only audited changes, contradiction refusal, stricter-only CLI and encrypted history purge passed');
  return privateValues;
 } finally {
  reopened?.lock(); key?.fill(0);
  for (const group of groups) { await sharing.setGroup(group, []); await set({}, group); }
  await set({});
  await rm(directory, { recursive: true, force: true });
 }
}
