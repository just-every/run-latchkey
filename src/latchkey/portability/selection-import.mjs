import { canonicalJson,access,exact,need } from '../reviews/common.mjs';
import { id,validateEnvelope,verifyWrapped } from '../crypto/envelope.mjs';
import { erasureKnown } from '../erasure/index.mjs';
import { subjectAdmission } from '../erasure/admission.mjs';
import { subjectItemReplayKnown } from '../erasure/subject.mjs';
import { restoreOwnerRights } from './service.mjs';
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
const binding=(ctx,vault,object,purpose,version=1)=>({tenant:ctx.tenant,vault,object,purpose,epoch:1,version});
export async function importSelection(input,ctx){
 exact(input,['sourceTenant','planHash','vaults','confirmed']);
 need(input.confirmed===true,'exact_export_approval_required',403);
 need(ctx.session.operator.role==='owner','destination_owner_required',403);
 need(uuid(input.sourceTenant)&&input.sourceTenant!==ctx.tenant,'fresh_installation_required');
 need(typeof input.planHash==='string'&&/^[A-Za-z0-9_-]{43}$/.test(input.planHash),'invalid_selected_export');
 need(Array.isArray(input.vaults)&&input.vaults.length>0&&input.vaults.length<=100&&new Set(input.vaults.map(row=>row.vault)).size===input.vaults.length,'invalid_selected_export');
 const {first,stmt,guard,event}=access(ctx),statements=[];
 const journal=await first('SELECT (SELECT COUNT(*) FROM lky_subject_fences WHERE tenant=?) AS subjects,(SELECT COUNT(*) FROM lky_erased_items) AS items',ctx.tenant);
 need(!await first('SELECT 1 FROM lky_vaults WHERE tenant=?',ctx.tenant),'empty_export_destination_required',409);
 const account=await first('SELECT authority_key FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant);
 for(const row of input.vaults){
  exact(row,['source','vault','kind','wrapped','versions','lifecycle']);
  need(uuid(row.source)&&uuid(row.vault)&&['company','family','private-work'].includes(row.kind),'invalid_selected_export');
  await subjectAdmission(ctx,[['vault',row.source],['vault',row.vault]]);
  need(await verifyWrapped(row.wrapped,account.authority_key,ctx.actor,binding(ctx,row.vault,ctx.actor,'vault-key')),'invalid_key_signature',403);
  need(Array.isArray(row.versions)&&Array.isArray(row.lifecycle),'invalid_selected_export');
  const seen=new Map();
  for(const version of row.versions){
   exact(version,['object','version','envelope']);
   need(uuid(version.object)&&Number.isSafeInteger(version.version)&&version.version>0&&version.version>(seen.get(version.object)??0),'invalid_export_history');
   seen.set(version.object,version.version);
   need(!await erasureKnown(ctx,row.source,version.object)&&!await subjectItemReplayKnown(ctx,row.source,version.object),'item_erased',409);
   validateEnvelope(version.envelope,binding(ctx,row.vault,version.object,'item',version.version));
  }
  need(new Set(row.lifecycle.map(item=>item.object)).size===row.lifecycle.length,'invalid_export_lifecycle');
  statements.push(stmt('INSERT INTO lky_vaults(id,tenant,owner,epoch,revision,mutation,kind,trash_policy) VALUES(?,?,?,1,1,?,?,NULL)',row.vault,ctx.tenant,ctx.actor,id(),row.kind),stmt('INSERT INTO lky_recipients VALUES(?,?,?,?)',row.vault,ctx.actor,canonicalJson(restoreOwnerRights),canonicalJson(row.wrapped)));
  for(const version of row.versions)statements.push(stmt('INSERT INTO lky_versions VALUES(?,?,?,?)',row.vault,version.object,version.version,canonicalJson(version.envelope)));
  for(const state of row.lifecycle){
   exact(state,['object','state','stateVersion','trashedAt','expiresAt','retentionActive']);
   need(seen.has(state.object)&&['active','archived','trash'].includes(state.state)&&Number.isSafeInteger(state.stateVersion)&&state.stateVersion>=0&&state.retentionActive===false&&[state.trashedAt,state.expiresAt].every(value=>value===null||Number.isSafeInteger(value)&&value>=0),'invalid_export_lifecycle');
   statements.push(stmt('INSERT INTO lky_lifecycle VALUES(?,?,?,?,?,?,?,NULL,0)',row.vault,state.object,state.state,state.stateVersion,id(),state.trashedAt,state.expiresAt));
  }
  statements.push(event('selected_vault_imported',row.vault));
 }
 const commitNow=Math.max(ctx.now,Date.now()),fenceArgs=ctx.fenceArgs.map(value=>value===ctx.now?commitNow:value);
 try{await ctx.db.batch([stmt('DELETE FROM lky_review_guard'),guard(ctx.fence,fenceArgs),guard("EXISTS(SELECT 1 FROM oa_operators WHERE id=? AND role='owner' AND status='active')",[ctx.session.operator.id]),guard('NOT EXISTS(SELECT 1 FROM lky_vaults WHERE tenant=?)',[ctx.tenant]),guard('(SELECT COUNT(*) FROM lky_subject_fences WHERE tenant=?)=? AND (SELECT COUNT(*) FROM lky_erased_items)=?',[ctx.tenant,journal.subjects,journal.items]),...statements,stmt('DELETE FROM lky_review_guard')])}catch{need(false,'selected_import_changed',409)}
 return {complete:true,planHash:input.planHash,vaults:input.vaults.map(row=>row.vault),sourceAuthorityImported:false};
}
