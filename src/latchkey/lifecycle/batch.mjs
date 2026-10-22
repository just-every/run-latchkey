import {validateEnvelope} from '../crypto/envelope.mjs';
import {subjectVaultWriteAllowed,subjectItemReplayKnown} from '../erasure/subject.mjs';
import {access,activeItem,exact,guarded,has,id,need,vaultFor,uuid} from './common.mjs';
export async function batchAuthenticated(route,input,ctx){
 if(route!=='item/batch')return null;
 exact(input,['vault','revision','entries']);const vault=await vaultFor(ctx,input.vault);need(vault.revision===input.revision,'version_conflict',409);need(Array.isArray(input.entries)&&input.entries.length>0&&input.entries.length<=64,'invalid_batch');
 await subjectVaultWriteAllowed(ctx,vault.id);
 const {first,stmt,event}=access(ctx),objects=new Set(),statements=[];
 for(const entry of input.entries){
  exact(entry,['object','version','envelope']);uuid(entry.object);need(!objects.has(entry.object),'duplicate_object');objects.add(entry.object);await activeItem(ctx,vault.id,entry.object);
  need(!await first('SELECT 1 FROM lky_erased_items WHERE vault_id=? AND object_id=?',vault.id,entry.object),'item_erased',409);
  if(await first('SELECT 1 FROM lky_subject_fences WHERE tenant=? LIMIT 1',ctx.tenant))need(!await subjectItemReplayKnown(ctx,vault.id,entry.object),'item_erased',409);
  const latest=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,entry.object);need(has(vault,latest.version?'edit':'create'),'permission_denied',403);need(entry.version===(latest.version??0)+1,'version_conflict',409);
  validateEnvelope(entry.envelope,{tenant:ctx.tenant,vault:vault.id,object:entry.object,purpose:'item',epoch:vault.epoch,version:entry.version});
  statements.push(stmt('INSERT INTO lky_versions VALUES(?,?,?,?)',vault.id,entry.object,entry.version,JSON.stringify(entry.envelope)));
 }
 await guarded(ctx,[vault],[...statements,stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?',id(),vault.id),event('item_batch_written',vault.id)]);
 return{vault:vault.id,revision:vault.revision+1,objects:[...objects]};
}
