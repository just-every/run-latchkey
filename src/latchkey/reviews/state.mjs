import { access,canonicalJson,need,ownedVault } from './common.mjs';
import { inventory,inventoryGuard } from './snapshot.mjs';
export async function transact(ctx,vault,statements,extra=[]){const {stmt,guard}=access(ctx);const guards=ctx.reviewGuards??await inventoryGuard(ctx,vault);try{await ctx.db.batch([stmt('DELETE FROM lky_review_guard'),guard(ctx.fence,ctx.fenceArgs),guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND tenant=?)',[vault,ctx.tenant]),...guards.map(g=>guard(g.sql,g.args)),...extra,...statements,stmt('DELETE FROM lky_review_guard')])}catch{need(false,'review_changed',409)}}
export async function start(ctx,row){
 need(row.phase==='scheduled'&&row.scheduled_at<=ctx.now,'review_not_due',409);
 await ownedVault({...ctx,actor:row.owner},row.vault_id);
 ctx={...ctx,reviewGuards:await inventoryGuard(ctx,row.vault_id)};
 const {rows,policyVersion,enforcement}=await inventory(ctx,row.vault_id),{stmt,event}=access(ctx);
 const snapshot=canonicalJson({enforcement});
 await transact(ctx,row.vault_id,[stmt("UPDATE lky_reviews SET phase='open',as_of=?,policy_version=?,snapshot=? WHERE id=? AND phase='scheduled'",ctx.now,policyVersion,snapshot,row.id),...rows.map(value=>stmt('INSERT INTO lky_review_rows(review_id,key,snapshot,reviewer,decision,reason,decided_at) VALUES(?,?,?,?,NULL,NULL,NULL)',row.id,value.key,canonicalJson(value),row.reviewer)),event('review_started',row.id)]);
 return {...row,phase:'open',as_of:ctx.now,policy_version:policyVersion,snapshot};
}
export async function detail(ctx,row){
 if(row.phase==='closed'&&row.package){const result=JSON.parse(row.package);return {...result,rows:row.owner===ctx.actor?result.rows:result.rows.filter(r=>r.reviewer===ctx.actor)}}
 if(row.phase==='scheduled'&&row.scheduled_at<=ctx.now)row=await start(ctx,row);
 const {all}=access(ctx),current=await inventory(ctx,row.vault_id),records=await all('SELECT * FROM lky_review_rows WHERE review_id=? ORDER BY key',row.id);
 const live=new Map(current.rows.map(r=>[r.key,r]));
 const rows=records.map(record=>{const snapshot=JSON.parse(record.snapshot),active=current.rows.some(r=>r.kind===snapshot.kind&&r.id===snapshot.id&&r.subject===snapshot.subject&&r.status==='active');return {...snapshot,reviewer:record.reviewer,decision:record.decision,reason:record.reason,decidedAt:record.decided_at,superseded:!!record.superseded,effective:record.decision==='remove'&&(!active||!!record.superseded)}});
 const keys=new Set(records.map(r=>r.key)),changes=current.rows.filter(value=>!keys.has(value.key));
 const changed=rows.filter(value=>!live.has(value.key)&&!value.superseded&&value.decision!=='remove');
 const policyChanged=row.phase!=='scheduled'&&current.policyVersion!==row.policy_version;
 const total=rows.length,decided=rows.filter(r=>r.decision).length,pendingRemovals=rows.filter(r=>r.decision==='remove'&&!r.effective).length;
 return {id:row.id,vault:row.vault_id,owner:row.owner,phase:row.phase,period:row.period,asOf:row.as_of,dueAt:row.due_at,scheduledAt:row.scheduled_at,policyVersion:row.policy_version,enforcement:JSON.parse(row.snapshot).enforcement??current.enforcement,rows:row.owner===ctx.actor?rows:rows.filter(r=>r.reviewer===ctx.actor),changes:row.owner===ctx.actor?changes:[],changed:row.owner===ctx.actor?changed:[],policyChanged,overdue:row.phase==='open'&&row.due_at<ctx.now,completeness:{total,decided,removals:rows.filter(r=>r.decision==='remove').length,pendingRemovals,unreconciled:changes.length+changed.length+Number(policyChanged)},closedAt:row.closed_at};
}
