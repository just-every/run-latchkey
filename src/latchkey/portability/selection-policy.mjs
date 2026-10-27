import { canonicalJson,access,exact,need,ownedVault } from '../reviews/common.mjs';
import { transact } from '../reviews/state.mjs';
import { verify } from '../crypto/envelope.mjs';
import { exportPolicyText,selectionApprovalText,selectionRoutes } from './selection-common.mjs';
export async function selectionPolicyAuthenticated(route,input,ctx){
 if(route===selectionRoutes.release){
  exact(input,['approvals']);need(Array.isArray(input.approvals)&&input.approvals.length>0&&input.approvals.length<=100,'invalid_export_selection');
  need(new Set(input.approvals.map(row=>row.vault)).size===input.approvals.length,'invalid_export_selection');
  const guards=[],{event}=access(ctx);let planHash,format;
  for(const approval of input.approvals){
   const checked=await checkApproval(approval,ctx);
   planHash??=checked.statement.planHash;format??=checked.statement.format;
   need(checked.statement.planHash===planHash&&checked.statement.format===format,'export_approval_changed',409);
   guards.push(...checked.guards);
  }
  const commitNow=Math.max(ctx.now,Date.now());
  need(input.approvals.every(row=>row.statement.expiresAt>commitNow),'export_approval_changed',409);
  const freshContext={...ctx,fenceArgs:ctx.fenceArgs.map(value=>value===ctx.now?commitNow:value)};
  await transact(freshContext,input.approvals[0].vault,[event('selection_release_authorized',planHash)],guards);
  return {released:true,planHash,format,coverage:'Client-prepared file released; delivery is not verified.'};
 }
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
 const checked=await checkApproval(input,ctx);
 await transact(ctx,vault.id,[event(statement.format==='plaintext'?'plaintext_selection_approved':'encrypted_selection_approved',vault.id)],checked.guards);
 return {approved:true,planHash:statement.planHash,format:statement.format};
}
async function checkApproval(input,ctx){
 exact(input,['vault','statement','signature','confirmed']);
 need(input.confirmed===true,'exact_export_approval_required',403);
 const vault=await ownedVault(ctx,input.vault),{first,guard}=access(ctx),statement=input.statement;
 const identity=await first('SELECT authority_key FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant);
 const saved=await first('SELECT * FROM lky_export_policies WHERE vault_id=?',vault.id);
 const current={revision:saved?.revision??0,allowPlaintext:!!saved?.allow_plaintext};
 if(saved){let policy;try{policy=JSON.parse(saved.statement)}catch{need(false,'export_policy_invalid',409)}need(policy.owner===vault.owner&&policy.tenant===ctx.tenant&&policy.vault===vault.id&&policy.revision===saved.revision&&policy.allowPlaintext===!!saved.allow_plaintext&&await verify(identity.authority_key,saved.signature,exportPolicyText(policy)),'export_policy_invalid',409)}
 exact(statement,['tenant','vault','owner','vaultRevision','policyRevision','format','planHash','counts','expiresAt']);
 need(statement.tenant===ctx.tenant&&statement.vault===vault.id&&statement.owner===ctx.actor&&statement.vaultRevision===vault.revision&&statement.policyRevision===current.revision&&['encrypted','plaintext'].includes(statement.format)&&typeof statement.planHash==='string'&&/^[A-Za-z0-9_-]{43}$/.test(statement.planHash)&&Number.isSafeInteger(statement.expiresAt)&&statement.expiresAt>ctx.now&&statement.expiresAt<=ctx.now+300000&&await verify(identity.authority_key,input.signature,selectionApprovalText(statement)),'export_approval_changed',409);
 exact(statement.counts,['items','versions','attachments','attachmentBytes']);
 need(Object.values(statement.counts).every(value=>Number.isSafeInteger(value)&&value>=0),'invalid_export_counts');
 need(statement.format!=='plaintext'||current.allowPlaintext,'plaintext_export_policy_required',403);
 return {statement,guards:[guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND tenant=? AND owner=? AND revision=?)',[vault.id,ctx.tenant,ctx.actor,vault.revision]),guard('COALESCE((SELECT revision FROM lky_export_policies WHERE vault_id=?),0)=?',[vault.id,current.revision])]};
}
