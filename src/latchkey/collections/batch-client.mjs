import {bytes,digest,id,itemKey,seal} from '../crypto/envelope.mjs';
export async function writeBatch(client,vault,values){
 const snapshot=await client.snapshot(vault),{key,result}=snapshot,versions=new Map();for(const row of result.versions)versions.set(row.object_id,Math.max(versions.get(row.object_id)??0,row.version));
 let revision=result.revision;const written=[];
 try{
  for(let start=0;start<values.length;start+=64){const part=values.slice(start,start+64),entries=[];
   for(const row of part){const object=row.object??id(),version=(versions.get(object)??0)+1,derived=await itemKey(key,result.tenant,vault,object);try{entries.push({object,version,envelope:await seal(derived,bytes(row.value),{tenant:result.tenant,vault,object,purpose:'item',epoch:result.epoch,version})});versions.set(object,version)}finally{derived.fill(0)}}
   const response=await client.call('item/batch',{vault,revision,entries});revision=response.revision;
   const seen=client.profile.seen[vault];seen.revision=revision;seen.versions??={};for(let i=0;i<entries.length;i++){const entry=entries[i];seen.versions[`${entry.object}:${entry.version}`]=await digest(bytes(part[i].value));written.push({object:entry.object,version:entry.version})}
  }
  return{vault,revision,objects:written};
 }finally{key.fill(0)}
}
