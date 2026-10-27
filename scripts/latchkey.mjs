#!/usr/bin/env node
// Secrets and values enter on stdin, never argv or environment. The caller
// explicitly selects local files; no ambient credential file is discovered.
import { PostureError } from '../src/latchkey/posture/read.mjs';
import { AccountSwitcher } from '../src/latchkey/accounts/client.mjs';
import { ApiError } from '../src/latchkey/api/catalogue.mjs';
import { SharingError } from '../src/latchkey/sharing/index.mjs';
import { sharingCommands, runSharingCommand } from './latchkey/sharing-commands.mjs';
import { ItemError } from '../src/latchkey/items/fields.mjs';
import { RecordsError } from '../src/latchkey/portability/private-files.mjs';
import { PortabilityClient } from '../src/latchkey/portability/client.mjs';
import { recordsCommand } from './latchkey/records-commands.mjs';
import { itemCommands, runItemCommand } from './latchkey/items-commands.mjs';
import { privateOutput } from '../src/latchkey/portability/private-files.mjs';
import { constants } from 'node:fs';
import { resolve } from 'node:path';
import { cacheIdentity,emptyCache,sealCache,openCache } from '../clients/shared/offline/cache.mjs';
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
let linkedAccounts = null, releaseRegistry = async () => {}, releaseCache = async () => {};
async function accountRegistry(input) {
 if (!input.accountRegistry || typeof input.accountRegistry !== 'string') throw new ClientError('account_registry_required');
 const path = input.accountRegistry + '.lock'; let handle;
 try { handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
 catch (error) { if (error.code === 'EEXIST') throw new ClientError('account_registry_busy'); throw error; }
 releaseRegistry = async () => { await handle.close(); await unlink(path); };
 linkedAccounts = await AccountSwitcher.decrypt(await readPrivate(input.accountRegistry),input.registryKey);
 return linkedAccounts;
}
try {
 let raw = ''; for await (const chunk of process.stdin) { raw += chunk; if (Buffer.byteLength(raw) > 1500000) throw new ClientError('input_too_large'); }
 const input = JSON.parse(raw), command = process.argv[2];
 let client, profile, result;
 if(command==='accounts-create'){
  if (!Array.isArray(input.links) || !input.links.length || input.links.length > 20) throw new ClientError('invalid_account_links');
  linkedAccounts = new AccountSwitcher();
  for (const link of input.links) await linkedAccounts.link({name:link.name,kind:link.kind,profile:await readPrivate(link.profile)},link.password,{confirmed:input.confirmed === true});
  await writePrivate(input.accountRegistry,await linkedAccounts.encrypt(input.registryKey)); result = {created:true,accounts:linkedAccounts.list()};
 } else if(command==='accounts-list'){
  result = (await accountRegistry(input)).list();
 } else if(command==='accounts-unlink'){
  const accounts=await accountRegistry(input); result={unlinked:true,accounts:accounts.unlink(input.accountName,{confirmed:input.confirmed === true})};
  await writePrivate(input.accountRegistry,await accounts.encrypt(input.registryKey),true);
 } else if(command==='accounts-link'){
  const accounts=await accountRegistry(input); await accounts.link({name:input.name,kind:input.kind,profile:await readPrivate(input.profile)},input.password,{confirmed:input.confirmed === true});
  await writePrivate(input.accountRegistry,await accounts.encrypt(input.registryKey),true); result={linked:true,accounts:accounts.list()};
 } else if(['msp-identity','msp-provider'].includes(command)){
  const {mspCommand}=await import('./latchkey/msp-commands.mjs');result=await mspCommand(command,input,{readPrivate,writePrivate});
 } else if(['migration-preview','migration-review'].includes(command)){
  const {migrationCommand}=await import('./latchkey/migration-commands.mjs');result=await migrationCommand(command,input);
 } else if(['passbolt-preview','passbolt-review'].includes(command)){
  const {passboltCommand}=await import('./latchkey/passbolt-commands.mjs');result=await passboltCommand(command,input);
 } else if(['cache-refresh','cache-read'].includes(command)){
  if(!input.cache||!input.profile||resolve(input.cache)===resolve(input.profile)||input.output&&[input.cache,input.profile].some(path=>resolve(path)===resolve(input.output)))throw new ClientError('offline_cache_path_conflict');
  const lockPath=input.cache+'.lock';let cacheLock;try{cacheLock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)}catch(error){if(error.code==='EEXIST')throw new ClientError('offline_cache_busy');throw error}
  releaseCache=async()=>{await cacheLock.close();await unlink(lockPath)};
  profile=await readPrivate(input.profile);const identity=emptyCache(profile,input.vault);
  let saved;try{saved=await readPrivate(input.cache)}catch(error){if(error.code!=='ENOENT')throw error}
  if(saved&&JSON.stringify(cacheIdentity(saved))!==JSON.stringify(identity))throw new ClientError('offline_cache_mismatch');
  if(command==='cache-read'){
   const value=await openCache(saved,input.cacheKey,identity);await writePrivate(input.output,value);result={written:true,connection:value.connection,expiresAt:value.expiresAt};
  }else{
   // Persist invalidation BEFORE authentication or any network request. A refusal
   // or interruption must never leave the old cache readable through this door.
   await writePrivate(input.cache,{...identity,state:'invalidated'},!!saved);
   client=new VaultClient(profile.origin);await client.unlock(profile,input.password);
   const value=await client.readVault(input.vault);await writePrivate(input.cache,await sealCache(identity,value,input.cacheKey),true);
   await writePrivate(input.profile,profile,true);result={refreshed:true,versions:value.versions.length,expiresAt:null};
  }
 } else if(command==='run'){
  const {runConsumer}=await import('./latchkey/run-command.mjs');result=await runConsumer(input,process.argv.slice(3));process.exitCode=result.exitCode;
 } else if (command === 'records-restore') {
  const { restoreLocalRecords } = await import('./latchkey/records-local.mjs');
  result = await restoreLocalRecords(input);
 } else if (command === 'posture-inspect') {
  const { readPosture } = await import('../src/latchkey/posture/read.mjs'); result = await readPosture(input);
 } else if (command === 'identity-request') {
  client = new VaultClient(input.origin); result = await client.requestIdentity(input.email);
 } else if (command === 'runtime-keygen') {
  const machine = await MachineClient.create(input.origin, input.runtimeKey);
  await writePrivate(input.machineProfile, machine); result = await MachineClient.identity(machine);
 } else if(command==='selection-open'){
  const {SelectionExportClient}=await import('../src/latchkey/portability/selection.mjs');const value=await SelectionExportClient.open(await readPrivate(input.archive),input.exportKey);await privateOutput(input.output,handle=>handle.writeFile(JSON.stringify(value)+'\n'));result={written:true,planHash:value.planHash,custody:'Private buyer-held file; external copies cannot be recalled.'};
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
 } else if (command === 'recovery-start') {
  const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');
  const credential=await readPrivate(input.credential);client=new VaultClient(credential.origin);await client.confirmIdentity(input.identityToken);
  const pending=await new RecoveryClient(client).begin({...credential,password:input.password});
  await writePrivate(input.pending,{...pending,cookie:client.cookie});
  const {account,verifiedEmail,vaults,devices,expiresAt,identityCheck,mfa,offlineExposure}=pending.preview;
  result={account,verifiedEmail,vaults,devices,expiresAt,identityCheck,mfa,offlineExposure,pendingWritten:true};
 } else if (command === 'recovery-finish') {
  const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');const pending=await readPrivate(input.pending);
  client=new VaultClient(pending.credential.origin,{cookie:pending.cookie});
  const recovered=await new RecoveryClient(client).complete(pending,input.password,{confirmed:input.confirmed===true,beforeCommit:async({profile,kit})=>{await writePrivate(input.profile,profile);await writePrivate(input.newKit,kit)}});
  await unlink(input.pending);result={recovered:true,device:recovered.profile.device,generation:recovered.profile.generation};
 } else if (command === 'recover-preview') {
  const kit = await readPrivate(input.kit); client = new VaultClient(kit.origin);
  result = await client.previewRecovery(kit, input.password);
 } else if (command === 'recover' || command === 'records-recover') {
  if (input.confirmed !== true) throw new ClientError('recovery_confirmation_required');
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
  if (input.accountRegistry) {
   if (!['identity','vault-create','put','read','export','item-save','item-search','item-history','item-field','item-attachment','api','audit','devices'].includes(command)) throw new ClientError('account_registry_command_unsupported');
   const accounts = await accountRegistry(input); client = await accounts.switch(input.accountName,input.password); profile = client.profile; }
  else { profile = await readPrivate(input.profile); client = new VaultClient(profile.origin); await client.unlock(profile, input.password); }
  switch (command) {
   case 'recovery-self-enroll': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');const code=await new RecoveryClient(client).enrollSelf({confirmed:input.confirmed===true});await writePrivate(input.output,code);result={enrolled:true,credentialWritten:true};break;}
   case 'recovery-administrator-enroll': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');const credential=await new RecoveryClient(client).enrollAdministrator(input.custodian,input.fingerprint,{confirmed:input.confirmed===true});credential.trustedAdministrator={account:input.custodian,authorityKey:client.profile.trusted[input.custodian].authorityKey};await writePrivate(input.output,credential);result={enrolled:true,credentialWritten:true};break;}
   case 'recovery-approve': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');result=await new RecoveryClient(client).approve(input.operation,{confirmed:input.confirmed===true,identityChecked:input.identityChecked===true});break;}
   case 'emergency-enroll': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');result=await new RecoveryClient(client).enrollEmergency(input.vault,input.contact,input.fingerprint,{waitMs:input.waitMs,expiresAt:input.expiresAt,confirmed:input.confirmed===true});break;}
   case 'emergency-request': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');result=await new RecoveryClient(client).requestEmergency(input.enrollment);break;}
   case 'emergency-cancel': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');result=await new RecoveryClient(client).cancelEmergency(input.enrollment);break;}
   case 'emergency-open': {const {RecoveryClient}=await import('../src/latchkey/recovery/client.mjs');const value=await new RecoveryClient(client).openEmergency(input.enrollment);await writePrivate(input.output,value);result={written:true,vault:value.vault,versions:value.versions.length,copyWarning:value.copyWarning};break;}
   case 'custody-enroll': {const {CustodyClient}=await import('../src/latchkey/people/custody-client.mjs');result=await new CustodyClient(client).enroll(input.vault,input.custodian,input.fingerprint,{confirmed:input.confirmed});break;}
   case 'custody-preview': {const {CustodyClient}=await import('../src/latchkey/people/custody-client.mjs');result=await new CustodyClient(client).preview(input.operation,input.action);await writePrivate(input.output,result);result={written:true,review:result.review,planHash:result.planHash,expiresAt:result.expiresAt};break;}
   case 'custody-commit': {const {CustodyClient}=await import('../src/latchkey/people/custody-client.mjs');const custody=new CustodyClient(client),review=await readPrivate(input.review);if(input.sourceFingerprint)await custody.trustSource(review,input.sourceFingerprint);result=await custody.commit(review,{confirmed:input.confirmed,approvedPlanHash:input.approvedPlanHash});break;}
   case 'people-offboard': result=await client.call(['people','offboard'].join('/'),{operator:input.operator,custodian:input.custodian,confirmed:input.confirmed});break;
   case 'selection-policy': {const {SelectionExportClient}=await import('../src/latchkey/portability/selection.mjs');result=await new SelectionExportClient(client).setPlaintextPolicy(input.vault,input.allowPlaintext,{confirmed:input.confirmed});break;}
   case 'selection-preview': {const {SelectionExportClient}=await import('../src/latchkey/portability/selection.mjs');const value=await new SelectionExportClient(client).preview(input.selection,{format:input.format,review:input.review});await writePrivate(input.output,value);result={written:true,planHash:value.planHash,selection:value.plan.selection,omissions:value.plan.omissions,review:value.plan.review,coverage:value.plan.coverage};break;}
   case 'selection-export': {
    const {SelectionExportClient}=await import('../src/latchkey/portability/selection.mjs'),exporter=new SelectionExportClient(client);
    const archive=await exporter.export(await readPrivate(input.plan),input.exportKey,{confirmed:input.confirmed,approvedPlanHash:input.approvedPlanHash,format:input.format});
    try{await privateOutput(input.output,handle=>handle.writeFile(JSON.stringify(archive)+'\n'))}catch(error){try{await exporter.reportOutcome('private_file_write_failed')}catch{}throw error}
    let auditRecorded=true;try{await exporter.reportOutcome('private_file_written')}catch{auditRecorded=false}
    result={written:true,auditRecorded,custody:'Private buyer-held file; external copies cannot be recalled.',warning:input.format==='plaintext'?'Unencrypted plaintext. Approval expiry cannot recall or erase this file.':null};break;
   }
   case 'selection-import': {const {SelectionExportClient}=await import('../src/latchkey/portability/selection.mjs');result=await new SelectionExportClient(client).reimport(await readPrivate(input.archive),input.exportKey,{confirmed:input.confirmed,approvedPlanHash:input.approvedPlanHash});break;}
   case 'erasure-scan': {const {scanErasureContent}=await import('../src/latchkey/erasure/client-scan.mjs');await writePrivate(input.output,await scanErasureContent(client,input.vault,input.terms));result={written:true};break;}
   case 'exit-plan': result=await client.call(['exit','plan'].join('/'),{});break;
   case 'rules': {
    const actions=['list','get','preview','save','activate','cancel','decide','complete','inbox'];
    if(!actions.includes(input.action))throw new ClientError('invalid_rule_action');
    result=await client.call(['rules',input.action].join('/'),input.input);break;
   }
   case 'migration-import': {const {migrationCommand}=await import('./latchkey/migration-commands.mjs');result=await migrationCommand(command,input,client);break;}
   case 'passbolt-import': {const {passboltCommand}=await import('./latchkey/passbolt-commands.mjs');result=await passboltCommand(command,input,client);break;}
   case 'api': {const {apiCommand}=await import('../src/latchkey/api/client.mjs');result=await apiCommand(client,input.api);break;}
   case 'project-create': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).create({name:input.name,vault:input.vault});break;}
   case 'project-environment': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).createEnvironment(input.project,input.environment);break;}
   case 'project-set': {const {ProjectClient}=await import('../src/latchkey/projects/client.mjs');result=await new ProjectClient(client).set(input.environment,input.path,input.value,{expectedVersion:input.expectedVersion});break;}
   case 'handoff-record': { const { HandoffClient } = await import('../src/latchkey/handoffs/client.mjs'); result = await new HandoffClient(client).record(input.vault,input.handoff,{confirmed:input.confirmed}); break; }
   case 'handoff-open': { const { HandoffClient } = await import('../src/latchkey/handoffs/client.mjs'); await writePrivate(input.output,await new HandoffClient(client).open(input.vault,input.object)); result={written:true}; break; }
   case 'item-expiry-watch': {
    const { HandoffClient } = await import('../src/latchkey/handoffs/client.mjs');
    try {
     for await (const report of new HandoffClient(client).watchExpiry(input.vault, { intervalMs: input.intervalMs, checks: input.checks, withinDays: input.withinDays })) {
      process.stdout.write(JSON.stringify(report) + '\n');
     }
     result = { completed: true };
    } finally { client.lock(); }
    break;
   }
   case 'item-expiry': { const { HandoffClient } = await import('../src/latchkey/handoffs/client.mjs'); result=await new HandoffClient(client).expiry(input.vault,{withinDays:input.withinDays ?? 30}); break; }
   case 'checkout-status': result=await client.call('checkout' + '/status',{vault:input.vault,object:input.object}); break;
   case 'checkout-acquire': result=await client.call('checkout' + '/acquire',{vault:input.vault,object:input.object,expiresAt:input.expiresAt,confirmed:input.confirmed}); break;
   case 'checkout-release': result=await client.call('checkout' + '/release',{vault:input.vault,object:input.object,checkout:input.checkout,reason:input.reason,confirmed:input.confirmed}); break;
   case 'checkout-complete': result=await client.call('checkout' + '/complete',{vault:input.vault,object:input.object,checkout:input.checkout,version:input.version,confirmed:input.confirmed}); break;
   case 'identity': result = { ...client.identity(), fingerprint: await client.identity().fingerprint, serverKey: profile.serverKey }; break;
   case 'vault-create': result = await client.createVault({kind: input.kind ?? 'company'}); break;
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
  if (linkedAccounts) await writePrivate(input.accountRegistry,await linkedAccounts.encrypt(input.registryKey),true);
  else await writePrivate(input.profile, profile, true);
 }
 client?.lock();
 process.stdout.write(JSON.stringify(result) + '\n');
} catch (error) {
 // Never print stack, stdin, crypto exceptions, file contents or provider errors.
 process.stderr.write(JSON.stringify({ error: error instanceof ApiError || error instanceof PostureError || error instanceof ClientError || error instanceof ItemError || error instanceof RecordsError || error instanceof SharingError ? error.code : 'client_failed' }) + '\n');
 process.exitCode = 1;
} finally {
 linkedAccounts?.lock();
 await releaseRegistry();
 await releaseCache();
}
