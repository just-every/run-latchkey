import {digest,validateEnvelope,verifyWrapped} from '../crypto/envelope.mjs';
import {utcDay,observationContext,reportKeyContext} from './history.mjs';
import {canonicalJson,guarded,has,uuid,access,exact,need,vaultFor} from '../lifecycle/common.mjs';
import {usageFilters} from './filters.mjs';
import {reportRoute} from './service-route.mjs';
export async function reportsAuthenticated(route,input,ctx){
 if(route===['reports','capture'].join('/'))return capture(input,ctx);
 if(route===['reports','history'].join('/'))return history(input,ctx);
 if(route!==reportRoute)return null;
 exact(input,['vault','from','to',...(input.filters===undefined?[]:['filters'])]);
 let filters;try{filters=usageFilters(input.filters);}catch{need(false,'invalid_report_filter');}
 need(Number.isSafeInteger(input.from)&&Number.isSafeInteger(input.to)&&input.from>=0&&input.from<=input.to&&input.to<=ctx.now,'invalid_report_range');
 const vault=await vaultFor(ctx,input.vault);
 need(vault.kind==='company'&&vault.owner===ctx.actor&&has(vault,'read'),'report_vault_owner_required',403);
 const {all,first}=access(ctx);
 const recipients=await all(`SELECT a.id AS account,o.status, (SELECT COUNT(*) FROM lky_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.generation=a.generation) AS enrolledDevices FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? AND a.tenant=? AND json_array_length(r.rights)>0 ORDER BY a.id`,vault.id,ctx.tenant);
 const predicates=[],args=[];
 for(const key of ['actor','item','action'])if(filters[key]!==undefined){predicates.push(`json_extract(d.facts,'$.${key}')=?`);args.push(filters[key]);}
 const rows=await all(`SELECT c.sequence,d.facts FROM lky_audit_chain c JOIN lky_audit_details d ON d.id=c.id WHERE c.tenant=? AND d.facts IS NOT NULL AND json_extract(d.facts,'$.vault')=? AND json_extract(d.facts,'$.time')>=? AND json_extract(d.facts,'$.time')<=? AND json_extract(d.facts,'$.result')='succeeded' ${predicates.map(p=>'AND '+p).join(' ')} ORDER BY c.sequence`,ctx.tenant,vault.id,input.from,input.to,...args);
 const events=rows.map(row=>{const f=JSON.parse(row.facts);return {sequence:row.sequence,actor:f.actor,item:f.item,action:f.action,time:f.time,receiptTime:f.receiptTime,policyVersion:f.policyVersion};});
 const adoption={scope:'Current recipients of this company vault; invitations without vault access are not included.',enrolled:recipients.length,active:recipients.filter(r=>r.status==='active').length,inactive:recipients.filter(r=>r.status==='inactive').length,devices:recipients.reduce((n,r)=>n+r.enrolledDevices,0),invited:null,neverUsed:null,extensionInstalled:null,mfa:null,weakUnlock:null};
 // Whole-installation roster totals require existing installation-owner authority.
 if(ctx.session.operator.role==='owner'){
  const roster=await all('SELECT o.status,a.id FROM oa_operators o LEFT JOIN lky_accounts a ON a.operator_id=o.id AND a.tenant=?',ctx.tenant);
  adoption.company={invited:roster.filter(r=>r.status==='invited').length,enrolled:roster.filter(r=>r.id).length,inactive:roster.filter(r=>r.status==='inactive').length};
 }
 need(await first(`SELECT 1 AS valid WHERE ${ctx.fence} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND revision=?)`,...ctx.fenceArgs,vault.id,ctx.actor,vault.revision),'report_source_changed',409);
 const source={vault:vault.id,revision:vault.revision,asOf:input.to,from:input.from,filters,adoption,recipients,events,retentionDays:365,coverage:['Connected authenticated human successes only; attempts and refusals excluded.','Machine, agent and offline event sources unavailable; no complete 12-month usage claim.','Installation and device counts do not establish extension installation, reachability, MFA or unlock strength.']};
 return {...source,fingerprint:await digest(canonicalJson([source.vault,source.revision,source.adoption,source.recipients]))};
}

async function ownerVault(input,ctx){const vault=await vaultFor(ctx,input.vault);need(vault.kind==='company'&&vault.owner===ctx.actor&&has(vault,'read'),'report_vault_owner_required',403);return vault;}
async function history(input,ctx){
 exact(input,['vault']);const vault=await ownerVault(input,ctx),{all,first}=access(ctx);
 const key=await first('SELECT * FROM lky_report_keys WHERE vault_id=?',vault.id);
 need(!key||key.owner===ctx.actor,'report_history_rewrap_required',409);
 const observations=await all('SELECT * FROM lky_report_observations WHERE vault_id=? ORDER BY as_of,id',vault.id);
 // Restore recipients have no rights until separately reviewed activation.
 need(await first(`SELECT 1 AS valid WHERE ${ctx.fence} AND EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND owner=? AND revision=?)`,...ctx.fenceArgs,vault.id,ctx.actor,vault.revision),'report_source_changed',409);
 return {key,observations,fingerprint:await digest(canonicalJson([key,observations]))};
}
async function capture(input,ctx){
 exact(input,['vault','id','asOf','from','revision','fingerprint','key','envelope','confirmed']);
 need(input.confirmed===true,'report_capture_confirmation_required');
 uuid(input.id);need(Number.isSafeInteger(input.asOf)&&input.asOf<=ctx.now&&input.asOf>=ctx.now-300000&&utcDay(input.asOf)===utcDay(ctx.now),'report_capture_must_be_current',409);
 const vault=await ownerVault(input,ctx),{first,stmt,event,guard}=access(ctx);
 const source=await reportsAuthenticated(reportRoute,{vault:vault.id,from:input.from,to:input.asOf,filters:{}},ctx);
 need(source.revision===input.revision&&source.fingerprint===input.fingerprint,'report_source_changed',409);
 validateEnvelope(input.envelope,observationContext(ctx.tenant,vault.id,input.id));
 need(await verifyWrapped(input.key,vault.authority_key,ctx.actor,reportKeyContext(ctx.tenant,vault.id,ctx.actor)),'invalid_report_key',403);
 const key=await first('SELECT * FROM lky_report_keys WHERE vault_id=?',vault.id);
 need(!key||key.owner===ctx.actor&&key.wrapped===canonicalJson(input.key),'report_history_key_changed',409);
 need(!await first('SELECT 1 FROM lky_report_observations WHERE vault_id=? AND day=?',vault.id,utcDay(input.asOf)),'report_day_already_captured',409);
 await guarded(ctx,[vault],[
  stmt('INSERT INTO lky_report_keys VALUES(?,?,?) ON CONFLICT(vault_id) DO NOTHING',vault.id,ctx.actor,canonicalJson(input.key)),
  stmt('INSERT INTO lky_report_observations VALUES(?,?,?,?,?,?)',input.id,vault.id,utcDay(input.asOf),input.asOf,input.revision,canonicalJson(input.envelope)),
  event('report_observation_captured',input.id)
 ],[guard(key?'EXISTS(SELECT 1 FROM lky_report_keys WHERE vault_id=? AND owner=? AND wrapped=?)':'NOT EXISTS(SELECT 1 FROM lky_report_keys WHERE vault_id=?)',key?[vault.id,ctx.actor,key.wrapped]:[vault.id])]);
 return {captured:input.id,day:utcDay(input.asOf),asOf:input.asOf};
}
