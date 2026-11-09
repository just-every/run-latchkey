import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { VaultClient } from '../src/latchkey/client.mjs';
import { SharingClient } from '../src/latchkey/sharing/client.mjs';
import { subjectAudit as legacyAudit } from './.sx-legacy-audit.mjs';
import { keyed } from '../src/latchkey/erasure/subject-common.mjs';
import { id } from '../src/latchkey/crypto/envelope.mjs';
import {createPortability} from '@runeditrun/rer/modules/portability';
import archivePolicy from '../scripts/latchkey/archive-policy.mjs';

export async function promote(client,mail,operator){
 const post=(route,input)=>client.fetcher(client.origin+route,{method:'POST',headers:{origin:client.origin,'content-type':'application/json',cookie:client.cookie},body:JSON.stringify(input),redirect:'manual'});
 const step=await post('/auth/step-up',{action:'owner:transfer',returnTo:'/app'});assert.equal(step.status,202,await step.clone().text());
 const message=mail.at(-1).content.find(part=>part.type==='text/plain').value,token=new URL(message.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 assert.equal((await post('/auth/confirm',{token})).status,303);const result=await post('/auth/operator/role',{operatorId:operator,role:'owner'});assert.equal(result.status,200,await result.clone().text());
}
const keyFor=table=>table==='lky_restore_history'?'restore_id':'id';
export async function probe({owner,db,source,mail,erasureSecret,bindings,survivor,phase}){
 const destination=owner;let verifier,nonOwner;
 if(phase==='after'){
  const email='synthetic-latchkey-9300@example.test',password='synthetic-latchkey-9301';
  const response=await owner.fetcher(owner.origin+'/auth/invite',{method:'POST',headers:{origin:owner.origin,'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({email,displayName:'Synthetic surviving verifier',role:'member'}),redirect:'manual'});
  assert.equal(response.status,202,await response.clone().text());
  const link=mail.at(-1).content.find(part=>part.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];
  verifier=new VaultClient(owner.origin,{fetcher:owner.fetcher});await verifier.confirmIdentity(new URL(link).searchParams.get('token'));const enrolled=await verifier.register(password);const verifierOperator=(await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(enrolled.profile.account).first()).operator_id;await promote(owner,mail,verifierOperator);await verifier.unlock(enrolled.profile,password);
  const group=(await new SharingClient(owner).createGroup()).group,policyInput={group,policy:{historyDays:1},reason:'Synthetic retained commitment proof'};
  const review=await owner.call('generator/policy/preview',policyInput);await owner.call('generator/policy/set',{...policyInput,policy:review.policy,review:review.hash,confirmed:true});
  owner=verifier;
  const memberEmail='synthetic-latchkey-9303@example.test',memberPassword='synthetic-latchkey-9304';
  const invited=await owner.fetcher(owner.origin+'/auth/invite',{method:'POST',headers:{origin:owner.origin,'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({email:memberEmail,displayName:'Synthetic non-owner verifier',role:'member'}),redirect:'manual'});assert.equal(invited.status,202);
  const memberLink=mail.at(-1).content.find(part=>part.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];nonOwner=new VaultClient(owner.origin,{fetcher:owner.fetcher});await nonOwner.confirmIdentity(new URL(memberLink).searchParams.get('token'));const memberEnrolled=await nonOwner.register(memberPassword);await nonOwner.unlock(memberEnrolled.profile,memberPassword);
  await owner.createVault();
 }
 const operator=(await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(source.profile.account).first()).operator_id;
 const person=await db.prepare('SELECT * FROM oa_operators WHERE id=?').bind(operator).first();
 const before={};for(const table of ['lky_events','oa_auth_audit','lky_generator_policy_changes','lky_restore_history'])before[table]=(await db.prepare(`SELECT * FROM ${table} ORDER BY ${keyFor(table)}`).all()).results;
 let preview;try{preview=await owner.call('subject/erase-preview',{subject:operator});}catch(error){
  if(error.code==='subject_unmapped_content'){
   const sessionOperator=await db.prepare('SELECT o.* FROM oa_operators o JOIN lky_accounts a ON a.operator_id=o.id WHERE a.id=?').bind(owner.profile.account).first();
   try{await (await import('./.sx-debug-plan.mjs')).subjectPlan({db,tenant:owner.profile.tenant,actor:owner.profile.account,session:{operator:sessionOperator},env:bindings,now:Date.now()},operator)}catch(debug){console.log(debug.message);}
  }throw error;
 }
 if(nonOwner){await assert.rejects(nonOwner.call('subject/erase-preview',{subject:operator}),e=>e.code==='owner_required');await assert.rejects(nonOwner.call('subject/erase',{subject:operator,confirmed:true,planHash:preview.planHash}),e=>e.code==='owner_required');}
 const erased=await owner.call('subject/erase',{subject:operator,confirmed:true,planHash:preview.planHash});
 const checkpoint=erased.outstanding.find(row=>row.domain==='audit-checkpoint');
 const verify=()=>owner.call('subject/audit-verify',{operation:erased.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}});
 assert.equal((await verify()).valid,true);
 const checks=[],sanitized={};
 for(const [table,columns]of Object.entries({lky_events:['actor','device','object_id'],oa_auth_audit:['actor_id'],lky_generator_policy_changes:['actor','device','group_id'],lky_restore_history:['source_account','destination_account','vaults','plan_hash','content_hash','archive_hash']})){
  const after=(await db.prepare(`SELECT * FROM ${table} ORDER BY ${keyFor(table)}`).all()).results;
  sanitized[table]=after;
  assert.equal(after.length,before[table].length,'retained rows are not dropped');
  for(const old of before[table])assert.ok(after.some(row=>row[keyFor(table)]===old[keyFor(table)]),'every original row retained');
  const changed=after.filter(row=>before[table].some(old=>old[keyFor(table)]===row[keyFor(table)]&&JSON.stringify(old)!==JSON.stringify(row)));
  assert.ok(changed.length,`real public-door source missing: ${table}`);
  for(const column of columns){
   const row=changed.find(row=>before[table].find(old=>old[keyFor(table)]===row[keyFor(table)])[column]!==row[column])??changed[0];
   const oldValue=before[table].find(old=>old[keyFor(table)]===row[keyFor(table)])[column];
   const original=oldValue!==row[column]?oldValue:(column==='vaults'?JSON.stringify([source.profile.account]):source.profile.account);
   await db.prepare(`UPDATE ${table} SET ${column}=? WHERE ${keyFor(table)}=?`).bind(original,row[keyFor(table)]).run();
   let accepted=false,error;try{accepted=(await verify()).valid}catch(e){error=e.code}
   checks.push({table,column,accepted,error});
   assert.equal(accepted,phase==='before',`${table}.${column}`);
   if(phase!=='before')assert.equal(error,'subject_audit_tampered');
   await db.prepare(`UPDATE ${table} SET ${column}=? WHERE ${keyFor(table)}=?`).bind(row[column],row[keyFor(table)]).run();
   assert.equal((await verify()).valid,true);
  }
 }
 let additional={};
 if(phase==='after'){
  await assert.rejects(nonOwner.call('subject/audit-verify',{operation:erased.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}}),e=>e.code==='owner_required');
  const unrelated=before.lky_events.filter(row=>row.actor===owner.profile.account);assert.ok(unrelated.length);for(const row of unrelated)assert.deepEqual(sanitized.lky_events.find(current=>current.id===row.id),row);
  const records=await createPortability({db,policy:archivePolicy}),job=await records.exports.create('synthetic-latchkey-9302');while((await records.exports.advance(job,{maxParts:100})).phase!=='complete'){}
  const exported=await new Response(await records.exports.download(job)).text();
  const auditFacts=JSON.stringify((await db.prepare('SELECT facts FROM lky_subject_audit').all()).results);
  for(const term of [operator,source.profile.account,person.email,person.display_name]){assert.ok(!exported.includes(term),'erased identity absent from later export');assert.ok(!auditFacts.includes(term),'audit commitments identity-free');}
  const result=await verify();assert.ok(result.coverage.completeSanitizedRows>0);assert.equal(result.coverage.legacyPartialRows,0);
  await assert.rejects(owner.call('subject/audit-verify',{operation:erased.operation,checkpoint:{}}),e=>e.code==='held_audit_checkpoint_required');
  const logs=(await db.prepare('SELECT * FROM lky_subject_audit WHERE operation=? ORDER BY position').bind(erased.operation).all()).results;
  const last=logs.at(-1);await db.prepare('DELETE FROM lky_subject_audit WHERE operation=? AND position=?').bind(erased.operation,last.position).run();
  await assert.rejects(verify(),e=>e.code==='subject_audit_tampered');
  await db.prepare('INSERT INTO lky_subject_audit VALUES(?,?,?,?,?)').bind(last.operation,last.position,last.facts,last.previous_hash,last.hash).run();assert.equal((await verify()).valid,true);
  const retained=sanitized.lky_restore_history.find(row=>row.source_account!==before.lky_restore_history.find(old=>old.restore_id===row.restore_id)?.source_account);
  assert.ok(retained);const original=before.lky_restore_history.find(row=>row.restore_id===retained.restore_id);
  await db.prepare('DELETE FROM lky_restore_history WHERE restore_id=?').bind(retained.restore_id).run();await assert.rejects(verify(),e=>e.code==='subject_audit_tampered');
  const columns=Object.keys(retained);await db.prepare(`INSERT INTO lky_restore_history (${columns.join(',')}) VALUES(${columns.map(()=>'?').join(',')})`).bind(...columns.map(c=>retained[c])).run();assert.equal((await verify()).valid,true);
  const secondOperator=(await db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(destination.profile.account).first()).operator_id;
  const unchangedLogs=JSON.stringify(logs),rowCount=(await db.prepare('SELECT COUNT(*) AS n FROM lky_subject_erasures').first()).n;
  await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(original.source_account,retained.restore_id).run();
  const bad=await owner.call('subject/erase-preview',{subject:secondOperator});
  await assert.rejects(owner.call('subject/erase',{subject:secondOperator,confirmed:true,planHash:bad.planHash}),e=>e.code==='subject_audit_tampered');
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_subject_erasures').first()).n,rowCount);assert.ok(await db.prepare('SELECT id FROM oa_operators WHERE id=?').bind(secondOperator).first());
  await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(retained.source_account,retained.restore_id).run();
  const again=await owner.call('subject/erase-preview',{subject:secondOperator}),second=await owner.call('subject/erase',{subject:secondOperator,confirmed:true,planHash:again.planHash});
  assert.equal((await verify()).valid,true);assert.equal(JSON.stringify((await db.prepare('SELECT * FROM lky_subject_audit WHERE operation=? ORDER BY position').bind(erased.operation).all()).results),unchangedLogs,'old proof bytes stay immutable');
  const secondCheckpoint=second.outstanding.find(row=>row.domain==='audit-checkpoint');assert.equal((await owner.call('subject/audit-verify',{operation:second.operation,checkpoint:{root:secondCheckpoint.root,length:secondCheckpoint.length,signature:secondCheckpoint.signature}})).valid,true);
  await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(original.source_account,retained.restore_id).run();await assert.rejects(verify(),e=>e.code==='subject_audit_tampered');await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(retained.source_account,retained.restore_id).run();
  // A separate legacy fixture uses the original emitter and the captured first
  // sanitized projection, never reconstructed historical facts from current rows.
  const ctx={db,tenant:owner.profile.tenant,env:{LATCHKEY_ERASURE_SECRET:erasureSecret}},legacyOperation=id();
  const redactions=Object.entries(sanitized).map(([table,rows])=>({table,keys:[keyFor(table)],rows:rows.filter(row=>before[table].some(old=>old[keyFor(table)]===row[keyFor(table)]&&JSON.stringify(old)!==JSON.stringify(row))),set:row=>row}));
  const legacy=await legacyAudit(ctx,legacyOperation,erased.counts,erased.createdAt,redactions);
  const outstanding=erased.outstanding.map(row=>row.domain==='audit-checkpoint'?{domain:'audit-checkpoint',state:'held-checkpoint-required',root:legacy.root,length:legacy.rows.length,signature:legacy.signature}:row);
  const legacyResult={operation:legacyOperation,label:erased.label,phase:erased.phase,controlPlaneErased:true,complete:false,counts:erased.counts,outstanding,createdAt:erased.createdAt};
  const proof=await keyed(ctx,'receipt',legacyResult);
  await db.batch([db.prepare('INSERT INTO lky_subject_erasures VALUES(?,?,?,?,?,?,?,?)').bind(legacyOperation,ctx.tenant,erased.label,erased.phase,JSON.stringify(erased.counts),JSON.stringify(outstanding),erased.createdAt,proof),...legacy.rows.map(row=>db.prepare('INSERT INTO lky_subject_audit VALUES(?,?,?,?,?)').bind(legacyOperation,row.position,row.facts,row.previous_hash,row.hash))]);
  const legacyVerify=()=>owner.call('subject/audit-verify',{operation:legacyOperation,checkpoint:{root:legacy.root,length:legacy.rows.length,signature:legacy.signature}});
  const legacyResultVerified=await legacyVerify();assert.equal(legacyResultVerified.coverage.completeSanitizedRows,0);assert.ok(legacyResultVerified.coverage.legacyPartialRows>0);
  await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(original.source_account,retained.restore_id).run();assert.equal((await legacyVerify()).valid,true);await assert.rejects(verify(),e=>e.code==='subject_audit_tampered');await db.prepare('UPDATE lky_restore_history SET source_account=? WHERE restore_id=?').bind(retained.source_account,retained.restore_id).run();
  assert.equal((await verify()).valid,true);
  additional={newCoverage:result.coverage,legacyCoverage:legacyResultVerified.coverage,legacyFixture:'Original legacy emitter over captured first-erasure sanitized rows',emptyCheckpointRefused:true,tailTruncationRefused:true,retainedDeletionRefused:true,priorTamperBlocksLaterErasureWithoutWrites:true,twoErasureTransitionVerified:true,oldProofUnchanged:true,unrelatedRowsPreserved:true,laterExportIdentityFree:true,auditIdentityFree:true,nonOwnerAllThreeDoorsRefused:true,latestRowTamperRefusedFromEarlierCheckpoint:true};
  verifier.lock();nonOwner.lock();
 }
 await writeFile(process.env.SX_PACKET+`/${phase}.json`,JSON.stringify({phase,sourceDoors:['real OPAQUE enrollment','activity','generator policy preview and confirmed set','Base archive import and separately approved restore activation','subject erasure preview and confirmation','subject audit verify'],intact:true,checks,...additional},null,2)+'\n');
 console.log('SX_PROBE '+JSON.stringify({phase,checks}));
 return {operation:erased.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature},subject:operator};
}
