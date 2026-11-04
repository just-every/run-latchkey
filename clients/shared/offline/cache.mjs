import { bytes, decode, json, open, seal } from '../../../src/latchkey/crypto/envelope.mjs';
import { ClientError } from '../../../src/latchkey/client.mjs';
import { validateItem } from '../../../src/latchkey/items/types.mjs';
const schema='latchkey-offline-cache-v1';
const eligibilitySchema='latchkey-offline-eligibility-v1';
const binding=identity=>({tenant:identity.tenant,vault:identity.vault,object:identity.account,purpose:'offline-cache',epoch:1,version:1});
const need=(value,code)=>{if(!value)throw new ClientError(code)};
export function cacheIdentity(value){
 need(value?.schema===schema&&typeof value.origin==='string'&&['tenant','vault','account','device'].every(key=>typeof value[key]==='string'&&/^[0-9a-f-]{36}$/.test(value[key])),'invalid_offline_cache');
 return Object.fromEntries(['schema','origin','tenant','vault','account','device'].map(key=>[key,value[key]]));
}
export function emptyCache(profile,vault){return cacheIdentity({schema,origin:profile.origin,tenant:profile.tenant,account:profile.account,device:profile.device,vault});}
// The lifecycle list and decrypted snapshot must describe the same authorized
// revision. Missing rows in that complete list mean active, as on the service.
export function withEligibility(value,lifecycle,owner,lastSync=Date.now()){
 const descriptor=lifecycle?.vault;
 need(descriptor?.id===value.vault&&descriptor.owner===owner&&descriptor.epoch===value.epoch&&descriptor.revision===value.revision&&Array.isArray(lifecycle.items),'offline_eligibility_changed');
 const states=new Map();
 for(const row of lifecycle.items){
  need(row&&typeof row.object==='string'&&!states.has(row.object)&&['active','archived','trash'].includes(row.state)&&Number.isSafeInteger(row.stateVersion)&&row.stateVersion>=0,'offline_eligibility_changed');
  states.set(row.object,row);
 }
 const latest=new Map();
 for(const row of value.versions)latest.set(row.object,Math.max(latest.get(row.object)??0,row.version));
 return {...value,eligibility:{schema:eligibilitySchema,owner,epoch:value.epoch,revision:value.revision,lastSync,items:[...latest].map(([object,version])=>({object,version,state:states.get(object)?.state??'active',stateVersion:states.get(object)?.stateVersion??0}))}};
}
export function offlineTotpItem(value,identity,object,field='totp'){
 const metadata=value?.eligibility;
 need(metadata?.schema===eligibilitySchema&&metadata.owner===identity.account,'offline_owner_eligibility_required');
 need(value.vault===identity.vault&&metadata.epoch===value.epoch&&metadata.revision===value.revision&&Number.isSafeInteger(metadata.lastSync)&&metadata.lastSync>=0&&Array.isArray(metadata.items)&&Array.isArray(value.versions),'offline_eligibility_unverifiable');
 const matches=metadata.items.filter(row=>row.object===object);
 need(matches.length===1,'offline_eligibility_unverifiable');
 const eligible=matches[0];
 need(eligible.state==='active','offline_item_not_active');
 need(Number.isSafeInteger(eligible.stateVersion)&&eligible.stateVersion>=0,'offline_eligibility_unverifiable');
 const rows=value.versions.filter(row=>row.object===object),versions=new Set();
 need(rows.length>0,'offline_item_not_found');
 for(const row of rows){need(Number.isSafeInteger(row.version)&&row.version>0&&!versions.has(row.version),'offline_item_ambiguous');versions.add(row.version)}
 const latest=rows.reduce((a,b)=>a.version>b.version?a:b);
 need(latest.version===eligible.version,'offline_eligibility_unverifiable');
 const item=validateItem(latest.value),fields=item.fields.filter(row=>row.id===field);
 need(fields.length===1&&fields[0].type==='otp','offline_totp_field_required');
 return fields[0].value;
}
export async function sealCache(identity,value,cacheKey){
 identity=cacheIdentity(identity);const key=decode(cacheKey,32);need(key.length===32,'invalid_key');
 try{const serialized=bytes({identity,value});need(serialized.length<=1048560,'offline_cache_size_limit');return {...identity,state:'available',envelope:await seal(key,serialized,binding(identity))}}finally{key.fill(0)}
}
export async function openCache(cache,cacheKey,expected){
 const identity=cacheIdentity(cache);need(cache.state==='available','offline_cache_invalidated');
 need(JSON.stringify(identity)===JSON.stringify(cacheIdentity(expected)),'offline_cache_mismatch');
 const key=decode(cacheKey,32);need(key.length===32,'invalid_key');
 try{const opened=json(await open(key,cache.envelope,binding(identity)));need(JSON.stringify(opened.identity)===JSON.stringify(identity),'offline_cache_mismatch');return {connection:'disconnected',authority:'unverified while disconnected',expiresAt:null,...opened.value}}finally{key.fill(0)}
}
