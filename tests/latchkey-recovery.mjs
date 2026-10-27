import assert from 'node:assert/strict';
import { createPortability } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../scripts/latchkey/archive-policy.mjs';
import { RecoveryClient } from '../src/latchkey/recovery/client.mjs';
import { VaultClient } from '../src/latchkey/client.mjs';
import { mkdtemp, writeFile, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { encode, random } from '../src/latchkey/crypto/envelope.mjs';

// Called through the real emitted Worker, with both factors held by the client.
export async function recoveryPreviewJourney(f) {
 const client = new VaultClient(f.origin, { fetcher: f.fetcher });
 const vault = (await f.owner.createVault()).vault;
 await f.owner.put(vault, { value: 'synthetic-latchkey-9001' });
 const devicesBefore = await f.owner.call('devices', {});
 const preview = await client.previewRecovery(f.enrolled.kit, f.password);
 assert.equal(preview.account, f.enrolled.profile.account);
 assert.equal(preview.generation, f.enrolled.profile.generation);
 assert.equal(preview.verifiedEmail, 'synthetic-latchkey-1100@example.test');
 assert.ok(preview.vaults.some(row => row.id === vault));
 assert.ok(preview.devices.some(row => row.id === f.enrolled.profile.device));
 assert.equal(preview.offlineExposure, 'unreachable-caches-and-previous-copies-cannot-be-recalled');
 assert.equal(client.token, null);
 assert.deepEqual(await f.owner.call('devices', {}), devicesBefore);
 await assert.rejects(client.previewRecovery(f.enrolled.kit, 'synthetic-latchkey-9002'), { code: 'authentication_failed' });
 await assert.rejects(client.previewRecovery({ ...f.enrolled.kit, recoverySecret: encode(random()) }, f.password), /cannot_decrypt/);
 await assert.rejects(f.owner.call('recovery' + '/preview', {}), { code: 'recovery_required' });
 assert.equal(client.token, null);
 const directory = await mkdtemp(join(tmpdir(), 'latchkey-recovery-confirm-'));
 try {
  const kit = join(directory, 'kit.json'); await writeFile(kit, JSON.stringify(f.enrolled.kit), {mode:0o600});
  const result = spawnSync(process.execPath, ['scripts/latchkey.mjs','recover'], {input:JSON.stringify({kit,password:f.password}),encoding:'utf8'});
  assert.equal(result.status,1);assert.equal(JSON.parse(result.stderr).error,'recovery_confirmation_required');
  assert.deepEqual(await f.owner.call('devices', {}), devicesBefore);
 } finally { await rm(directory,{recursive:true,force:true}); }
 const recovered = await client.recover(f.enrolled.kit, f.password);
 await assert.rejects(f.owner.call('vaults', {}), { code: 'authority_expired' });
 await assert.rejects(f.owner.unlock(f.enrolled.profile, f.password), { code: 'authentication_failed' });
 await assert.rejects(client.previewRecovery(f.enrolled.kit, f.password), { code: 'kit_revoked' });
 await f.owner.unlock(recovered.profile, f.password);
 assert.equal((await f.owner.readVault(vault)).versions[0].value.value, 'synthetic-latchkey-9001');
 const audit = await f.owner.call('audit', {});
 assert.ok(audit.some(row => row.action === 'account_recovered'));
 for (const value of [f.password, f.enrolled.kit.recoverySecret, recovered.kit.recoverySecret, 'synthetic-latchkey-9001']) {
  assert.ok(!JSON.stringify(preview).includes(value)); assert.ok(!JSON.stringify(audit).includes(value));
 }
}
// Recovery custody uses the real identity, PAKE, mail and encrypted Worker doors.
async function member(f,n,role='member') {
 const email=`synthetic-latchkey-${n}@example.test`,password=`synthetic-latchkey-${n+1}`;
 const response=await f.fetcher(f.origin+'/auth/invite',{method:'POST',headers:{origin:f.origin,cookie:f.owner.cookie,'content-type':['application','json'].join('/')},body:JSON.stringify({email,displayName:`synthetic-latchkey-${n}`,role})});assert.equal(response.status,202,await response.text());
 const token=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.confirmIdentity(token);const enrolled=await client.register(password);await client.unlock(enrolled.profile,password);return {client,enrolled,password,email};
}
async function verifiedClient(f,email) {
 const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.requestIdentity(email);
 const token=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');await client.confirmIdentity(token);return client;
}
async function command(f,name,input,expected=0) {
 const child=spawn(process.execPath,['scripts/latchkey.mjs',name],{env:{...process.env,NODE_EXTRA_CA_CERTS:f.caFile},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.stdin.end(JSON.stringify(input));const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(code,expected,err);return {value:JSON.parse(expected?err:out),output:out+err};
}
export async function independentRecoveryJourney(f) {
 const person=await member(f,9100),vault=(await person.client.createVault()).vault;
 await person.client.put(vault,{value:'synthetic-latchkey-9102'});
 const recovery=new RecoveryClient(person.client),directory=await mkdtemp(join(tmpdir(),'latchkey-independent-recovery-'));
 let code;try{const profile=join(directory,'profile.json'),output=join(directory,'code.json');await writeFile(profile,JSON.stringify(person.client.profile),{mode:0o600});
 assert.equal((await command(f,'recovery-self-enroll',{profile,password:person.password,output},1)).value.error,'recovery_confirmation_required');
 const enrollment=await command(f,'recovery-self-enroll',{profile,password:person.password,output,confirmed:true});code=JSON.parse(await readFile(output,'utf8'));assert.equal((await stat(output)).mode&0o777,0o600);assert.equal(enrollment.value.credentialWritten,true);assert.ok(!enrollment.output.includes(code.secret));
 }finally{await rm(directory,{recursive:true,force:true})}
 const clean=await verifiedClient(f,person.email),self=new RecoveryClient(clean),password='synthetic-latchkey-9103';
 await assert.rejects(new RecoveryClient(f.owner).begin({...code,password}),{code:'recovery_enrollment_unavailable'});
 const passwordOnly=new VaultClient(f.origin,{fetcher:f.fetcher});await passwordOnly.unlock(person.enrolled.profile,person.password);await assert.rejects(new RecoveryClient(passwordOnly).begin({...code,password}),{code:'fresh_verified_identity_required'});
 const pending=await self.begin({...code,password});
 assert.deepEqual(pending.preview.vaults.map(row=>row.id),[vault]);assert.ok(pending.preview.devices.some(row=>row.id===person.enrolled.profile.device));
 const invalid={...pending,credential:{...pending.credential,secret:encode(random())}};
 await assert.rejects(self.complete(invalid,password,{confirmed:true}),/cannot_decrypt/);
 const authenticFetcher=clean.fetcher;clean.fetcher=(url,init)=>authenticFetcher(url,url.endsWith(['recovery','session','finish'].join('/'))?{...init,body:JSON.stringify({...JSON.parse(init.body),signature:'synthetic-latchkey-9193'})}:init);
 try{await assert.rejects(self.complete(pending,password,{confirmed:true}),{code:'recovery_possession_required'})}finally{clean.fetcher=authenticFetcher}
 const oldCookie=person.client.cookie,recovered=await self.complete(pending,password,{confirmed:true});
 await assert.rejects(person.client.readVault(vault),error=>error.status===401);
 const oldSession=await f.fetcher(f.origin+'/api/latchkey/account',{method:'POST',headers:{origin:f.origin,cookie:oldCookie,'content-type':['application','json'].join('/')},body:'{}'});assert.equal(oldSession.status,401);
 await assert.rejects(person.client.unlock(person.enrolled.profile,person.password),{code:'authentication_failed'});
 await person.client.unlock(recovered.profile,password);assert.equal((await person.client.readVault(vault)).versions[0].value.value,'synthetic-latchkey-9102');
 const again=new RecoveryClient(await verifiedClient(f,person.email));await assert.rejects(again.begin({...code,password}),{code:'recovery_enrollment_unavailable'});
 const expiringCode=await new RecoveryClient(person.client).enrollSelf({confirmed:true}),expiring=await again.begin({...expiringCode,password});await f.db.prepare('UPDATE lky_recovery_cases SET expires_at=0 WHERE id=?').bind(expiring.preview.operation).run();await assert.rejects(again.complete(expiring,password,{confirmed:true}),{code:'recovery_case_expired'});
 const secondCode=await new RecoveryClient(person.client).enrollSelf({confirmed:true});await person.client.call(['recovery','revoke'].join('/'),{enrollment:secondCode.enrollment});await assert.rejects(again.begin({...secondCode,password}),{code:'recovery_enrollment_unavailable'});
 const admin={client:f.owner},target=await member(f,9130),company=(await target.client.createVault()).vault;
 await target.client.put(company,{value:'synthetic-latchkey-9132'});
 const adminIdentity=await admin.client.identity(),targetIdentity=await target.client.identity();await admin.client.pinAccount(targetIdentity.account,await targetIdentity.fingerprint);
 const enrollment=await new RecoveryClient(target.client).enrollAdministrator(adminIdentity.account,await adminIdentity.fingerprint,{confirmed:true});
 await assert.rejects(target.client.createVault({kind:'family'}),{code:'independent_family_account_required'});
 const lost=new RecoveryClient(await verifiedClient(f,target.email)),newPassword='synthetic-latchkey-9133';
 const request=await lost.begin({...enrollment,password:newPassword,trustedAdministrator:{account:adminIdentity.account,authorityKey:adminIdentity.authorityKey}});
 await assert.rejects(lost.complete(request,newPassword,{confirmed:true}),{code:'recovery_approval_required'});
 await assert.rejects(new RecoveryClient(person.client).approve(request.preview.operation,{confirmed:true,identityChecked:true}),{code:'named_recovery_administrator_required'});
 await assert.rejects(new RecoveryClient(admin.client).approve(request.preview.operation,{confirmed:true}),{code:'identity_review_required'});
 await new RecoveryClient(admin.client).approve(request.preview.operation,{confirmed:true,identityChecked:true});
 const result=await lost.complete(request,newPassword,{confirmed:true});
 await assert.rejects(target.client.readVault(company),error=>error.status===401);await target.client.unlock(result.profile,newPassword);assert.equal((await target.client.readVault(company)).versions[0].value.value,'synthetic-latchkey-9132');
 await assert.rejects(new RecoveryClient(admin.client).approve(request.preview.operation,{confirmed:true,identityChecked:true}),{code:'named_recovery_administrator_required'});
 const family=(await target.client.createVault({kind:'family'})).vault;await target.client.put(family,{value:'synthetic-latchkey-9134'});
 await assert.rejects(new RecoveryClient(target.client).enrollAdministrator(adminIdentity.account,await adminIdentity.fingerprint,{confirmed:true}),{code:'independent_family_account_required'});
 const account=await f.db.prepare('SELECT * FROM lky_accounts WHERE id=?').bind(target.client.profile.account).first();
 assert.notEqual(account.opaque_record,'');assert.notEqual(result.profile.serverKey,target.enrolled.profile.serverKey);
 const audit=JSON.stringify((await f.db.prepare('SELECT * FROM lky_events').all()).results),storage=JSON.stringify((await f.db.prepare('SELECT * FROM lky_recovery_custody').all()).results),mail=JSON.stringify(f.mail),logs=JSON.stringify(f.runtimeLogs),facts=JSON.stringify((await f.db.prepare('SELECT facts FROM lky_audit_details').all()).results);
 assert.ok(facts.includes('recovery_possession_required'));assert.ok(facts.includes('succeeded'));
 for(const value of [code.secret,secondCode.secret,person.password,password,newPassword,target.client.bundle.root.recipient.privateKey,'synthetic-latchkey-9102','synthetic-latchkey-9132'])for(const output of[audit,storage,mail,logs,facts])assert.ok(!output.includes(value),'Recovery material must remain client-held');
 assert.ok(f.mail.some(row=>row.personalizations?.some(value=>value.to?.some(to=>to.email===person.email))&&row.subject==='Latchkey recovery notice'));
 console.log('Independent one-use self recovery and named administrator lost-password recovery passed');
}
export async function emergencyRecoveryJourney(f) {
 const owner=await member(f,9200),contact=await member(f,9210),stranger=await member(f,9220),vault=(await owner.client.createVault({kind:'family'})).vault;
 await owner.client.put(vault,{value:'synthetic-latchkey-9202'});const unrelated=(await owner.client.createVault({kind:'family'})).vault;await owner.client.put(unrelated,{value:'synthetic-latchkey-9203'});
 await contact.client.pinAccount(owner.client.profile.account,await owner.client.identity().fingerprint);
 const recovery=new RecoveryClient(owner.client),recipient=new RecoveryClient(contact.client),waitMs=3600000,expiresAt=Date.now()+3*waitMs;
 const enroll=async()=>recovery.enrollEmergency(vault,contact.client.profile.account,await contact.client.identity().fingerprint,{waitMs,expiresAt,confirmed:true});
 const canceled=await enroll();const notices=f.mail.length,request=await recipient.requestEmergency(canceled.enrollment);assert.equal(f.mail.length,notices+1);assert.deepEqual(request.scope,[vault]);assert.ok(request.availableAt> Date.now());
 const repeated=await recipient.requestEmergency(canceled.enrollment);assert.deepEqual(repeated,request);assert.equal(f.mail.length,notices+1);
 await assert.rejects(recipient.openEmergency(canceled.enrollment),{code:'emergency_waiting'});
 await assert.rejects(new RecoveryClient(stranger.client).requestEmergency(canceled.enrollment),{code:'emergency_scope_refused'});
 await assert.rejects(recipient.cancelEmergency(canceled.enrollment),{code:'emergency_owner_required'});
 await recovery.cancelEmergency(canceled.enrollment);await assert.rejects(recipient.openEmergency(canceled.enrollment),{code:'emergency_authority_expired'});
 const ready=await enroll();await recipient.requestEmergency(ready.enrollment);
 // Set an elapsed start in the real store rather than waiting an hour.
 await f.db.prepare('UPDATE lky_emergency_access SET requested_at=? WHERE id=?').bind(Date.now()-waitMs-1000,ready.enrollment).run();
 const opened=await recipient.openEmergency(ready.enrollment);assert.equal(opened.vault,vault);assert.deepEqual(opened.versions.map(row=>row.value.value),['synthetic-latchkey-9202']);
 await assert.rejects(contact.client.readVault(unrelated),{code:'not_found'});await assert.rejects(contact.client.readVault(vault),{code:'not_found'});
 await f.db.prepare('UPDATE lky_emergency_access SET expires_at=1 WHERE id=?').bind(ready.enrollment).run();await assert.rejects(recipient.openEmergency(ready.enrollment),{code:'emergency_authority_expired'});
 const revoked=await enroll();await recipient.requestEmergency(revoked.enrollment);await f.db.prepare('UPDATE lky_emergency_access SET requested_at=? WHERE id=?').bind(Date.now()-waitMs-1000,revoked.enrollment).run();await recovery.cancelEmergency(revoked.enrollment);await assert.rejects(recipient.openEmergency(revoked.enrollment),{code:'emergency_authority_expired'});
 for(const output of[JSON.stringify(f.mail),JSON.stringify(f.runtimeLogs),JSON.stringify((await f.db.prepare('SELECT * FROM lky_events').all()).results)])for(const secret of['synthetic-latchkey-9202','synthetic-latchkey-9203',owner.client.bundle.root.recipient.privateKey])assert.ok(!output.includes(secret));
 console.log('Personal emergency scope, waiting, notices, cancellation and expiry passed');
}
export async function recoveryCliJourney(f) {
 const person=await member(f,9400),vault=(await person.client.createVault()).vault;await person.client.put(vault,{value:'synthetic-latchkey-9402'});const credential=await new RecoveryClient(person.client).enrollSelf({confirmed:true}),directory=await mkdtemp(join(tmpdir(),'latchkey-cli-recovery-'));
 try {
 const code=join(directory,'code.json'),pending=join(directory,'pending.json'),profile=join(directory,'new-profile.json'),kit=join(directory,'new-kit.json');await writeFile(code,JSON.stringify(credential),{mode:0o600});
 await person.client.requestIdentity(person.email);const identityToken=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token'),password='synthetic-latchkey-9403';
 const started=await command(f,'recovery-start',{credential:code,pending,identityToken,password});assert.equal(started.value.account,person.client.profile.account);assert.equal(started.value.verifiedEmail,person.email);assert.deepEqual(started.value.vaults.map(v=>v.id),[vault]);assert.equal((await stat(pending)).mode&0o777,0o600);
 const input={pending,profile,newKit:kit,password};assert.equal((await command(f,'recovery-finish',input,1)).value.error,'recovery_confirmation_required');
 const finished=await command(f,'recovery-finish',{...input,confirmed:true});assert.equal(finished.value.recovered,true);for(const file of[profile,kit])assert.equal((await stat(file)).mode&0o777,0o600);await assert.rejects(stat(pending),{code:'ENOENT'});
 const recovered=JSON.parse(await readFile(profile,'utf8'));await assert.rejects(person.client.readVault(vault),error=>error.status===401);await person.client.unlock(recovered,password);assert.equal((await person.client.readVault(vault)).versions[0].value.value,'synthetic-latchkey-9402');
 for(const output of[started.output,finished.output])for(const secret of[credential.secret,password,recovered.deviceSecret,'synthetic-latchkey-9402'])assert.ok(!output.includes(secret));
 }finally{await rm(directory,{recursive:true,force:true})}
 console.log('Shipped CLI recovery start and finish keep private files private and require confirmation');
}
export async function recoveryArchiveErasureJourney(f) {
 const person=await member(f,9300),vault=(await person.client.createVault({kind:'family'})).vault;await person.client.put(vault,{value:'synthetic-latchkey-9302'});
 const recovery=new RecoveryClient(person.client),code=await recovery.enrollSelf({confirmed:true});
 const pending=await new RecoveryClient(await verifiedClient(f,person.email)).begin({...code,password:'synthetic-latchkey-9303'});
 const emergency=await recovery.enrollEmergency(vault,f.owner.profile.account,await f.owner.identity().fingerprint,{waitMs:3600000,expiresAt:Date.now()+7200000,confirmed:true});
 const records=await createPortability({db:f.db,policy:archivePolicy}),job=await records.exports.create();for(;;){if((await records.exports.advance(job,{maxParts:100})).phase==='complete')break}
 const lines=(await new Response(await records.exports.download(job)).text()).trim().split('\n').map(row=>JSON.parse(row));
 for(const table of['lky_recovery_custody','lky_recovery_cases','lky_emergency_access']){assert.ok(!lines[0].tables.some(row=>row.name===table));assert.ok(lines[0].excludedTables.includes(table))}
 const destination=await (await import('./browser/fixture.mjs')).vaultFixture({browserEnabled:false,enrollOwner:false});try{const imported=await createPortability({db:destination.db,policy:archivePolicy}),operation=await imported.imports.create(lines[0]);for(const part of lines.slice(1,-1))await imported.imports.uploadPart(operation,part.index,part);assert.equal((await imported.imports.finalize(operation,{contentHash:lines.at(-1).contentHash,archiveHash:lines.at(-1).archiveHash})).phase,'complete');for(const table of['lky_recovery_custody','lky_recovery_cases','lky_emergency_access'])assert.equal((await destination.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first()).n,0)}finally{await destination.close()}
 const operator=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(person.client.profile.account).first()).operator_id;
 const preview=await f.owner.call(['subject','erase-preview'].join('/'),{subject:operator});await f.owner.call(['subject','erase'].join('/'),{subject:operator,confirmed:true,planHash:preview.planHash});
 assert.equal(await f.db.prepare('SELECT id FROM lky_recovery_custody WHERE id=?').bind(code.enrollment).first(),null);assert.equal(await f.db.prepare('SELECT id FROM lky_recovery_cases WHERE id=?').bind(pending.preview.operation).first(),null);assert.equal(await f.db.prepare('SELECT id FROM lky_emergency_access WHERE id=?').bind(emergency.enrollment).first(),null);
 console.log('Recovery authority stays absent after actual archive restore and person erasure removes custody');
}
export async function recoveryNoticeFailureJourney() {
 const f=await (await import('./browser/fixture.mjs')).vaultFixture({browserEnabled:false,mailStatus:503});try{
 await assert.rejects(new RecoveryClient(f.owner).enrollSelf({confirmed:true}),{code:'recovery_notice_unavailable'});
 assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_recovery_custody').first()).n,0);
 console.log('Failed mail acceptance refuses enrollment without retaining recovery custody');
 }finally{await f.close()}
}
if (process.argv[1] === import.meta.filename) {
 const { vaultFixture } = await import('./browser/fixture.mjs');
 const f = await vaultFixture({ browserEnabled: false });
 try { await recoveryNoticeFailureJourney(); await independentRecoveryJourney(f); await emergencyRecoveryJourney(f); await recoveryArchiveErasureJourney(f); await recoveryCliJourney(f); await recoveryPreviewJourney(f); console.log('Recovery preview, kit factors, old-authority refusal and retained decryption passed'); }
 finally { await f.close(); }
}
