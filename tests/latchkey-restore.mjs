// Called by the real emitted-Worker journey after Base has completed import and
// the destination owner has independently enrolled/recovered a trusted device.
import assert from 'node:assert/strict';
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

export async function exerciseRecordsRestore({ archive, sourceClient, destinationClient, wrongPersonClient, expectedVersions }) {
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
   const read = await destinationClient.readVault(vault.vault);
   if (expectedVersions?.[vault.vault]) assert.deepEqual(read.versions, expectedVersions[vault.vault]);
   const exported = await destinationClient.snapshot(vault.vault, 'export'); exported.key.fill(0);
   assert.equal(exported.result.owner, destination.account);
   // Rewrapping vault access cannot transfer the original actor's personal suppression.
   const health=await new HealthClient(destinationClient).inspect(vault.vault);
   assert.deepEqual(health.history,[]);assert.ok(health.findings.every(finding=>finding.suppression===null));
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
export async function prepareHealthHistoryRestore(client){
 const vault=(await client.createVault()).vault,health=new HealthClient(client);
 const item=await client.put(vault,createItem('login',{title:'Synthetic restore health',values:{password:'aaaa'}}));
 const finding=(await health.inspect(vault)).findings.find(r=>r.object===item.object&&r.code==='weak-password');assert.ok(finding);
 await health.suppress(vault,finding,{reason:'Synthetic restore investigation'});
 await health.suppress(vault,finding,{reason:'Synthetic restore dismissal'});
 const history=await health.history(vault);assert.deepEqual(history.map(r=>r.reason),['Synthetic restore investigation','Synthetic restore dismissal']);
 return {vault,item:item.object,rows:await client.call(['health','history'].join('/'),{vault})};
}
