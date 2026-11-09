import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { digest } from '../crypto/envelope.mjs';
import { access, keyed, need, receipt } from './subject-common.mjs';

export const retainedDomains = new Set(['lky_events','oa_auth_audit','lky_generator_policy_changes','lky_restore_history']);
export const legacyExcludedColumns = Object.freeze(['actor','actor_id','device','object_id','source_account','destination_account','group_id','vaults','plan_hash','content_hash','archive_hash']);
export function legacyProjection(row) {
 const value={...row};for(const column of legacyExcludedColumns)delete value[column];return value;
}
export const completeCommitment=(ctx,domain,row)=>keyed(ctx,'audit-content-v2',{domain,row});
export const referenceFor=(ctx,domain,keys,row)=>keyed(ctx,'audit-reference',[domain,Object.fromEntries(keys.map(key=>[key,row[key]]))]);
// Version 3 also keeps one keyed digest per column, bound to the row reference,
// so the one legitimate later rewrite (scheduled retention erasure of the item a
// row names) can be recognised without trusting or regenerating anything.
const columnDigest=(ctx,domain,reference,column,value)=>keyed(ctx,'audit-column',[domain,reference,column,value]);
async function columnDigests(ctx,domain,reference,row) {
 const result={};for(const column of Object.keys(row).sort())result[column]=await columnDigest(ctx,domain,reference,column,row[column]);
 return result;
}
// Scheduled retention erasure rewrites actor and device to constants and replaces
// object_id with the erasure receipt id of the item the row named. Accept exactly
// that: every other column, and the erased item itself, must match the commitment.
async function retentionRewrite(ctx,facts,row) {
 if(facts.domain!=='lky_events'||facts.version!==3||row.actor!=='retention-policy'||row.device!=='scheduled')return false;
 const erased=await access(ctx).first("SELECT object_id FROM lky_erased_items WHERE tenant=? AND receipt_id=? AND erased_device='retention-policy'",ctx.tenant,row.object_id);
 if(!erased)return false;
 for(const column of facts.columns){
  if(column==='actor'||column==='device')continue;
  if(facts.columnDigests[column]!==await columnDigest(ctx,facts.domain,facts.reference,column,column==='object_id'?erased.object_id:row[column]))return false;
 }
 return true;
}
const address=node=>`${node.operation}:${node.position}`;
const scope=node=>canonicalJson([node.facts.domain,node.facts.reference]);
const tampered=value=>need(value,'subject_audit_tampered',409);

// Stored, keyed receipt anchors authenticate transitions even when verification
// starts from an earlier separately held checkpoint. Never rebuild an old proof
// from mutable rows. Legacy facts keep their original, limited projection.
export async function commitmentHistory(ctx) {
 const {all}=access(ctx),operations=new Map(),nodes=new Map(),roots=new Map(),successors=new Map();
 for(const stored of await all('SELECT * FROM lky_subject_erasures WHERE tenant=?',ctx.tenant)){
  const result=await receipt(ctx,stored),checkpoint=result.outstanding.find(entry=>entry.domain==='audit-checkpoint');
  tampered(checkpoint);
  let previous='';const entries=[];
  for(const [position,row]of (await all('SELECT * FROM lky_subject_audit WHERE operation=? ORDER BY position',stored.id)).entries()){
   tampered(row.position===position&&row.previous_hash===previous&&row.hash===await digest(canonicalJson([stored.id,position,previous,row.facts])));
   previous=row.hash;
   let facts;try{facts=JSON.parse(row.facts)}catch{tampered(false)}
   tampered(facts&&typeof facts==='object'&&!Array.isArray(facts));
   const node={operation:stored.id,position,facts};entries.push(node);
   if(facts.version!==undefined){
    tampered(retainedDomains.has(facts.domain)&&(facts.version===2||facts.version===3)&&facts.coverage==='complete-sanitized-row'&&Array.isArray(facts.columns)&&typeof facts.content==='string'&&typeof facts.prior==='string'&&typeof facts.reference==='string');
    tampered(facts.version===2?facts.columnDigests===undefined:facts.columnDigests&&typeof facts.columnDigests==='object'&&canonicalJson(Object.keys(facts.columnDigests).sort())===canonicalJson([...facts.columns].sort())&&Object.values(facts.columnDigests).every(value=>typeof value==='string'));
    nodes.set(address(node),node);
   }
  }
  tampered(checkpoint.root===previous&&checkpoint.length===entries.length&&checkpoint.signature===await keyed(ctx,'audit-root',{operation:stored.id,root:previous,length:entries.length}));
  operations.set(stored.id,{entries,checkpoint});
 }
 for(const node of nodes.values()){
  const predecessor=node.facts.predecessor;
  if(predecessor===null){tampered(!roots.has(scope(node)));roots.set(scope(node),node);continue;}
  tampered(predecessor&&typeof predecessor.operation==='string'&&Number.isSafeInteger(predecessor.position));
  const parent=nodes.get(address(predecessor));
  tampered(parent&&scope(parent)===scope(node)&&node.facts.prior===parent.facts.content&&!successors.has(address(parent)));
  successors.set(address(parent),node);
 }
 const latest=node=>{
  const seen=new Set();
  for(;;){tampered(!seen.has(address(node)));seen.add(address(node));const next=successors.get(address(node));if(!next)return node;node=next;}
 };
 // Every node must descend from the unique root, including disconnected cycles.
 const reached=new Set();for(const root of roots.values()){let node=root;for(;;){tampered(!reached.has(address(node)));reached.add(address(node));node=successors.get(address(node));if(!node)break;}}
 tampered(reached.size===nodes.size);
 return {operations,roots,latest};
}

export async function verifyCompleteRow(ctx,history,node,row) {
 const terminal=history.latest(node);
 tampered(row&&canonicalJson(terminal.facts.columns)===canonicalJson(Object.keys(row).sort()));
 // Exact committed state, or the one constrained retention rewrite of it. Version 2
 // facts carry no column digests and keep their original whole-row-only promise.
 tampered(terminal.facts.content===await completeCommitment(ctx,terminal.facts.domain,row)||await retentionRewrite(ctx,terminal.facts,row));
 return terminal;
}

export async function newCommitment(ctx,history,domain,keys,before,after) {
 const reference=await referenceFor(ctx,domain,keys,before),root=history.roots.get(canonicalJson([domain,reference]));
 const terminal=root?await verifyCompleteRow(ctx,history,root,before):null;
 // Verify the limited legacy promise too, without promoting omitted columns.
 for(const operation of history.operations.values())for(const node of operation.entries){
  if(node.facts.version===undefined&&node.facts.domain===domain&&node.facts.reference===reference)
   tampered(node.facts.content===await keyed(ctx,'audit-content',legacyProjection(before)));
 }
 return {domain,reference,version:3,coverage:'complete-sanitized-row',columns:Object.keys(after).sort(),
  columnDigests:await columnDigests(ctx,domain,reference,after),
  predecessor:terminal?{operation:terminal.operation,position:terminal.position}:null,
  // A verified later retention rewrite is the same committed state, so the link is the predecessor's content.
  prior:terminal?terminal.facts.content:await completeCommitment(ctx,domain,before),content:await completeCommitment(ctx,domain,after)};
}
