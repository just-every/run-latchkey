import {access,exact,need,vaultFor} from '../lifecycle/common.mjs';
import {usageFilters} from './filters.mjs';
import {reportRoute} from './service-route.mjs';
export async function reportsAuthenticated(route,input,ctx){
 if(route!==reportRoute)return null;
 exact(input,['vault','from','to',...(input.filters===undefined?[]:['filters'])]);
 let filters;try{filters=usageFilters(input.filters);}catch{need(false,'invalid_report_filter');}
 need(Number.isSafeInteger(input.from)&&Number.isSafeInteger(input.to)&&input.from>=0&&input.from<=input.to&&input.to<=ctx.now,'invalid_report_range');
 const vault=await vaultFor(ctx,input.vault);
 need(vault.kind==='company'&&vault.owner===ctx.actor,'report_vault_owner_required',403);
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
 return {vault:vault.id,revision:vault.revision,asOf:input.to,from:input.from,filters,adoption,recipients,events,retentionDays:365,coverage:['Connected authenticated human successes only; attempts and refusals excluded.','Machine, agent and offline event sources unavailable; no complete 12-month usage claim.','Installation and device counts do not establish extension installation, reachability, MFA or unlock strength.']};
}
