#!/usr/bin/env node
// Secrets and values enter on stdin, never argv or environment. The caller
// explicitly selects local files; no ambient credential file is discovered.
import { SharingError } from '../src/latchkey/sharing/index.mjs';
import { sharingCommands, runSharingCommand } from './latchkey/sharing-commands.mjs';
import { ItemError } from '../src/latchkey/items/fields.mjs';
import { RecordsError } from '../src/latchkey/portability/private-files.mjs';
import { PortabilityClient } from '../src/latchkey/portability/client.mjs';
import { recordsCommand } from './latchkey/records-commands.mjs';
import { itemCommands, runItemCommand } from './latchkey/items-commands.mjs';
import { constants } from 'node:fs';
import { open, rename, unlink } from 'node:fs/promises';
import { MachineClient } from '../src/latchkey/machine.mjs';
import { VaultClient, ClientError } from '../src/latchkey/client.mjs';

async function readPrivate(path) {
 const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
 try {
  const info = await handle.stat();
  if (!info.isFile() || (info.mode & 0o077) !== 0 || info.uid !== process.getuid()) throw new ClientError('private_file_required');
  return JSON.parse(await handle.readFile('utf8'));
 } finally { await handle.close(); }
}
async function writePrivate(path, value, replace = false) {
 const target = replace ? `${path}.new-${process.pid}` : path;
 const handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
 try { await handle.writeFile(JSON.stringify(value) + '\n'); await handle.sync(); } finally { await handle.close(); }
 if (replace) { try { await rename(target, path); } catch (error) { await unlink(target); throw error; } }
}
try {
 let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 1500000) throw new ClientError('input_too_large'); }
 const input = JSON.parse(raw), command = process.argv[2];
 let client, profile, result;
 if(command==='run'){
  const {runConsumer}=await import('./latchkey/run-command.mjs');result=await runConsumer(input,process.argv.slice(3));process.exitCode=result.exitCode;
 } else if (command === 'records-restore') {
  const { restoreLocalRecords } = await import('./latchkey/records-local.mjs');
  result = await restoreLocalRecords(input);
 } else if (command === 'identity-request') {
  client = new VaultClient(input.origin); result = await client.requestIdentity(input.email);
 } else if (command === 'runtime-keygen') {
  const machine = await MachineClient.create(input.origin, input.runtimeKey);
  await writePrivate(input.machineProfile, machine); result = await MachineClient.identity(machine);
 } else if (command === 'runtime-read') {
  const value = await MachineClient.read(await readPrivate(input.machineProfile), await readPrivate(input.grant), input.runtimeKey);
  await writePrivate(input.output, value); result = { written: true };
 } else if (command === 'archive-open') {
  result = await VaultClient.openExport(await readPrivate(input.archive), input.exportKey);
  await writePrivate(input.output, result);
  result = { written: true, versions: result.versions.length };
 } else if (['records-seal', 'records-open'].includes(command)) {
  result = await recordsCommand(command, input);
 } else if (['records-rewrap-plan', 'records-rewrap-verify'].includes(command)) {
  const value = await recordsCommand(command, input);
  await writePrivate(input.output, value); result = { written: true };
 } else if (['sharing-link-preview', 'sharing-link-challenge', 'sharing-link-open'].includes(command)) {
  result = await runSharingCommand(command, input, { writePrivate });
 } else if (command === 'register') {
  client = new VaultClient(input.origin, { cookie: input.cookie });
  if (input.identityToken) await client.confirmIdentity(input.identityToken);
  const enrolled = await client.register(input.password, { beforeCommit: async ({ profile, kit }) => { await writePrivate(input.profile, profile); await writePrivate(input.kit, kit); } });
  result = { account: enrolled.profile.account, device: enrolled.profile.device, kitWritten: true };
 } else if (command === 'recover' || command === 'records-recover') {
  let kit = await readPrivate(input.kit);
  if (command === 'records-recover') { if (input.approvedOrigin !== input.origin) throw new ClientError('destination_origin_confirmation_required'); kit = { ...kit, origin: input.origin }; }
  client = new VaultClient(kit.origin);
  const recovered = await client.recover(kit, input.password, { beforeCommit: async ({ profile, kit }) => { await writePrivate(input.profile, profile); await writePrivate(input.newKit, kit); } });
  result = { device: recovered.profile.device, generation: recovered.profile.generation, kitWritten: true };
 } else if (command === 'enroll-start') {
  client = new VaultClient(input.origin);
  const enrolled = await client.beginEnrollment({ schema: 1, origin: input.origin, account: input.account, tenant: input.tenant, serverKey: input.serverKey, recipientKey: input.recipientKey, authorityKey: input.authorityKey }, input.password);
  await writePrivate(input.profile, enrolled.profile);
  result = { device: enrolled.device, fingerprint: enrolled.fingerprint };
 } else if (command === 'enroll-complete') {
  profile = await readPrivate(input.profile); client = new VaultClient(profile.origin);
  profile = await client.completeEnrollment(profile, input.password);
  await writePrivate(input.profile, profile, true); result = { device: profile.device, enrolled: true };
 } else {
  profile = await readPrivate(input.profile); client = new VaultClient(profile.origin);
  await client.unlock(profile, input.password);
  switch (command) {
   case 'api': {const {apiCommand}=await import('../src/latchkey/api/client.mjs');result=await apiCommand(client,input.api);break;}
   case 'project-create': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).create({name:input.name,vault:input.vault});break;}
   case 'project-environment': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).createEnvironment(input.project,input.environment);break;}
   case 'project-set': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).set(input.environment,input.path,input.value,{expectedVersion:input.expectedVersion});break;}
   case 'identity': result = { ...client.identity(), fingerprint: await client.identity().fingerprint, serverKey: profile.serverKey }; break;
   case 'vault-create': result = await client.createVault(); break;
   case 'put': result = await client.put(input.vault, input.value, input.object); break;
   case 'read': { const value = await client.readVault(input.vault); await writePrivate(input.output, value); result = { written: true, versions: value.versions.length }; break; }
   case 'trust': result = await client.pinAccount(input.account, input.fingerprint); break;
   case 'share': result = await client.share(input.vault, input.account, input.fingerprint, input.rights); break;
   case 'rotate': result = await client.rotate(input.vault, input.remove ?? null, input.confirmedKeys ?? {}); break;
   case 'export': { const archive = await client.exportVault(input.vault, input.exportKey); await writePrivate(input.output, archive); result = { written: true }; break; }
   case 'runtime-grant': { const grant = await client.grantMachine(input.vault, input.object, input.identity, input.fingerprint, input.expiresInSeconds); await writePrivate(input.output, grant); result = { machine: grant.machine, expires: grant.expires }; break; }
   case 'runtime-revoke': result = await client.call('machine/revoke', { machine: input.machine }); break;
   case 'password-change': { const changed = await client.changePassword(input.newPassword, { beforeCommit: async ({ profile, kit }) => { await writePrivate(input.newProfile, profile); await writePrivate(input.newKit, kit); } }); result = { generation: changed.profile.generation, device: changed.profile.device, kitWritten: true }; break; }
   case 'archive-prepare': { const {plan} = await readPrivate(input.plan); result = await new PortabilityClient(client).prepare({ plan, approval: await readPrivate(input.approval), sourceFingerprint: input.sourceFingerprint, destinationFingerprint: input.destinationFingerprint }); break; }
   case 'archive-status': result = await new PortabilityClient(client).status(input.restore); break;
   case 'archive-activate': result = await new PortabilityClient(client).activate({ restore: input.restore, approvedPlanHash: input.approvedPlanHash, activation: input.activation, rights: input.rights }); break;
   case 'item-erase': result = await client.eraseItem(input.vault, input.object, { confirmed: input.confirmed, revision: input.revision }); break;
   case 'devices': result = await client.call('devices', {}); break;
   case 'device-revoke': result = await client.call('device/revoke', { device: input.device }); break;
   case 'enroll-approve': result = await client.approveEnrollment(input.device, input.fingerprint); break;
   case 'audit': result = await client.call('audit', {}); break;
   default: if (command === 'records-rewrap-approve') { const value = await recordsCommand(command, input, { client }); await writePrivate(input.output, value); result = { written: true }; } else if (sharingCommands.includes(command)) result = await runSharingCommand(command, input, { client, writePrivate }); else if (itemCommands.includes(command)) result = await runItemCommand(command, input, { client, readPrivate, writePrivate }); else throw new ClientError('unknown_command');
  }
  await writePrivate(input.profile, profile, true);
 }
 client?.lock();
 process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
 // Never print stack, stdin, crypto exceptions, file contents or provider errors.
 process.stderr.write(JSON.stringify({ error: error instanceof ClientError || error instanceof ItemError || error instanceof RecordsError || error instanceof SharingError ? error.code : 'client_failed' }) + '\n');
 process.exitCode = 1;
}
