import { access, exact, guarded, has, id, need, uuid, vaultFor, canonicalJson } from '../lifecycle/common.mjs';
import { digest } from '../crypto/envelope.mjs';
const path = (...parts) => parts.join('/');
const name = path.bind(null,'rules');
const integer = (value,min,max) => Number.isSafeInteger(value)&&value>=min&&value<=max;
const owner = ctx => need(ctx.session.operator.role==='owner','rule_owner_required',403);
async function definition(ctx,value) {
 exact(value,['title','kind','vault','targets','severity','recipients','startAt','intervalMs','windowMs','maxEffects']);
 need(typeof value.title==='string'&&value.title.trim().length>0&&value.title.length<=120,'invalid_rule_title');
 need(['expiry','review','rotation','anomaly'].includes(value.kind),'forbidden_rule_effect',403);
 need(['warning','critical'].includes(value.severity),'invalid_rule_severity');
 need(integer(value.startAt,0,8640000000000000)&&integer(value.intervalMs,60000,366*86400000)&&integer(value.windowMs,60000,value.intervalMs),'invalid_rule_schedule');
 need(integer(value.maxEffects,1,100),'invalid_rule_bound');
 const vault=await vaultFor(ctx,value.vault);need(vault.owner===ctx.actor&&vault.kind==='company'&&has(vault,'read'),'rule_owner_required',403);
 need(Array.isArray(value.targets)&&value.targets.length>0&&value.targets.length<=100&&new Set(value.targets.map(t=>t.object)).size===value.targets.length,'invalid_rule_targets');
 const {first}=access(ctx);
 for(const target of value.targets){
  exact(target,['object','version','dueAt']);uuid(target.object);need(integer(target.version,1,Number.MAX_SAFE_INTEGER)&&integer(target.dueAt,0,8640000000000000),'invalid_rule_target');
  const latest=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,target.object);
  need(latest?.version===target.version&&!await first("SELECT 1 FROM lky_lifecycle WHERE vault_id=? AND object_id=? AND state<>'active'",vault.id,target.object),'rule_target_changed',409);
 }
 need(Array.isArray(value.recipients)&&value.recipients.length>0&&value.recipients.length<=20&&new Set(value.recipients).size===value.recipients.length,'invalid_rule_recipients');
 for(const recipient of value.recipients){uuid(recipient);need(await first("SELECT 1 FROM lky_recipients r JOIN lky_accounts a ON a.id=r.account_id JOIN oa_operators o ON o.id=a.operator_id WHERE r.vault_id=? AND r.account_id=? AND a.tenant=? AND o.status='active' AND EXISTS(SELECT 1 FROM json_each(r.rights) WHERE value='read')",vault.id,recipient,ctx.tenant),'rule_recipient_unavailable',403)}
 need(value.targets.length*value.recipients.length<=value.maxEffects,'rule_effect_limit');
 return vault;
}
async function rowFor(ctx,rule) {
 const row=await access(ctx).first('SELECT * FROM lky_rules WHERE id=? AND tenant=? AND owner=?',uuid(rule),ctx.tenant,ctx.actor);
 need(row,'rule_not_found',404);return row;
}
async function snapshot(ctx,row) {
 const {all}=access(ctx);
 return {...row,versions:(await all('SELECT * FROM lky_rule_versions WHERE rule_id=? ORDER BY version',row.id)).map(v=>({...v,definition:JSON.parse(v.definition)})),runs:await all('SELECT * FROM lky_rule_runs WHERE rule_id=? ORDER BY slot,version',row.id),obligations:await all('SELECT o.* FROM lky_rule_obligations o JOIN lky_rule_runs r ON r.id=o.run_id WHERE r.rule_id=? ORDER BY o.created_at,o.id',row.id),decisions:await all('SELECT d.* FROM lky_rule_decisions d JOIN lky_rule_obligations o ON o.id=d.obligation JOIN lky_rule_runs r ON r.id=o.run_id WHERE r.rule_id=? ORDER BY d.created_at,d.id',row.id)};
}
async function preview(ctx,value) {
 const vault=await definition(ctx,value);
 const view={definition:value,vaultRevision:vault.revision,vaultEpoch:vault.epoch,targets:value.targets,recipients:value.recipients,severity:value.severity,approvalPolicy:'exact-human-decision-per-rotation',externalEffects:0,maximumObligations:value.maxEffects,maintenanceWindow:{startAt:value.startAt,windowMs:value.windowMs},observations:'Owner-supplied metadata bound to exact encrypted item versions; contents are not inspected by the scheduler.'};
 return {vault,view:{...view,hash:await digest(canonicalJson(view))}};
}
export async function rulesAuthenticated(route,input,ctx) {
 if(!route.startsWith(name()+'/'))return null;
 const {first,all,stmt,event,guard}=access(ctx);
 // A recipient sees only currently authorized in-app obligations, never rule definitions.
 if(route===name('inbox')){
  exact(input,[]);return all("SELECT o.*,r.rule_id,v.definition FROM lky_rule_obligations o JOIN lky_rule_runs r ON r.id=o.run_id JOIN lky_rules c ON c.id=r.rule_id JOIN lky_rule_versions v ON v.rule_id=r.rule_id AND v.version=r.version JOIN lky_recipients p ON p.vault_id=json_extract(v.definition,'$.vault') AND p.account_id=o.recipient WHERE c.tenant=? AND o.recipient=? AND o.phase<>'inactive' AND EXISTS(SELECT 1 FROM json_each(p.rights) WHERE value='read') ORDER BY o.created_at,o.id LIMIT 100",ctx.tenant,ctx.actor).then(rows=>rows.map(({definition,...row})=>({...row,delivery:'in-app',severity:JSON.parse(definition).severity})))
 }
 owner(ctx);
 if(route===name('list')){exact(input,[]);return all('SELECT * FROM lky_rules WHERE tenant=? AND owner=? ORDER BY created_at,id',ctx.tenant,ctx.actor)}
 if(route===name('preview')){exact(input,['definition']);return (await preview(ctx,input.definition)).view}
 if(route===name('save')){
  exact(input,['rule','version','definition']);const previous=input.rule===null?null:await rowFor(ctx,input.rule);need(input.version===(previous?.version??0),'rule_changed',409);
  const vault=await definition(ctx,input.definition),rule=previous?.id??id(),version=input.version+1;
  await guarded(ctx,[vault],[...(previous?[stmt('UPDATE lky_rules SET version=?,active=0 WHERE id=?',version,rule),stmt("UPDATE lky_rule_obligations SET phase='superseded' WHERE phase IN ('waiting-approval','approved','open') AND run_id IN(SELECT id FROM lky_rule_runs WHERE rule_id=?)",rule)]:[stmt('INSERT INTO lky_rules VALUES(?,?,?,?,0,?)',rule,ctx.tenant,ctx.actor,version,ctx.now)]),stmt('INSERT INTO lky_rule_versions VALUES(?,?,?,?)',rule,version,canonicalJson(input.definition),ctx.now),event('rule_version_saved',rule)],previous?[guard('EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=?)',[rule,input.version])]:[]);
  return snapshot(ctx,await rowFor(ctx,rule));
 }
 const row=await rowFor(ctx,input.rule);
 if(route===name('get')){exact(input,['rule']);return snapshot(ctx,row)}
 const current=await first('SELECT definition FROM lky_rule_versions WHERE rule_id=? AND version=?',row.id,row.version),value=JSON.parse(current.definition);
 if(route===name('activate')){
  exact(input,['rule','version','previewHash','confirmed']);need(input.confirmed===true,'rule_confirmation_required',403);need(input.version===row.version,'rule_changed',409);const {vault,view}=await preview(ctx,value);need(input.previewHash===view.hash,'rule_preview_changed',409);
  await guarded(ctx,[vault],[stmt('UPDATE lky_rules SET active=1 WHERE id=?',row.id),event('rule_activated',row.id)],[guard('EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=?)',[row.id,row.version])]);return snapshot(ctx,await rowFor(ctx,row.id));
 }
 if(route===name('cancel')){
  exact(input,['rule','version']);need(input.version===row.version,'rule_changed',409);const vault=await vaultFor(ctx,value.vault);need(vault.owner===ctx.actor,'rule_owner_required',403);
  await guarded(ctx,[vault],[stmt('UPDATE lky_rules SET active=0 WHERE id=?',row.id),stmt("UPDATE lky_rule_obligations SET phase='cancelled' WHERE phase IN ('waiting-approval','approved','open') AND run_id IN(SELECT id FROM lky_rule_runs WHERE rule_id=?)",row.id),event('rule_cancelled',row.id)],[guard('EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=?)',[row.id,row.version])]);return snapshot(ctx,await rowFor(ctx,row.id));
 }
 if(route===name('decide')){
  exact(input,['rule','version','obligation','decision','confirmed']);need(input.confirmed===true,'rule_confirmation_required',403);need(row.active===1&&row.version===input.version,'rule_changed',409);need(['approve','deny'].includes(input.decision),'invalid_rule_decision');
  const obligation=await first('SELECT o.* FROM lky_rule_obligations o JOIN lky_rule_runs r ON r.id=o.run_id WHERE o.id=? AND r.rule_id=? AND r.version=?',uuid(input.obligation),row.id,row.version);need(obligation?.phase==='waiting-approval','rule_approval_unavailable',409);
  const vault=await definition(ctx,value);
  await guarded(ctx,[vault],[stmt('INSERT INTO lky_rule_decisions VALUES(?,?,?,?,?)',id(),obligation.id,ctx.actor,input.decision,ctx.now),stmt('UPDATE lky_rule_obligations SET phase=? WHERE id=?',input.decision==='approve'?'approved':'denied',obligation.id),event('rule_rotation_decided',row.id)],[guard("EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=? AND active=1)",[row.id,row.version]),guard("EXISTS(SELECT 1 FROM lky_rule_obligations WHERE id=? AND phase='waiting-approval')",[obligation.id])]);return snapshot(ctx,await rowFor(ctx,row.id));
 }
 if(route===name('complete')){
  exact(input,['rule','version','obligation','resultVersion','confirmed']);need(input.confirmed===true,'rule_confirmation_required',403);need(row.active===1&&row.version===input.version,'rule_changed',409);need(value.kind==='rotation','rule_rotation_required');
  const obligation=await first('SELECT o.* FROM lky_rule_obligations o JOIN lky_rule_runs r ON r.id=o.run_id WHERE o.id=? AND r.rule_id=? AND r.version=?',uuid(input.obligation),row.id,row.version);need(obligation?.phase==='approved','rule_approval_required',403);
  const vault=await vaultFor(ctx,value.vault);need(vault.owner===ctx.actor&&has(vault,'read')&&has(vault,'rotate'),'rule_owner_required',403);
  const latest=await first('SELECT MAX(version) AS version FROM lky_versions WHERE vault_id=? AND object_id=?',vault.id,obligation.object_id);need(latest.version===input.resultVersion&&input.resultVersion>obligation.source_version,'rule_result_not_observed',409);
  await guarded(ctx,[vault],[stmt("UPDATE lky_rule_obligations SET phase='vault-result-recorded',result_version=? WHERE id=?",input.resultVersion,obligation.id),event('rule_vault_result_observed',row.id)],[guard('EXISTS(SELECT 1 FROM lky_rules WHERE id=? AND version=? AND active=1)',[row.id,row.version]),guard("EXISTS(SELECT 1 FROM lky_rule_obligations WHERE id=? AND phase='approved')",[obligation.id])]);
  return {state:'vault-result-recorded',resultVersion:input.resultVersion,providerState:'unknown',verification:'Observed encrypted vault version only; provider verification remains outstanding.'};
 }
 need(false,'rule_route_not_found',404);
}
