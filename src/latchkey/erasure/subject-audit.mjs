import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest } from '../crypto/envelope.mjs';
import { access, keyed, need } from './subject-common.mjs';
import { commitmentHistory, legacyExcludedColumns, legacyProjection, newCommitment, referenceFor, retainedDomains, verifyCompleteRow } from './subject-commitment.mjs';
const auditDomains=new Set([...retainedDomains,'lky_audit_details']);
export async function subjectAudit(ctx,operation,counts,createdAt,redactions=[]) {
 let previous='';const rows=[],history=await commitmentHistory(ctx);
 const factsList=Object.entries(counts).filter(([,count])=>count>0).sort(([a],[b])=>a.localeCompare(b)).map(([domain,count])=>({domain,count,time:createdAt}));
 for(const entry of redactions.filter(entry=>auditDomains.has(entry.table)))for(const row of entry.rows){
  factsList.push(retainedDomains.has(entry.table)
   ?await newCommitment(ctx,history,entry.table,entry.keys,row,entry.set(row))
   :{domain:entry.table,reference:await referenceFor(ctx,entry.table,entry.keys,row),content:await keyed(ctx,'audit-content',legacyProjection(entry.set(row)))});
 }
 for(const item of factsList){
  const facts=canonicalJson(item),hash=await digest(canonicalJson([operation,rows.length,previous,facts]));
  rows.push({position:rows.length,facts,previous_hash:previous,hash});previous=hash;
 }
 return {rows,root:previous,signature:await keyed(ctx,'audit-root',{operation,root:previous,length:rows.length})};
}
export async function verifySubjectAudit(ctx,operation,{root,length,signature}={}) {
 const history=await commitmentHistory(ctx),record=history.operations.get(operation);
 need(record,'subject_erasure_not_found',404);
 need(typeof root==='string'&&Number.isSafeInteger(length)&&typeof signature==='string','held_audit_checkpoint_required');
 need(root===record.checkpoint.root&&length===record.checkpoint.length&&signature===record.checkpoint.signature,'subject_audit_tampered',409);
 const {all}=access(ctx),domainRows=new Map(),coverage={completeSanitizedRows:0,wholeRowOnlyRows:0,legacyPartialRows:0,detailRows:0,legacyExcludedColumns:[...legacyExcludedColumns]};
 for(const node of record.entries){
  const {facts}=node;
  if(auditDomains.has(facts.domain)){
   if(!domainRows.has(facts.domain)){
    const keys=(await all(`PRAGMA table_info(${facts.domain})`)).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name),indexed=new Map();
    for(const candidate of await all(`SELECT * FROM ${facts.domain}`))indexed.set(await referenceFor(ctx,facts.domain,keys,candidate),candidate);
    domainRows.set(facts.domain,indexed);
   }
   const current=domainRows.get(facts.domain).get(facts.reference);
   if(facts.version!==undefined){await verifyCompleteRow(ctx,history,node,current);coverage.completeSanitizedRows++;if(facts.version===2)coverage.wholeRowOnlyRows++;}
   else{
    need(current&&facts.content===await keyed(ctx,'audit-content',legacyProjection(current)),'subject_audit_tampered',409);
    if(retainedDomains.has(facts.domain))coverage.legacyPartialRows++;else coverage.detailRows++;
   }
  }
 }
 return {valid:true,operation,root,length,signature,coverage,requiresHeldCheckpointForTailVerification:true};
}
