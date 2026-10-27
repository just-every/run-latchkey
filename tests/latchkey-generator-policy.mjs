import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VaultClient } from '../src/latchkey/client.mjs';
import { spawn } from 'node:child_process';
import { ApiClient } from '../src/latchkey/api/client.mjs';
import { id, digest, sign, signingText } from '../src/latchkey/crypto/envelope.mjs';
import { SharingClient } from '../src/latchkey/sharing/client.mjs';
import { runItemCommand } from '../scripts/latchkey/items-commands.mjs';
import { GeneratorHistory, generatorHistoryKey } from '../src/latchkey/generator/index.mjs';

// Called from the real Worker journey after both account clients are unlocked.
export async function runGeneratorPolicyJourneys({ owner, member, db, ownerPassword }) {
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1300-')), privateValues = [];
 const sharing = new SharingClient(owner), groups = [];
 const readPrivate = async path => JSON.parse(await readFile(path, 'utf8'));
 const writePrivate = async (path, value, replace = false) => writeFile(path, JSON.stringify(value), { mode: 0o600, flag: replace ? 'w' : 'wx' });
 const context = { client: member, readPrivate, writePrivate };
 const call = (client = member) => client.call('generator/policy', {});
 const preview = (policy, group = null, reason = 'synthetic-latchkey-1301', client = owner) => client.call('generator/policy/preview', { group, policy, reason });
 const apply = (plan, extra = {}, client = owner) => client.call('generator/policy/set', { group: plan.group, policy: plan.policy, reason: plan.reason, confirmed: true, review: plan.hash, ...extra });
 const set = async (policy, group = null, reason = 'synthetic-latchkey-1301') => apply(await preview(policy, group, reason));
 const policyRows = async () => (await db.prepare('SELECT * FROM lky_generator_policies WHERE tenant=? ORDER BY scope').bind(owner.profile.tenant).all()).results;
 const auditRows = async () => (await db.prepare('SELECT * FROM lky_generator_policy_changes WHERE tenant=? ORDER BY id').bind(owner.profile.tenant).all()).results;
 const reject = (operation, code) => assert.rejects(operation, error => error.code === code);
 const history = join(directory, 'history.json'), output = join(directory, 'generated.json');
 let key, reopened;
 try {
  assert.equal((await call(owner)).canManage, true); assert.equal((await call()).canManage, false);
  await reject(member.call('generator/policy/set', { group: null, policy: { historyDays: 0 }, reason: 'synthetic-latchkey-1302' }), 'owner_required');
  const company = { minLength: 28, maxLength: 100, minEntropyBits: 100, historyDays: 20 };
  const policiesBefore = await policyRows(), changesBefore = await auditRows();
  const plan = await preview(company);
  assert.ok(plan.canApply); assert.equal(plan.conflicts.length, 0);
  assert.ok(plan.members.some(row => row.account === owner.profile.account));
  const memberPlan = plan.members.find(row => row.account === member.profile.account); assert.ok(memberPlan);
  assert.equal(memberPlan.before.policy.minLength, 16); assert.equal(memberPlan.after.policy.minLength, 28);
  assert.deepEqual(memberPlan.after.sources.map(row => row.scope), ['baseline', 'company']);
  assert.ok(memberPlan.devices.some(row => row.id === member.profile.device));
  assert.ok(memberPlan.devices.every(row => row.reachability === 'unknown' && row.convergence === 'unverified'));
  assert.deepEqual(await policyRows(), policiesBefore); assert.deepEqual(await auditRows(), changesBefore);
  await reject(apply(plan, { confirmed: false }), 'policy_confirmation_required');
  await reject(apply(plan, { policy: { ...plan.policy, minLength: 29 } }), 'policy_review_changed');
  await reject(apply(plan, { reason: 'synthetic-latchkey-1310' }), 'policy_review_changed');
  await reject(preview(company, null, 'synthetic-latchkey-1311', member), 'owner_required');
  await reject(apply(plan, {}, member), 'owner_required');
  await apply(plan);
  assert.equal((await auditRows()).length, changesBefore.length + 1);
  assert.deepEqual((await policyRows()).find(row => row.scope === 'company').policy, JSON.stringify(plan.policy));
  await reject(apply(plan), 'policy_review_changed');
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
  const staleMembership = await preview(company, a);
  await sharing.setGroup(a, []); await sharing.setGroup(a, [member.profile.account]);
  const membershipPolicies = await policyRows(), membershipAudit = await auditRows();
  await reject(apply(staleMembership), 'policy_review_changed');
  assert.deepEqual(await policyRows(), membershipPolicies); assert.deepEqual(await auditRows(), membershipAudit);
  const groupPreview = await preview(company, a);
  assert.deepEqual(groupPreview.members.map(row => row.account), [member.profile.account]);
  const stalePolicy = groupPreview;
  await set({ ...company, historyDays: 9 });
  await reject(apply(stalePolicy), 'policy_review_changed');
  const pendingClient = new VaultClient(owner.origin, { cookie: owner.cookie, fetcher: owner.fetcher });
  const pending = await pendingClient.beginEnrollment(owner.profile, ownerPassword);
  await owner.approveEnrollment(pending.device, pending.fingerprint);
  const staleDevices = await preview(company, a);
  const enrolled = await pendingClient.completeEnrollment(pending.profile, ownerPassword);
  await reject(apply(staleDevices), 'policy_review_changed');
  const revokePlan = await preview(company, a);
  await owner.call('device' + '/revoke', { device: enrolled.profile?.device ?? enrolled.device });
  await reject(apply(revokePlan), 'policy_review_changed');
  pendingClient.lock();
  const foreign = id();
  await db.prepare('UPDATE lky_share_groups SET tenant=? WHERE id=?').bind(foreign, b).run();
  try { await reject(preview(company, b), 'not_found'); } finally { await db.prepare('UPDATE lky_share_groups SET tenant=? WHERE id=?').bind(owner.profile.tenant, b).run(); }
  const first = { minLength: 40, maxLength: 80, historyDays: 5 }, second = { minLength: 48, maxLength: 64, historyDays: 2 };
  const cliPlan = await runItemCommand('generator-policy-preview', { group: a, policy: first, reason: 'synthetic-latchkey-1304' }, { ...context, client: owner });
  await reject(runItemCommand('generator-policy-apply', { ...cliPlan, review: cliPlan.hash, confirmed: false }, { ...context, client: owner }), 'policy_confirmation_required');
  await runItemCommand('generator-policy-apply', { ...cliPlan, review: cliPlan.hash, confirmed: true }, { ...context, client: owner }); await set(second, b, 'synthetic-latchkey-1305');
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
  const conflict = await preview({ ...company, minLength: first.maxLength + 1 });
  assert.equal(conflict.canApply, false);
  assert.ok(conflict.conflicts.some(row => row.reason.includes('81') && row.reason.includes('64') && row.sources.some(source => source.group === b)));
  await reject(apply(conflict), 'conflicting_generator_policy');
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
  console.log('Generator policy: read-only reviewed impact, exact confirmation, stale policy, membership and device refusal; live company and group intersections, membership changes, owner-only audited changes, contradiction refusal, stricter-only CLI and encrypted history purge passed');
  return privateValues;
 } finally {
  reopened?.lock(); key?.fill(0);
  for (const group of groups) { await sharing.setGroup(group, []); await set({}, group); }
  await set({});
  await rm(directory, { recursive: true, force: true });
 }
}

