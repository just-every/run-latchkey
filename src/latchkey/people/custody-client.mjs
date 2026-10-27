import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes,digest,itemKey,json,open,random,seal,sign,unwrapSigned,verify } from '../crypto/envelope.mjs';
import { policyText } from '../crypto/lifecycle.mjs';
const route=action=>['people','custody',action].join('/');
const text=value=>canonicalJson(['latchkey-company-custody-v1',value]);
const need=(value,code)=>{if(!value)throw Object.assign(Error(code),{code})};
const binding=(tenant,vault,object,purpose,epoch,version=1)=>({tenant,vault,object,purpose,epoch,version});
export class CompanyCustodyClient {
 constructor(client){this.client=client}
 async enroll(vault,custodian,fingerprint,{confirmed=false}={}){
  need(confirmed===true,'custody_confirmation_required');const c=this.client;
  const descriptor=(await c.call('vaults',{})).find(row=>row.id===vault);need(descriptor?.owner===c.profile.account&&descriptor.kind!=='family','company_vault_owner_required');
  const recipient=await c.pinAccount(custodian,fingerprint),snapshot=await c.snapshot(vault);
  try{
   need(snapshot.result.owner===c.profile.account,'company_vault_owner_required');
   const statement={tenant:c.profile.tenant,vault,owner:c.profile.account,custodian,epoch:snapshot.result.epoch,generation:recipient.generation,recipientKey:recipient.publicKey,keyHash:await digest(snapshot.key),wrapped:await c.wrap(snapshot.key,recipient.publicKey,binding(c.profile.tenant,vault,custodian,'company-custody',snapshot.result.epoch))};
   return c.call(route('enroll'),{vault,enrollment:{statement,signature:await sign(c.bundle.root.authority.privateKey,text(statement))},confirmed:true});
  }finally{snapshot.key.fill(0)}
 }
 async key(enrollment,sourceKey){
  const c=this.client,s=enrollment.statement;
  need(s.tenant===c.profile.tenant&&s.custodian===c.profile.account&&s.generation===c.profile.generation&&s.recipientKey===c.profile.recipientKey,'custody_context_changed');
  need(c.profile.trusted[s.owner]?.authorityKey===sourceKey&&await verify(sourceKey,enrollment.signature,text(s)),'recipient_confirmation_required');
  const key=await unwrapSigned(s.wrapped,c.bundle.root.recipient.privateKey,sourceKey,s.owner,binding(s.tenant,s.vault,s.custodian,'company-custody',s.epoch));
  if(key.length!==32||await digest(key)!==s.keyHash){key.fill(0);need(false,'custody_key_mismatch')}return key;
 }
 async accept(vault,sourceFingerprint,{confirmed=false}={}){
  need(confirmed===true,'custody_confirmation_required');const c=this.client,pending=await c.call(route('pending'),{vault});
  await c.pinAccount(pending.enrollment.statement.owner,sourceFingerprint);
  const key=await this.key(pending.enrollment,pending.sourceKey);
  try{return c.call(route('accept'),{vault,enrollmentHash:pending.enrollmentHash,signature:await sign(c.bundle.root.authority.privateKey,canonicalJson(['latchkey-company-custody-receipt-v1',{enrollmentHash:pending.enrollmentHash,keyHash:await digest(key)}]))})}finally{key.fill(0)}
 }
 async revoke(vault,{confirmed=false}={}){need(confirmed===true,'custody_confirmation_required');return this.client.call(route('revoke'),{vault,confirmed:true})}
 async preview(vault){return this.client.call(route('preview'),{vault})}
 async handback(review,{confirmed=false,approvedPlanHash}={}){
  const c=this.client,{plan,planHash,enrollment}=review;
  need(confirmed===true&&approvedPlanHash===planHash,'custody_confirmation_required');
  need(await digest(canonicalJson(plan))===planHash&&await digest(canonicalJson(enrollment))===plan.enrollmentHash,'custody_plan_changed');
  need(plan.tenant===c.profile.tenant&&plan.custodian===c.profile.account&&plan.owner===enrollment.statement.owner&&plan.vault===enrollment.statement.vault&&plan.epoch===enrollment.statement.epoch&&plan.expiresAt>Date.now(),'custody_context_changed');
  const key=await this.key(enrollment,plan.sourceKey),next=random(),versions=[];
  try{
   for(const row of plan.versions){
    const oldKey=await itemKey(key,plan.tenant,plan.vault,row.object_id),newKey=await itemKey(next,plan.tenant,plan.vault,row.object_id);
    let plaintext;
    try{plaintext=await open(oldKey,JSON.parse(row.envelope),binding(plan.tenant,plan.vault,row.object_id,'item',plan.epoch,row.version));json(plaintext);versions.push({object:row.object_id,version:row.version,envelope:await seal(newKey,plaintext,binding(plan.tenant,plan.vault,row.object_id,'item',plan.epoch+1,row.version))})}finally{oldKey.fill(0);newKey.fill(0);plaintext?.fill(0)}
   }
   const statement={schema:1,purpose:'trash-retention',tenant:plan.tenant,vault:plan.vault,owner:c.profile.account,days:30};
   const result=await c.call(route('commit'),{plan,planHash,confirmed:true,versions,wrapped:await c.wrap(next,c.profile.recipientKey,binding(plan.tenant,plan.vault,c.profile.account,'vault-key',plan.epoch+1)),policy:{statement,signature:await sign(c.bundle.root.authority.privateKey,policyText(statement))}});
   c.profile.seen[plan.vault]={owner:c.profile.account,epoch:result.epoch,revision:result.revision,keyFingerprint:await digest(next),versions:{}};return result;
  }finally{key.fill(0);next.fill(0)}
 }
}
