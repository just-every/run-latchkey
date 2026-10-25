import { attachmentBytes } from '../items/attachments.mjs';
import { ClientError } from '../client.mjs';
// This report stays in the authorized client. It never changes other owners' data.
export async function scanErasureContent(client,vault,terms){
 if(!Array.isArray(terms)||!terms.length||terms.length>100||terms.some(term=>typeof term!=='string'||!term.trim()||term.length>1000))throw new ClientError('invalid_erasure_terms');
 const needles=terms.map(term=>term.toLowerCase()),snapshot=await client.readVault(vault),matches=[];
 const contains=value=>needles.some(term=>value.toLowerCase().includes(term));
 for(const row of snapshot.versions){
  const fields=contains(JSON.stringify(row.value)),attachments=[];
  for(const attachment of row.value.attachments??[]){
   const data=await attachmentBytes(attachment);
   try{if(contains(new TextDecoder().decode(data)))attachments.push(attachment.id)}finally{data.fill(0)}
  }
  if(fields||attachments.length)matches.push({object:row.object,version:row.version,fields,attachments});
 }
 return {vault,epoch:snapshot.epoch,revision:snapshot.revision,versionsScanned:snapshot.versions.length,matches,complete:false,scope:'Authorized vault history and decoded attachment text only; binary encodings and inaccessible vaults remain unverified.',action:'Owner review required; no content changed.'};
}
