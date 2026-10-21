import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest } from '../crypto/envelope.mjs';
import { access, keyed, need } from './subject-common.mjs';
const auditDomains=new Set(['lky_events','oa_auth_audit','lky_generator_policy_changes','lky_restore_history']);
function content(row){const value={...row};for(const column of ['actor','actor_id','device','object_id','source_account','destination_account','group_id','vaults','plan_hash','content_hash','archive_hash'])delete value[column];return value;}
export async function subjectAudit(ctx,operation,counts,createdAt,redactions=[]) {
 let previous='';const rows=[];
 const factsList=Object.entries(counts).filter(([,count])=>count>0).sort(([a],[b])=>a.localeCompare(b)).map(([domain,count])=>({domain,count,time:createdAt}));
 for(const entry of redactions.filter(entry=>auditDomains.has(entry.table)))for(const row of entry.rows){
  factsList.push({domain:entry.table,reference:await keyed(ctx,'audit-reference',[entry.table,Object.fromEntries(entry.keys.map(key=>[key,row[key]]))]),content:await keyed(ctx,'audit-content',content(entry.set(row)))});
 }
 for(const item of factsList){
  const facts=canonicalJson(item),hash=await digest(canonicalJson([operation,rows.length,previous,facts]));
  rows.push({position:rows.length,facts,previous_hash:previous,hash});previous=hash;
 }
 return {rows,root:previous,signature:await keyed(ctx,'audit-root',{operation,root:previous,length:rows.length})};
}
export async function verifySubjectAudit(ctx,operation,{root,length,signature}={}) {
 const {all,first}=access(ctx),receipt=await first('SELECT proof FROM lky_subject_erasures WHERE id=? AND tenant=?',operation,ctx.tenant);
 need(receipt,'subject_erasure_not_found',404);
 const rows=await all('SELECT * FROM lky_subject_audit WHERE operation=? ORDER BY position',operation);
 let previous='';const domainRows=new Map();
 for(const [position,row]of rows.entries()){
  need(row.position===position&&row.previous_hash===previous&&row.hash===await digest(canonicalJson([operation,position,previous,row.facts])),'subject_audit_tampered',409);previous=row.hash;
  const facts=JSON.parse(row.facts);
  if(auditDomains.has(facts.domain)){
   if(!domainRows.has(facts.domain)){
    const keys=(await all(`PRAGMA table_info(${facts.domain})`)).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name),indexed=new Map();
    for(const candidate of await all(`SELECT * FROM ${facts.domain}`))indexed.set(await keyed(ctx,'audit-reference',[facts.domain,Object.fromEntries(keys.map(key=>[key,candidate[key]]))]),candidate);
    domainRows.set(facts.domain,indexed);
   }
   const current=domainRows.get(facts.domain).get(facts.reference);
   need(current&&facts.content===await keyed(ctx,'audit-content',content(current)),'subject_audit_tampered',409);
  }
 }
 if(root!=null)need(root===previous&&length===rows.length&&signature===await keyed(ctx,'audit-root',{operation,root:previous,length:rows.length}),'subject_audit_tampered',409);
 return {valid:true,operation,root:previous,length:rows.length,signature:await keyed(ctx,'audit-root',{operation,root:previous,length:rows.length}),requiresHeldCheckpointForTailVerification:true};
}
