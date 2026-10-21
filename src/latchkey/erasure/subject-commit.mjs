import { createPortability,excludedTable } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../../../scripts/latchkey/archive-policy.mjs';
import { id } from '../crypto/envelope.mjs';
import { access,fresh,keyed,need,ownerArgs,ownerPredicate,receipt,SubjectErasureError } from './subject-common.mjs';
import { subjectAudit } from './subject-audit.mjs';

export async function subjectRecords(ctx) {
 const service=await createPortability({db:ctx.db,policy:archivePolicy});
 // Only initialize Base state; these returned tombstone statements are never
 // committed. Product erasure uses the real reviewed primary keys below.
 if(!await access(ctx).first('SELECT 1 FROM rer_portability_state WHERE id=1'))await service.erasureStatements('oa_operators',{id:'initialization-only'});
 return service;
}
const substitute=(value,label)=>typeof value==='string'?value.replaceAll('__SUBJECT_ANON__',label):value;
const rowKey=(entry,row)=>JSON.stringify(entry.keys.map(key=>row[key]));
async function deletionOrder(ctx,entries){
 const names=[...new Set(entries.map(entry=>entry.table))],parents=new Map();
 for(const name of names)parents.set(name,(await access(ctx).all(`PRAGMA foreign_key_list(${name})`)).map(ref=>ref.table).filter(parent=>names.includes(parent)));
 const result=[],remaining=new Set(names);
 while(remaining.size){const ready=[...remaining].filter(name=>![...remaining].some(child=>parents.get(child).includes(name)));need(ready.length,'subject_dependency_cycle',409);for(const name of ready){result.push(name);remaining.delete(name);}}
 return result;
}
export async function commitSubject(ctx,plan,service){
 const {stmt,guard,first,all}=access(ctx),operation=id(),label=id(),anonymousEmail=`${label}@removed.invalid`;
 const checkpoint=await first('SELECT source_identity,epoch,applying FROM rer_portability_state WHERE id=1');need(checkpoint?.applying===0,'restore_in_progress',409);
 const transferSelect="SELECT name FROM sqlite_master WHERE type='table' AND (name GLOB 'rer_portability_snap_*' OR name GLOB 'rer_portability_stage_*') ORDER BY name";
 const transferNames=(await all(transferSelect)).map(row=>row.name),transferStatements=await service.invalidateTransfersStatements();
 const deletionEntries=plan.changes.filter(entry=>entry.action==='delete'),redactions=plan.changes.filter(entry=>entry.action==='redact').map(entry=>({...entry,set:row=>Object.fromEntries(Object.entries(entry.set(row)).map(([column,value])=>[column,substitute(value,label)]))}));
 const deleted=new Map(),updates=[];
 for(const entry of deletionEntries)for(const row of entry.rows)deleted.set(`${entry.table}:${rowKey(entry,row)}`,{entry,row});
 for(const entry of redactions)for(const row of entry.rows){const next=entry.set(row),columns=entry.columns.filter(column=>!entry.keys.includes(column));updates.push(stmt(`UPDATE ${entry.table} SET ${columns.map(column=>`${column}=?`).join(',')} WHERE ${entry.keys.map(key=>`${key}=?`).join(' AND ')}`,...columns.map(column=>substitute(next[column],label)),...entry.keys.map(key=>row[key])));}
 const journal=[];
 for(const {entry,row}of deleted.values())if(!excludedTable(entry.table,archivePolicy))journal.push(...await service.erasureStatements(entry.table,Object.fromEntries(entry.keys.map(key=>[key,row[key]]))));
 if(redactions.some(entry=>entry.rows.length))journal.push(...await service.redactionStatements());
 const fences=[['operator',plan.person.id],['email',plan.person.email],...plan.devices.map(device=>['device',device.id]),...plan.external.map(value=>['external-identity',[value.issuer,value.subject]]),...plan.erased.map(row=>['item',[row.vault_id,row.object_id]]),...plan.ownedVaults.map(row=>['vault',row.id]),...plan.ownedVersions.map(row=>['item',[row.vault_id,row.object_id]]),...plan.machines.map(row=>['machine',row.id]),...plan.groups.map(row=>['group',row.id])];
 if(plan.account)fences.push(['account',plan.account.id]);
 const fenceRows=[];for(const [kind,value]of fences)fenceRows.push({kind,digest:await keyed(ctx,`fence:${kind}`,kind==='email'?value.toLowerCase():value)});
 const audit=await subjectAudit(ctx,operation,plan.counts,ctx.now,redactions),outstanding=[...plan.outstanding,{domain:'audit-checkpoint',state:'held-checkpoint-required',root:audit.root,length:audit.rows.length,signature:audit.signature}];
 const result={operation,label,phase:'control-plane-erased',controlPlaneErased:true,complete:false,counts:plan.counts,outstanding,createdAt:ctx.now},proof=await keyed(ctx,'receipt',result);
 const ordered=await deletionOrder(ctx,deletionEntries);
 const eraseStatements=ordered.flatMap(table=>[...deleted.values()].filter(value=>value.entry.table===table).map(({entry,row})=>stmt(`DELETE FROM ${table} WHERE ${entry.keys.map(key=>`${key}=?`).join(' AND ')}`,...entry.keys.map(key=>row[key]))));
 const snapshots=plan.snapshots.map(entry=>guard(`(SELECT json_group_array(json_array(${entry.columns.join(',')})) FROM (SELECT * FROM ${entry.table} WHERE ${entry.where} ORDER BY ${entry.keys.join(',')}))=?`,[...entry.args,JSON.stringify(entry.rows.map(row=>entry.columns.map(column=>row[column])))]));
 const schemaSql="SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name";
 try{
  await ctx.db.batch([
   stmt('DELETE FROM lky_subject_guard'),guard(`${ctx.fence} AND ${ownerPredicate}`,[...fresh(ctx),...ownerArgs(ctx)]),
   guard('(SELECT json_group_array(json_array(name,sql)) FROM ('+schemaSql+'))=?',[JSON.stringify(plan.schema.map(row=>[row.name,row.sql]))]),
   guard('EXISTS(SELECT 1 FROM rer_portability_state WHERE id=1 AND source_identity=? AND epoch=? AND applying=0)',[checkpoint.source_identity,checkpoint.epoch]),
   guard(`(SELECT json_group_array(name) FROM (${transferSelect}))=?`,[JSON.stringify(transferNames)]),...snapshots,
   stmt("INSERT INTO oa_operators VALUES(?,?,?,'member','inactive',1,?,NULL)",label,anonymousEmail,'Removed person',ctx.now),
   ...updates,...eraseStatements,...journal,...transferStatements,
   stmt('INSERT INTO lky_subject_erasures VALUES(?,?,?,?,?,?,?,?)',operation,ctx.tenant,label,result.phase,JSON.stringify(plan.counts),JSON.stringify(outstanding),ctx.now,proof),
   ...fenceRows.map(row=>stmt('INSERT INTO lky_subject_fences VALUES(?,?,?,?,?) ON CONFLICT(tenant,kind,digest) DO NOTHING',ctx.tenant,row.kind,row.digest,operation,ctx.now)),
   ...plan.affected.map(vault=>stmt('INSERT INTO lky_subject_invalidations VALUES(?,?,?,?,?)',ctx.tenant,vault.id,operation,vault.epoch,'pending')),
   ...plan.affected.map(vault=>stmt('UPDATE lky_vaults SET revision=revision+1,mutation=? WHERE id=?',operation,vault.id)),
   ...audit.rows.map(row=>stmt('INSERT INTO lky_subject_audit VALUES(?,?,?,?,?)',operation,row.position,row.facts,row.previous_hash,row.hash)),
   stmt('DELETE FROM lky_subject_guard'),
  ]);
 }catch{throw new SubjectErasureError('subject_erasure_conflict',409);}
 return receipt(ctx,await first('SELECT * FROM lky_subject_erasures WHERE id=?',operation));
}
