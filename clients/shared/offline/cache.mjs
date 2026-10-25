import { bytes, decode, json, open, seal } from '../../../src/latchkey/crypto/envelope.mjs';
import { ClientError } from '../../../src/latchkey/client.mjs';
const schema='latchkey-offline-cache-v1';
const binding=identity=>({tenant:identity.tenant,vault:identity.vault,object:identity.account,purpose:'offline-cache',epoch:1,version:1});
const need=(value,code)=>{if(!value)throw new ClientError(code)};
export function cacheIdentity(value){
 need(value?.schema===schema&&typeof value.origin==='string'&&['tenant','vault','account','device'].every(key=>typeof value[key]==='string'&&/^[0-9a-f-]{36}$/.test(value[key])),'invalid_offline_cache');
 return Object.fromEntries(['schema','origin','tenant','vault','account','device'].map(key=>[key,value[key]]));
}
export function emptyCache(profile,vault){return cacheIdentity({schema,origin:profile.origin,tenant:profile.tenant,account:profile.account,device:profile.device,vault});}
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
