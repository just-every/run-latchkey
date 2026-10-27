import { access, guarded, has, id, need, vaultFor } from '../lifecycle/common.mjs';
import { scopeGuards } from './scope.mjs';
import { reconcileBoundReviews } from './review-results.mjs';
import { scheduleSlot } from './clock.mjs';
// The caller must supply the event clock. Replay never consults the wall clock.
export async function runRuleSchedule(db,now) {
 need(Number.isSafeInteger(now)&&now>=0,'rule_clock_required');
 let cursor='',processed=0;
 while(true){
 const rows=(await db.prepare("SELECT c.*,v.definition,a.operator_id FROM lky_rules c JOIN lky_rule_versions v ON v.rule_id=c.id AND v.version=c.version JOIN lky_accounts a ON a.id=c.owner JOIN oa_operators o ON o.id=a.operator_id WHERE c.active=1 AND a.tenant=c.tenant AND o.status='active' AND o.role='owner' AND c.id>? ORDER BY c.id LIMIT 100").bind(cursor).all()).results;
 if(!rows.length)break;
 cursor=rows.at(-1).id;
 for(const row of rows){
  const value=JSON.parse(row.definition);if(now<value.startAt)continue;
  const {slot,startAt}=scheduleSlot(value,now),run=id();
  const ctx={db,now,actor:row.owner,device:'rule-scheduler',tenant:row.tenant,fence:"EXISTS(SELECT 1 FROM lky_rules c JOIN lky_accounts a ON a.id=c.owner JOIN oa_operators o ON o.id=a.operator_id WHERE c.id=? AND c.version=? AND c.active=1 AND a.tenant=c.tenant AND o.status='active' AND o.role='owner')",fenceArgs:[row.id,row.version]};
  const {stmt,first,event,guard}=access(ctx);
  if(await first('SELECT 1 FROM lky_rule_runs WHERE rule_id=? AND version=? AND slot=?',row.id,row.version,slot))continue;
  const vault=await vaultFor(ctx,value.vault);if(vault.owner!==row.owner||vault.kind!=='company'||!has(vault,'read'))continue;
  let state=now-startAt>=value.windowMs?'missed-window':'prepared';
  const guards=[];
  try{guards.push(...await scopeGuards(ctx,value))}catch(error){if(error.code!=='rule_scope_changed')throw error;state='suspended-scope-changed'}
  for(const target of value.targets){
   const sql="(SELECT MAX(version) FROM lky_versions WHERE vault_id=? AND object_id=?)=? AND NOT EXISTS(SELECT 1 FROM lky_lifecycle WHERE vault_id=? AND object_id=? AND state<>'active')",args=[vault.id,target.object,target.version,vault.id,target.object];
   if(!await first(`SELECT 1 WHERE ${sql}`,...args))state='suspended-target-changed';else guards.push(guard(sql,args));
  }
  for(const recipient of value.recipients){
   const sql="EXISTS(SELECT 1 FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? AND r.account_id=? AND a.tenant=? AND o.status='active' AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read'))",args=[vault.id,recipient,row.tenant];
   if(!await first(`SELECT 1 WHERE ${sql}`,...args))state='suspended-recipient-changed';else guards.push(guard(sql,args));
  }
  const effects=state==='prepared'?value.targets.filter(t=>value.kind==='review'||t.dueAt<=now).flatMap(target=>value.recipients.map(recipient=>({target,recipient}))):[];
  need(effects.length<=value.maxEffects,'rule_effect_limit');
  try {
   await guarded(ctx,[vault],[stmt('INSERT INTO lky_rule_runs VALUES(?,?,?,?,?,?)',run,row.id,row.version,slot,state,now),...effects.map(({target,recipient})=>stmt('INSERT INTO lky_rule_obligations VALUES(?,?,?,?,?,?,NULL,?)',id(),run,target.object,recipient,target.version,value.kind==='rotation'?'waiting-approval':'open',now)),event('rule_run_'+state,row.id)],[guard('NOT EXISTS(SELECT 1 FROM lky_rule_runs WHERE rule_id=? AND version=? AND slot=?)',[row.id,row.version,slot]),...(state==='prepared'?guards:[])]);
   processed++;
  } catch(error) {
   // A concurrent runner may win the unique slot. Other failures stay visible.
   if(!await first('SELECT 1 FROM lky_rule_runs WHERE rule_id=? AND version=? AND slot=?',row.id,row.version,slot))throw error;
  }
 }
 }
 return {processed,completed:await reconcileBoundReviews(db,now)};
}
