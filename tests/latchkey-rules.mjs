import assert from 'node:assert/strict';
import { vaultFixture } from './browser/fixture.mjs';
import { createItem } from '../src/latchkey/items/types.mjs';
import { restoreDomainArchive } from './latchkey-evidence.mjs';
import { LifecycleClient } from '../src/latchkey/lifecycle/client.mjs';
import { reconcileBoundReviews } from '../src/latchkey/rules/review-results.mjs';
import { SharingClient, PublicLinkClient } from '../src/latchkey/sharing/client.mjs';
import { ProjectClient } from '../src/latchkey/projects/client.mjs';
import { VaultClient } from '../src/latchkey/client.mjs';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { id } from '../src/latchkey/crypto/envelope.mjs';
const route = (...parts) => ['rules',...parts].join('/');
const reviewRoute = name => ['reviews',name].join('/');
const refused = (promise,code) => assert.rejects(promise,error=>error.code===code);
export async function ruleLifecycleJourney() {
 const realNow=Date.now;let clock=Date.parse('2031-11-15T12:00:00Z');Date.now=()=>clock;
 const f=await vaultFixture({browserEnabled:false,clock,persistent:true});
 try {
  const owner=f.owner,call=(name,input)=>owner.call(route(name),input),vault=(await owner.createVault()).vault;
  const object=(await owner.put(vault,createItem('login',{title:'Finance shared credential',values:{password:'synthetic-latchkey-7990'}}))).object;
  const invited=await f.fetcher(f.origin+'/auth/invite',{method:'POST',headers:{origin:f.origin,'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({email:'synthetic-latchkey-7993@example.test',displayName:'Finance member',role:'member'})});assert.equal(invited.status,202);
  const token=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  const member=new VaultClient(f.origin,{fetcher:f.fetcher});await member.confirmIdentity(token);const enrolled=await member.register('synthetic-latchkey-7994');await member.unlock(enrolled.profile,'synthetic-latchkey-7994');
  await refused(member.call(route('list'),{}),'rule_owner_required');await refused(member.call(route('scopes'),{}),'rule_owner_required');assert.deepEqual(await member.call(route('inbox'),{}),[]);
  const startAt=2000000000000,definition={title:'Finance credential expiry',kind:'rotation',vault,targets:[{object,version:1,dueAt:startAt}],severity:'critical',recipients:[owner.profile.account],startAt,intervalMs:90*86400000,windowMs:3600000,maxEffects:1};
  for(const kind of ['grant-access','export','loosen-authentication','change-recovery-administrators'])await refused(call('save',{rule:null,version:0,definition:{...definition,kind}}),'forbidden_rule_effect');
  await refused(call('save',{rule:null,version:0,definition:{...definition,maxEffects:0}}),'invalid_rule_bound');
  await refused(call('preview',{definition:{...definition,targets:[{object:id(),version:1,dueAt:startAt}]}}),'rule_target_changed');
  await refused(call('preview',{definition:{...definition,recipients:[id()]}}),'rule_recipient_unavailable');
  let saved=await call('save',{rule:null,version:0,definition}),rule=saved.id;
  let preview=await call('preview',{definition});assert.deepEqual(preview.targets,definition.targets);assert.equal(preview.externalEffects,0);assert.equal(preview.maximumObligations,1);assert.equal(saved.active,0);
  await refused(call('activate',{rule,version:1,previewHash:preview.hash,confirmed:false}),'rule_confirmation_required');
  await refused(call('activate',{rule,version:1,previewHash:'synthetic-latchkey-7991',confirmed:true}),'rule_preview_changed');
  await call('activate',{rule,version:1,previewHash:preview.hash,confirmed:true});
  await f.schedule(startAt-1);assert.equal((await call('get',{rule})).runs.length,0);
  await Promise.all([f.schedule(startAt),f.schedule(startAt)]);
  saved=await call('get',{rule});assert.equal(saved.runs.length,1);assert.equal(saved.runs[0].slot,0);assert.equal(saved.obligations.length,1);assert.equal(saved.obligations[0].phase,'waiting-approval');assert.equal(saved.obligations[0].created_at,startAt);
  const obligation=saved.obligations[0].id,inbox=await call('inbox',{});assert.equal(inbox.length,1);assert.equal(inbox[0].delivery,'in-app');assert.ok(!JSON.stringify(inbox).includes('synthetic-latchkey-7990'));
  await call('decide',{rule,version:1,obligation,decision:'approve',confirmed:true});
  const revised={...definition,severity:'warning',title:'Revised finance expiry'};
  saved=await call('save',{rule,version:1,definition:revised});assert.equal(saved.version,2);assert.equal(saved.active,0);assert.equal(saved.obligations[0].phase,'superseded');assert.equal(saved.decisions[0].decision,'approve');assert.deepEqual(saved.versions[0].definition,definition);
  await refused(call('decide',{rule,version:1,obligation,decision:'approve',confirmed:true}),'rule_changed');
  await refused(call('save',{rule,version:1,definition}),'rule_changed');
  preview=await call('preview',{definition:revised});await call('activate',{rule,version:2,previewHash:preview.hash,confirmed:true});await f.schedule(startAt);
  saved=await call('get',{rule});assert.equal(saved.runs.length,2);assert.equal(saved.obligations.length,2);
  await call('cancel',{rule,version:2});await f.schedule(startAt+60000);saved=await call('get',{rule});assert.equal(saved.active,0);assert.equal(saved.obligations.find(row=>row.id!==obligation).phase,'cancelled');
  await call('activate',{rule,version:2,previewHash:preview.hash,confirmed:true});await f.schedule(startAt+120000);assert.equal((await call('get',{rule})).obligations.length,2);
  const next=startAt+definition.intervalMs;await f.schedule(next+definition.windowMs);saved=await call('get',{rule});assert.equal(saved.runs.at(-1).state,'missed-window');assert.equal(saved.obligations.length,2);
  const review={...definition,kind:'review',title:'Quarterly finance review template'},reviewRule=(await call('save',{rule:null,version:0,definition:review})).id;
  await call('activate',{rule:reviewRule,version:1,previewHash:(await call('preview',{definition:review})).hash,confirmed:true});await f.schedule(startAt);
  assert.equal((await call('get',{rule:reviewRule})).obligations[0].phase,'open');
  await owner.put(vault,createItem('login',{title:'Finance shared credential',values:{password:'synthetic-latchkey-7992'}}),object,1);
  await f.schedule(startAt+2*definition.intervalMs);saved=await call('get',{rule});assert.equal(saved.runs.at(-1).state,'suspended-target-changed');assert.equal(saved.obligations.length,2);
  const completedDefinition={...definition,title:'Finance result verification',targets:[{object,version:2,dueAt:startAt}]},resultRule=(await call('save',{rule:null,version:0,definition:completedDefinition})).id;
  await call('activate',{rule:resultRule,version:1,previewHash:(await call('preview',{definition:completedDefinition})).hash,confirmed:true});await f.schedule(startAt);
  const resultObligation=(await call('get',{rule:resultRule})).obligations[0].id;
  await refused(call('complete',{rule:resultRule,version:1,obligation:resultObligation,resultVersion:2,confirmed:true}),'rule_approval_required');
  await call('decide',{rule:resultRule,version:1,obligation:resultObligation,decision:'approve',confirmed:true});
  await refused(call('complete',{rule:resultRule,version:1,obligation:resultObligation,resultVersion:2,confirmed:true}),'rule_result_not_observed');
  await owner.put(vault,createItem('login',{title:'Finance shared credential',values:{password:'synthetic-latchkey-7995'}}),object,2);
  const result=await call('complete',{rule:resultRule,version:1,obligation:resultObligation,resultVersion:3,confirmed:true});assert.equal(result.providerState,'unknown');assert.equal(result.state,'vault-result-recorded');
  const scratch=await mkdtemp(join(tmpdir(),'latchkey-rules-cli-'));
  try {
   const clockModule=join(scratch,'clock.mjs');await writeFile(clockModule,`Date.now=()=>${clock};`);
   const profile=join(scratch,'profile.json');await writeFile(profile,JSON.stringify(owner.profile),{mode:0o600});
   const output=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['--import',clockModule,'scripts/latchkey.mjs','rules'],{env:{...process.env,NODE_EXTRA_CA_CERTS:f.caFile},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);child.on('error',reject);child.on('exit',code=>code===0?resolve(stdout):reject(Error('Rule CLI failed: '+stderr)));child.stdin.end(JSON.stringify({profile,password:f.password,action:'list',input:{}}))});
   assert.ok(JSON.parse(output).some(row=>row.id===rule));
  }finally{await rm(scratch,{recursive:true,force:true})}
  // Close a real quarterly review; a binding never completes its obligation.
  const reviewVault=(await owner.createVault()).vault,reviewObject=(await owner.put(reviewVault,createItem('login',{title:'Review result target',values:{password:'synthetic-latchkey-8540'}}))).object;
  const quarterStart=new Date(clock);quarterStart.setUTCMonth(Math.floor(quarterStart.getUTCMonth()/3)*3,1);quarterStart.setUTCHours(0,0,0,0);
  const reviewDefinition={...definition,kind:'review',vault:reviewVault,targets:[{object:reviewObject,version:1,dueAt:clock}],startAt:quarterStart.getTime(),recurrence:'calendar-quarter'};
  const newReviewRule=async()=>{const r=(await call('save',{rule:null,version:0,definition:reviewDefinition})).id;await call('activate',{rule:r,version:1,previewHash:(await call('preview',{definition:reviewDefinition})).hash,confirmed:true});await f.schedule(reviewDefinition.startAt);return await call('get',{rule:r})};
  const reviewState=await newReviewRule(),reviewRuleId=reviewState.id,reviewObligation=reviewState.obligations[0].id;
  const sharing=new SharingClient(owner);await sharing.setPolicy({externalEnabled:true,domains:['example.test'],defaultDays:7,maxDays:30});
  const external=await sharing.createLink(reviewVault,reviewObject,{recipient:'synthetic-latchkey-8541@example.test',startsAt:clock+300000});
  const future=await sharing.createLink(reviewVault,reviewObject,{recipient:'synthetic-latchkey-8542@example.test',startsAt:clock+86400000});
  const campaign=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:owner.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Quarterly access review'})).id;
  const binding={rule:reviewRuleId,version:1,obligation:reviewObligation,review:campaign,slot:0,vault:reviewVault,scope:{group:null,project:null},reviewer:owner.profile.account,confirmed:true};
  await refused(call('bind-review',{...binding,confirmed:false}),'rule_confirmation_required');
  for(const changed of [{slot:1},{vault},{scope:{group:id(),project:null}},{reviewer:member.profile.account}])await refused(call('bind-review',{...binding,...changed}),'rule_review_mismatch');
  const wrong=(await owner.call(reviewRoute('create'),{vault,reviewer:owner.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Wrong vault'})).id;
  await refused(call('bind-review',{...binding,review:wrong}),'rule_review_mismatch');
  const nextQuarter=new Date(quarterStart);nextQuarter.setUTCMonth(nextQuarter.getUTCMonth()+3);
  const wrongQuarter=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:owner.profile.account,scheduleAt:nextQuarter.getTime(),dueAt:nextQuarter.getTime()+3600000,period:'Next quarter'})).id;
  await refused(call('bind-review',{...binding,review:wrongQuarter}),'rule_review_mismatch');
  assert.deepEqual((await call('review-candidates',{rule:reviewRuleId,version:1,obligation:reviewObligation})).map(r=>r.id),[campaign]);
  await call('bind-review',binding);assert.equal((await call('get',{rule:reviewRuleId})).obligations[0].phase,'open');
  await refused(member.call(route('bind-review'),binding),'rule_owner_required');
  await refused(call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),'rule_review_not_closed');
  let reviewDetail=await owner.call(reviewRoute('get'),{review:campaign});
  assert.equal(reviewDetail.rows.length,3);
  const ownReviewRow=reviewDetail.rows.find(r=>r.subject===owner.profile.account),externalRow=reviewDetail.rows.find(r=>r.id===external.link);
  await owner.call(reviewRoute('assign'),{review:campaign,key:ownReviewRow.key,reviewer:member.profile.account});
  await member.call(reviewRoute('decide'),{review:campaign,key:ownReviewRow.key,decision:'confirm',reason:'Independently reviewed current owner access'});
  await owner.call(reviewRoute('decide'),{review:campaign,key:externalRow.key,decision:'remove',reason:'Retire external access'});
  await owner.call(reviewRoute('decide'),{review:campaign,key:reviewDetail.rows.find(r=>r.id===future.link).key,decision:'remove',reason:'Cancel scheduled access before it begins'});
  await refused(owner.call(reviewRoute('close'),{review:campaign}),'review_incomplete');
  await refused(call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),'rule_review_not_closed');
  assert.equal((await owner.call(reviewRoute('get'),{review:campaign})).completeness.pendingRemovals,1);
  await owner.call(reviewRoute('remove'),{review:campaign,key:externalRow.key});
  assert.equal((await owner.call(reviewRoute('get'),{review:campaign})).completeness.pendingRemovals,0);
  reviewDetail=await owner.call(reviewRoute('reconcile'),{review:campaign,reviewer:owner.profile.account});
  for(const entry of reviewDetail.rows.filter(r=>!r.decision))await owner.call(reviewRoute('decide'),{review:campaign,key:entry.key,decision:'confirm',reason:'Reviewed the now revoked grant'});
  await owner.call(reviewRoute('close'),{review:campaign});
  // A closed report's effective flag cannot stand in for removal of future access.
  await refused(call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),'rule_review_removal_pending');
  await f.schedule(clock);assert.equal((await call('get',{rule:reviewRuleId})).obligations[0].phase,'open');
  await sharing.revokeLink(future.link);
  // Revoke the deciding reviewer after its read, before inventory snapshots.
  let raced=false;
  const raceDb={prepare(sql){const wrap=(statement,args=[])=>new Proxy(statement,{get(target,key){
   if(key==='bind')return(...values)=>wrap(target.bind(...values),values);
   if(key==='first')return async()=>{const result=await target.first();if(!raced&&sql.startsWith('SELECT 1 WHERE EXISTS(SELECT 1 FROM lky_accounts')&&args[0]===member.profile.account){raced=true;await f.db.prepare("UPDATE oa_operators SET status='inactive' WHERE id=(SELECT operator_id FROM lky_accounts WHERE id=?)").bind(member.profile.account).run()}return result};
   const value=target[key];return typeof value==='function'?value.bind(target):value;
  }});return wrap(f.db.prepare(sql))},batch:statements=>f.db.batch(statements)};
  assert.equal(await reconcileBoundReviews(raceDb,clock),0);assert.equal(raced,true);
  assert.equal((await call('get',{rule:reviewRuleId})).obligations[0].phase,'open');
  await refused(call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),'rule_reviewer_unavailable');
  await f.db.prepare("UPDATE oa_operators SET status='active' WHERE id=(SELECT operator_id FROM lky_accounts WHERE id=?)").bind(member.profile.account).run();
  await member.requestIdentity('synthetic-latchkey-7993@example.test');
  const freshToken=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  await member.confirmIdentity(freshToken);await member.unlock(enrolled.profile,'synthetic-latchkey-7994');
  assert.equal((await f.db.prepare('SELECT revoked_at FROM lky_links WHERE id=?').bind(external.link).first()).revoked_at,clock);
  clock+=300000;await f.restart(clock);
  await refused(new PublicLinkClient(external.url,{fetcher:f.fetcher}).preview(),'link_unavailable');
  await f.restart(clock);assert.equal((await call('get',{rule:reviewRuleId})).obligations[0].phase,'open');
  await Promise.all([call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation}),f.schedule(clock)]);
  await f.restart(clock);await f.schedule(clock);await call('reconcile-review',{rule:reviewRuleId,version:1,obligation:reviewObligation});
  const observed=await call('get',{rule:reviewRuleId});assert.equal(observed.obligations[0].phase,'review-result-recorded');assert.equal(observed.reviewBindings.length,1);assert.equal(JSON.parse(observed.reviewBindings[0].result).removals,2);
  assert.equal((await owner.call('audit',{})).filter(e=>e.action==='rule_review_result_observed'&&e.object_id===reviewRuleId).length,1);
  const duplicate=await newReviewRule();await refused(call('bind-review',{...binding,rule:duplicate.id,obligation:duplicate.obligations[0].id}),'rule_review_already_bound');
  await call('cancel',{rule:duplicate.id,version:1});await refused(call('bind-review',{...binding,rule:duplicate.id,obligation:duplicate.obligations[0].id}),'rule_review_unavailable');
  await call('save',{rule:duplicate.id,version:1,definition:{...reviewDefinition,title:'Changed review'}});await refused(call('reconcile-review',{rule:duplicate.id,version:1,obligation:duplicate.obligations[0].id}),'rule_changed');
  // Current reviewer authority is required after binding as well as before it.
  await owner.share(reviewVault,member.profile.account,await member.identity().fingerprint,['read']);
  const memberReviewDefinition={...reviewDefinition,recipients:[member.profile.account]},memberReviewRule=(await call('save',{rule:null,version:0,definition:memberReviewDefinition})).id;
  await call('activate',{rule:memberReviewRule,version:1,previewHash:(await call('preview',{definition:memberReviewDefinition})).hash,confirmed:true});await f.schedule(reviewDefinition.startAt);
  const memberReviewObligation=(await call('get',{rule:memberReviewRule})).obligations[0].id,memberCampaign=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:member.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Assigned reviewer authority'})).id;
  await call('bind-review',{...binding,rule:memberReviewRule,obligation:memberReviewObligation,review:memberCampaign,reviewer:member.profile.account});
  await owner.rotate(reviewVault,member.profile.account);
  await refused(call('reconcile-review',{rule:memberReviewRule,version:1,obligation:memberReviewObligation}),'rule_recipient_unavailable');await f.schedule(clock);
  assert.equal((await call('get',{rule:memberReviewRule})).obligations[0].phase,'open');
  const cancelled=await newReviewRule(),cancelledCampaign=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:owner.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Cancelled result'})).id;
  await call('bind-review',{...binding,rule:cancelled.id,obligation:cancelled.obligations[0].id,review:cancelledCampaign});await call('cancel',{rule:cancelled.id,version:1});
  await refused(call('reconcile-review',{rule:cancelled.id,version:1,obligation:cancelled.obligations[0].id}),'rule_review_unavailable');
  const edited=await newReviewRule(),editedCampaign=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:owner.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Edited result'})).id;
  await call('bind-review',{...binding,rule:edited.id,obligation:edited.obligations[0].id,review:editedCampaign});await call('save',{rule:edited.id,version:1,definition:{...reviewDefinition,title:'Superseded binding'}});
  await refused(call('reconcile-review',{rule:edited.id,version:2,obligation:edited.obligations[0].id}),'rule_review_unavailable');
  const db=await restoreDomainArchive(f);
  const restored=await db.prepare('SELECT * FROM lky_rules WHERE id=?').bind(rule).first();assert.equal(restored.active,0);assert.equal(restored.version,2);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_rule_versions WHERE rule_id=?').bind(rule).first()).n,2);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_rule_runs WHERE rule_id=?').bind(rule).first()).n,saved.runs.length);
  const restoredObligations=(await db.prepare('SELECT * FROM lky_rule_obligations').all()).results;assert.equal(restoredObligations.length,9);assert.ok(restoredObligations.every(o=>o.phase==='inactive'));
  const restoredBinding=await db.prepare('SELECT * FROM lky_rule_reviews WHERE obligation=?').bind(reviewObligation).first();assert.equal(restoredBinding.phase,'inactive');assert.equal(restoredBinding.result,observed.reviewBindings[0].result);
  assert.equal((await db.prepare('SELECT phase FROM lky_reviews WHERE id=?').bind(campaign).first()).phase,'inactive');
  assert.equal((await db.prepare('SELECT decision FROM lky_rule_decisions').first()).decision,'approve');
  // A ready result behind a full page of unfinished bindings must still run.
  const backlog=[];
  for(let index=0;index<101;index++){
   const rule=(await call('save',{rule:null,version:0,definition:reviewDefinition})).id;
   await call('activate',{rule,version:1,previewHash:(await call('preview',{definition:reviewDefinition})).hash,confirmed:true});backlog.push({rule});
  }
  await f.schedule(reviewDefinition.startAt);
  for(const entry of backlog){
   entry.obligation=(await call('get',{rule:entry.rule})).obligations[0].id;
   entry.review=(await owner.call(reviewRoute('create'),{vault:reviewVault,reviewer:owner.profile.account,scheduleAt:clock,dueAt:clock+3600000,period:'Queued quarterly review'})).id;
   await call('bind-review',{...binding,rule:entry.rule,obligation:entry.obligation,review:entry.review});
  }
  backlog.sort((a,b)=>a.obligation.localeCompare(b.obligation));const last=backlog.at(-1);
  const lastDetail=await owner.call(reviewRoute('get'),{review:last.review});assert.equal(lastDetail.rows.length,2);
  for(const entry of lastDetail.rows){
   const actor=entry.subject===owner.profile.account?member:owner;
   if(actor===member)await owner.call(reviewRoute('assign'),{review:last.review,key:entry.key,reviewer:member.profile.account});
   await actor.call(reviewRoute('decide'),{review:last.review,key:entry.key,decision:'confirm',reason:'Reviewed the bounded current grant'});
  }
  await owner.call(reviewRoute('close'),{review:last.review});await f.schedule(clock);
  assert.equal((await call('get',{rule:last.rule})).obligations[0].phase,'review-result-recorded');
  for(const entry of backlog.slice(0,-1))assert.equal((await call('get',{rule:entry.rule})).obligations[0].phase,'open');
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_rule_reviews WHERE review_id=?').bind(campaign).first()).n,1);
  await owner.eraseItem(reviewVault,reviewObject,{confirmed:true});
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_rule_reviews WHERE review_id=?').bind(campaign).first()).n,0);
  await refused(call('get',{rule:reviewRuleId}),'rule_not_found');
  await owner.share(vault,member.profile.account,await member.identity().fingerprint,['read']);
  const memberDefinition={...definition,title:'Assigned finance expiry',targets:[{object,version:3,dueAt:startAt}],recipients:[member.profile.account]},memberRule=(await call('save',{rule:null,version:0,definition:memberDefinition})).id;
  await call('activate',{rule:memberRule,version:1,previewHash:(await call('preview',{definition:memberDefinition})).hash,confirmed:true});await f.schedule(startAt);
  assert.equal((await member.call(route('inbox'),{})).length,1);
  const subject=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(member.profile.account).first()).operator_id;
  const erasure=await owner.call(['subject','erase-preview'].join('/'),{subject});await owner.call(['subject','erase'].join('/'),{subject,confirmed:true,planHash:erasure.planHash});
  await refused(call('get',{rule:memberRule}),'rule_not_found');
  await owner.eraseItem(vault,object,{confirmed:true});
  await refused(call('get',{rule}),'rule_not_found');await f.schedule(startAt+3*definition.intervalMs);assert.ok(!(await call('list',{})).some(r=>r.id===rule));
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_rule_reviews WHERE review_id=?').bind(campaign).first()).n,0);
  await refused(call('save',{rule:null,version:0,definition}),'rule_target_changed');
  // Public-door scope checks and calendar recurrence share this lifecycle journey.
  const projects=new ProjectClient(owner),scopeSharing=new SharingClient(owner),project=await projects.create({name:'Finance scope'}),environment=await projects.createEnvironment(project.project,{name:'Production'});
  const resource=await projects.set(environment.environment,'RULE_SECRET','synthetic-latchkey-8170'),group=(await scopeSharing.createGroup([owner.profile.account])).group;
  const quarter=Date.parse('2031-10-01T00:00:00Z'),quarterDefinition={...definition,vault:project.vault,targets:[{object:resource.object,version:1,dueAt:quarter}],startAt:quarter,recurrence:'calendar-quarter',scope:{group,project:project.project}};
  await refused(call('preview',{definition:{...quarterDefinition,startAt:quarter+60000}}),'invalid_rule_quarter');
  await refused(call('preview',{definition:{...quarterDefinition,scope:{group:id(),project:project.project}}}),'rule_scope_changed');
  const unrelated=(await owner.put(project.vault,createItem('login',{title:'Outside project',values:{password:'synthetic-latchkey-8171'}}))).object;
  await refused(call('preview',{definition:{...quarterDefinition,targets:[{object:unrelated,version:1,dueAt:quarter}]}}),'rule_scope_changed');
  await refused(call('preview',{definition:{...quarterDefinition,scope:{group,project:id()}}}),'rule_scope_changed');
  const scopeOptions=await call('scopes',{});assert.ok(scopeOptions.groups.some(g=>g.id===group));assert.ok(scopeOptions.projects.some(p=>p.id===project.project));
  const quarterRule=(await call('save',{rule:null,version:0,definition:quarterDefinition})).id;
  const quarterPreview=await call('preview',{definition:quarterDefinition});assert.equal(quarterPreview.recurrence,'calendar-quarter');assert.deepEqual(quarterPreview.scope,quarterDefinition.scope);
  await call('activate',{rule:quarterRule,version:1,previewHash:quarterPreview.hash,confirmed:true});
  await f.schedule(quarter-1);assert.equal((await call('get',{rule:quarterRule})).runs.length,0);
  for(const [slot,date] of ['2031-10-01','2032-01-01','2032-04-01','2032-07-01'].entries()){
   const time=Date.parse(date+'T00:00:00Z');await Promise.all([f.schedule(time),f.schedule(time)]);
   const state=await call('get',{rule:quarterRule});assert.equal(state.runs.length,slot+1);assert.equal(state.runs.at(-1).slot,slot);assert.equal(state.runs.at(-1).state,'prepared');assert.equal(state.obligations.length,slot+1);
  }
  // A missing selected member must suspend, even after activation; cancellation remains available.
  await scopeSharing.setGroup(group,[]);await f.schedule(Date.parse('2032-10-01T00:00:00Z'));
  let quarterState=await call('get',{rule:quarterRule});assert.equal(quarterState.runs.at(-1).state,'suspended-scope-changed');assert.equal(quarterState.obligations.length,4);
  await refused(call('decide',{rule:quarterRule,version:1,obligation:quarterState.obligations[0].id,decision:'approve',confirmed:true}),'rule_scope_changed');
  await call('cancel',{rule:quarterRule,version:1});
  await refused(call('activate',{rule:quarterRule,version:1,previewHash:quarterPreview.hash,confirmed:true}),'rule_scope_changed');
  await scopeSharing.setGroup(group,[owner.profile.account]);await call('activate',{rule:quarterRule,version:1,previewHash:quarterPreview.hash,confirmed:true});
  await f.schedule(Date.parse('2033-01-01T01:00:00Z'));quarterState=await call('get',{rule:quarterRule});assert.equal(quarterState.runs.at(-1).state,'missed-window');assert.equal(quarterState.obligations.length,4);
  const environmentObject=(await projects.environment(environment.environment)).object;await new LifecycleClient(owner).change(project.vault,environmentObject,'archived',{confirmed:true});
  await f.schedule(Date.parse('2033-04-01T00:00:00Z'));quarterState=await call('get',{rule:quarterRule});assert.equal(quarterState.runs.at(-1).state,'suspended-scope-changed');assert.equal(quarterState.obligations.length,4);
  console.log('PASS ruleLifecycleJourney: bounded versioned rules, exact approval, injected scheduling, replay and inactive Records restore');
 } finally {await f.close();Date.now=realNow}
}
await ruleLifecycleJourney();
