import { canonicalJson,access,exact,need,ownedVault } from '../reviews/common.mjs';
import { transact } from '../reviews/state.mjs';
import { verify } from '../crypto/envelope.mjs';
import { exportPolicyText,selectionApprovalText,selectionRoutes } from './selection-common.mjs';
export async function selectionPolicyAuthenticated(route,input,ctx){
 if(![selectionRoutes.policy,selectionRoutes.setPolicy,selectionRoutes.authorize].includes(route))return null;
 const setting=route===selectionRoutes.setPolicy,authorizing=route===selectionRoutes.authorize;
 exact(input,setting?['vault','statement','signature','confirmed']:authorizing?['vault','statement','signature','confirmed']:['vault']);
 const vault=await ownedVault(ctx,input.vault),{first,stmt,event,guard}=access(ctx);
 const identity=await first('SELECT authority_key FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant);
 const saved=await first('SELECT * FROM lky_export_policies WHERE vault_id=?',vault.id);
 const current={revision:saved?.revision??0,allowPlaintext:!!saved?.allow_plaintext};
 if(saved){let statement;try{statement=JSON.parse(saved.statement)}catch{need(false,'export_policy_invalid',409)}need(statement.owner===vault.owner&&statement.tenant===ctx.tenant&&statement.vault===vault.id&&statement.revision===saved.revision&&statement.allowPlaintext===!!saved.allow_plaintext&&await verify(identity.authority_key,saved.signature,exportPolicyText(statement)),'export_policy_invalid',409)}
 if(!setting&&!authorizing)return current;
 need(input.confirmed===true,'exact_export_approval_required',403);
 const statement=input.statement;
 if(setting){
  exact(statement,['tenant','vault','owner','revision','allowPlaintext']);
  need(statement.tenant===ctx.tenant&&statement.vault===vault.id&&statement.owner===ctx.actor&&statement.revision===current.revision+1&&typeof statement.allowPlaintext==='boolean'&&await verify(identity.authority_key,input.signature,exportPolicyText(statement)),'export_policy_changed',409);
  await transact(ctx,vault.id,[stmt('INSERT INTO lky_export_policies VALUES(?,?,?,?,?,?) ON CONFLICT(vault_id) DO UPDATE SET owner=excluded.owner,revision=excluded.revision,allow_plaintext=excluded.allow_plaintext,statement=excluded.statement,signature=excluded.signature',vault.id,ctx.actor,statement.revision,Number(statement.allowPlaintext),canonicalJson(statement),input.signature),event('export_policy_changed',vault.id)],[guard('COALESCE((SELECT revision FROM lky_export_policies WHERE vault_id=?),0)=?',[vault.id,current.revision]),guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=?)',[vault.id,ctx.actor])]);
  return {revision:statement.revision,allowPlaintext:statement.allowPlaintext};
 }
 exact(statement,['tenant','vault','owner','vaultRevision','policyRevision','format','planHash','expiresAt']);
 need(statement.tenant===ctx.tenant&&statement.vault===vault.id&&statement.owner===ctx.actor&&statement.vaultRevision===vault.revision&&statement.policyRevision===current.revision&&['encrypted','plaintext'].includes(statement.format)&&typeof statement.planHash==='string'&&/^[A-Za-z0-9_-]{43}$/.test(statement.planHash)&&Number.isSafeInteger(statement.expiresAt)&&statement.expiresAt>ctx.now&&statement.expiresAt<=ctx.now+300000&&await verify(identity.authority_key,input.signature,selectionApprovalText(statement)),'export_approval_changed',409);
 need(statement.format!=='plaintext'||current.allowPlaintext,'plaintext_export_policy_required',403);
 await transact(ctx,vault.id,[event(statement.format==='plaintext'?'plaintext_selection_approved':'encrypted_selection_approved',vault.id)],[guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND revision=?)',[vault.id,ctx.actor,vault.revision]),guard('COALESCE((SELECT revision FROM lky_export_policies WHERE vault_id=?),0)=?',[vault.id,current.revision])]);
 return {approved:true,planHash:statement.planHash,format:statement.format};
}
