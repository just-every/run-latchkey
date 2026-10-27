import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import { VaultClient } from '../src/latchkey/client.mjs';
import {LifecycleClient} from '../src/latchkey/lifecycle/client.mjs';
import {ProjectClient} from '../src/latchkey/projects/client.mjs';
import {itemKey,open} from '../src/latchkey/crypto/envelope.mjs';
import { CustodyClient } from '../src/latchkey/people/custody-client.mjs';
const refused=(promise,code)=>assert.rejects(promise,e=>e.code===code);
export async function custodyJourney({owner,member,ownerPassword,memberPassword,caFile,productDb:db,mail,productOrigin,fetchProduct}){
 const directory=await mkdtemp(join(tmpdir(),'latchkey-custody-'));
 const cli=async(command,input,expected=0)=>{const child=spawn(process.execPath,[resolve('scripts/latchkey.mjs'),command],{env:{...process.env,NODE_EXTRA_CA_CERTS:caFile},stdio:['pipe','pipe','pipe']});let out='',err='';child.stdout.on('data',x=>out+=x);child.stderr.on('data',x=>err+=x);child.stdin.end(JSON.stringify(input));const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(code,expected,err);for(const secret of[ownerPassword,memberPassword,'synthetic-latchkey-7801','synthetic-latchkey-7802','synthetic-latchkey-7805',owner.bundle.root.recipient.privateKey])assert.ok(!out.includes(secret)&&!err.includes(secret),'CLI must not disclose secrets');return JSON.parse(expected?err:out)};
 try{
 const email='synthetic-latchkey-7800@example.test',password='synthetic-latchkey-7801';
 await owner.call(['api','users','invite'].join('/'),{email,displayName:'Custody leaver',role:'member',returnTo:'/app/vault'});
 const token=new URL(mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const leaver=new VaultClient(productOrigin,{fetcher:fetchProduct});await leaver.confirmIdentity(token);const enrolled=await leaver.register(password);await leaver.unlock(enrolled.profile,password);
 const vault=(await leaver.createVault()).vault,privateWork=(await leaver.createVault({kind:'private-work'})).vault,family=(await leaver.createVault({kind:'family'})).vault;
 const item=(await leaver.put(vault,{value:'synthetic-latchkey-7802',attachments:[{digest:'synthetic-latchkey-7803',data:'synthetic-latchkey-7804'}]})).object;
 await leaver.put(vault,{value:'synthetic-latchkey-7805'},item);
 const project=await new ProjectClient(leaver).create({name:'Synthetic company project',vault});
 const privateItem=(await leaver.put(privateWork,{value:'synthetic-latchkey-7806'})).object;
 const trashItem=(await leaver.put(privateWork,{value:'synthetic-latchkey-7810'})).object;
 const life=new LifecycleClient(leaver);const trashed=await life.change(privateWork,trashItem,'trash',{confirmed:true});await life.change(privateWork,privateItem,'archived',{confirmed:true});
 const familyItem=(await leaver.put(family,{value:'synthetic-latchkey-7807'})).object;
 const oldSnapshot=await leaver.snapshot(vault),oldKey=oldSnapshot.key;
 const operator=(await owner.call(['api','users','list'].join('/'),{})).find(p=>p.email===email).id,custody=new CustodyClient(leaver),receiver=new CustodyClient(owner),fingerprint=await owner.identity().fingerprint;
 await refused(custody.enroll(vault,owner.profile.account,fingerprint),'custody_confirmation_required');
 await refused(custody.enroll(vault,owner.profile.account,'synthetic-latchkey-7808',{confirmed:true}),'recipient_mismatch');
 await refused(custody.enroll(vault,member.profile.account,await member.identity().fingerprint,{confirmed:true}),'active_owner_custodian_required');
 await refused(custody.enroll(family,owner.profile.account,fingerprint,{confirmed:true}),'company_vault_owner_required');
 const familySnapshot=await leaver.snapshot(family);try{const wrapped=await leaver.wrap(familySnapshot.key,owner.profile.recipientKey,{tenant:leaver.profile.tenant,vault:family,object:owner.profile.account,purpose:'company-custody',epoch:1,version:1});await refused(leaver.call(['people','custody','enroll'].join('/'),{vault:family,custodian:owner.profile.account,fingerprint,revision:familySnapshot.result.revision,confirmed:true,wrapped}),'company_vault_owner_required')}finally{familySnapshot.key.fill(0)}
 await refused(new CustodyClient(member).enroll(vault,owner.profile.account,fingerprint,{confirmed:true}),'company_vault_owner_required');
 assert.equal((await custody.enroll(vault,owner.profile.account,fingerprint,{confirmed:true})).transferred,false);
 const leaverPath=join(directory,'leaver.json'),ownerPath=join(directory,'owner.json'),reviewPath=join(directory,'review.json');
 await writeFile(leaverPath,JSON.stringify(leaver.profile),{mode:0o600});
 const enrollInput={profile:leaverPath,password,vault:privateWork,custodian:owner.profile.account,fingerprint};
 assert.equal((await cli('custody-enroll',enrollInput,1)).error,'custody_confirmation_required');assert.equal((await cli('custody-enroll',{...enrollInput,confirmed:true})).enrolled,true);
 await refused(owner.readVault(vault),'not_found');
 const rows=await db.prepare('SELECT wrapped FROM lky_company_custody WHERE owner=?').bind(leaver.profile.account).all();assert.equal(rows.results.length,2);
 for(const secret of['synthetic-latchkey-7802','synthetic-latchkey-7805',leaver.bundle.root.recipient.privateKey,owner.bundle.root.recipient.privateKey])assert.ok(!JSON.stringify(rows).includes(secret));
 const op=await owner.call(['people','offboard'].join('/'),{operator,custodian:owner.profile.account,confirmed:true});assert.equal(op.handback,'enrolled-awaiting-review');
 await assert.rejects(leaver.readVault(vault));
 await refused(receiver.preview(op.id,'reactivate'),'company_handback_pending');
 await refused(new CustodyClient(member).preview(op.id),'named_custodian_required');
 const review=await receiver.preview(op.id);assert.deepEqual(review.plan.vaults.map(v=>v.vault).sort(),[vault,privateWork].sort());assert.equal(review.plan.vaults.reduce((n,v)=>n+v.versions,0),5);assert.equal(review.plan.vaults.reduce((n,v)=>n+v.items,0),4);
 await refused(receiver.commit(review,{approvedPlanHash:review.planHash}),'custody_confirmation_required');
 await refused(receiver.commit({...review,plan:{...review.plan,action:'reactivate'}},{confirmed:true,approvedPlanHash:review.planHash}),'custody_review_changed');
 await refused(receiver.commit(review,{confirmed:true,approvedPlanHash:review.planHash}),'recipient_confirmation_required');
 await refused(receiver.trustSource(review,'synthetic-latchkey-7809'),'recipient_mismatch');
 await receiver.trustSource(review,await leaver.identity().fingerprint);
 await db.prepare('UPDATE lky_custody_reviews SET expires_at=0 WHERE id=?').bind(review.review).run();await refused(receiver.commit(review,{confirmed:true,approvedPlanHash:review.planHash}),'custody_review_expired');
 const stale=await receiver.preview(op.id);await db.prepare('UPDATE lky_vaults SET revision=revision+1 WHERE id=?').bind(vault).run();await refused(receiver.commit(stale,{confirmed:true,approvedPlanHash:stale.planHash}),'custody_review_changed');
 let fresh=await receiver.preview(op.id);
 await db.prepare("UPDATE oa_operators SET role='owner' WHERE id=(SELECT operator_id FROM lky_accounts WHERE id=?)").bind(member.profile.account).run();
 await db.prepare("UPDATE oa_operators SET role='member' WHERE id=?").bind((await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(owner.profile.account).first()).operator_id).run();
 await refused(receiver.commit(fresh,{confirmed:true,approvedPlanHash:fresh.planHash}),'authentication_required');
 await member.unlock(member.profile,memberPassword);const blocked=await member.call(['people','offboarding'].join('/'),{operation:op.id});assert.equal(blocked.handback,'blocked-no-active-owner-custodian');assert.equal(blocked.custodian,owner.profile.account);await refused(new CustodyClient(member).preview(op.id),'named_custodian_required');
 await db.prepare("UPDATE oa_operators SET role='owner' WHERE id=(SELECT operator_id FROM lky_accounts WHERE id=?)").bind(owner.profile.account).run();
 await db.prepare("UPDATE oa_operators SET role='member' WHERE id=(SELECT operator_id FROM lky_accounts WHERE id=?)").bind(member.profile.account).run();
 await owner.unlock(owner.profile,ownerPassword);await member.unlock(member.profile,memberPassword);
 await refused(receiver.commit(fresh,{confirmed:true,approvedPlanHash:fresh.planHash}),'custody_review_changed');fresh=await receiver.preview(op.id);
 await writeFile(ownerPath,JSON.stringify(owner.profile),{mode:0o600});await writeFile(reviewPath,JSON.stringify(fresh),{mode:0o600});
 const completed=await cli('custody-commit',{profile:ownerPath,password:ownerPassword,review:reviewPath,confirmed:true,approvedPlanHash:fresh.planHash,sourceFingerprint:await leaver.identity().fingerprint});assert.equal(completed.status,'transferred');assert.equal(completed.providerChanges,false);assert.equal(completed.restoredGrants,false);
 const stored=await db.prepare('SELECT envelope FROM lky_versions WHERE vault_id=? AND object_id=? AND version=1').bind(vault,item).first(),envelope=JSON.parse(stored.envelope),oldItemKey=await itemKey(oldKey,owner.profile.tenant,vault,item);
 try{await assert.rejects(open(oldItemKey,envelope,envelope.context),/cannot_decrypt/)}finally{oldKey.fill(0);oldItemKey.fill(0)}
 const result=await owner.readVault(vault);assert.equal(result.epoch,2);assert.equal(result.versions.length,3);assert.deepEqual(result.versions.filter(v=>v.object===item).map(v=>[v.object,v.version,v.value]),[[item,1,{value:'synthetic-latchkey-7802',attachments:[{digest:'synthetic-latchkey-7803',data:'synthetic-latchkey-7804'}]}],[item,2,{value:'synthetic-latchkey-7805'}]]);
 const receivedProject=(await new ProjectClient(owner).list()).find(p=>p.id===project.project);assert.equal(receivedProject.owner,owner.profile.account);assert.deepEqual(receivedProject.value,{schema:['latchkey','project','v1'].join('/'),name:'Synthetic company project'});
 const retained=(await owner.call(['lifecycle','list'].join('/'),{vault:privateWork})).items.find(v=>v.object===trashItem);assert.equal(retained.state,'trash');assert.equal(retained.retentionActive,false);assert.equal(retained.expiresAt,trashed.expiresAt);assert.deepEqual((await owner.readItem(privateWork,trashItem)).versions[0].value,{value:'synthetic-latchkey-7810'});
 assert.deepEqual((await owner.readItem(privateWork,privateItem)).versions[0].value,{value:'synthetic-latchkey-7806'});
 assert.equal((await owner.call(['lifecycle','list'].join('/'),{vault:privateWork})).items.find(v=>v.object===privateItem).state,'archived');await new LifecycleClient(owner).change(privateWork,privateItem,'active',{confirmed:true});
 await refused(owner.readVault(family),'not_found');assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=? AND object_id=?').bind(family,familyItem).first()).n,1);
 await refused(receiver.commit(fresh,{confirmed:true,approvedPlanHash:fresh.planHash}),'custody_review_expired');
 await assert.rejects(owner.call(['api','users','status'].join('/'),{operator,status:'active'}));
 const activationPath=join(directory,'reactivation.json');assert.equal((await cli('custody-preview',{profile:ownerPath,password:ownerPassword,operation:op.id,action:'reactivate',output:activationPath})).written,true);
 const activation=JSON.parse(await readFile(activationPath,'utf8'));assert.deepEqual(activation.plan.vaults,[]);assert.equal((await receiver.commit(activation,{confirmed:true,approvedPlanHash:activation.planHash})).status,'reactivated');
 await assert.rejects(leaver.readVault(vault));
 await leaver.requestIdentity(email);const newToken=new URL(mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');await leaver.confirmIdentity(newToken);await leaver.unlock(enrolled.profile,password);
 await refused(leaver.readVault(vault),'not_found');await refused(leaver.readVault(privateWork),'not_found');assert.deepEqual((await leaver.readItem(family,familyItem)).versions[0].value,{value:'synthetic-latchkey-7807'});
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_recipients WHERE vault_id=?').bind(vault).first()).n,1);
 const audit=await owner.call('audit',{});assert.ok(audit.some(e=>e.action==='company_handback_completed'));assert.ok(audit.some(e=>e.action==='membership_reactivated'));
 for(const secret of['synthetic-latchkey-7802','synthetic-latchkey-7805','synthetic-latchkey-7807'])assert.ok(!JSON.stringify(audit).includes(secret));
 console.log('Company custody HTTP journey: explicit encrypted enrollment, owner-only reviewed key rotation, exact histories and family exclusion, stale and expired refusal, no-custodian refusal, replay and fresh membership-only reactivation passed');
 leaver.lock();
 }finally{await rm(directory,{recursive:true,force:true})}
}

export async function runCustodyJourney(){
 const {vaultFixture}=await import('./browser/fixture.mjs');
 const f=await vaultFixture({browserEnabled:false});
 try{
  const email='synthetic-latchkey-7890@example.test',password='synthetic-latchkey-7891';
  await f.owner.call(['api','users','invite'].join('/'),{email,displayName:'Independent custody member',role:'member',returnTo:'/app/vault'});
  const token=new URL(f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  const member=new VaultClient(f.origin,{fetcher:f.fetcher});await member.confirmIdentity(token);const enrolled=await member.register(password);await member.unlock(enrolled.profile,password);
  await custodyJourney({owner:f.owner,member,ownerPassword:f.password,memberPassword:password,caFile:f.caFile,productDb:f.db,mail:f.mail,productOrigin:f.origin,fetchProduct:f.fetcher});
 }finally{await f.close()}
}
