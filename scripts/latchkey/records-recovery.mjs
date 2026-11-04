import * as opaque from '@serenity-kit/opaque';
import { readArchive } from '@runeditrun/rer/modules/portability';
import { loadPolicy } from '@runeditrun/rer/internal/cli/portability-policy.mjs';
import { open, json, unlockKey, decode } from '../../src/latchkey/crypto/envelope.mjs';
import { withOpenedRecordsArchive } from '../../src/latchkey/portability/archive.mjs';
import { privateInput, fileStream, requireRecords as need, RecordsError } from '../../src/latchkey/portability/private-files.mjs';
import { configuration } from './records-local-bindings.mjs';
import { restoreLocalRecords } from './records-local.mjs';

async function privateJson(path) {
 let handle;
 try {
  handle = await privateInput(path);
  need((await handle.stat()).size <= 65536, 'recovery_material_invalid');
  return JSON.parse(await handle.readFile('utf8'));
 } catch (error) {
  if (error instanceof RecordsError) throw error;
  throw new RecordsError(error.code === 'ENOENT' ? 'recovery_material_missing' : 'recovery_material_invalid');
 } finally { await handle?.close(); }
}

// Run OPAQUE against the independently retained archive, never the source
// service. This checks both factors without issuing a session or new authority.
async function checkOwner(account, kit, password) {
 try {
  need(kit?.schema === 1 && kit.account === account.id && kit.tenant === account.tenant
   && kit.generation === account.generation && typeof password === 'string' && password.length > 0
   && decode(kit.recoverySecret, 32).length === 32, 'recovery_material_invalid');
  await opaque.ready;
  const started = opaque.client.startLogin({ password });
  const server = opaque.server.startLogin({ serverSetup: account.opaque_setup, registrationRecord: account.opaque_record,
   userIdentifier: account.id, startLoginRequest: started.startLoginRequest, identifiers: { client: account.id, server: account.tenant } });
  const result = opaque.client.finishLogin({ clientLoginState: started.clientLoginState, loginResponse: server.loginResponse,
   password, identifiers: { client: account.id, server: account.tenant }, keyStretching: 'memory-constrained' });
  need(result?.serverStaticPublicKey === kit.serverKey, 'recovery_material_invalid');
  opaque.server.finishLogin({ serverLoginState: server.serverLoginState, finishLoginRequest: result.finishLoginRequest });
  const key = await unlockKey(result.exportKey, kit.recoverySecret, account.id);
  let plaintext;
  try {
   plaintext = await open(key, JSON.parse(account.recovery_wrap), { tenant: account.tenant, vault: 'account', object: account.id,
    purpose: 'recovery', epoch: account.generation, version: 1 });
   const { root } = json(plaintext);
   need(root.recipient.publicKey === account.recipient_key && root.authority.publicKey === account.authority_key
    && root.recovery.publicKey === account.recovery_key, 'recovery_material_invalid');
  } finally { key.fill(0); plaintext?.fill(0); }
 } catch { throw new RecordsError('recovery_material_invalid'); }
}

export async function checkRecoveryKit(input) {
 need(input && Object.keys(input).every(key => ['input', 'exportKey', 'owners', 'restoreConfiguration', 'approvedOrigin', 'journal'].includes(key)), 'invalid_recovery_check');
 need(Array.isArray(input.owners) && input.owners.length >= 2 && input.owners.length <= 8
  && input.owners.every(owner => typeof owner.name === 'string' && owner.name.trim().length > 0 && owner.name.length <= 120)
  && new Set(input.owners.map(owner => owner.name.trim())).size === input.owners.length, 'two_named_owners_required');
 let origin;
 try { origin = new URL(input.approvedOrigin); } catch { need(false, 'local_recovery_origin_required'); }
 need(origin.origin === input.approvedOrigin && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname)
  && ['https:', 'http:'].includes(origin.protocol), 'local_recovery_origin_required');
 return withOpenedRecordsArchive({ input: input.input, exportKey: input.exportKey, laterJournal: input.journal }, async (path, receipt) => {
  const handle = await privateInput(path), accounts = [], operators = [], objects = new Set();
  let manifest, versions = 0;
  try {
   for await (const record of readArchive(fileStream(handle))) {
    if (record.kind === 'manifest') manifest = record;
    if (record.kind !== 'part') continue;
    for (const item of record.items) {
     if (item.kind !== 'row') continue;
     if (item.table === 'lky_accounts') accounts.push(item.row);
     if (item.table === 'oa_operators') operators.push(item.row);
     if (item.table === 'lky_versions') { versions++; objects.add(JSON.stringify([item.row.vault_id, item.row.object_id])); }
    }
   }
  } finally { await handle.close(); }
  const policy = await loadPolicy(process.cwd(), undefined, 'scripts/latchkey/archive-policy.mjs');
  const config = await configuration(process.cwd(), policy), retained = await privateJson(input.restoreConfiguration);
  const requiredConfiguration = [...new Set([...manifest.requiredConfiguration, ...policy.requiredConfiguration])];
  need(retained?.schema === 1 && retained.sourceIdentity === manifest.sourceIdentity
   && manifest.product === policy.product && retained.variables && typeof retained.variables === 'object'
   && requiredConfiguration.every(name => typeof retained.variables[name] === 'string' && retained.variables[name].trim().length > 0)
   && retained.variables.AUTH_ORIGIN === input.approvedOrigin, 'restore_configuration_invalid');
  need((manifest.migrations ?? []).every(name => config.migrations.some(entry => entry.name === name)), 'records_migration_source_missing');
  const seen = new Set();
  for (const owner of input.owners) {
   const kit = await privateJson(owner.kit), account = accounts.find(row => row.id === kit?.account);
   need(account && !seen.has(account.id) && operators.some(row => row.id === account.operator_id && row.role === 'owner' && row.status === 'active'), 'enrolled_owner_required');
   seen.add(account.id); await checkOwner(account, kit, owner.password);
  }
  return { checked: true, archiveHash: receipt.archiveHash, contentHash: receipt.contentHash,
   owners: seen.size, members: operators.filter(row => row.status === 'active').length,
   enrolledAccounts: accounts.length, items: objects.size, versions, parts: manifest.partCount,
   requiredConfiguration, erasure: receipt.erasure, inactive: true,
   boundary: 'Local material check only. Base import checks schema compatibility; fresh recovery and explicit activation are still required. No provider recovery or device continuity is established.' };
 });
}

export async function restoreRecoveryKit({ checkpoint, confirmed, partsPerRun, finalize, ...input }) {
 need(confirmed === true, 'records_confirmation_required');
 const checked = await checkRecoveryKit(input);
 return withOpenedRecordsArchive({ input: input.input, exportKey: input.exportKey, laterJournal: input.journal }, async path => ({
  ...await restoreLocalRecords({ input: path, checkpoint, confirmed, partsPerRun, finalize, journal: input.journal }), material: checked,
 }));
}
