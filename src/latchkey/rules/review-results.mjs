import { access, canonicalJson, guarded, has, need, vaultFor, LifecycleError } from '../lifecycle/common.mjs';
import { inventory, inventoryGuard } from '../reviews/snapshot.mjs';
import { scopeGuards } from './scope.mjs';

// A full-vault campaign covers the rule's exact target within its narrower
// constraints. Linking is bookkeeping, never a review decision or removal.
export async function reviewContext(ctx,row,value,obligation) {
 const {first,guard}=access(ctx);
 need(value.kind==='review'&&value.recurrence==='calendar-quarter','quarterly_review_required',409);
 need(row.active===1&&obligation?.phase==='open','rule_review_unavailable',409);
 const run=await first("SELECT * FROM lky_rule_runs WHERE id=? AND rule_id=? AND version=? AND state='prepared'",obligation.run_id,row.id,row.version);
 need(run,'rule_review_unavailable',409);
 const vault=await vaultFor(ctx,value.vault);
 need(vault.owner===ctx.actor&&vault.kind==='company'&&has(vault,'read'),'rule_owner_required',403);
 const guards=await scopeGuards(ctx,value);
 const recipientSql="EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? AND r.account_id=? AND a.tenant=? AND o.status='active' AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read'))";
 const recipientArgs=[vault.id,obligation.recipient,ctx.tenant];
 need(await first(`SELECT 1 WHERE ${recipientSql}`,...recipientArgs),'rule_recipient_unavailable',403);
 guards.push(guard(recipientSql,recipientArgs));
 for(const target of value.targets){
  const sql="(SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle WHERE vault_id=? AND object_id=? AND state<>'active')",args=[vault.id,target.object,target.version,vault.id,target.object];
  need(await first(`SELECT 1 WHERE ${sql}`,...args),'rule_target_changed',409);guards.push(guard(sql,args));
 }
 guards.push(guard('EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=? AND active=1)',[row.id,row.version]),guard("EXISTS(SELECT 1 FROM lky_rule_runs WHERE id=? AND version=? AND slot=? AND state='prepared')",[run.id,row.version,run.slot]),guard("EXISTS(SELECT 1 FROM lky_rule_obligations WHERE id=? AND phase='open')",[obligation.id]));
 const start=new Date(value.startAt);start.setUTCMonth(start.getUTCMonth()+run.slot*3);
 const startAt=start.getTime();start.setUTCMonth(start.getUTCMonth()+3);
 return {vault,guards,startAt,endAt:start.getTime(),binding:{rule:row.id,version:row.version,run:run.id,slot:run.slot,vault:vault.id,scope:value.scope??{group:null,project:null},reviewer:obligation.recipient,object:obligation.object_id,sourceVersion:obligation.source_version}};
}
export async function matchingReview(ctx,review,context) {
 const row=await access(ctx).first('SELECT * FROM lky_reviews WHERE id=? AND tenant=?',review,ctx.tenant),b=context.binding;
 need(row&&row.owner===ctx.actor&&row.vault_id===b.vault&&row.reviewer===b.reviewer&&['scheduled','open','closed'].includes(row.phase)&&row.scheduled_at>=context.startAt&&row.scheduled_at<context.endAt&&row.due_at<=context.endAt&&(row.as_of===null||row.as_of>=context.startAt&&row.as_of<context.endAt),'rule_review_mismatch',409);
 return row;
}
export async function reconcileReview(ctx,row,value,obligation) {
 const {first,stmt,event,guard}=access(ctx);
 const link=await first('SELECT * FROM lky_rule_reviews WHERE obligation=?',obligation?.id??'');
 need(link&&link.phase==='active','rule_review_not_bound',409);
 // Idempotent retries still check current owner, reviewer, scope and run fences.
 const completed=obligation.phase==='review-result-recorded';
 const context=await reviewContext(ctx,row,value,{...obligation,phase:completed?'open':obligation.phase});
 need(link.binding===canonicalJson(context.binding),'rule_review_mismatch',409);
 const review=await matchingReview(ctx,link.review_id,context);
 need(review.phase==='closed'&&review.package&&review.closed_at!==null,'rule_review_not_closed',409);
 if(completed){need(link.result,'rule_review_not_observed',409);return {state:'review-result-recorded',review:link.review_id,result:JSON.parse(link.result)}}
 const result=JSON.parse(review.package),c=result.completeness;
 need(result.id===review.id&&result.vault===context.vault.id&&result.phase==='closed'&&result.closedAt===review.closed_at&&review.closed_at>=review.as_of&&result.rows.length>0&&c.total===result.rows.length&&c.decided===c.total&&c.pendingRemovals===0&&c.unreconciled===0&&result.rows.every(r=>['confirm','remove'].includes(r.decision)),'rule_review_incomplete',409);
 for(const reviewer of new Set(result.rows.map(r=>r.reviewer)))need(await first("SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'",reviewer,ctx.tenant),'rule_reviewer_unavailable',403);
 const snapshots=await inventoryGuard(ctx,context.vault.id),current=await inventory(ctx,context.vault.id);
 // Future, pending and temporarily inactive grants still retain authority.
 // A historical effective flag cannot substitute for their actual removal.
 need(result.rows.filter(r=>r.decision==='remove').every(r=>r.effective&&!current.rows.some(live=>live.kind===r.kind&&live.id===r.id&&live.subject===r.subject&&!['revoked','expired','spent'].includes(live.status))),'rule_review_removal_pending',409);
 const summary=canonicalJson({review:review.id,closedAt:review.closed_at,total:c.total,decided:c.decided,removals:c.removals,providerState:'unknown'});
 try {
  await guarded(ctx,[context.vault],[stmt("UPDATE lky_rule_obligations SET phase='review-result-recorded' WHERE id=?",obligation.id),stmt('UPDATE lky_rule_reviews SET result=?,recorded_at=? WHERE obligation=?',summary,ctx.now,obligation.id),event('rule_review_result_observed',row.id)],[...context.guards,...snapshots.map(g=>guard(g.sql,g.args)),guard("EXISTS(SELECT 1 FROM lky_rule_reviews WHERE obligation=? AND review_id=? AND binding=? AND phase='active' AND result IS NULL)",[obligation.id,link.review_id,link.binding])]);
 } catch(error) {
  const winner=await first('SELECT result FROM lky_rule_reviews WHERE obligation=?',obligation.id);
  if(winner?.result!==summary)throw error;
 }
 return {state:'review-result-recorded',review:review.id,result:JSON.parse(summary)};
}
export async function reconcileBoundReviews(db,now) {
 const rows=(await db.prepare("SELECT c.*,v.definition,o.id AS obligation,a.operator_id FROM lky_rules c JOIN lky_rule_versions v ON v.rule_id=c.id AND v.version=c.version JOIN lky_rule_runs r ON r.rule_id=c.id AND r.version=c.version JOIN lky_rule_obligations o ON o.run_id=r.id JOIN lky_rule_reviews b ON b.obligation=o.id JOIN lky_accounts a ON a.id=c.owner JOIN oa_operators p ON p.id=a.operator_id WHERE c.active=1 AND p.status='active' AND p.role='owner' AND o.phase='open' AND b.phase='active' AND b.result IS NULL ORDER BY o.id LIMIT 100").all()).results;
 let completed=0;
 for(const row of rows){
  const ctx={db,now,actor:row.owner,device:'rule-scheduler',tenant:row.tenant,fence:"EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active')",fenceArgs:[row.owner,row.tenant]};
  try{await reconcileReview(ctx,row,JSON.parse(row.definition),await access(ctx).first('SELECT * FROM lky_rule_obligations WHERE id=?',row.obligation));completed++}catch(error){if(!(error instanceof LifecycleError))throw error}
 }
 return completed;
}
