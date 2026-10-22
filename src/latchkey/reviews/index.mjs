import { verify } from '../crypto/envelope.mjs';
import { access,campaign,canonicalJson,digest,evidenceText,exact,id,need,ownedVault,reviewer,text,uuid } from './common.mjs';
import { inventory,inventoryGuard } from './snapshot.mjs';
import { detail,start,transact } from './state.mjs';
export { ReviewError } from './common.mjs';
const owner=(ctx,row)=>need(row.owner===ctx.actor,'review_owner_required',403);
export async function reviewsAuthenticated(route,input,ctx){
 if(!route.startsWith('reviews/'))return null;
 const {all,first,stmt,event,guard}=access(ctx);
 if(route==='reviews/people'){exact(input,[]);return all("SELECT a.id AS account,o.display_name AS name,o.role FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.tenant=? AND o.status='active' AND (a.id=? OR EXISTS(SELECT 1 FROM lky_vaults WHERE owner=? AND tenant=?) OR a.id IN(SELECT owner FROM lky_reviews WHERE id IN(SELECT review_id FROM lky_review_rows WHERE reviewer=?))) ORDER BY a.id",ctx.tenant,ctx.actor,ctx.actor,ctx.tenant,ctx.actor)}
 if(route==='reviews/list'){exact(input,['vault']);if(input.vault!==null)uuid(input.vault);return all('SELECT DISTINCT c.id,c.phase,c.scheduled_at,c.due_at,c.created_at FROM lky_reviews c LEFT JOIN lky_review_rows r ON r.review_id=c.id WHERE c.tenant=? AND (? IS NULL OR c.vault_id=?) AND (c.owner=? OR r.reviewer=?) ORDER BY c.created_at DESC',ctx.tenant,input.vault,input.vault,ctx.actor,ctx.actor)}
 if(route==='reviews/create'){
  exact(input,['vault','reviewer','scheduleAt','dueAt','period']);await ownedVault(ctx,input.vault);await reviewer(ctx,input.reviewer);text(input.period,120);need(Number.isSafeInteger(input.scheduleAt)&&Number.isSafeInteger(input.dueAt)&&input.scheduleAt>=ctx.now-60000&&input.dueAt>Math.max(ctx.now,input.scheduleAt),'invalid_review_dates');
  const review=id();await transact(ctx,input.vault,[stmt("INSERT INTO lky_reviews VALUES(?,?,?,?,?,?,'scheduled',?,?,?,NULL,'','{}',NULL,NULL)",review,ctx.tenant,input.vault,ctx.actor,input.reviewer,input.period,input.scheduleAt,input.dueAt,ctx.now),event('review_scheduled',review)]);
  const row=await campaign(ctx,review);if(row.scheduled_at<=ctx.now)await start(ctx,row);return {id:review};
 }
 const review=uuid(input.review),row=await campaign(ctx,review);
 ctx={...ctx,reviewGuards:await inventoryGuard(ctx,row.vault_id)};
 if(route==='reviews/get'){exact(input,['review']);return detail(ctx,row)}
 if(route==='reviews/remind'){
  exact(input,['review']);owner(ctx,row);const result=await detail(ctx,row);need(result.overdue,'review_not_overdue',409);const reviewers=[...new Set(result.rows.filter(r=>!r.decision||r.decision==='remove'&&!r.effective).map(r=>r.reviewer))];
  await transact(ctx,row.vault_id,[...reviewers.map(account=>stmt('INSERT INTO lky_review_reminders VALUES(?,?,?,?) ON CONFLICT DO NOTHING',review,account,Math.floor(ctx.now/86400000),ctx.now)),event('review_overdue_followup',review)]);return {review,owners:reviewers,delivery:'in-app',reminders:await all('SELECT reviewer,day,created_at FROM lky_review_reminders WHERE review_id=?',review)};
 }
 if(route==='reviews/reconcile'){
  exact(input,['review','reviewer']);owner(ctx,row);need(row.phase==='open','review_not_open',409);await reviewer(ctx,input.reviewer);
  const result=await detail(ctx,row),current=await inventory(ctx,row.vault_id),currentKeys=new Set(current.rows.map(r=>r.key));
  // Retain historical decisions; changed grants are new rows. Removed or
  // changed undecided grants remain an explicit remove decision with reason.
  await transact(ctx,row.vault_id,[...result.changes.map(value=>stmt('INSERT INTO lky_review_rows(review_id,key,snapshot,reviewer,decision,reason,decided_at) VALUES(?,?,?,?,NULL,NULL,NULL) ON CONFLICT DO NOTHING',review,value.key,canonicalJson(value),input.reviewer)),...result.rows.filter(value=>!currentKeys.has(value.key)&&value.decision!=='remove').map(value=>stmt("UPDATE lky_review_rows SET superseded=1,decision=COALESCE(decision,'remove'),reason=COALESCE(reason,'Reconciled superseded snapshot; current authority reviewed separately'),decided_at=COALESCE(decided_at,?) WHERE review_id=? AND key=?",ctx.now,review,value.key)),stmt('UPDATE lky_reviews SET policy_version=? WHERE id=?',current.policyVersion,review),event('review_reconciled',review)]);return detail(ctx,await campaign(ctx,review));
 }
 if(route==='reviews/assign'){
  exact(input,['review','key','reviewer']);owner(ctx,row);need(row.phase==='open','review_not_open',409);await reviewer(ctx,input.reviewer);
  const entry=await first('SELECT * FROM lky_review_rows WHERE review_id=? AND key=?',review,text(input.key,64));need(entry,'review_grant_not_found',404);need(!entry.decision,'review_already_decided',409);
  await transact(ctx,row.vault_id,[stmt('UPDATE lky_review_rows SET reviewer=? WHERE review_id=? AND key=? AND decision IS NULL',input.reviewer,review,input.key),event('review_assigned',review)]);return detail(ctx,row);
 }
 if(route==='reviews/decide'){
  exact(input,['review','key','decision','reason']);need(row.phase==='open','review_not_open',409);need(['confirm','remove'].includes(input.decision));text(input.reason);const entry=await first('SELECT * FROM lky_review_rows WHERE review_id=? AND key=?',review,text(input.key,64));need(entry&&entry.reviewer===ctx.actor,'assigned_reviewer_required',403);const value=JSON.parse(entry.snapshot);
  need(!(input.decision==='confirm'&&[value.subject,value.sponsor].includes(ctx.actor)),'independent_reviewer_required',403);need(!(input.decision==='remove'&&value.kind==='direct'&&value.subject===row.owner),'owner_transfer_required',409);need(!entry.decision,'review_already_decided',409);
  await transact(ctx,row.vault_id,[stmt('UPDATE lky_review_rows SET decision=?,reason=?,decided_at=? WHERE review_id=? AND key=? AND reviewer=? AND decision IS NULL',input.decision,input.reason,ctx.now,review,input.key,ctx.actor),event('review_decided',review)],[guard("EXISTS(SELECT 1 FROM lky_reviews WHERE id=? AND phase='open')",[review])]);return detail(ctx,row);
 }
 if(route==='reviews/remove'){
  exact(input,['review','key']);owner(ctx,row);need(row.phase==='open','review_not_open',409);const entry=await first("SELECT * FROM lky_review_rows WHERE review_id=? AND key=? AND decision='remove'",review,text(input.key,64));need(entry,'remove_decision_required',409);const value=JSON.parse(entry.snapshot);
  need(value.kind!=='direct','client_rekey_required',409);let write;
  if(['inherited','internal'].includes(value.kind))write=stmt('DELETE FROM lky_share_keys WHERE share_id=? AND account_id=?',value.id,value.subject);
  else if(value.kind==='external')write=stmt('UPDATE lky_links SET revoked_at=?,mutation=? WHERE id=? AND vault_id=?',ctx.now,id(),value.id,row.vault_id);
  else if(value.kind==='machine'&&value.transport==='scoped-runtime')write=stmt('UPDATE lky_runtime_grants SET revoked_at=? WHERE id=? AND tenant=?',ctx.now,value.id,ctx.tenant);
  else if(value.kind==='machine')write=stmt('UPDATE lky_machines SET revoked_at=?,mutation=? WHERE id=? AND vault_id=?',ctx.now,id(),value.id,row.vault_id);
  need(write,'invalid_review_grant');await transact(ctx,row.vault_id,[write,event('review_removal_effective',review)]);return detail(ctx,row);
 }
 if(route==='reviews/close'){
  exact(input,['review']);owner(ctx,row);need(row.phase==='open','review_not_open',409);const result=await detail(ctx,row);need(result.completeness.decided===result.completeness.total&&result.completeness.pendingRemovals===0&&result.completeness.unreconciled===0,'review_incomplete',409);
  await transact(ctx,row.vault_id,[stmt("UPDATE lky_reviews SET phase='closed',closed_at=?,package=? WHERE id=? AND phase='open'",ctx.now,canonicalJson({...result,phase:'closed',closedAt:ctx.now,overdue:false}),review),event('review_closed',review)]);return detail(ctx,await campaign(ctx,review));
 }
 if(route==='reviews/package'){
  exact(input,['review']);owner(ctx,row);need(row.phase==='closed'&&row.package,'review_incomplete',409);return JSON.parse(row.package);
 }
 if(route==='reviews/package/verify'){
  exact(input,['review','package','signature']);owner(ctx,row);need(row.phase==='closed'&&row.package,'review_incomplete',409);const key=await first('SELECT authority_key FROM lky_accounts WHERE id=?',ctx.actor);need(canonicalJson(input.package)===canonicalJson(JSON.parse(row.package))&&await verify(key.authority_key,input.signature,evidenceText(input.package)),'invalid_evidence_signature',403);return {valid:true,digest:await digest(evidenceText(input.package))};
 }
 need(false,'review_route_not_found',404);
}