// The REST adapter and shipped CLI both cross the real emitted Worker boundary.
export async function runGeneratorApiJourney(f) {
 const { owner, db } = f, api = new ApiClient(owner);
 const directory = await mkdtemp(join(tmpdir(), 'synthetic-latchkey-1320-'));
 const state = async () => ({
  policies: (await db.prepare('SELECT * FROM lky_generator_policies ORDER BY scope').all()).results,
  changes: (await db.prepare('SELECT * FROM lky_generator_policy_changes ORDER BY id').all()).results,
 });
 const rawApply = async input => {
  const path = '/api/latchkey/v1/policies/generator', body = JSON.stringify(input), nonce = id(), time = String(Date.now());
  const response = await owner.fetcher(owner.origin + path, { method: 'PUT', headers: {
   origin: owner.origin, cookie: owner.cookie, 'content-type': 'application/json',
   'x-latchkey-grant': owner.token, 'x-latchkey-nonce': nonce, 'x-latchkey-time': time,
   'x-latchkey-signature': await sign(owner.bundle.signing.privateKey, signingText('PUT', path, owner.token, nonce, time, await digest(body))),
  }, body });
  return { status: response.status, body: await response.json() };
 };
 const cli = async (command, body, expected = 0) => {
  const child = spawn(process.execPath, ['scripts/latchkey.mjs', 'api'], { env: { ...process.env, NODE_EXTRA_CA_CERTS: f.caFile }, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', part => out += part); child.stderr.on('data', part => err += part);
  child.stdin.end(JSON.stringify({ profile: join(directory, 'profile.json'), password: f.password, api: { command, body } }));
  const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  assert.equal(code, expected, err);
  assert.ok(!out.includes(f.password) && !err.includes(f.password));
  if (expected) { assert.equal(out, ''); return JSON.parse(err); }
  assert.equal(err, ''); return JSON.parse(out);
 };
 try {
  await writeFile(join(directory, 'profile.json'), JSON.stringify(owner.profile), { mode: 0o600 });
  const input = { group: null, policy: { minLength: 28 }, reason: 'synthetic-latchkey-1321' }, before = await state();
  const plan = await api.previewGeneratorPolicy(input);
  assert.equal(plan.members.find(row => row.account === owner.profile.account).after.policy.minLength, 28);
  assert.deepEqual(await state(), before);
  for (const extra of [{}, { confirmed: false, review: plan.hash }, { confirmed: 'true', review: plan.hash }]) {
   assert.deepEqual(await rawApply({ ...input, ...extra }), { status: 400, body: { error: 'policy_confirmation_required' } });
  }
  assert.deepEqual(await rawApply({ ...input, confirmed: true }), { status: 400, body: { error: 'policy_review_required' } });
  assert.deepEqual(await rawApply({ ...input, confirmed: true, review: 'synthetic-latchkey-1322' }), { status: 409, body: { error: 'policy_review_changed' } });
  assert.deepEqual(await state(), before);
  const applied = await api.setGeneratorPolicy({ ...input, policy: plan.policy, confirmed: true, review: plan.hash });
  assert.equal(applied.policy.minLength, 28);
  assert.equal((await state()).changes.length, before.changes.length + 1);
  assert.deepEqual(await rawApply({ ...input, policy: plan.policy, confirmed: true, review: plan.hash }), { status: 409, body: { error: 'policy_review_changed' } });
  const sharing = new SharingClient(owner), group = (await sharing.createGroup([owner.profile.account])).group;
  const groupInput = { group, policy: { maxLength: 32 }, reason: 'synthetic-latchkey-1326' };
  const groupPlan = await api.previewGeneratorPolicy(groupInput);
  await api.setGeneratorPolicy({ ...groupInput, policy: groupPlan.policy, confirmed: true, review: groupPlan.hash });
  const conflictBefore = await state();
  const entropyInput = { ...input, policy: { minEntropyBits: 220 }, reason: 'synthetic-latchkey-1327' };
  const conflict = await api.previewGeneratorPolicy(entropyInput);
  assert.equal(conflict.canApply, false);
  assert.equal(conflict.members.find(row => row.account === owner.profile.account).before.policy.minEntropyBits, 80);
  assert.equal(conflict.members.find(row => row.account === owner.profile.account).after.policy.minEntropyBits, 220);
  assert.ok(conflict.conflicts.some(row => row.reason.includes('220') && row.reason.includes('maximum length 32') && row.sources.some(source => source.group === group)));
  assert.deepEqual(await state(), conflictBefore);
  assert.deepEqual(await rawApply({ ...entropyInput, policy: conflict.policy, confirmed: true, review: conflict.hash }), { status: 400, body: { error: 'conflicting_generator_policy' } });
  assert.deepEqual(await state(), conflictBefore);
  const cliConflict = await cli('policies.generator-preview', entropyInput);
  assert.equal(cliConflict.canApply, false);
  assert.equal((await cli('policies.generator', { ...entropyInput, policy: cliConflict.policy, confirmed: true, review: cliConflict.hash }, 1)).error, 'conflicting_generator_policy');
  assert.deepEqual(await state(), conflictBefore);
  // A feasible entropy request still applies and generates through the CLI.
  const feasibleInput = { ...entropyInput, policy: { minEntropyBits: 200 } }, feasible = await api.previewGeneratorPolicy(feasibleInput);
  assert.equal(feasible.canApply, true);
  await api.setGeneratorPolicy({ ...feasibleInput, policy: feasible.policy, confirmed: true, review: feasible.hash });
  const generatedFile = join(directory, 'generated.json'), history = join(directory, 'history.json');
  await runItemCommand('generate', { output: generatedFile, history, acknowledgedRetentionDays: 30, options: { length: 32 } }, {
   client: owner, readPrivate: async path => JSON.parse(await readFile(path, 'utf8')),
   writePrivate: (path, value) => writeFile(path, JSON.stringify(value), { mode: 0o600 }),
  });
  const generated = JSON.parse(await readFile(generatedFile, 'utf8'));
  assert.equal(generated.value.length, 32); assert.ok(generated.entropyBits >= 200);
  const clearGroup = { ...groupInput, policy: {} }, clearGroupPlan = await api.previewGeneratorPolicy(clearGroup);
  await api.setGeneratorPolicy({ ...clearGroup, policy: clearGroupPlan.policy, confirmed: true, review: clearGroupPlan.hash });
  await sharing.setGroup(group, []);
  const cliInput = { ...input, policy: { minLength: 32 }, reason: 'synthetic-latchkey-1323' }, cliBefore = await state();
  const cliPlan = await cli('policies.generator-preview', cliInput);
  assert.equal(cliPlan.members.find(row => row.account === owner.profile.account).after.policy.minLength, 32);
  assert.deepEqual(await state(), cliBefore);
  const body = { ...cliInput, policy: cliPlan.policy, review: cliPlan.hash };
  assert.equal((await cli('policies.generator', body, 1)).error, 'policy_confirmation_required');
  assert.equal((await cli('policies.generator', { ...body, confirmed: false }, 1)).error, 'policy_confirmation_required');
  assert.equal((await cli('policies.generator', { ...body, confirmed: true, reason: 'synthetic-latchkey-1324' }, 1)).error, 'policy_review_changed');
  assert.deepEqual(await state(), cliBefore);
  const cliApplied = await cli('policies.generator', { ...body, confirmed: true });
  assert.equal(cliApplied.policy.minLength, 32);
  assert.equal((await state()).changes.length, cliBefore.changes.length + 1);
  assert.equal((await cli('policies.generator', { ...body, confirmed: true }, 1)).error, 'policy_review_changed');
  const contenders = await Promise.all([36, 40].map(async minLength => {
   const input = { group: null, policy: { minLength }, reason: 'synthetic-latchkey-1328' };
   const plan = await api.previewGeneratorPolicy(input);
   return { ...input, policy: plan.policy, confirmed: true, review: plan.hash };
  }));
  const raceBefore = await state(), outcomes = await Promise.allSettled(contenders.map(input => api.setGeneratorPolicy(input)));
  assert.equal(outcomes.filter(result => result.status === 'fulfilled').length, 1);
  const refused = outcomes.find(result => result.status === 'rejected');
  assert.equal(refused.reason.code, 'policy_review_changed');
  const winner = outcomes.findIndex(result => result.status === 'fulfilled');
  assert.equal((await owner.call('generator' + '/policy', {})).policy.minLength, contenders[winner].policy.minLength);
  assert.equal((await state()).changes.length, raceBefore.changes.length + 1);
  const reset = { group: null, policy: {}, reason: 'synthetic-latchkey-1325' }, resetPlan = await api.previewGeneratorPolicy(reset);
  await api.setGeneratorPolicy({ ...reset, policy: resetPlan.policy, confirmed: true, review: resetPlan.hash });
  console.log('Generator REST and CLI: read-only preview, exact confirmation, entropy conflict refusal, feasible generation, concurrent application and no refused writes passed');
 } finally { await rm(directory, { recursive: true, force: true }); }
}
