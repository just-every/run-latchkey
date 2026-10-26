import { attachmentBytes } from '../items/attachments.mjs';
import { ClientError } from '../client.mjs';
// This report stays in the authorized client. It never changes other owners' data.
export async function scanErasureContent(client,vault,terms){
 if(!Array.isArray(terms)||!terms.length||terms.length>100||terms.some(term=>typeof term!=='string'||!term.trim()||term.length>1000))throw new ClientError('invalid_erasure_terms');
 const needles=terms.map(term=>term.toLowerCase()),snapshot=await client.readVault(vault),matches=[],unverifiedAttachments=[];
 const contains=value=>needles.some(term=>value.toLowerCase().includes(term));
 for(const row of snapshot.versions){
  const fields=contains(JSON.stringify(row.value)),attachments=[];
  for(const attachment of row.value.attachments??[]){
   const data=await attachmentBytes(attachment);
   try{
    // Only decode recognized text. A replacement character from malformed
    // binary data must never silently count as a completed content inspection.
    const encoding=data[0]===0xff&&data[1]===0xfe?'utf-16le':data[0]===0xfe&&data[1]===0xff?'utf-16be':'utf-8';
    let text;
    try{text=new TextDecoder(encoding,{fatal:true}).decode(data)}catch{unverifiedAttachments.push({object:row.object,version:row.version,attachment:attachment.id});continue}
    if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)){unverifiedAttachments.push({object:row.object,version:row.version,attachment:attachment.id});continue}
    if(contains(text))attachments.push(attachment.id);
   }finally{data.fill(0)}
  }
  if(fields||attachments.length)matches.push({object:row.object,version:row.version,fields,attachments});
 }
 return {vault,epoch:snapshot.epoch,revision:snapshot.revision,versionsScanned:snapshot.versions.length,matches,unverifiedAttachments,complete:false,scope:'Authorized vault history and UTF-8 or BOM-marked UTF-16 attachment text only; binary content, other encodings and inaccessible vaults remain unverified.',action:'Owner review required; no content changed.'};
}
