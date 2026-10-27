import { canonicalJson, access, exact, guarded, id, need, uuid, vaultFor } from '../lifecycle/common.mjs';
import { digest, verify, verifyWrapped, validateEnvelope } from '../crypto/envelope.mjs';
import { policyText } from '../crypto/lifecycle.mjs';
const path = action => ['people','custody',action].join('/');
const hash = value => digest(canonicalJson(value));
const binding = (tenant,vault,account,epoch) => ({tenant,vault,object:account,purpose:'company-custody',epoch,version:1});
export const custodyText = value => canonicalJson(['latchkey-company-custody-v1',value]);
export const receiptText = value => canonicalJson(['latchkey-company-custody-receipt-v1',value]);
async function ownerAccount(ctx,account){
 const row=await access(ctx).first("SELECT a.*,o.version AS operator_version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.role='owner' AND o.status='active'",account,ctx.tenant);
 need(row,'active_owner_custodian_required',403);return row;
}
const ownerGuard=(ctx,account)=>access(ctx).guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND o.version=? AND o.role='owner' AND o.status='active')",[account.id,ctx.tenant,account.generation,account.operator_version]);
async function context(ctx,vaultId,expiresAt){
 const {first,all}=access(ctx),vault=await first('SELECT * FROM lky_vaults WHERE id=? AND tenant=?',uuid(vaultId),ctx.tenant);need(vault,'not_found',404);
 const custody=await first('SELECT * FROM lky_company_custody WHERE vault_id=?',vault.id);need(custody&&custody.accepted===1&&custody.owner===vault.owner&&custody.epoch===vault.epoch,'enrolled_company_custody_required',409);
 need(custody.custodian===ctx.actor,'custodian_required',403);const custodian=await ownerAccount(ctx,ctx.actor);
 const enrollment=JSON.parse(custody.enrollment);need(enrollment.statement.generation===custodian.generation&&enrollment.statement.recipientKey===custodian.recipient_key,'custody_authority_changed',409);
 const operation=await first("SELECT * FROM lky_people_offboarding WHERE tenant=? AND account=? AND custodian=? AND status='suspended'",ctx.tenant,vault.owner,ctx.actor);need(operation,'suspended_handback_required',409);
 const source=await first("SELECT a.authority_key FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND o.status='inactive'",vault.owner);need(source,'leaver_state_changed',409);
 // Special lifecycle and linked product records need their own reviewed migration.
 for(const [table,column] of [['lky_lifecycle','vault_id'],['lky_erased_items','vault_id'],['lky_projects','vault_id'],['lky_reviews','vault_id'],['lky_aliases','vault_id']])need(!await first(`SELECT 1 FROM ${table} WHERE ${column}=?`,vault.id),'custody_linked_state_unsupported',409);
 const versions=await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version',vault.id);
 need(versions.length>0,'custody_empty_vault',409);
 const plan={schema:'latchkey-company-handback-v1',tenant:ctx.tenant,vault:vault.id,owner:vault.owner,custodian:ctx.actor,epoch:vault.epoch,revision:vault.revision,operation:operation.id,enrollmentHash:custody.enrollment_hash,sourceKey:source.authority_key,custodianGeneration:custodian.generation,custodianVersion:custodian.operator_version,versions,expiresAt};
 return {plan,vault,custody,enrollment,custodian};
}
export async function custodyAuthenticated(route,input,ctx){
 if(!route.startsWith(['people','custody',''].join('/')))return null;
 const {first,stmt,event,guard}=access(ctx);
 if(route===path('enroll')){
  exact(input,['vault','enrollment','confirmed']);need(input.confirmed===true,'custody_confirmation_required',403);
  const vault=await vaultFor(ctx,input.vault);need(vault.owner===ctx.actor&&vault.kind!=='family','company_vault_owner_required',403);
  const enrollment=input.enrollment,s=enrollment?.statement;exact(enrollment,['statement','signature']);exact(s,['tenant','vault','owner','custodian','epoch','generation','recipientKey','keyHash','wrapped']);
  need(s.tenant===ctx.tenant&&s.vault===vault.id&&s.owner===ctx.actor&&s.epoch===vault.epoch,'custody_context_changed',409);
  const custodian=await ownerAccount(ctx,uuid(s.custodian));need(s.custodian!==ctx.actor&&s.generation===custodian.generation&&s.recipientKey===custodian.recipient_key,'custody_authority_changed',409);
  need(typeof s.keyHash==='string'&&/^[A-Za-z0-9_-]{43}$/.test(s.keyHash),'invalid_custody_key_hash');
  need(await verify(vault.authority_key,enrollment.signature,custodyText(s))&&await verifyWrapped(s.wrapped,vault.authority_key,ctx.actor,binding(ctx.tenant,vault.id,custodian.id,vault.epoch)),'invalid_custody_signature',403);
  const enrollmentHash=await hash(enrollment);
  await guarded(ctx,[vault],[stmt('INSERT INTO lky_company_custody VALUES(?,?,?,?,?,?,0) ON CONFLICT(vault_id) DO UPDATE SET owner=excluded.owner,custodian=excluded.custodian,epoch=excluded.epoch,enrollment=excluded.enrollment,enrollment_hash=excluded.enrollment_hash,accepted=0',vault.id,ctx.actor,custodian.id,vault.epoch,canonicalJson(enrollment),enrollmentHash),event('company_custody_proposed',vault.id)],[ownerGuard(ctx,custodian)]);
  return {enrollmentHash,accepted:false};
 }
 if(route===path('revoke')){
  exact(input,['vault','confirmed']);need(input.confirmed===true,'custody_confirmation_required',403);
  const vault=await vaultFor(ctx,input.vault);need(vault.owner===ctx.actor,'company_vault_owner_required',403);
  await guarded(ctx,[vault],[stmt('DELETE FROM lky_company_custody WHERE vault_id=?',vault.id),event('company_custody_revoked',vault.id)]);return {revoked:true};
 }
 if(route===path('pending')||route===path('accept')){
  exact(input,route===path('pending')?['vault']:['vault','enrollmentHash','signature']);
  const custodian=await ownerAccount(ctx,ctx.actor),row=await first('SELECT c.*,a.authority_key FROM lky_company_custody c JOIN lky_accounts a ON a.id=c.owner JOIN lky_vaults v ON v.id=c.vault_id WHERE c.vault_id=? AND c.custodian=? AND v.tenant=? AND v.epoch=c.epoch AND v.owner=c.owner',uuid(input.vault),ctx.actor,ctx.tenant);need(row,'not_found',404);
  const enrollment=JSON.parse(row.enrollment);need(enrollment.statement.generation===custodian.generation,'custody_authority_changed',409);
  if(route===path('pending'))return {enrollment,enrollmentHash:row.enrollment_hash,sourceKey:row.authority_key};
  need(input.enrollmentHash===row.enrollment_hash&&await verify(custodian.authority_key,input.signature,receiptText({enrollmentHash:row.enrollment_hash,keyHash:enrollment.statement.keyHash})),'invalid_custody_receipt',403);
  await guarded(ctx,[],[stmt('UPDATE lky_company_custody SET accepted=1 WHERE vault_id=?',row.vault_id),event('company_custody_accepted',row.vault_id)],[ownerGuard(ctx,custodian),guard('EXISTS(SELECT 1 FROM lky_company_custody c JOIN lky_vaults v ON v.id=c.vault_id WHERE c.vault_id=? AND c.enrollment_hash=? AND v.epoch=c.epoch AND v.owner=c.owner)',[row.vault_id,row.enrollment_hash])]);return {accepted:true};
 }
 if(route===path('preview')){
  exact(input,['vault']);const value=await context(ctx,input.vault,ctx.now+240000);return {plan:value.plan,planHash:await hash(value.plan),enrollment:value.enrollment};
 }
 if(route===path('commit')){
  exact(input,['plan','planHash','confirmed','versions','wrapped','policy']);need(input.confirmed===true,'custody_confirmation_required',403);
  const p=input.plan;need(Number.isSafeInteger(p?.expiresAt)&&p.expiresAt>Math.max(ctx.now,Date.now())&&p.expiresAt<=ctx.now+300000,'custody_review_expired',409);
  const current=await context(ctx,p.vault,p.expiresAt),{plan,vault,custodian,custody}=current;
  need(await hash(p)===input.planHash&&await hash(plan)===input.planHash,'custody_plan_changed',409);
  const epoch=vault.epoch+1;
  need(Array.isArray(input.versions)&&input.versions.length===plan.versions.length,'custody_versions_changed',409);
  for(const [index,row] of input.versions.entries()){
   exact(row,['object','version','envelope']);const expected=plan.versions[index];need(row.object===expected.object_id&&row.version===expected.version,'custody_versions_changed',409);
   validateEnvelope(row.envelope,{tenant:ctx.tenant,vault:vault.id,object:row.object,purpose:'item',epoch,version:row.version});
  }
  need(await verifyWrapped(input.wrapped,custodian.authority_key,ctx.actor,{tenant:ctx.tenant,vault:vault.id,object:ctx.actor,purpose:'vault-key',epoch,version:1}),'invalid_custody_wrap',403);
  const policy=input.policy;need(policy?.statement?.tenant===ctx.tenant&&policy.statement.vault===vault.id&&policy.statement.owner===ctx.actor&&await verify(custodian.authority_key,policy.signature,policyText(policy.statement)),'invalid_custody_policy',403);
  const statements=[stmt('UPDATE lky_vaults SET owner=?,epoch=?,revision=revision+1,mutation=?,trash_policy=? WHERE id=?',ctx.actor,epoch,id(),canonicalJson(policy),vault.id),stmt('DELETE FROM lky_recipients WHERE vault_id=?',vault.id),stmt('DELETE FROM lky_vault_capabilities WHERE vault_id=?',vault.id),stmt('INSERT INTO lky_recipients VALUES(?,?,?,?)',vault.id,ctx.actor,canonicalJson(['read','create','edit','export','share','rotate','delete','restore']),canonicalJson(input.wrapped)),...input.versions.map(row=>stmt('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=?',canonicalJson(row.envelope),vault.id,row.object,row.version)),stmt('DELETE FROM lky_export_policies WHERE vault_id=?',vault.id),stmt('UPDATE lky_shares SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,vault.id),stmt('UPDATE lky_links SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,vault.id),stmt('UPDATE lky_machines SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,vault.id),stmt('DELETE FROM lky_company_custody WHERE vault_id=?',vault.id),stmt("UPDATE lky_people_offboarding SET handback=CASE WHEN EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_versions i ON i.vault_id=v.id WHERE v.owner=? AND v.tenant=? AND v.kind<>'family') THEN 'blocked-missing-enrolled-custody' ELSE 'transferred-company-items' END WHERE id=?",vault.owner,ctx.tenant,plan.operation),event('company_handback_completed',vault.id)];
  need(plan.expiresAt>Math.max(ctx.now,Date.now()),'custody_review_expired',409);
  await guarded(ctx,[],statements,[ownerGuard(ctx,custodian),guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND epoch=? AND revision=?)',[vault.id,vault.owner,vault.epoch,vault.revision]),guard('EXISTS(SELECT 1 FROM lky_company_custody WHERE vault_id=? AND enrollment_hash=? AND accepted=1)',[vault.id,custody.enrollment_hash]),guard("EXISTS(SELECT 1 FROM lky_people_offboarding p JOIN oa_operators o ON o.id=p.operator WHERE p.id=? AND p.status='suspended' AND o.status='inactive')",[plan.operation])]);
  return {transferred:true,vault:vault.id,epoch,revision:vault.revision+1,providerChanged:false};
 }
 need(false,'custody_route_not_found',404);
}
