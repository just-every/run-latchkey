import * as opaque from '@serenity-kit/opaque';
import { access, exact, guarded, need, uuid } from '../lifecycle/common.mjs';
import { id, publicKey, validateEnvelope, verify, verifyWrapped } from '../crypto/envelope.mjs';
import { operatorMail } from '../../mail.server.mjs';
const prefix = ['recovery',''].join('/');
const binding=(tenant,object,purpose,epoch)=>({tenant,vault:'account',object,purpose,epoch,version:1});
export const recoveryText=input=>JSON.stringify(['latchkey-recovery-v1',input]);
async function notice(ctx,operator,stage) {
 const person=await access(ctx).first("SELECT email FROM oa_operators WHERE id=? AND status='active'",operator);
 const sender=operatorMail(ctx.env);need(person&&sender&&ctx.env.MAIL_FROM,'recovery_notice_unavailable',503);
 let result;try{result=await sender.send({deliveryId:id(),from:ctx.env.MAIL_FROM,to:[person.email],subject:'Latchkey recovery notice',text:`A ${stage} was authorized for your Latchkey account. Sign in to review recovery or cancel a pending emergency request. No recovery material is included.`,html:`<p>A ${stage} was authorized for your Latchkey account. Sign in to review recovery or cancel a pending emergency request.</p>`,headers:{'Auto-Submitted':'auto-generated'}})}catch{need(false,'recovery_notice_unavailable',503)}
 need(result?.status==='accepted'||result?.status==='development'&&ctx.env.AUTH_LOCAL==='true','recovery_notice_unavailable',503);
}
const activeAccount=async(ctx,account)=>access(ctx).first("SELECT a.*,o.role,o.status FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.tenant=? AND o.status='active'",account,ctx.tenant);
async function enrollmentFor(ctx,enrollment) {
 const row=await access(ctx).first('SELECT * FROM lky_recovery_custody WHERE id=? AND account=? AND generation=? AND revoked_at IS NULL',uuid(enrollment),ctx.actor,ctx.generation);
 need(row,'recovery_enrollment_unavailable',403);return row;
}
// These doors require a verified member session, but never a remembered vault password.
export async function recoverySession(route,input,ctx) {
 if(!route.startsWith(prefix+'session/'))return null;
 const dbAccess=access(ctx); const stmt=(sql,...args)=>{need(args.every(value=>value!==undefined),'recovery_binding_missing');return dbAccess.stmt(sql,...args)};const {first,all,guard,event}=dbAccess,action=route.slice((prefix+'session/').length);
 const account=await first('SELECT * FROM lky_accounts WHERE operator_id=?',ctx.session.operator.id);need(account,'recovery_unavailable',403);
 Object.assign(ctx,{actor:account.id,tenant:account.tenant,generation:account.generation,device:'verified-session',fence:"EXISTS(SELECT 1 FROM oa_sessions s JOIN oa_operators o ON o.id=s.operator_id JOIN lky_accounts a ON a.operator_id=o.id WHERE s.id=? AND s.revoked_at IS NULL AND s.expires_at>? AND s.operator_version=o.version AND o.status='active' AND a.id=? AND a.generation=?)",fenceArgs:[ctx.session.id,ctx.now,account.id,account.generation]});
 if(action==='start') {
  exact(input,['enrollment','request','transferKey']);const enrolled=await enrollmentFor(ctx,input.enrollment);
  need(await first("SELECT 1 FROM oa_sessions s JOIN oa_tokens t ON t.id=s.source_token_id WHERE s.id=? AND s.kind='native' AND t.consumed_at IS NOT NULL AND s.created_at>?",ctx.session.id,ctx.now-300000),'fresh_verified_identity_required',403);
  await publicKey(input.transferKey,'wrap');need(typeof input.request==='string'&&input.request.length<4096);
  if(enrolled.kind==='administrator') {const admin=await activeAccount(ctx,enrolled.custodian);need(admin?.role==='owner'&&admin.generation===enrolled.custodian_generation,'recovery_administrator_unavailable',403)}
  await opaque.ready;const setup=opaque.server.createSetup(),result=opaque.server.createRegistrationResponse({serverSetup:setup,userIdentifier:account.id,registrationRequest:input.request}),operation=id();
  await notice(ctx,account.operator_id,'vault recovery request');
  await guarded(ctx,[],[stmt('INSERT INTO lky_recovery_cases VALUES(?,?,?,?,?,?,?,?,NULL,NULL)',operation,enrolled.id,account.id,account.generation,ctx.session.id,setup,input.transferKey,ctx.now+240000),event('recovery_requested',operation)]);
  return {operation,response:result.registrationResponse,serverKey:opaque.server.getPublicKey(setup),account:account.id,tenant:account.tenant,generation:account.generation,recipientKey:account.recipient_key,authorityKey:account.authority_key,recoveryKey:account.recovery_key,expiresAt:ctx.now+240000,verifiedEmail:ctx.session.operator.email,approval:enrolled.kind==='administrator'?'named-administrator-required':'client-held-code-required',identityCheck:'fresh-verified-member-channel',mfa:'unchanged',offlineExposure:'unreachable-caches-and-previous-copies-cannot-be-recalled',vaults:await all('SELECT v.id,v.kind FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? ORDER BY v.id',account.id),devices:await all('SELECT id,revoked_at FROM lky_devices WHERE account_id=? ORDER BY id',account.id)};
 }
 if(action==='status'||action==='finish') {
  const operation=await first('SELECT * FROM lky_recovery_cases WHERE id=? AND account=? AND session_id=? AND generation=? AND expires_at>? AND consumed_at IS NULL',uuid(input.operation),account.id,ctx.session.id,account.generation,ctx.now);need(operation,'recovery_case_expired',409);
  const enrolled=await enrollmentFor(ctx,operation.enrollment);
  if(enrolled.kind==='administrator'){const admin=await activeAccount(ctx,enrolled.custodian);need(admin?.role==='owner'&&admin.generation===enrolled.custodian_generation,'recovery_administrator_unavailable',403)}
  if(action==='status'){exact(input,['operation']);return {approved:!!operation.approved_wrap,wrapped:operation.approved_wrap?JSON.parse(operation.approved_wrap):null,custodian:enrolled.custodian}}
  exact(input,['operation','record','device','deviceKey','bundle','recoveryKey','recoveryWrap','signature']);
  need(enrolled.kind==='self'||operation.approved_wrap,'recovery_approval_required',403);
  const {signature,...signed}=input;need(await verify(account.recovery_key,signature,recoveryText(signed)),'recovery_possession_required',403);
  need(typeof input.record==='string'&&input.record.length<4096);await publicKey(input.deviceKey,'sign');await publicKey(input.recoveryKey,'sign');const target=uuid(input.device),next=account.generation+1;
  validateEnvelope(input.bundle,binding(ctx.tenant,target,'device',next));validateEnvelope(input.recoveryWrap,binding(ctx.tenant,account.id,'recovery',next));
  await notice(ctx,account.operator_id,'vault recovery completion');
  await guarded(ctx,[],[
   stmt('UPDATE lky_accounts SET opaque_setup=?,opaque_record=?,generation=?,recovery_key=?,recovery_wrap=?,mutation=? WHERE id=?',operation.setup,input.record,next,input.recoveryKey,JSON.stringify(input.recoveryWrap),target,account.id),
   stmt('UPDATE lky_devices SET revoked_at=? WHERE account_id=?',ctx.now,account.id),
   stmt('INSERT INTO lky_devices VALUES(?,?,?,?,?,NULL)',target,account.id,input.deviceKey,JSON.stringify(input.bundle),next),
   stmt('UPDATE oa_sessions SET revoked_at=? WHERE operator_id=?',ctx.now,account.operator_id),
   stmt('DELETE FROM lky_grants WHERE account_id=?',account.id),
   stmt('UPDATE lky_recovery_custody SET revoked_at=? WHERE account=?',ctx.now,account.id),
   stmt('UPDATE lky_recovery_cases SET consumed_at=? WHERE account=?',ctx.now,account.id),
   event('vault_secret_recovered',operation.id),
  ],[guard('EXISTS(SELECT 1 FROM lky_recovery_cases WHERE id=? AND consumed_at IS NULL AND expires_at>?)',[operation.id,ctx.now]),guard('EXISTS(SELECT 1 FROM lky_recovery_custody WHERE id=? AND revoked_at IS NULL)',[enrolled.id]),...(enrolled.kind==='administrator'?[guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND o.status='active' AND o.role='owner')",[enrolled.custodian,enrolled.custodian_generation])]:[])]);
  return {recovered:true,generation:next,mfa:'unchanged'};
 }
 need(false,'not_found',404);
}
export async function recoveryAuthenticated(route,input,ctx) {
 if(!route.startsWith(prefix))return null;
 const {first,all,stmt,guard,event}=access(ctx),action=route.slice(prefix.length);
 const account=await activeAccount(ctx,ctx.actor);need(account,'recovery_unavailable',403);
 if(action==='enroll') {
  exact(input,['enrollment','kind','custodian','wrapped','confirmed']);need(input.confirmed===true,'recovery_confirmation_required',403);const enrollment=uuid(input.enrollment);
  need(['self','administrator'].includes(input.kind));let admin=null;
  if(input.kind==='administrator') {
   admin=await activeAccount(ctx,uuid(input.custodian));need(admin?.role==='owner'&&admin.id!==ctx.actor,'named_recovery_administrator_required',403);
   need(!await first("SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.kind='family'",ctx.actor),'independent_family_account_required',403);
   need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,binding(ctx.tenant,enrollment,'administrator-recovery',account.generation)),'invalid_key_signature',403);
  }else{need(input.custodian===null);validateEnvelope(input.wrapped,binding(ctx.tenant,enrollment,'self-recovery',account.generation))}
  await notice(ctx,account.operator_id,'recovery enrollment');
  await guarded(ctx,[],[stmt('INSERT INTO lky_recovery_custody VALUES(?,?,?,?,?,?,?,NULL)',enrollment,ctx.actor,account.generation,input.kind,admin?.id??null,admin?.generation??null,JSON.stringify(input.wrapped)),event('recovery_enrolled',enrollment)],admin?[guard("NOT EXISTS(SELECT 1 FROM lky_vaults v JOIN lky_recipients r ON r.vault_id=v.id WHERE r.account_id=? AND v.kind='family')",[ctx.actor]),guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id WHERE a.id=? AND a.generation=? AND o.role='owner' AND o.status='active')",[admin.id,admin.generation])]:[]);
  return {enrollment,kind:input.kind,custodian:admin?.id??null};
 }
 if(action==='revoke') {exact(input,['enrollment']);await guarded(ctx,[],[stmt('UPDATE lky_recovery_custody SET revoked_at=? WHERE id=? AND account=?',ctx.now,uuid(input.enrollment),ctx.actor),event('recovery_revoked',input.enrollment)]);return {revoked:true}}
 if(action==='administrator-review'||action==='administrator-approve') {
  const operation=await first("SELECT c.*,e.custodian,e.custodian_generation,e.wrapped,a.authority_key,a.operator_id FROM lky_recovery_cases c JOIN lky_recovery_custody e ON e.id=c.enrollment JOIN lky_accounts a ON a.id=c.account JOIN oa_operators o ON o.id=a.operator_id WHERE c.id=? AND e.custodian=? AND e.kind='administrator' AND e.revoked_at IS NULL AND c.generation=a.generation AND e.generation=a.generation AND c.consumed_at IS NULL AND c.expires_at>? AND o.status='active'",uuid(input.operation),ctx.actor,ctx.now);
  need(operation&&account.role==='owner'&&account.generation===operation.custodian_generation,'named_recovery_administrator_required',403);
  if(action==='administrator-review'){exact(input,['operation']);return {operation:operation.id,enrollment:operation.enrollment,account:operation.account,tenant:ctx.tenant,generation:operation.generation,authorityKey:operation.authority_key,transferKey:operation.transfer_key,wrapped:JSON.parse(operation.wrapped),identityCheck:'verified-member-session-and-explicit-human-review',expiresAt:operation.expires_at}}
  exact(input,['operation','wrapped','identityChecked','confirmed']);need(input.confirmed===true&&input.identityChecked===true,'identity_review_required',403);
  need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,binding(ctx.tenant,operation.id,'recovery-approval',operation.generation)),'invalid_key_signature',403);
  await guarded(ctx,[],[stmt('UPDATE lky_recovery_cases SET approved_wrap=? WHERE id=?',JSON.stringify(input.wrapped),operation.id),event('recovery_approved',operation.id)],[guard('EXISTS(SELECT 1 FROM lky_recovery_cases c JOIN lky_recovery_custody e ON e.id=c.enrollment JOIN lky_accounts a ON a.id=c.account WHERE c.id=? AND c.consumed_at IS NULL AND c.expires_at>? AND e.revoked_at IS NULL AND a.generation=c.generation AND a.generation=e.generation)',[operation.id,ctx.now])]);return {approved:true};
 }
 if(action==='emergency-enroll') {
  exact(input,['contact','vault','waitMs','expiresAt','wrapped','enrollment','confirmed']);need(input.confirmed===true,'recovery_confirmation_required',403);
  const contact=await activeAccount(ctx,uuid(input.contact));need(contact&&contact.id!==ctx.actor,'emergency_contact_required',403);
  const vault=await first("SELECT * FROM lky_vaults WHERE id=? AND tenant=? AND owner=? AND kind='family'",uuid(input.vault),ctx.tenant,ctx.actor);need(vault,'personal_scope_required',403);
  need(Number.isSafeInteger(input.waitMs)&&input.waitMs>=3600000&&Number.isSafeInteger(input.expiresAt)&&input.expiresAt>ctx.now+input.waitMs&&input.expiresAt<=ctx.now+30*86400000,'invalid_emergency_interval');
  const enrollment=uuid(input.enrollment);need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,{tenant:ctx.tenant,vault:vault.id,object:enrollment,purpose:'emergency-access',epoch:vault.epoch,version:1}),'invalid_key_signature',403);
  await notice(ctx,account.operator_id,'personal emergency enrollment');
  await guarded(ctx,[],[stmt('INSERT INTO lky_emergency_access VALUES(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL)',enrollment,ctx.tenant,ctx.actor,contact.id,account.generation,contact.generation,vault.id,vault.epoch,JSON.stringify(input.wrapped),input.waitMs,input.expiresAt),event('emergency_enrolled',enrollment)],[guard("EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=? AND owner=? AND kind='family')",[vault.id,vault.epoch,ctx.actor])]);return {enrollment,scope:[vault.id],waitMs:input.waitMs,expiresAt:input.expiresAt};
 }
 if(['emergency-request','emergency-cancel','emergency-open'].includes(action)) {
  exact(input,['enrollment']);const row=await first('SELECT * FROM lky_emergency_access WHERE id=? AND tenant=?',uuid(input.enrollment),ctx.tenant);need(row,'not_found',404);
  need(row.owner===ctx.actor||row.contact===ctx.actor,'emergency_scope_refused',403);
  if(action==='emergency-cancel'){need(row.owner===ctx.actor,'emergency_owner_required',403);await guarded(ctx,[],[stmt('UPDATE lky_emergency_access SET cancelled_at=? WHERE id=?',ctx.now,row.id),event('emergency_cancelled',row.id)]);return {cancelled:true}}
  const owner=await activeAccount(ctx,row.owner),contact=await activeAccount(ctx,row.contact),vault=await first("SELECT * FROM lky_vaults WHERE id=? AND owner=? AND kind='family'",row.vault,row.owner);
  need(row.contact===ctx.actor&&owner?.generation===row.owner_generation&&contact?.generation===row.contact_generation&&vault?.epoch===row.epoch&&!row.cancelled_at&&row.expires_at>ctx.now,'emergency_authority_expired',403);
  if(action==='emergency-request'){
   if(!row.requested_at){await notice(ctx,owner.operator_id,'personal emergency request');await guarded(ctx,[],[stmt('UPDATE lky_emergency_access SET requested_at=? WHERE id=? AND requested_at IS NULL',ctx.now,row.id),event('emergency_requested',row.id)],[guard('EXISTS(SELECT 1 FROM lky_emergency_access WHERE id=? AND cancelled_at IS NULL AND expires_at>?)',[row.id,ctx.now])])}
   const current=await first('SELECT requested_at FROM lky_emergency_access WHERE id=?',row.id);return {availableAt:current.requested_at+row.wait_ms,expiresAt:row.expires_at,scope:[row.vault]};
  }
  need(row.requested_at&&ctx.now>=row.requested_at+row.wait_ms,'emergency_waiting',403);
  const versions=await all('SELECT object_id,version,envelope FROM lky_versions WHERE vault_id=? ORDER BY object_id,version',row.vault);
  await guarded(ctx,[],[event('emergency_opened',row.id)],[guard('EXISTS(SELECT 1 FROM lky_emergency_access WHERE id=? AND cancelled_at IS NULL AND expires_at>? AND requested_at+wait_ms<=?)',[row.id,ctx.now,ctx.now]),guard("EXISTS(SELECT 1 FROM lky_accounts a JOIN oa_operators o ON o.id=a.operator_id JOIN lky_vaults v ON v.owner=a.id WHERE a.id=? AND a.generation=? AND o.status='active' AND v.id=? AND v.epoch=? AND v.kind='family')",[row.owner,row.owner_generation,row.vault,row.epoch]),guard('EXISTS(SELECT 1 FROM lky_vaults WHERE id=? AND epoch=? AND revision=?)',[vault.id,vault.epoch,vault.revision])]);
  return {tenant:ctx.tenant,vault:row.vault,enrollment:row.id,epoch:row.epoch,owner:row.owner,authorityKey:owner.authority_key,wrapped:JSON.parse(row.wrapped),versions,expiresAt:row.expires_at,copyWarning:'Previously delivered copies cannot be recalled.'};
 }
 need(false,'not_found',404);
}
