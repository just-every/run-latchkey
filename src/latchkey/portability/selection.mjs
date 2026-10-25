import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes,decode,digest,id,json,open,seal,sign,verify } from '../crypto/envelope.mjs';
import { exportPolicyText,selectionApprovalText,selectionRoutes } from './selection-common.mjs';
import { ClientError } from '../client.mjs';
const need=(value,code)=>{if(!value)throw new ClientError(code)};
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value);
const schema='latchkey-selected-export-v1';
const approvalText=plan=>canonicalJson([schema,plan]);
async function collect(client,selection,format='encrypted'){
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
   vaults.push({vault:selected.vault,kind:visible.find(row=>row.id===selected.vault)?.kind,policyRevision:policy.revision,epoch:snapshot.result.epoch,revision:snapshot.result.revision,objects:chosen,omittedObjects:objects.filter(object=>!chosen.includes(object)),lifecycle,counts:{items:chosen.length,versions:versions.length,attachments:attachments.length,attachmentBytes:attachments.reduce((total,row)=>total+row.size,0)},versions});
  }finally{snapshot.key.fill(0)}
 }
 const plan={schema,source:{tenant:client.profile.tenant,account:client.profile.account,authorityKey:client.profile.authorityKey},selection:vaults.map(({versions,...row})=>row),contentHash:await digest(canonicalJson(vaults)),omittedVaults:visible.filter(row=>!vaults.some(vault=>vault.vault===row.id)).map(row=>({vault:row.id,counts:'not inspected'})).sort((a,b)=>a.vault.localeCompare(b.vault)),omissions:['Unselected items and vaults','Installation identities, private account keys and active authority','Non-item domains; use the full encrypted installation archive'],activeAuthority:false,format};
 return {plan,vaults,planHash:await digest(approvalText(plan))};
}
export class SelectionExportClient {
 constructor(client){this.client=client}
 async preview(selection,{format='encrypted'}={}){const {plan,planHash}=await collect(this.client,selection,format);return {plan,planHash}}
 async setPlaintextPolicy(vault,allowPlaintext,{confirmed=false}={}){
  need(confirmed===true,'exact_export_approval_required');const current=await this.client.call(selectionRoutes.policy,{vault});
  const statement={tenant:this.client.profile.tenant,vault,owner:this.client.profile.account,revision:current.revision+1,allowPlaintext};
  return this.client.call(selectionRoutes.setPolicy,{vault,statement,signature:await sign(this.client.bundle.root.authority.privateKey,exportPolicyText(statement)),confirmed:true});
 }
 async export(preview,exportKey,{confirmed=false,approvedPlanHash,format='encrypted'}={}){
  need(format===preview?.plan?.format,'export_format_changed');
  need(confirmed===true&&approvedPlanHash===preview?.planHash,'exact_export_approval_required');
  const fresh=await collect(this.client,preview.plan.selection.map(row=>({vault:row.vault,objects:row.objects})),format);
  need(fresh.planHash===approvedPlanHash&&canonicalJson(fresh.plan)===canonicalJson(preview.plan),'export_plan_changed');
  for(const row of fresh.plan.selection){
   const statement={tenant:this.client.profile.tenant,vault:row.vault,owner:this.client.profile.account,vaultRevision:row.revision,policyRevision:row.policyRevision,format,planHash:approvedPlanHash,expiresAt:Date.now()+240000};
   await this.client.call(selectionRoutes.authorize,{vault:row.vault,statement,signature:await sign(this.client.bundle.root.authority.privateKey,selectionApprovalText(statement)),confirmed:true});
  }
  const key=format==='encrypted'?decode(exportKey,32):null;need(!key||key.length===32,'invalid_key');
  try{
   const value={schema,plan:fresh.plan,planHash:fresh.planHash,vaults:fresh.vaults,signature:await sign(this.client.bundle.root.authority.privateKey,approvalText(fresh.plan))};
   const serialized=bytes(value);need(serialized.length<=1048560,'selected_export_size_limit');
   if(format==='plaintext')return value;
   return await seal(key,serialized,{tenant:'portable',vault:'selection',object:id(),purpose:'selected-export',epoch:1,version:1});
  }finally{key?.fill(0)}
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
  for(const source of value.vaults){
   need(['company','family'].includes(source.kind),'invalid_selected_export');
   need((source.lifecycle??[]).every(row=>row.state==='active'),'nonactive_selection_requires_review');
   const versions=new Map();for(const row of source.versions){need(uuid(row.object)&&row.version===(versions.get(row.object)??0)+1,'export_history_gap');versions.set(row.object,row.version)}
  }
  const restored=[];
  for(const source of value.vaults){
   const destination=(await this.client.createVault({kind:source.kind})).vault;
   for(const row of source.versions)await this.client.put(destination,row.value,row.object,row.version-1);
   const actual=await this.client.readVault(destination);
   need(await digest(canonicalJson(actual.versions))===await digest(canonicalJson(source.versions)),'export_reconciliation_failed');
   restored.push({source:source.vault,destination,counts:source.counts,contentHash:await digest(canonicalJson(actual.versions)),access:'New destination owner only; source grants and active authority were not imported.'});
  }
  return {complete:true,restored,omissions:value.plan.omissions,laterErasure:'An old file without a later erasure journal cannot establish subsequent erasure.'};
 }
}
