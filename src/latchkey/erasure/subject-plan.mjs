import { access, keyed, need, uuid } from './subject-common.mjs';
import { subjectSchema } from './subject-schema.mjs';
const contains = (value, terms) => typeof value === 'string' && terms.some(term => value.toLowerCase().includes(term.toLowerCase()));
export async function subjectPlan(ctx, subject) {
 uuid(subject);
 const {all,first}=access(ctx), schema=await subjectSchema(ctx);
 const person=await first('SELECT * FROM oa_operators WHERE id=?',subject);
 need(person,'subject_not_found',404);
 need(subject!==ctx.session.operator.id,'self_erasure_forbidden',409);
 const account=await first('SELECT * FROM lky_accounts WHERE operator_id=?',subject),accountId=account?.id??null;
 need(!account||account.tenant===ctx.tenant,'subject_not_found',404);
 need(person.role!=='owner' || !!await first("SELECT id FROM oa_operators WHERE role='owner' AND status='active' AND id<>?",subject),'last_owner',409);
 const identity=[person.id,accountId,person.email,person.display_name].filter(value=>typeof value==='string'&&value.length>=3), snapshots=[], changes=[];
 const select=async(table,where='1',args=[],action='delete',set=null)=>{
  const columns=await all(`PRAGMA table_info("${table}")`),keys=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  need(keys.length,'subject_schema_unmapped',409);
  const rows=await all(`SELECT * FROM ${table} WHERE ${where} ORDER BY ${keys.join(',')}`,...args);
  const entry={table,where,args,keys,columns:columns.map(c=>c.name),rows,action,set};snapshots.push(entry);if(action!=='observe')changes.push(entry);return rows;
 };
 const own='SELECT id FROM lky_vaults WHERE tenant=? AND owner=?',ownArgs=[ctx.tenant,accountId];
 const ownedVaults=await select('lky_vaults','tenant=? AND owner=?',ownArgs);
 const remainingVaults=await select('lky_vaults','tenant=? AND owner IS NOT ?',[ctx.tenant,accountId],'observe');
 const devices=await select('lky_devices','account_id=?',[accountId]),deviceIds=devices.map(row=>row.id);
 identity.push(...deviceIds);
 const groups=await select('lky_share_groups','tenant=? AND created_by=?',[ctx.tenant,accountId]),groupIds=groups.map(row=>row.id);
 const groupList=JSON.stringify(groupIds);
 const shares=await select('lky_shares',`tenant=? AND (source_account=? OR vault_id IN (${own}) OR group_id IN (SELECT value FROM json_each(?)))`,[ctx.tenant,accountId,...ownArgs,groupList]);
 const shareList=JSON.stringify(shares.map(row=>row.id));
 const links=await select('lky_links',`tenant=? AND (source_account=? OR vault_id IN (${own}) OR lower(recipient_email)=lower(?))`,[ctx.tenant,accountId,...ownArgs,person.email]);
 const linkList=JSON.stringify(links.map(row=>row.id));
 const recipients=await select('lky_recipients',`account_id=? OR vault_id IN (${own})`,[accountId,...ownArgs]);
 const shareKeys=await select('lky_share_keys','account_id=? OR share_id IN (SELECT value FROM json_each(?))',[accountId,shareList]);
 const affectedIds=new Set([...recipients.map(row=>row.vault_id),...remainingVaults.filter(vault=>shareKeys.some(k=>shares.some(s=>s.id===k.share_id&&s.vault_id===vault.id))).map(row=>row.id)]);
 // A received share's source grant may belong to somebody else.
 const received=await all('SELECT DISTINCT s.vault_id FROM lky_shares s JOIN lky_share_keys k ON k.share_id=s.id WHERE k.account_id=?',accountId);
 for(const row of received)affectedIds.add(row.vault_id);
 await select('lky_vault_capabilities',`account_id=? OR vault_id IN (${own})`,[accountId,...ownArgs]);
 await select('lky_lifecycle',`vault_id IN (${own})`,ownArgs);
 await select('lky_lifecycle',`vault_id NOT IN (${own}) AND instr(proof,?)>0`,[...ownArgs,accountId],'redact',row=>({...row,proof:null,retention_active:0}));
 await select('lky_bulk_operations',`actor=? OR instr(plan,?)>0`,[accountId,accountId]);
 const ownedVersions=await select('lky_versions',`vault_id IN (${own})`,ownArgs);
 await select('lky_link_challenges','link_id IN (SELECT value FROM json_each(?))',[linkList]);
 await select('lky_share_group_members','account_id=? OR group_id IN (SELECT value FROM json_each(?))',[accountId,groupList]);
 await select('lky_generator_policies','group_id IN (SELECT value FROM json_each(?))',[groupList]);
 const machines=await select('lky_machines',`account_id=? OR vault_id IN (${own})`,[accountId,...ownArgs]);
 const grants=await select('lky_grants','account_id=?',[accountId]);
 await select('lky_nonces','grant_hash IN (SELECT value FROM json_each(?))',[JSON.stringify(grants.map(row=>row.token_hash))]);
 for(const table of ['lky_exchanges','lky_password_changes','lky_enrollments'])await select(table,'account_id=?',[accountId]);
 await select('lky_registrations','operator_id=?',[subject]);
 await select('lky_restore_preparations');
 // Campaign snapshots and signed packages contain historical reviewer/subject
 // identities. Erasure invalidates affected packages rather than re-signing them.
 const reviews=await all('SELECT * FROM lky_reviews');
 const reviewRows=await all('SELECT * FROM lky_review_rows');
 const affectedReviews=reviews.filter(row=>contains(JSON.stringify(row),identity)||reviewRows.some(r=>r.review_id===row.id&&contains(JSON.stringify(r),identity))).map(row=>row.id);
 const reviewList=JSON.stringify(affectedReviews);
 await select('lky_review_rows','review_id IN (SELECT value FROM json_each(?))',[reviewList]);
 await select('lky_review_reminders','review_id IN (SELECT value FROM json_each(?))',[reviewList]);
 await select('lky_evidence_deliveries','review_id IN (SELECT value FROM json_each(?)) OR owner=?',[reviewList,accountId]);
 await select('lky_evidence_destinations','owner=?',[accountId]);
 await select('lky_reviews','id IN (SELECT value FROM json_each(?))',[reviewList]);
 const erased=await select('lky_erased_items',`vault_id IN (${own}) OR erased_by=? OR erased_device IN (SELECT value FROM json_each(?)) OR instr(proof,?)>0`,[...ownArgs,accountId,JSON.stringify(deviceIds),accountId]);
 await select('lky_subject_invalidations',`vault_id IN (${own})`,ownArgs);
 await select('oa_external_identities','operator_id=?',[subject]);
 const tokens=await select('oa_tokens','operator_id=? OR issuer_id=?',[subject,subject]);
 const sessions=await select('oa_sessions','operator_id=? OR source_token_id IN (SELECT value FROM json_each(?))',[subject,JSON.stringify(tokens.map(row=>row.id))]);
 const sessionList=JSON.stringify(sessions.map(row=>row.id));
 for(const table of ['oa_provider_sessions','oa_provider_session_pins'])await select(table,'session_id IN (SELECT value FROM json_each(?))',[sessionList]);
 for(const table of ['oa_credentials','oa_owner_signins','oa_invitation_cancellations'])await select(table,'operator_id=?',[subject]);
 await select('oa_step_up_challenges','operator_id=? OR session_id IN (SELECT value FROM json_each(?))',[subject,sessionList]);
 await select('oa_dev_credentials','id=? OR id IN (SELECT value FROM json_each(?))',[subject,JSON.stringify([...tokens.map(row=>row.id),...sessions.map(row=>row.id)])]);
 await select('oa_setup_links','owner_id=? OR session_id IN (SELECT value FROM json_each(?))',[subject,sessionList]);
 await select('rer_dependency_pending','approved_by=? OR approved_session IN (SELECT value FROM json_each(?))',[subject,sessionList]);
 // A hashed limiter cannot be reliably attributed back to a person. Clear
 // ephemeral limiter/flow state rather than retain an unprovable identity copy.
 for(const table of ['oa_limits','oa_oidc_limits','oa_oidc_transactions','lky_limits'])await select(table);
 const markerArgs=identity.flatMap(term=>[term]),matches=column=>identity.map(()=>`instr(lower(CAST(${column} AS TEXT)),lower(?))>0`).join(' OR ');
 await select('rer_mail_development_outbox',matches('message'),markerArgs);
 await select('rer_command_receipts',`${matches('actor')} OR ${matches('result')} OR ${matches('once')}`,[...markerArgs,...markerArgs,...markerArgs]);
 const auditIds=[...identity,...ownedVaults.map(row=>row.id),...ownedVersions.map(row=>row.object_id),...machines.map(row=>row.id),...groups.map(row=>row.id),...shares.map(row=>row.id),...links.map(row=>row.id),...erased.map(row=>row.receipt_id)];
 const anon='__SUBJECT_ANON__',same=value=>identity.includes(value),ref=value=>auditIds.includes(value)?anon:value;
 const redact=async(table,predicate,convert)=>{
  const rows=await all(`SELECT * FROM ${table}`),selected=rows.filter(predicate);if(!selected.length)return;
  const keys=(await all(`PRAGMA table_info(${table})`)).filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  const clauses=selected.map(()=>`(${keys.map(k=>`${k}=?`).join(' AND ')})`).join(' OR '),args=selected.flatMap(row=>keys.map(k=>row[k]));
  await select(table,clauses,args,'redact',convert);
 };
 await redact('lky_events',row=>same(row.actor)||same(row.device)||auditIds.includes(row.object_id),row=>({...row,actor:ref(row.actor),device:ref(row.device),object_id:ref(row.object_id)}));
 await redact('oa_auth_audit',row=>same(row.actor_id)||contains(row.value,identity),row=>({...row,actor_id:same(row.actor_id)?anon:row.actor_id,value:'{}'}));
 await redact('lky_generator_policy_changes',row=>same(row.actor)||same(row.device)||groupIds.includes(row.group_id)||contains(row.reason,identity),row=>({...row,actor:ref(row.actor),device:ref(row.device),group_id:groupIds.includes(row.group_id)?null:row.group_id,reason:'',policy:'{}'}));
 await redact('lky_restore_history',row=>same(row.source_account)||same(row.destination_account)||contains(row.vaults,identity)||ownedVaults.some(v=>contains(row.vaults,[v.id]))||contains(row.activation,identity),row=>({...row,source_account:ref(row.source_account),destination_account:ref(row.destination_account),vaults:'[]',activation:'erased-subject',plan_hash:anon,content_hash:anon,archive_hash:anon}));
 await redact('oa_policy_approvals',row=>row.owner_id===subject||contains(row.definition,identity)||contains(row.actions,identity),row=>({...row,owner_id:row.owner_id===subject?anon:row.owner_id,policy_id:anon,definition:'{}',actions:'[]',revoked_at:ctx.now,revoke_reason:'erased-subject',version_hash:anon}));
 const redactedApprovals=changes.filter(entry=>entry.table==='oa_policy_approvals').flatMap(entry=>entry.rows.map(row=>row.id));
 await redact('oa_policy_runs',row=>row.approved_by===subject||redactedApprovals.includes(row.approval_id)||contains(row.error,identity),row=>({...row,approved_by:row.approved_by===subject?anon:row.approved_by,policy_id:anon,error:null,version_hash:anon}));
 for(const [table,column]of [['oa_domain_rules','created_by'],['oa_first_run','completed_by'],['oa_bootstrap','claim_id']])await redact(table,row=>row[column]===subject,row=>({...row,[column]:anon}));
 await redact('oc_owner_claims',row=>row.operator_id===subject||row.email.toLowerCase()===person.email.toLowerCase(),row=>({...row,operator_id:anon,session_id:anon,email:`${anon}@removed.invalid`,jti:anon}));
 const external=await all('SELECT issuer,subject FROM oa_external_identities WHERE operator_id=?',subject);
 for(const row of external)await select('oc_idp_grants','issuer=? AND subject=?',[row.issuer,row.subject]);
 await select('oc_idp_grants','subject=? OR lower(subject)=lower(?)',[subject,person.email]);
 // Base erasure operation state is owned by Base's runner. It cannot safely be
 // rewritten behind that runner or called complete by this separate flow.
 const baseOps=await all('SELECT * FROM rer_erasure_operations'),baseScope=await all('SELECT * FROM rer_erasure_scope');
 need(!baseOps.some(row=>contains(JSON.stringify(row),identity))&&!baseScope.some(row=>contains(JSON.stringify(row),identity)),'base_erasure_pending',409);
 for(const table of ['rer_dependency_link','oa_identity_providers','oa_sharing_policy','oa_domain_rules']){
  if(!schema.some(row=>row.name===table))continue;
  const rows=await all(`SELECT * FROM ${table}`);
  need(!rows.some(row=>contains(JSON.stringify(row),identity)&&!changes.some(entry=>entry.table===table&&entry.rows.some(old=>JSON.stringify(old)===JSON.stringify(row)))),'subject_configuration_hold',409);
 }
 await select('lky_accounts','id=?',[accountId]);await select('oa_operators','id=?',[subject]);
 // Every remaining readable column is checked too: a source/cache adapter
 // cannot silently introduce a second unclassified copy of this identity.
 // Encrypted client material is explicitly outstanding, never claimed clean.
 const opaque={lky_versions:['envelope'],lky_devices:['bundle'],lky_accounts:['opaque_setup','opaque_record','recovery_wrap'],lky_recipients:['wrapped_key'],lky_share_keys:['wrapped_key'],lky_links:['envelope'],rer_dependency_keys:['private_key']};
 const observed=new Set(['lky_versions','lky_devices','lky_accounts','lky_nonces','rer_dependency_keys']);
 for(const table of schema.map(row=>row.name).filter(name=>!name.startsWith('sqlite_')&&!name.startsWith('_cf_')&&!name.startsWith('rer_portability_')&&!['d1_migrations','rer_migrations','_rer_deploy_migrations','_rer_portability_migrations'].includes(name))){
  const columns=await all(`PRAGMA table_info(${table})`),keys=columns.filter(c=>c.pk).sort((a,b)=>a.pk-b.pk).map(c=>c.name);
  if(!keys.length)continue;
  const rows=await all(`SELECT * FROM ${table}`);
  for(const row of rows){
   const matchesRow=entry=>entry.table===table&&entry.rows.some(old=>keys.every(key=>old[key]===row[key]));
   if(changes.some(entry=>entry.action==='delete'&&matchesRow(entry)))continue;
   const redacted=changes.find(entry=>entry.action==='redact'&&matchesRow(entry)),next=redacted?redacted.set(row):row;
   need(!Object.entries(next).some(([column,value])=>!opaque[table]?.includes(column)&&contains(value,identity)),'subject_unmapped_content',409);
   if(table==='lky_recipients'&&contains(row.wrapped_key,identity)&&!ownedVaults.some(v=>v.id===row.vault_id))affectedIds.add(row.vault_id);
  }
  if(!observed.has(table))await select(table,'1',[],'observe');
 }
 const affected=remainingVaults.filter(v=>affectedIds.has(v.id));
 const outstanding=[{domain:'encrypted-client-content',state:'pending',vaults:remainingVaults.map(v=>v.id),reason:'Client decryption and authorized redaction of other owners ciphertext are required.'},{domain:'disconnected-device-cache',state:'outstanding',devices:devices.length,reason:'Unreachable caches have no default expiry; previously copied values cannot be recalled.'},{domain:'provider-rotation-and-external-copies',state:'pending',vaults:affected.map(v=>v.id),reason:'Provider deletion and rotation require separately observed results.'},{domain:'backup-expiry',state:'pending',reason:'Downloaded archives and provider backups cannot be recalled; restore requires the latest journal and separately held erasure key.'}];
 const counts={};for(const entry of changes)counts[`${entry.action}:${entry.table}`]=(counts[`${entry.action}:${entry.table}`]??0)+entry.rows.length;
 // Consent binds the reviewed deletion/redaction scope, not unrelated live
 // observations such as another account's authentication nonce. The latter
 // are still checked against this request's snapshot in the atomic commit.
 const planHash=await keyed(ctx,'plan',{subject,account:accountId,schema,changes:changes.map(({set,...entry})=>entry),ownedVaults,affected});
 return {person,account,schema,snapshots,changes,ownedVaults,ownedVersions,machines,groups,affected,remainingVaults,devices,external,erased,identity,auditIds,counts,outstanding,planHash};
}
