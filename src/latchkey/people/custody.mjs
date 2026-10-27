import { access, canonicalJson, exact, guarded, id, need, uuid, verifyPolicy } from '../lifecycle/common.mjs';
import { digest, validateEnvelope, verifyWrapped } from '../crypto/envelope.mjs';
const binding=(tenant,vault,object,purpose,epoch)=>({tenant,vault,object,purpose,epoch,version:1});
const rights=['read','create','edit','export','share','rotate','delete','restore'];
const ownerSql="EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND a.generation=? AND o.status='active' AND o.role='owner' AND o.version=?)";
async function activeOwner(ctx,account){
 return access(ctx).first("SELECT a.*,o.version AS operator_version FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active' AND o.role='owner'",account,ctx.tenant);
}
async function operationFor(ctx,operation){
 const op=await access(ctx).first('SELECT * FROM lky_people_offboarding WHERE id=? AND tenant=?',uuid(operation),ctx.tenant);
 need(op,'not_found',404);need(op.custodian===ctx.actor,'named_custodian_required',403);
 const owner=await activeOwner(ctx,ctx.actor);need(owner,'active_owner_custodian_required',403);
 return {op,owner};
}
async function planFor(ctx,operation,action){
 const {op,owner}=await operationFor(ctx,operation),{all,first}=access(ctx);
 need(['handback','reactivate'].includes(action),'invalid_custody_action');
 const person=await first('SELECT o.id,o.status,o.version,a.generation FROM oa_operators o JOIN lky_accounts a ON a.operator_id=o.id WHERE o.id=? AND a.id=? AND a.tenant=?',op.operator,op.account,ctx.tenant);
 need(person&&person.status==='inactive'&&op.status==='suspended','offboarding_state_changed',409);
 need(!await first('SELECT 1 FROM oa_external_identities WHERE operator_id=?',op.operator),'directory_reconciliation_required',409);
 const vaults=await all("SELECT v.* FROM lky_vaults v WHERE v.tenant=? AND v.owner=? AND v.kind<>'family' ORDER BY v.id",ctx.tenant,op.account);
 const sources=[];
 for(const vault of vaults){
  const custody=await first('SELECT * FROM lky_company_custody WHERE vault_id=?',vault.id);
  need(custody&&custody.owner===op.account&&custody.custodian===ctx.actor&&custody.tenant===ctx.tenant&&custody.epoch===vault.epoch&&custody.generation===owner.generation,'missing_enrolled_custody',409);
  // Erasure signatures require a separately reviewed authority reconciliation.
  need(!await first('SELECT 1 FROM lky_erased_items WHERE vault_id=?',vault.id),'custody_reconciliation_required',409);
  const lifecycle=await all('SELECT * FROM lky_lifecycle WHERE vault_id=? ORDER BY object_id',vault.id),projects=await all('SELECT id,owner,metadata_object FROM lky_projects WHERE vault_id=? ORDER BY id',vault.id);
  const versions=await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version',vault.id);
  const recipients=await all('SELECT account_id,rights,wrapped_key FROM lky_recipients WHERE vault_id=? ORDER BY account_id',vault.id);
  sources.push({vault:vault.id,kind:vault.kind,epoch:vault.epoch,revision:vault.revision,archived:lifecycle.filter(v=>v.state==='archived').length,trash:lifecycle.filter(v=>v.state==='trash').length,projects,versions:versions.length,items:new Set(versions.map(v=>v.object_id)).size,contentHash:await digest(canonicalJson(versions)),custodyHash:await digest(canonicalJson(JSON.parse(custody.wrapped))),commitment:await digest(canonicalJson({vault,versions,recipients,custody,lifecycle,projects}))});
 }
 if(action==='reactivate')need(vaults.length===0&&['transferred','no-owned-company-items'].includes(op.handback),'company_handback_pending',409);
 else need(vaults.length>0,'no_company_vaults',409);
 return {schema:1,operation:op.id,action,account:op.account,operator:op.operator,operatorVersion:person.version,accountGeneration:person.generation,custodian:ctx.actor,custodianGeneration:owner.generation,custodianVersion:owner.operator_version,vaults:sources,effect:action==='handback'?'Rotate encrypted company vaults into the named custodian. Remove every prior vault recipient and grant. Preserve archived and trashed states with automatic retention paused; transfer project metadata ownership. Hold erasure proofs for reconciliation. No provider changes. Previously copied data cannot be recalled.':'Reactivate membership only. Existing sessions and tokens stay revoked. No vault grants, transferred ownership or provider credentials are restored.'};
}
export async function custodyAuthenticated(route,input,ctx){
 if(!route.startsWith(['people','custody',''].join('/')))return null;
 const {all,first,stmt,event,guard}=access(ctx),action=route.slice(['people','custody',''].join('/').length);
 if(action==='enroll'){
  exact(input,['vault','custodian','fingerprint','wrapped','revision','confirmed']);need(input.confirmed===true,'custody_confirmation_required',403);
  const vault=await first("SELECT v.*,a.authority_key FROM lky_vaults v JOIN lky_accounts a ON a.id=v.owner WHERE v.id=? AND v.tenant=? AND v.owner=? AND v.kind<>'family'",uuid(input.vault),ctx.tenant,ctx.actor);
  need(vault,'company_vault_owner_required',403);need(input.revision===vault.revision,'version_conflict',409);
  const owner=await activeOwner(ctx,uuid(input.custodian));need(owner&&owner.id!==ctx.actor,'active_owner_custodian_required',403);
  need(input.fingerprint===await digest(JSON.stringify([owner.recipient_key,owner.authority_key])),'recipient_mismatch',409);
  need(await verifyWrapped(input.wrapped,vault.authority_key,ctx.actor,binding(ctx.tenant,vault.id,owner.id,'company-custody',vault.epoch)),'invalid_key_signature',403);
  await guarded(ctx,[],[stmt('INSERT INTO lky_company_custody VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(vault_id) DO UPDATE SET owner=excluded.owner,custodian=excluded.custodian,epoch=excluded.epoch,generation=excluded.generation,wrapped=excluded.wrapped,enrolled_at=excluded.enrolled_at',vault.id,ctx.tenant,ctx.actor,owner.id,vault.epoch,owner.generation,canonicalJson(input.wrapped),ctx.now),event('company_custody_enrolled',vault.id)],[guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND epoch=? AND revision=?)',[vault.id,ctx.actor,vault.epoch,vault.revision]),guard(ownerSql,[owner.id,ctx.tenant,owner.generation,owner.operator_version])]);
  return {vault:vault.id,custodian:owner.id,enrolled:true,transferred:false};
 }
 if(action==='preview'){
  exact(input,['operation','action']);const plan=await planFor(ctx,input.operation,input.action),review=id(),expiresAt=ctx.now+240000;
  await guarded(ctx,[],[stmt('INSERT INTO lky_custody_reviews VALUES(?,?,?,?,?,?,?,NULL)',review,ctx.tenant,ctx.actor,plan.operation,plan.action,canonicalJson(plan),expiresAt),event('company_custody_reviewed',review)]);
  return {review,plan,planHash:await digest(canonicalJson(plan)),expiresAt};
 }
 if(action==='source'){
  exact(input,['review','vault']);const review=await first('SELECT * FROM lky_custody_reviews WHERE id=? AND tenant=? AND actor=? AND action=? AND consumed_at IS NULL AND expires_at>?',uuid(input.review),ctx.tenant,ctx.actor,'handback',ctx.now);need(review,'custody_review_expired',409);
  const plan=await planFor(ctx,review.operation,'handback');need(canonicalJson(plan)===review.plan,'custody_review_changed',409);need(plan.vaults.some(v=>v.vault===input.vault),'not_found',404);
  const vault=await first('SELECT v.*,a.authority_key,a.recipient_key FROM lky_vaults v JOIN lky_accounts a ON a.id=v.owner WHERE v.id=?',uuid(input.vault));
  const custody=await first('SELECT wrapped FROM lky_company_custody WHERE vault_id=?',vault.id);
  return {vault:vault.id,tenant:ctx.tenant,owner:vault.owner,authorityKey:vault.authority_key,recipientKey:vault.recipient_key,epoch:vault.epoch,revision:vault.revision,kind:vault.kind,wrapped:JSON.parse(custody.wrapped),versions:await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version',vault.id)};
 }
 if(action==='commit'){
  exact(input,['review','planHash','confirmed','vaults']);need(input.confirmed===true,'custody_confirmation_required',403);
  const review=await first('SELECT * FROM lky_custody_reviews WHERE id=? AND tenant=? AND actor=? AND consumed_at IS NULL AND expires_at>?',uuid(input.review),ctx.tenant,ctx.actor,ctx.now);need(review,'custody_review_expired',409);
  const plan=await planFor(ctx,review.operation,review.action);need(canonicalJson(plan)===review.plan&&input.planHash===await digest(review.plan),'custody_review_changed',409);
  need(Array.isArray(input.vaults)&&canonicalJson(input.vaults.map(v=>v.vault).sort())===canonicalJson(plan.vaults.map(v=>v.vault).sort()),'incomplete_handback',409);
  const changes=[],guards=[guard('EXISTS(SELECT 1 FROM lky_custody_reviews WHERE id=? AND consumed_at IS NULL AND expires_at>?)',[review.id,ctx.now]),guard(ownerSql,[ctx.actor,ctx.tenant,plan.custodianGeneration,plan.custodianVersion]),guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND status='inactive' AND version=?)",[plan.operator,plan.operatorVersion]),guard('EXISTS(SELECT 1 FROM lky_accounts WHERE id=? AND generation=?)',[plan.account,plan.accountGeneration]),guard('NOT EXISTS(SELECT 1 FROM oa_external_identities WHERE operator_id=?)',[plan.operator]),guard("(SELECT COUNT(*) FROM lky_vaults WHERE tenant=? AND owner=? AND kind<>'family')=?",[ctx.tenant,plan.account,plan.vaults.length])];
  for(const source of plan.vaults){
   const next=input.vaults.find(v=>v.vault===source.vault);exact(next,['vault','versions','wrapped','policy']);
   const owner=await activeOwner(ctx,ctx.actor),epoch=source.epoch+1;
   need(await verifyWrapped(next.wrapped,owner.authority_key,ctx.actor,binding(ctx.tenant,source.vault,ctx.actor,'vault-key',epoch)),'invalid_key_signature',403);
   need(await verifyPolicy(next.policy,{id:source.vault,tenant:ctx.tenant,owner:ctx.actor,authority_key:owner.authority_key}),'invalid_retention_policy',403);
   const original=await all('SELECT object_id,version FROM lky_versions WHERE vault_id=? ORDER BY object_id,version',source.vault);
   need(Array.isArray(next.versions)&&canonicalJson(next.versions.map(v=>[v.object,v.version]).sort())===canonicalJson(original.map(v=>[v.object_id,v.version]).sort()),'incomplete_handback',409);
   for(const row of next.versions){exact(row,['object','version','envelope']);validateEnvelope(row.envelope,{...binding(ctx.tenant,source.vault,uuid(row.object),'item',epoch),version:row.version});changes.push(stmt('UPDATE lky_versions SET envelope=? WHERE vault_id=? AND object_id=? AND version=?',canonicalJson(row.envelope),source.vault,row.object,row.version));}
   guards.push(guard('(SELECT COUNT(*) FROM lky_projects WHERE vault_id=?)=?',[source.vault,source.projects.length]));
   for(const project of source.projects)guards.push(guard('EXISTS(SELECT 1 FROM lky_projects WHERE id=? AND vault_id=? AND owner=? AND metadata_object=?)',[project.id,source.vault,project.owner,project.metadata_object]));
   guards.push(guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND epoch=? AND revision=?)',[source.vault,plan.account,source.epoch,source.revision]));
   changes.push(stmt('UPDATE lky_projects SET owner=? WHERE vault_id=?',ctx.actor,source.vault),stmt('UPDATE lky_lifecycle SET retention_active=0 WHERE vault_id=?',source.vault),stmt('UPDATE lky_vaults SET owner=?,epoch=?,revision=revision+1,mutation=?,trash_policy=? WHERE id=?',ctx.actor,epoch,id(),canonicalJson(next.policy),source.vault),stmt('DELETE FROM lky_recipients WHERE vault_id=?',source.vault),stmt('INSERT INTO lky_recipients VALUES(?,?,?,?)',source.vault,ctx.actor,canonicalJson(rights),canonicalJson(next.wrapped)),stmt('DELETE FROM lky_vault_capabilities WHERE vault_id=?',source.vault),stmt('DELETE FROM lky_export_policies WHERE vault_id=?',source.vault),stmt('DELETE FROM lky_company_custody WHERE vault_id=?',source.vault),stmt('UPDATE lky_machines SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,source.vault),stmt('UPDATE lky_runtime_grants SET revoked_at=COALESCE(revoked_at,?) WHERE id IN(SELECT grant_id FROM lky_runtime_scopes WHERE vault_id=? UNION SELECT grant_id FROM lky_runtime_dependencies WHERE vault_id=?)',ctx.now,source.vault,source.vault),stmt('UPDATE lky_mcp_credentials SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,source.vault),stmt('UPDATE lky_shares SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,source.vault),stmt('UPDATE lky_links SET revoked_at=COALESCE(revoked_at,?) WHERE vault_id=?',ctx.now,source.vault),event('company_vault_transferred',source.vault));
  }
  if(review.action==='reactivate')changes.push(stmt("UPDATE oa_operators SET status='active',version=version+1 WHERE id=?",plan.operator),stmt('UPDATE oa_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?',ctx.now,plan.operator),stmt('UPDATE oa_tokens SET revoked_at=COALESCE(revoked_at,?) WHERE operator_id=?',ctx.now,plan.operator),stmt('DELETE FROM lky_grants WHERE account_id=?',plan.account),stmt("UPDATE lky_people_offboarding SET status='reactivated' WHERE id=?",plan.operation));
  else changes.push(stmt("UPDATE lky_people_offboarding SET handback='transferred' WHERE id=?",plan.operation));
  changes.push(stmt('UPDATE lky_custody_reviews SET consumed_at=? WHERE id=?',ctx.now,review.id),event(review.action==='handback'?'company_handback_completed':'membership_reactivated',review.id));
  await guarded(ctx,[],changes,guards);
  return {operation:plan.operation,action:review.action,vaults:plan.vaults.map(v=>v.vault),status:review.action==='handback'?'transferred':'reactivated',providerChanges:false,restoredGrants:false};
 }
 need(false,'custody_route_not_found',404);
}
