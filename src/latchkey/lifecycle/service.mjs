import { validDeletionConsent } from '../crypto/lifecycle.mjs';
import { access,canonicalJson,exact,guarded,has,id,invalidateObject,need,vaultFor,verifyCapability,verifyPolicy,uuid } from './common.mjs';
export { LifecycleError } from './common.mjs';
const descriptor=v=>({id:v.id,kind:v.kind,owner:v.owner,epoch:v.epoch,revision:v.revision,rights:JSON.parse(v.rights),policy:v.trash_policy?JSON.parse(v.trash_policy):null});
const item=row=>({object:row.object_id,state:row.state,stateVersion:row.state_version,trashedAt:row.trashed_at,expiresAt:row.expires_at,retentionActive:!!row.retention_active});
export async function lifecycleAuthenticated(route,input,ctx){
 if(!route.startsWith('lifecycle/'))return null;
 const {all,first,stmt,event}=access(ctx),vault=await vaultFor(ctx,input.vault);
 need(['read','restore','delete','edit'].some(right=>has(vault,right)),'permission_denied',403);
 if(route==='lifecycle/list'){exact(input,['vault']);return{vault:descriptor(vault),items:(await all('SELECT * FROM lky_lifecycle WHERE vault_id=? ORDER BY object_id',vault.id)).map(item)}}
 if(route==='lifecycle/policy/set'){
  exact(input,['vault','policy']);need(vault.owner===ctx.actor,'owner_required',403);need(await verifyPolicy(input.policy,vault),'invalid_retention_policy',403);
  await guarded(ctx,[vault],[stmt('UPDATE lky_vaults SET trash_policy=?,revision=revision+1,mutation=? WHERE id=?',canonicalJson(input.policy),id(),vault.id),event('trash_policy_confirmed',vault.id)]);return{policy:input.policy};
 }
 if(route==='lifecycle/context'){
  exact(input,['vault','object']);const object=uuid(input.object),version=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,object);need(version?.version,'not_found',404);
  const state=await first('SELECT * FROM lky_lifecycle WHERE vault_id=? AND object_id=?',vault.id,object),capability=await first('SELECT capability FROM lky_vault_capabilities WHERE vault_id=? AND account_id=?',vault.id,ctx.actor);
  return{vault:descriptor(vault),item:{object,version:version.version,state:state?.state??'active',stateVersion:state?.state_version??0,nonce:state?.nonce??null},authorization:capability?JSON.parse(capability.capability):null};
 }
 if(route==='lifecycle/change'){
  exact(input,['vault','object','state','revision','stateVersion','proof','confirmed']);need(input.confirmed===true,'lifecycle_confirmation_required',403);const object=uuid(input.object);need(['active','archived','trash'].includes(input.state));need(vault.revision===input.revision,'version_conflict',409);
  const latest=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,object);need(latest?.version,'not_found',404);
  const current=await first('SELECT * FROM lky_lifecycle WHERE vault_id=? AND object_id=?',vault.id,object),state=current?.state??'active';need((current?.state_version??0)===input.stateVersion,'lifecycle_changed',409);need(state!==input.state,'lifecycle_unchanged',409);
  if(state==='trash'&&current.expires_at<=ctx.now)need(false,'trash_expired',410);
  if(input.state==='active'){need(has(vault,'restore')&&has(vault,'create'),'restore_and_create_required',403);need(vault.kind!=='family'||vault.owner===ctx.actor,'family_restore_forbidden',403)}
  else if(input.state==='archived'){need(has(vault,'edit')&&state==='active','permission_denied',403)}
  else{
   need(has(vault,'delete')&&state==='active','permission_denied',403);need(vault.kind!=='family'||vault.owner===ctx.actor,'family_trash_forbidden',403);need(vault.trash_policy&&canonicalJson(input.proof?.policy)===canonicalJson(JSON.parse(vault.trash_policy)),'owner_retention_consent_required',403);
   need(await validDeletionConsent(input.proof,{tenant:ctx.tenant,vault:vault.id,object,owner:vault.owner,actor:ctx.actor,epoch:vault.epoch,version:latest.version,revision:vault.revision},vault.authority_key),'invalid_deletion_consent',403);
   need(Math.abs(input.proof.statement.trashedAt-ctx.now)<60000,'deletion_consent_expired',403);
   if(ctx.actor!==vault.owner){const account=await first('SELECT id,authority_key,generation FROM lky_accounts WHERE id=?',ctx.actor);need(await verifyCapability(input.proof.authorization,vault,{...account,rights:JSON.parse(vault.rights)}),'delete_authority_changed',403);const stored=await first('SELECT capability FROM lky_vault_capabilities WHERE vault_id=? AND account_id=?',vault.id,ctx.actor);need(stored&&canonicalJson(JSON.parse(stored.capability))===canonicalJson(input.proof.authorization),'delete_authority_changed',403)}
  }
  const proof=input.state==='trash'?input.proof:null,nonce=proof?.statement.nonce??id();
  await guarded(ctx,[vault],[stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?',nonce,vault.id),stmt('INSERT INTO lky_lifecycle VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(vault_id,object_id) DO UPDATE SET state=excluded.state,state_version=excluded.state_version,nonce=excluded.nonce,trashed_at=excluded.trashed_at,expires_at=excluded.expires_at,proof=excluded.proof,retention_active=excluded.retention_active',vault.id,object,input.state,input.stateVersion+1,nonce,proof?.statement.trashedAt??null,proof?.statement.expiresAt??null,proof?canonicalJson(proof):null,Number(!!proof)),...(input.state!=='active'?invalidateObject(ctx,vault.id,object):[]),event('item_'+input.state,object)]);
  return{vault:vault.id,object,state:input.state,stateVersion:input.stateVersion+1,expiresAt:proof?.statement.expiresAt??null};
 }
 need(false,'lifecycle_route_not_found',404);
}
