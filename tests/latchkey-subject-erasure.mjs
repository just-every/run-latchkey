import assert from 'node:assert/strict';
import { VaultClient } from '../src/latchkey/client.mjs';
import { SharingClient } from '../src/latchkey/sharing/client.mjs';
import { createAttachment } from '../src/latchkey/items/attachments.mjs';
import { digest } from '../src/latchkey/crypto/envelope.mjs';
import { subjectReplayKnown,subjectItemReplayKnown } from '../src/latchkey/erasure/subject.mjs';

const rejects=(promise,code)=>assert.rejects(promise,error=>error.code===code);
async function backup(records){const job=await records.exports.create('synthetic-latchkey-980');for(;;){if((await records.exports.advance(job,{maxParts:100})).phase==='complete')break;}const raw=await new Response(await records.exports.download(job)).text();return {job,raw,lines:raw.trim().split('\n').map(line=>JSON.parse(line))};}

// An actual invited third person, real OPAQUE enrollment, emitted Worker and D1.
// The caller supplies the existing official-schema mail network fixture only.
export async function runSubjectErasureJourneys({owner,db,records,mail,post,fetcher=owner.fetcher,erasureSecret}){
 const email='synthetic-latchkey-981@example.test',name='synthetic-latchkey-982',password='synthetic-latchkey-983';
 assert.equal((await post('/auth/invite',{email,displayName:name,role:'admin'},owner.cookie)).status,202);
 const message=mail.at(-1).content.find(part=>part.type==='text/plain').value,link=message.match(/https:\/\/[^\s<>]+/)[0];
 const person=new VaultClient(owner.origin,{fetcher});await person.confirmIdentity(new URL(link).searchParams.get('token'));
 const registered=await person.register(password);await person.unlock(registered.profile,password);
 const operator=(await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(person.profile.account).first()).operator_id;
 const vault=(await person.createVault()).vault,attachment=await createAttachment('synthetic-latchkey-984',new TextEncoder().encode('synthetic-latchkey-985'));
 const item=await person.put(vault,{title:'synthetic-latchkey-986',secret:'synthetic-latchkey-987',attachments:[attachment]});
 await person.put(vault,{secret:'synthetic-latchkey-988'},item.object);
 await person.put(vault,{schema:'latchkey/template/v1',name:'synthetic-latchkey-989',fields:[]});
 const otherVault=(await owner.createVault()).vault,kept=await owner.put(otherVault,{secret:'synthetic-latchkey-990'});
 const identity=await digest(JSON.stringify([person.profile.recipientKey,person.profile.authorityKey]));
 await person.pinAccount(owner.profile.account,await digest(JSON.stringify([owner.profile.recipientKey,owner.profile.authorityKey])));
 await owner.share(otherVault,person.profile.account,identity,['read']);
 assert.equal((await person.readItem(otherVault,kept.object)).versions[0].value.secret,'synthetic-latchkey-990');
 const personalSharing=new SharingClient(person),group=await personalSharing.createGroup();
 await owner.call('generator/policy/set',{group:group.group,policy:{historyDays:1},reason:email});
 await rejects(person.call('subject/erase-preview',{subject:operator}),'owner_required');
 const ownerOperator=(await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(owner.profile.account).first()).operator_id;
 await rejects(owner.call('subject/erase-preview',{subject:ownerOperator}),'self_erasure_forbidden');
 const before=await backup(records),preview=await owner.call('subject/erase-preview',{subject:operator});
 assert.equal(preview.complete,false);assert.equal(preview.requiresConfirmation,true);
 await rejects(owner.call('subject/erase',{subject:operator,confirmed:false,planHash:preview.planHash}),'subject_erasure_confirmation_required');
 await rejects(owner.call('subject/erase',{subject:operator,confirmed:true,planHash:'synthetic-latchkey-991'}),'subject_erasure_plan_changed');
 assert.ok(await db.prepare('SELECT id FROM oa_operators WHERE id=?').bind(operator).first());
 const erased=await owner.call('subject/erase',{subject:operator,confirmed:true,planHash:preview.planHash});
 assert.equal(erased.controlPlaneErased,true);assert.equal(erased.complete,false);
 assert.ok(erased.outstanding.some(row=>row.domain==='encrypted-client-content'&&row.vaults.includes(otherVault)));
 assert.ok(erased.outstanding.some(row=>row.domain==='disconnected-device-cache'&&row.state==='outstanding'));
 assert.equal((await owner.call('subject/erase',{subject:operator,confirmed:true,planHash:preview.planHash})).operation,erased.operation);
 assert.equal((await owner.call('subject/erasure-status',{operation:erased.operation})).operation,erased.operation);
 await rejects(records.exports.status(before.job),'job_not_found');
 assert.equal((await post('/auth/invite',{email,displayName:name,role:'member'},owner.cookie)).status,409);
 const mailCount=mail.length;assert.equal((await post('/auth/magic-link',{email})).status,202);assert.equal(mail.length,mailCount);
 assert.equal(await db.prepare('SELECT id FROM oa_operators WHERE id=?').bind(operator).first(),null);
 assert.equal(await db.prepare('SELECT id FROM lky_accounts WHERE id=?').bind(person.profile.account).first(),null);
 assert.equal(await db.prepare('SELECT id FROM lky_vaults WHERE id=?').bind(vault).first(),null);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=?').bind(vault).first()).n,0);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_recipients WHERE account_id=?').bind(person.profile.account).first()).n,0);
 await assert.rejects(person.readVault(otherVault),error=>error.status===401||error.status===403);
 assert.equal((await owner.readItem(otherVault,kept.object)).versions[0].value.secret,'synthetic-latchkey-990');
 const invalidations=await owner.call('subject/invalidations',{});assert.ok(invalidations.invalidations.some(row=>row.vault===otherVault&&row.status==='pending'));
 await rejects(owner.put(otherVault,{secret:'synthetic-latchkey-992'}),'subject_key_rotation_required');
 await owner.rotate(otherVault);
 await owner.put(otherVault,{secret:'synthetic-latchkey-993'});
 assert.ok((await owner.call('subject/invalidations',{})).invalidations.some(row=>row.vault===otherVault&&row.status==='rotated'));
 const checkpoint=erased.outstanding.find(row=>row.domain==='audit-checkpoint');
 assert.equal((await owner.call('subject/audit-verify',{operation:erased.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}})).valid,true);
 const firstAudit=await db.prepare('SELECT * FROM lky_subject_audit WHERE operation=? ORDER BY position LIMIT 1').bind(erased.operation).first();
 await db.prepare("UPDATE lky_subject_audit SET facts='{}' WHERE operation=? AND position=?").bind(erased.operation,firstAudit.position).run();
 await rejects(owner.call('subject/audit-verify',{operation:erased.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}}),'subject_audit_tampered');
 await db.prepare('UPDATE lky_subject_audit SET facts=? WHERE operation=? AND position=?').bind(firstAudit.facts,erased.operation,firstAudit.position).run();
 if(erasureSecret){
  const ctx={db,tenant:owner.profile.tenant,env:{LATCHKEY_ERASURE_SECRET:erasureSecret}};
  assert.equal(await subjectReplayKnown(ctx,'email',email),true);assert.equal(await subjectReplayKnown(ctx,'operator',operator),true);assert.equal(await subjectItemReplayKnown(ctx,vault,item.object),true);
 }
 const after=await backup(records),rows=after.lines.filter(row=>row.kind==='part').flatMap(part=>part.items).filter(item=>item.kind==='row');
 const exported=JSON.stringify(rows);for(const original of [email,name,operator,person.profile.account,person.profile.device,vault])assert.ok(!exported.includes(original),'removed identity/owned content must be absent from later exports');
 assert.ok(rows.some(row=>row.table==='lky_subject_fences'));assert.ok(rows.some(row=>row.table==='lky_subject_audit'));
 console.log('Person erasure: native third-person enrollment, reviewed owner confirmation, owned ciphertext/template/attachment deletion, shared-authority removal without unrelated value loss, anonymized audit/tamper checks, connected revocation and mandatory vault rekey, keyed replay and later exports passed; encrypted other-owner scans/external copies remain explicitly pending');
 return {privateValues:[person.bundle.root.recipient.privateKey,person.bundle.root.authority.privateKey,person.bundle.root.recovery.privateKey,person.bundle.signing.privateKey,password,'synthetic-latchkey-984','synthetic-latchkey-985','synthetic-latchkey-986','synthetic-latchkey-987','synthetic-latchkey-988','synthetic-latchkey-989','synthetic-latchkey-990','synthetic-latchkey-993'],erasedArchive:before.raw,laterJournal:{sourceIdentity:after.lines[0].sourceIdentity,epoch:after.lines[0].epoch,journal:after.lines[0].journal},operation:erased.operation};
}
