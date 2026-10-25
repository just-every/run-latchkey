import { canonicalJson } from '@runeditrun/rer/modules/portability';
import { bytes, encode, id } from '../crypto/envelope.mjs';
import { ApiError } from '../api/catalogue.mjs';
const need=(value,code='invalid_audit_input',status=400)=>{if(!value)throw new ApiError(code,status)};
const access=ctx=>({stmt:(sql,...args)=>ctx.db.prepare(sql).bind(...args),all:async(sql,...args)=>(await ctx.db.prepare(sql).bind(...args).all()).results,first:(sql,...args)=>ctx.db.prepare(sql).bind(...args).first()});
const exact=(value,keys)=>need(value&&Object.keys(value).sort().join()===[...keys].sort().join(),'invalid_fields');
export const retentionDays=365;
export async function auditMac(ctx,domain,value){
 need(typeof ctx.env.SESSION_SECRET==='string'&&ctx.env.SESSION_SECRET.length>=32,'audit_key_unavailable',503);
 const key=await crypto.subtle.importKey('raw',bytes(ctx.env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 return encode(new Uint8Array(await crypto.subtle.sign('HMAC',key,bytes(['latchkey-audit-v1',ctx.tenant,domain,value]))));
}
const appendQueues=new Map();
export async function appendAudit(ctx,facts){
 const previous=appendQueues.get(ctx.tenant)??Promise.resolve();
 const pending=previous.catch(()=>{}).then(()=>commitAudit(ctx,facts));
 appendQueues.set(ctx.tenant,pending);
 try{return await pending}finally{if(appendQueues.get(ctx.tenant)===pending)appendQueues.delete(ctx.tenant)}
}
async function commitAudit(ctx,facts){
 const {first,stmt}=access(ctx),event=id(),serialized=canonicalJson(facts),commitment=await auditMac(ctx,'facts',[event,serialized]);
 for(let attempt=0;attempt<16;attempt++){
  const tail=await first('SELECT sequence,hash FROM lky_audit_chain WHERE tenant=? ORDER BY sequence DESC LIMIT 1',ctx.tenant);
  const sequence=(tail?.sequence??0)+1,previous=tail?.hash??'',hash=await auditMac(ctx,'chain',[sequence,event,previous,commitment]);
  try{
   await ctx.db.batch([stmt('INSERT INTO lky_audit_chain VALUES(?,?,?,?,?,?)',ctx.tenant,sequence,event,previous,commitment,hash),stmt('INSERT INTO lky_audit_details VALUES(?,?,NULL,NULL)',event,serialized)]);
   return {sequence,id:event,hash};
  }catch(error){
   const current=await first('SELECT sequence FROM lky_audit_chain WHERE tenant=? ORDER BY sequence DESC LIMIT 1',ctx.tenant);
   if((current?.sequence??0)<sequence)throw error;
  }
 }
 throw new ApiError('audit_busy',409);
}
const reference=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/.test(value)?value:null;
const actions={'vault\u002fread':'view','item\u002fread':'view','vault\u002fexport':'export','vault\u002fcreate':'create','item\u002fput':'edit','vault\u002fshare':'grant','vault\u002frotate':'rotate','device\u002frevoke':'revoke','machine\u002fgrant':'grant','machine\u002frevoke':'revoke'};
export function auditFacts(ctx,route,input,result,requestId){
 const category=['vault','item','api','sharing','runtime','project','webhook','mcp','subject','recovery','enrollment','device','machine','generator','reviews','evidence','archive','checkout','people','admin'].find(value=>route.startsWith(value+'/'))??'authenticated';
 const action=route==='item\u002fauthorize'&&['copy','reveal','fill','history','attachment'].includes(input.action)?input.action:actions[route]??category+'_action';
 const ip=ctx.request?.headers.get('cf-connecting-ip');
 return {schema:'latchkey-audit-fact-v1',request:requestId,actor:ctx.actor,sponsor:ctx.actor,serviceIdentity:null,agent:null,device:ctx.device,ip:ip&&/^[a-fA-F0-9:.]{3,45}$/.test(ip)?ip:null,time:ctx.now,receiptTime:ctx.now,vault:reference(input.vault),item:reference(input.object),target:reference(input.operator??input.account??input.device??input.subscription??input.operation),action,permission:category,policyVersion:'unrecorded',result,coverage:'connected authenticated human request; intent and outcome are separate records'};
}
export async function auditDisposition(ctx,row,reason){
 const disposition=canonicalJson({reason,at:ctx.now});
 return {...row,facts:null,disposition,authorization:await auditMac(ctx,'disposition',[row.id,disposition])};
}
export async function auditCheckpoint(ctx){
 const tail=await access(ctx).first('SELECT sequence,hash FROM lky_audit_chain WHERE tenant=? ORDER BY sequence DESC LIMIT 1',ctx.tenant);
 const checkpoint={tenant:ctx.tenant,length:tail?.sequence??0,hash:tail?.hash??''};
 return {...checkpoint,signature:await auditMac(ctx,'checkpoint',checkpoint)};
}
async function verifyAudit(ctx,checkpoint){
 need(checkpoint&&checkpoint.tenant===ctx.tenant&&Number.isSafeInteger(checkpoint.length)&&checkpoint.length>=0,'held_checkpoint_required');
 const signed={tenant:checkpoint.tenant,length:checkpoint.length,hash:checkpoint.hash};
 need(checkpoint.signature===await auditMac(ctx,'checkpoint',signed),'audit_checkpoint_invalid',409);
 const {all}=access(ctx);let previous='',position=0,anchored=checkpoint.length===0&&checkpoint.hash==='';
 // Pages bound each store read while verification still covers the whole chain.
 for(;;){
  const rows=await all('SELECT c.*,d.facts,d.disposition,d.authorization FROM lky_audit_chain c LEFT JOIN lky_audit_details d ON d.id=c.id WHERE c.tenant=? AND c.sequence>? ORDER BY c.sequence LIMIT 200',ctx.tenant,position);
  if(!rows.length)break;
  for(const row of rows){
   need(row.sequence===++position&&row.previous_hash===previous&&row.hash===await auditMac(ctx,'chain',[position,row.id,previous,row.commitment]),'audit_tampered',409);
   if(row.facts!==null)need(row.commitment===await auditMac(ctx,'facts',[row.id,row.facts]),'audit_tampered',409);
   else need(row.disposition&&row.authorization===await auditMac(ctx,'disposition',[row.id,row.disposition]),'audit_tampered',409);
   previous=row.hash;
   if(position===checkpoint.length)anchored=previous===checkpoint.hash;
  }
 }
 need(anchored&&position>=checkpoint.length,'audit_tampered',409);
 return {valid:true,verified:position,checkpoint:await auditCheckpoint(ctx),coverage:'Hold checkpoints outside this installation to detect tail truncation.'};
}
export async function auditAuthenticated(route,input,ctx){
 if(!route.startsWith('audit/'))return null;
 need(ctx.session.operator.role==='owner','audit_owner_required',403);
 const {all,stmt}=access(ctx);
 if(route==='audit' + '/checkpoint'){exact(input,[]);return auditCheckpoint(ctx)}
 if(route==='audit' + '/verify'){exact(input,['checkpoint']);return verifyAudit(ctx,input.checkpoint)}
 if(route==='audit' + '/retention'){exact(input,[]);return {days:retentionDays,automaticExpiry:false,consequences:'Explicit expiry removes identifying details older than 365 days. Authenticated anonymized commitments remain. External copies require separate verification.',extension:'not implemented'}}
 if(route==='audit' + '/expire'){
  exact(input,['confirmed']);need(input.confirmed===true,'audit_expiry_confirmation_required',403);
  const expired=await all("SELECT d.* FROM lky_audit_details d JOIN lky_audit_chain c ON c.id=d.id WHERE c.tenant=? AND d.facts IS NOT NULL AND json_extract(d.facts,'$.time')<? LIMIT 200",ctx.tenant,ctx.now-retentionDays*86400000);
  const updates=[];
  for(const row of expired){const next=await auditDisposition(ctx,row,'retention');updates.push(stmt('UPDATE lky_audit_details SET facts=NULL,disposition=?,authorization=? WHERE id=? AND facts=?',next.disposition,next.authorization,row.id,row.facts))}
  if(updates.length)await ctx.db.batch(updates);
  return {expired:expired.length,more:expired.length===200};
 }
 if(route==='audit' + '/list'||route==='audit' + '/csv'){
  exact(input,['filters','after','limit']);need(input.filters&&typeof input.filters==='object'&&!Array.isArray(input.filters));
  need(Number.isSafeInteger(input.after)&&input.after>=0&&Number.isSafeInteger(input.limit)&&input.limit>=1&&input.limit<=200);
  const columns={person:'actor',serviceIdentity:'serviceIdentity',agent:'agent',vault:'vault',item:'item',action:'action',device:'device',ip:'ip',from:'time',to:'time'},conditions=['c.tenant=?','c.sequence>?','d.facts IS NOT NULL'],args=[ctx.tenant,input.after];
  for(const [key,value]of Object.entries(input.filters)){
   need(Object.hasOwn(columns,key),'invalid_audit_filter');
   if(key==='from'||key==='to')need(Number.isSafeInteger(value)&&value>=0);else need(typeof value==='string'&&value.length>0&&value.length<=100);
   conditions.push(`json_extract(d.facts,'$.${columns[key]}')${key==='from'?'>=':key==='to'?'<=':'='}?`);args.push(value);
  }
  const rows=await all(`SELECT c.sequence,c.id,d.facts FROM lky_audit_chain c JOIN lky_audit_details d ON d.id=c.id WHERE ${conditions.join(' AND ')} ORDER BY c.sequence LIMIT ?`,...args,input.limit+1);
  const entries=rows.slice(0,input.limit).map(row=>({sequence:row.sequence,id:row.id,...JSON.parse(row.facts)})),next=rows.length>input.limit?entries.at(-1).sequence:null;
  if(route==='audit' + '/list')return {entries,next,retentionDays,coverage:'No signed offline evidence or public machine requests are included.'};
  const fields=['sequence','id','actor','sponsor','serviceIdentity','agent','vault','item','action','device','ip','time','receiptTime','permission','policyVersion','result'];
  const csv=value=>'"'+String(value??'').replaceAll('"','""').replace(/^[=+@-]/,"'$&")+'"';
  return {csv:[fields.join(','),...entries.map(row=>fields.map(field=>csv(row[field])).join(','))].join('\r\n'),next,count:entries.length};
 }
 throw new ApiError('audit_route_not_found',404);
}
