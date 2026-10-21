import { access,exact,keyed,need,receipt,requireOwner,subjectReplayKnown,uuid } from './subject-common.mjs';
import { subjectPlan } from './subject-plan.mjs';
import { commitSubject,subjectRecords } from './subject-commit.mjs';
import { verifySubjectAudit } from './subject-audit.mjs';
export { SubjectErasureError,subjectReplayKnown } from './subject-common.mjs';
export { verifySubjectAudit } from './subject-audit.mjs';

// Admission/put/import/source adapters must call this before creating an item
// whose old plain UUID fence was anonymized by a person-erasure transaction.
export const subjectItemReplayKnown=(ctx,vault,object)=>subjectReplayKnown(ctx,'item',[vault,object]);
export async function subjectVaultWriteAllowed(ctx,vault){
 const pending=await access(ctx).first("SELECT 1 AS pending FROM lky_subject_invalidations WHERE tenant=? AND vault_id=? AND status='pending'",ctx.tenant,vault);
 need(!pending,'subject_key_rotation_required',409);return true;
}
// Add these statements to the already-fenced, successful vault/rotate batch.
// A provider-password rotation is a separate observed result, never inferred.
export function subjectRotationStatements(ctx,vault,newEpoch){
 need(Number.isSafeInteger(newEpoch)&&newEpoch>0,'invalid_epoch');
 return [access(ctx).stmt("UPDATE lky_subject_invalidations SET status='rotated' WHERE tenant=? AND vault_id=? AND status='pending' AND epoch<? AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND tenant=? AND epoch=?)",ctx.tenant,vault,newEpoch,vault,ctx.tenant,newEpoch)];
}
async function completedFor(ctx,subject){
 const hash=await keyed(ctx,'fence:operator',subject);
 return access(ctx).first('SELECT e.* FROM lky_subject_fences f JOIN lky_subject_erasures e ON e.id=f.operation WHERE f.tenant=? AND f.kind=? AND f.digest=?',ctx.tenant,'operator',hash);
}
export async function subjectErasureAuthenticated(route,input,ctx){
 if(!['subject/erase-preview','subject/erase','subject/erasure-status','subject/invalidations','subject/audit-verify'].includes(route))return null;
 await requireOwner(ctx);
 if(route==='subject/erasure-status'){
  exact(input,['operation']);const row=await access(ctx).first('SELECT * FROM lky_subject_erasures WHERE id=? AND tenant=?',uuid(input.operation),ctx.tenant);need(row,'subject_erasure_not_found',404);return receipt(ctx,row);
 }
 if(route==='subject/invalidations'){
  exact(input,[]);return {invalidations:await access(ctx).all('SELECT vault_id AS vault,operation,epoch,status FROM lky_subject_invalidations WHERE tenant=? ORDER BY vault_id,operation',ctx.tenant)};
 }
 if(route==='subject/audit-verify'){
  exact(input,['operation','checkpoint']);need(input.checkpoint&&typeof input.checkpoint==='object','held_audit_checkpoint_required');return verifySubjectAudit(ctx,uuid(input.operation),input.checkpoint);
 }
 const preview=route.endsWith('-preview');exact(input,preview?['subject']:['subject','confirmed','planHash']);const subject=uuid(input.subject);
 if(!preview)need(input.confirmed===true,'subject_erasure_confirmation_required');
 const known=await completedFor(ctx,subject);if(known)return receipt(ctx,known);
 const records=await subjectRecords(ctx),plan=await subjectPlan(ctx,subject);
 if(preview)return {planHash:plan.planHash,counts:plan.counts,outstanding:plan.outstanding,complete:false,requiresConfirmation:true};
 need(input.planHash===plan.planHash,'subject_erasure_plan_changed',409);
 return commitSubject(ctx,plan,records);
}
