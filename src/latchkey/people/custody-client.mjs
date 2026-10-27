import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes, digest, itemKey, json, open, random, seal, sign, unwrapSigned } from '../crypto/envelope.mjs';
import { policyText } from '../crypto/lifecycle.mjs';
import { ClientError } from '../client.mjs';
const need=(condition,code)=>{if(!condition)throw new ClientError(code)};
const binding=(tenant,vault,object,purpose,epoch,version=1)=>({tenant,vault,object,purpose,epoch,version});
export class CustodyClient {
 constructor(client){this.client=client}
 async enroll(vault,custodian,fingerprint,{confirmed=false}={}){
  need(confirmed===true,'custody_confirmation_required');
  const c=this.client,descriptor=(await c.call('vaults',{})).find(v=>v.id===vault);
  need(descriptor&&descriptor.owner===c.profile.account&&descriptor.kind!=='family','company_vault_owner_required');
  const recipient=await c.pinAccount(custodian,fingerprint),snapshot=await c.snapshot(vault);
  try{
   need(snapshot.result.owner===c.profile.account,'company_vault_owner_required');
   return await c.call(['people','custody','enroll'].join('/'),{vault,custodian,fingerprint,revision:snapshot.result.revision,confirmed:true,wrapped:await c.wrap(snapshot.key,recipient.publicKey,binding(c.profile.tenant,vault,custodian,'company-custody',snapshot.result.epoch))});
  }finally{snapshot.key.fill(0)}
 }
 preview(operation,action='handback'){return this.client.call(['people','custody','preview'].join('/'),{operation,action})}
 async trustSource(review,fingerprint){
  need(review.plan.action==='handback'&&review.plan.vaults.length>0,'no_company_vaults');
  const source=await this.client.call(['people','custody','source'].join('/'),{review:review.review,vault:review.plan.vaults[0].vault});
  need(source.owner===review.plan.account&&source.tenant===this.client.profile.tenant&&await digest(JSON.stringify([source.recipientKey,source.authorityKey]))===fingerprint,'recipient_mismatch');
  this.client.profile.trusted[source.owner]={recipientKey:source.recipientKey,authorityKey:source.authorityKey};
 }
 async commit(review,{confirmed=false,approvedPlanHash}={}){
  need(confirmed===true,'custody_confirmation_required');
  need(review.planHash===approvedPlanHash&&await digest(canonicalJson(review.plan))===approvedPlanHash,'custody_review_changed');
  const c=this.client,outputs=[];
  for(const expected of review.plan.vaults){
   const source=await c.call(['people','custody','source'].join('/'),{review:review.review,vault:expected.vault});
   const trusted=c.profile.trusted[source.owner];need(trusted?.authorityKey===source.authorityKey,'recipient_confirmation_required');
   need(source.tenant===c.profile.tenant&&source.vault===expected.vault&&source.epoch===expected.epoch&&source.revision===expected.revision&&source.versions.length===expected.versions&&await digest(canonicalJson(source.versions))===expected.contentHash&&await digest(canonicalJson(source.wrapped))===expected.custodyHash,'custody_review_changed');
   const oldKey=await unwrapSigned(source.wrapped,c.bundle.root.recipient.privateKey,trusted.authorityKey,source.owner,binding(source.tenant,source.vault,c.profile.account,'company-custody',source.epoch)),nextKey=random();
   try{
    const versions=[];
    for(const row of source.versions){
     const before=await itemKey(oldKey,source.tenant,source.vault,row.object_id),after=await itemKey(nextKey,source.tenant,source.vault,row.object_id);
     let plain;
     try{plain=await open(before,JSON.parse(row.envelope),binding(source.tenant,source.vault,row.object_id,'item',source.epoch,row.version));json(plain);versions.push({object:row.object_id,version:row.version,envelope:await seal(after,plain,binding(source.tenant,source.vault,row.object_id,'item',source.epoch+1,row.version))})}finally{before.fill(0);after.fill(0);plain?.fill(0)}
    }
    const statement={schema:1,purpose:'trash-retention',tenant:source.tenant,vault:source.vault,owner:c.profile.account,days:30};
    outputs.push({vault:source.vault,versions,wrapped:await c.wrap(nextKey,c.profile.recipientKey,binding(source.tenant,source.vault,c.profile.account,'vault-key',source.epoch+1)),policy:{statement,signature:await sign(c.bundle.root.authority.privateKey,policyText(statement))}});
   }finally{oldKey.fill(0);nextKey.fill(0)}
  }
  const result=await c.call(['people','custody','commit'].join('/'),{review:review.review,planHash:review.planHash,confirmed:true,vaults:outputs});
  for(const vault of result.vaults)delete c.profile.seen[vault];
  return result;
 }
}
