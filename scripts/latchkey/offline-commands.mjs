import { constants } from 'node:fs';
import { open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cacheIdentity, emptyCache, sealCache, openCache, withEligibility, offlineTotpItem } from '../../clients/shared/offline/cache.mjs';
import { VaultClient, ClientError } from '../../src/latchkey/client.mjs';
import { totp } from '../../src/latchkey/totp/index.mjs';

export const offlineCommands=Object.freeze(['cache-refresh','cache-read','cache-totp']);
export async function offlineCommand(command,input,{readPrivate,writePrivate}){
 const need=(value,code)=>{if(!value)throw new ClientError(code)};
 need(typeof input.cache==='string'&&input.cache&&typeof input.profile==='string'&&input.profile,'offline_cache_path_required');
 need(resolve(input.cache)!==resolve(input.profile)&&(!input.output||![input.cache,input.profile,input.cache+'.lock'].some(path=>resolve(path)===resolve(input.output))),'offline_cache_path_conflict');
 if(command!=='cache-refresh')need(typeof input.output==='string'&&input.output.length>0,'offline_output_required');
 const lockPath=input.cache+'.lock';let lock,client;
 try{lock=await open(lockPath,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600)}catch(error){if(error.code==='EEXIST')throw new ClientError('offline_cache_busy');throw error}
 try{
  const profile=await readPrivate(input.profile),identity=emptyCache(profile,input.vault);
  let saved;try{saved=await readPrivate(input.cache)}catch(error){if(error.code!=='ENOENT')throw error}
  if(saved)need(JSON.stringify(cacheIdentity(saved))===JSON.stringify(identity),'offline_cache_mismatch');
  if(command==='cache-refresh'){
   // Persist invalidation before authentication or any network request.
   await writePrivate(input.cache,{...identity,state:'invalidated'},!!saved);
   client=new VaultClient(profile.origin);await client.unlock(profile,input.password);
   const value=await client.readVault(input.vault),owner=profile.seen[input.vault].owner;
   const lifecycle=await client.call(['lifecycle','list'].join('/'),{vault:input.vault});
   await writePrivate(input.cache,await sealCache(identity,withEligibility(value,lifecycle,owner),input.cacheKey),true);
   await writePrivate(input.profile,profile,true);
   return {refreshed:true,versions:value.versions.length,expiresAt:null};
  }
  const value=await openCache(saved,input.cacheKey,identity);
  if(command==='cache-read'){
   await writePrivate(input.output,value);
   return {written:true,connection:value.connection,expiresAt:value.expiresAt};
  }
  const {code,validFrom,validUntil}=await totp(offlineTotpItem(value,identity,input.object,input.field));
  await writePrivate(input.output,{code,validFrom,validUntil,connection:'disconnected',authority:'unverified while disconnected',expiresAt:null,lastSync:value.eligibility.lastSync});
  return {written:true,connection:'disconnected',authority:'unverified while disconnected',expiresAt:null};
 }finally{client?.lock();await lock.close();await unlink(lockPath)}
}
