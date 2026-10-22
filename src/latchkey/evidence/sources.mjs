import {access,campaign,canonicalJson,digest,exact,id,need,ownedVault,uuid} from '../reviews/common.mjs';
import {inventoryGuard} from '../reviews/snapshot.mjs';
import {transact} from '../reviews/state.mjs';
import {companyPosture} from './posture.mjs';

// The local immutable review retains its attributed decisions. Outbound evidence
// excludes people, arbitrary reasons, recipient email, credential references and
// free-form period text. Counts and each decision's outcome remain inspectable.
function reviewDisclosure(row){
 const value=JSON.parse(row.package);
 return {schema:'latchkey/review-disclosure/v1',id:row.id,kind:'access-review',asOf:value.asOf,closedAt:value.closedAt,sourceTimestamp:row.closed_at,policyVersion:value.policyVersion,enforcement:value.enforcement,completeness:value.completeness,
  rows:value.rows.map(r=>({kind:r.kind,rights:r.rights,status:r.status,decision:r.decision,effective:r.effective,decidedAt:r.decidedAt,superseded:r.superseded})),
  omitted:['people and recipient identities','credential and vault references','decision reasons','free-form review period']};
}
export async function evidenceSource(ctx,source){
 uuid(source);const {first}=access(ctx),captured=await first('SELECT * FROM lky_evidence_sources WHERE id=? AND tenant=? AND owner=?',source,ctx.tenant,ctx.actor);
 if(captured){need(captured.active===1,'evidence_source_inactive',409);await companyScope(ctx,captured.vault_id);return {id:source,vault:captured.vault_id,kind:captured.kind,package:JSON.parse(captured.body),sourceTimestamp:captured.source_timestamp,guard:{sql:'EXISTS(SELECT 1 FROM lky_evidence_sources WHERE id=? AND active=1 AND body=?)',args:[source,captured.body]}};}
 const row=await campaign(ctx,source);need(row.owner===ctx.actor,'review_owner_required',403);await companyScope(ctx,row.vault_id);need(row.phase==='closed'&&row.package,'review_incomplete',409);
 return {id:source,vault:row.vault_id,kind:'access-review',package:reviewDisclosure(row),sourceTimestamp:row.closed_at,guard:{sql:"EXISTS(SELECT 1 FROM lky_reviews WHERE id=? AND phase='closed' AND package=?)",args:[source,row.package]}};
}
export async function companyScope(ctx,vault){const row=await ownedVault(ctx,vault);need(row.kind==='company','company_vault_required',403);return row;}
export async function evidenceSourcesAuthenticated(route,input,ctx){
 const {all,stmt,event}=access(ctx);
 if(route==='evidence/source-meta'){
  exact(input,['source']);uuid(input.source);const row=await access(ctx).first('SELECT * FROM lky_evidence_sources WHERE id=? AND tenant=? AND owner=?',input.source,ctx.tenant,ctx.actor);
  if(row){await companyScope(ctx,row.vault_id);return {id:row.id,vault:row.vault_id,owner:row.owner,phase:row.active?'closed':'inactive',kind:row.kind};}
  const review=await campaign(ctx,input.source);need(review.owner===ctx.actor,'review_owner_required',403);await companyScope(ctx,review.vault_id);return {id:review.id,vault:review.vault_id,owner:review.owner,phase:review.phase,kind:'access-review'};
 }
 if(route==='evidence/sources'){exact(input,['vault']);await companyScope(ctx,input.vault);return all('SELECT id,kind,source_timestamp AS sourceTimestamp,active FROM lky_evidence_sources WHERE vault_id=? AND tenant=? AND owner=? ORDER BY created_at DESC,id',input.vault,ctx.tenant,ctx.actor);}
 if(route!=='evidence/capture')return null;
 exact(input,['vault','confirmed']);need(input.confirmed===true,'evidence_capture_confirmation_required',403);
 const guarded={...ctx,reviewGuards:await inventoryGuard(ctx,input.vault)},body=await companyPosture(guarded,input.vault),source=id(),value={...body,id:source};
 await transact(guarded,input.vault,[stmt('INSERT INTO lky_evidence_sources VALUES(?,?,?,?,?,?,?,?,1)',source,ctx.tenant,ctx.actor,input.vault,'company-posture',canonicalJson(value),ctx.now,ctx.now),event('company_evidence_captured',source)]);
 return {id:source,kind:'company-posture',sourceTimestamp:ctx.now,packageHash:await digest(canonicalJson(value))};
}
