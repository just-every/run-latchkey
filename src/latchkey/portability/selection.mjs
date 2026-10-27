import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes,decode,digest,id,itemKey,json,open,random,seal,sign,verify } from '../crypto/envelope.mjs';
import { exportPolicyText,selectionApprovalText,selectionRoutes } from './selection-common.mjs';
import { attachmentBytes } from '../items/attachments.mjs';
import { ClientError } from '../client.mjs';
const need=(value,code)=>{if(!value)throw new ClientError(code)};
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
const schema='latchkey-selected-export-v1';
const approvalText=plan=>canonicalJson([schema,plan]);
function historyGaps(versions){
 const seen=new Map(),gaps=[];let previousObject='';
 for(const row of versions){
  need(typeof row.object==='string'&&previousObject.localeCompare(row.object)<=0,'invalid_export_history');previousObject=row.object;
  const previous=seen.get(row.object)??0;
  need(uuid(row.object)&&Number.isSafeInteger(row.version)&&row.version>previous,'invalid_export_history');
  if(row.version>previous+1)gaps.push({object:row.object,from:previous+1,to:row.version-1});
  seen.set(row.object,row.version);
 }
 return gaps;
}
async function collect(client,selection,format='encrypted',review={purpose:'Migration',target:'Buyer-held private file'}){
 need(review&&Object.keys(review).sort().join()==='purpose,target'&&[review.purpose,review.target].every(value=>typeof value==='string'&&value.trim().length>0&&value.length<=500),'export_review_required');
 need(['encrypted','plaintext'].includes(format),'invalid_export_format');
 const visible=await client.call('vaults',{});
 if(selection==='company')selection=visible.filter(row=>row.kind==='company'&&row.owner===client.profile.account).map(row=>({vault:row.id,objects:null}));
 need(Array.isArray(selection)&&selection.length>0&&selection.length<=100,'invalid_export_selection');
 need(new Set(selection.map(row=>row.vault)).size===selection.length,'invalid_export_selection');
 const vaults=[];
 for(const selected of [...selection].sort((a,b)=>a.vault.localeCompare(b.vault))){
  need(uuid(selected.vault)&&Object.keys(selected).sort().join()==='objects,vault'&&(selected.objects===null||Array.isArray(selected.objects)&&selected.objects.length>0&&selected.objects.every(uuid)&&new Set(selected.objects).size===selected.objects.length),'invalid_export_selection');
  const snapshot=await client.snapshot(selected.vault,'export');
  try{
   const policy=await client.call(selectionRoutes.policy,{vault:selected.vault});
   need(format!=='plaintext'||policy.allowPlaintext,'plaintext_export_policy_required');
   const all=await client.decodeVersions(snapshot),objects=[...new Set(all.map(row=>row.object))].sort();
   need(selected.objects===null||selected.objects.every(object=>objects.includes(object)),'export_item_missing');
   const chosen=selected.objects===null?objects:[...selected.objects].sort(),versions=all.filter(row=>chosen.includes(row.object));
   const lifecycle=(await client.call(['lifecycle','list'].join('/'),{vault:selected.vault})).items.filter(row=>chosen.includes(row.object));
   const attachments=versions.flatMap(row=>row.value.attachments??[]);
   vaults.push({vault:selected.vault,kind:visible.find(row=>row.id===selected.vault)?.kind,policyRevision:policy.revision,epoch:snapshot.result.epoch,revision:snapshot.result.revision,objects:chosen,omittedObjects:objects.filter(object=>!chosen.includes(object)),lifecycle,historyGaps:historyGaps(versions),counts:{items:chosen.length,versions:versions.length,attachments:attachments.length,attachmentBytes:attachments.reduce((total,row)=>total+row.size,0)},versions});
  }finally{snapshot.key.fill(0)}
 }
 const plan={schema,review:{...review,consequences:'The buyer controls downloaded copies. Plaintext has no encryption and cannot be remotely recalled or expired.'},coverage:{basis:'Vaults visible to the current account only',completeCompany:false,selectedCompanyVaults:vaults.filter(row=>row.kind==='company').length,visibleCompanyVaults:visible.filter(row=>row.kind==='company').length,otherCompanyVaults:'unknown; not inspected'},source:{tenant:client.profile.tenant,account:client.profile.account,authorityKey:client.profile.authorityKey},selection:vaults.map(({versions,...row})=>row),contentHash:await digest(canonicalJson(vaults)),omittedVaults:visible.filter(row=>!vaults.some(vault=>vault.vault===row.id)).map(row=>({vault:row.id,counts:'not inspected'})).sort((a,b)=>a.vault.localeCompare(b.vault)),omissions:['Unselected items and vaults','Installation identities, private account keys and active authority','Non-item domains; use the full encrypted installation archive'],activeAuthority:false,format};
 return {plan,vaults,planHash:await digest(approvalText(plan))};
}
export class SelectionExportClient {
 constructor(client){this.client=client}
 async preview(selection,{format='encrypted',review}={}){const {plan,planHash}=await collect(this.client,selection,format,review);return {plan,planHash}}
 async setPlaintextPolicy(vault,allowPlaintext,{confirmed=false}={}){
  need(confirmed===true,'exact_export_approval_required');const current=await this.client.call(selectionRoutes.policy,{vault});
  const statement={tenant:this.client.profile.tenant,vault,owner:this.client.profile.account,revision:current.revision+1,allowPlaintext};
  return this.client.call(selectionRoutes.setPolicy,{vault,statement,signature:await sign(this.client.bundle.root.authority.privateKey,exportPolicyText(statement)),confirmed:true});
 }
 async export(preview,exportKey,{confirmed=false,approvedPlanHash,format='encrypted'}={}){
  this.pendingRelease=null;
  need(format===preview?.plan?.format,'export_format_changed');
  need(confirmed===true&&approvedPlanHash===preview?.planHash,'exact_export_approval_required');
  need(preview.plan.review,'export_plan_changed');
  const fresh=await collect(this.client,preview.plan.selection.map(row=>({vault:row.vault,objects:row.objects})),format,{purpose:preview.plan.review.purpose,target:preview.plan.review.target});
  need(fresh.planHash===approvedPlanHash&&canonicalJson(fresh.plan)===canonicalJson(preview.plan),'export_plan_changed');
  const approvals=[],expiresAt=Date.now()+240000;
  for(const row of fresh.plan.selection){
   const statement={tenant:this.client.profile.tenant,vault:row.vault,owner:this.client.profile.account,vaultRevision:row.revision,policyRevision:row.policyRevision,format,planHash:approvedPlanHash,counts:row.counts,expiresAt};
   const approval={vault:row.vault,statement,signature:await sign(this.client.bundle.root.authority.privateKey,selectionApprovalText(statement)),confirmed:true};
   await this.client.call(selectionRoutes.authorize,approval);approvals.push(approval);
  }
  const key=format==='encrypted'?decode(exportKey,32):null;need(!key||key.length===32,'invalid_key');
  try{
   const value={schema,plan:fresh.plan,planHash:fresh.planHash,vaults:fresh.vaults,signature:await sign(this.client.bundle.root.authority.privateKey,approvalText(fresh.plan))};
   const serialized=bytes(value);need(serialized.length<=1048560,'selected_export_size_limit');
   const archive=format==='plaintext'?value:await seal(key,serialized,{tenant:'portable',vault:'selection',object:id(),purpose:'selected-export',epoch:1,version:1});
   // Recheck every selected vault together after encryption, at the release boundary.
   await this.client.call(selectionRoutes.release,{approvals});
   this.pendingRelease={approvals};
   return archive;
  }finally{key?.fill(0)}
 }
 async reportOutcome(outcome){
  need(this.pendingRelease,'export_release_receipt_required');
  return this.client.call(selectionRoutes.outcome,{...this.pendingRelease,outcome});
 }
 static async open(archive,exportKey){
  const plaintext=archive?.schema===schema&&archive.plan?.format==='plaintext';
  need(plaintext||archive?.context?.tenant==='portable'&&archive.context.vault==='selection'&&archive.context.purpose==='selected-export','invalid_selected_export');
  const key=plaintext?null:decode(exportKey,32);need(!key||key.length===32,'invalid_key');
  try{
   const value=plaintext?archive:json(await open(key,archive,archive.context));
   need(value.schema===schema&&value.plan?.schema===schema&&value.plan.activeAuthority===false&&value.planHash===await digest(approvalText(value.plan))&&value.plan.contentHash===await digest(canonicalJson(value.vaults))&&await verify(value.plan.source.authorityKey,value.signature,approvalText(value.plan)),'invalid_selected_export');
   need(canonicalJson(value.vaults.map(({versions,...row})=>row))===canonicalJson(value.plan.selection),'invalid_selected_export');return value;
  }finally{key?.fill(0)}
 }
 async reimport(archive,exportKey,{confirmed=false,approvedPlanHash}={}){
  const value=await SelectionExportClient.open(archive,exportKey);
  need(confirmed===true&&approvedPlanHash===value.planHash,'exact_export_approval_required');
  need(this.client.profile.tenant!==value.plan.source.tenant,'fresh_installation_required');
  need((await this.client.call('vaults',{})).length===0,'empty_export_destination_required');
  // Validate every source before creating destination ciphertext or writing anything.
  for(const source of value.vaults){
   need(['company','family','private-work'].includes(source.kind),'invalid_selected_export');
   need(canonicalJson(source.historyGaps??[])===canonicalJson(historyGaps(source.versions)),'export_history_gap');
   for(const row of source.versions)for(const attachment of row.value.attachments??[])await attachmentBytes(attachment);
   const attachments=source.versions.flatMap(row=>row.value.attachments??[]);
   need(canonicalJson(source.counts)===canonicalJson({items:new Set(source.versions.map(row=>row.object)).size,versions:source.versions.length,attachments:attachments.length,attachmentBytes:attachments.reduce((total,row)=>total+row.size,0)}),'export_counts_mismatch');
  }
  const prepared=[];
  for(const source of value.vaults){
   const vault=id(),key=random(),versions=[];
   try{
    for(const row of source.versions){
     const derived=await itemKey(key,this.client.profile.tenant,vault,row.object);
     try{versions.push({object:row.object,version:row.version,envelope:await seal(derived,bytes(row.value),{tenant:this.client.profile.tenant,vault,object:row.object,purpose:'item',epoch:1,version:row.version})})}finally{derived.fill(0)}
    }
    prepared.push({source:source.vault,vault,kind:source.kind,wrapped:await this.client.wrap(key,this.client.profile.recipientKey,{tenant:this.client.profile.tenant,vault,object:this.client.profile.account,purpose:'vault-key',epoch:1,version:1}),versions,lifecycle:(source.lifecycle??[]).map(row=>({...row,retentionActive:false})).sort((a,b)=>a.object.localeCompare(b.object))});
   }finally{key.fill(0)}
  }
  await this.client.call(selectionRoutes.import,{sourceTenant:value.plan.source.tenant,planHash:value.planHash,vaults:prepared,confirmed:true});
  const restored=[];
  for(const [index,source] of value.vaults.entries()){
   const destination=prepared[index].vault,actual=await this.client.readVault(destination),lifecycle=(await this.client.call(['lifecycle','list'].join('/'),{vault:destination})).items;
   need(await digest(canonicalJson(actual.versions))===await digest(canonicalJson(source.versions))&&canonicalJson(lifecycle)===canonicalJson(prepared[index].lifecycle),'export_reconciliation_failed');
   restored.push({source:source.vault,destination,counts:source.counts,historyGaps:source.historyGaps??[],lifecycle,contentHash:await digest(canonicalJson(actual.versions)),access:'New destination owner only; source grants and active authority were not imported.'});
  }
  return {complete:true,restored,omissions:value.plan.omissions,laterErasure:'An old file without a later erasure journal cannot establish subsequent erasure.'};
 }
}
