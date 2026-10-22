import { access } from './common.mjs';
import { start,detail,transact } from './state.mjs';
export async function runReviewSchedule(db,now=Date.now()){
 const rows=(await db.prepare("SELECT c.*,a.operator_id FROM lky_reviews c JOIN lky_accounts a ON a.id=c.owner JOIN oa_operators o ON o.id=a.operator_id JOIN lky_vaults v ON v.id=c.vault_id WHERE c.phase IN ('scheduled','open') AND c.scheduled_at<=? AND a.tenant=c.tenant AND o.status='active' AND v.owner=c.owner ORDER BY c.scheduled_at,c.id LIMIT 100").bind(now).all()).results;
 for(const row of rows){
  const ctx={db,now,actor:row.owner,device:'review-scheduler',tenant:row.tenant,session:{operator:{id:row.operator_id}},fence:"EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_vaults v ON v.owner=a.id WHERE a.id=? AND a.tenant=? AND o.status='active' AND v.id=?)",fenceArgs:[row.owner,row.tenant,row.vault_id]};
  if(row.phase==='scheduled')await start(ctx,row);
  const state=await detail(ctx,{...row,...(row.phase==='scheduled'?await access(ctx).first('SELECT * FROM lky_reviews WHERE id=?',row.id):{})});
  if(state.overdue){const {stmt}=access(ctx),reviewers=[...new Set(state.rows.filter(r=>!r.decision||r.decision==='remove'&&!r.effective).map(r=>r.reviewer))];await transact(ctx,row.vault_id,reviewers.map(reviewer=>stmt('INSERT INTO lky_review_reminders VALUES(?,?,?,?) ON CONFLICT DO NOTHING',row.id,reviewer,Math.floor(now/86400000),now)))}
 }
 return {processed:rows.length};
}
