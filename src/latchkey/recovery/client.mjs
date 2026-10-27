import * as opaque from '@serenity-kit/opaque';
import { ClientError } from '../client.mjs';
import { bytes,decode,encode,id,itemKey,json,keypair,open,random,seal,sign,unlockKey,unwrapSigned } from '../crypto/envelope.mjs';
const route=action=>['recovery',action].join('/');
const session=action=>route(['session',action].join('/'));
const binding=(tenant,object,purpose,epoch)=>({tenant,vault:'account',object,purpose,epoch,version:1});
const need=(value,code)=>{if(!value)throw new ClientError(code)};
const recoveryText=input=>JSON.stringify(['latchkey-recovery-v1',input]);
export class RecoveryClient {
 constructor(client){this.client=client}
 async enrollSelf({confirmed=false}={}) {
  need(confirmed,'recovery_confirmation_required');const c=this.client,enrollment=id(),secret=encode(random());
  const wrapped=await seal(decode(secret),bytes({root:c.bundle.root,trusted:c.profile.trusted,seen:c.profile.seen}),binding(c.profile.tenant,enrollment,'self-recovery',c.profile.generation));
  await c.call(route('enroll'),{enrollment,kind:'self',custodian:null,wrapped,confirmed});
  return {schema:1,origin:c.origin,account:c.profile.account,tenant:c.profile.tenant,generation:c.profile.generation,enrollment,secret,wrapped};
 }
 async enrollAdministrator(custodian,fingerprint,{confirmed=false}={}) {
  need(confirmed,'recovery_confirmation_required');const c=this.client,admin=await c.pinAccount(custodian,fingerprint),enrollment=id();
  const wrapped=await c.wrap(bytes({root:c.bundle.root,trusted:c.profile.trusted,seen:c.profile.seen}),admin.publicKey,binding(c.profile.tenant,enrollment,'administrator-recovery',c.profile.generation));
  await c.call(route('enroll'),{enrollment,kind:'administrator',custodian,wrapped,confirmed});
  return {schema:1,origin:c.origin,account:c.profile.account,tenant:c.profile.tenant,generation:c.profile.generation,enrollment};
 }
 async begin(credential) {
  const c=this.client;need(credential.origin===c.origin,'recovery_origin_mismatch');await opaque.ready;
  const started=opaque.client.startRegistration({password:credential.password}),transfer=await keypair('wrap');
  const preview=await c.request(session('start'),{enrollment:credential.enrollment,request:started.registrationRequest,transferKey:transfer.publicKey});
  need(preview.account===credential.account&&preview.tenant===credential.tenant&&preview.generation===credential.generation,'recovery_context_changed');
  return {credential:{...credential,password:undefined},started,transfer,preview};
 }
 async approve(operation,{confirmed=false,identityChecked=false}={}) {
  need(confirmed&&identityChecked,'identity_review_required');const c=this.client,review=await c.call(route('administrator-review'),{operation});
  const trusted=c.profile.trusted[review.account];need(trusted?.authorityKey===review.authorityKey,'recipient_confirmation_required');
  const payload=await unwrapSigned(review.wrapped,c.bundle.root.recipient.privateKey,trusted.authorityKey,review.account,binding(review.tenant,review.enrollment,'administrator-recovery',review.generation));
  const wrapped=await c.wrap(payload,review.transferKey,binding(review.tenant,review.operation,'recovery-approval',review.generation));
  return c.call(route('administrator-approve'),{operation,wrapped,confirmed,identityChecked});
 }
 async complete(pending,password,{confirmed=false,beforeCommit}={}) {
  need(confirmed,'recovery_confirmation_required');const c=this.client,{credential,preview}=pending;
  let payload;
  if(credential.secret)payload=json(await open(decode(credential.secret),credential.wrapped,binding(preview.tenant,credential.enrollment,'self-recovery',preview.generation)));
  else {
   const approval=await c.request(session('status'),{operation:preview.operation});need(approval.approved,'recovery_approval_required');
   const trusted=credential.trustedAdministrator;need(trusted?.account===approval.custodian&&trusted.authorityKey,'recipient_confirmation_required');
   payload=json(await unwrapSigned(approval.wrapped,pending.transfer.privateKey,trusted.authorityKey,approval.custodian,binding(preview.tenant,preview.operation,'recovery-approval',preview.generation)));
  }
  const root=payload.root;need(root.recipient.publicKey===preview.recipientKey&&root.authority.publicKey===preview.authorityKey&&root.recovery.publicKey===preview.recoveryKey,'recovery_context_changed');
  const oldRecovery=root.recovery.privateKey;root.recovery=await keypair('sign');
  const result=opaque.client.finishRegistration({clientRegistrationState:pending.started.clientRegistrationState,registrationResponse:preview.response,password,identifiers:{client:preview.account,server:preview.tenant},keyStretching:'memory-constrained'});
  need(result.serverStaticPublicKey===preview.serverKey,'server_key_changed');
  const profile={schema:1,origin:c.origin,account:preview.account,tenant:preview.tenant,serverKey:result.serverStaticPublicKey,device:id(),deviceSecret:encode(random()),generation:preview.generation+1,recipientKey:root.recipient.publicKey,authorityKey:root.authority.publicKey,trusted:payload.trusted,seen:payload.seen};
  const kit={schema:1,origin:c.origin,account:profile.account,tenant:profile.tenant,serverKey:profile.serverKey,recoverySecret:encode(random()),generation:profile.generation},signing=await keypair('sign');
  const bundle=await seal(await unlockKey(result.exportKey,profile.deviceSecret,profile.account),bytes({root,signing}),binding(profile.tenant,profile.device,'device',profile.generation));
  const recoveryWrap=await seal(await unlockKey(result.exportKey,kit.recoverySecret,profile.account),bytes({root}),binding(profile.tenant,profile.account,'recovery',profile.generation));
  const input={operation:preview.operation,record:result.registrationRecord,device:profile.device,deviceKey:signing.publicKey,bundle,recoveryKey:root.recovery.publicKey,recoveryWrap};
  if(beforeCommit)await beforeCommit({profile,kit});
  await c.request(session('finish'),{...input,signature:await sign(oldRecovery,recoveryText(input))});c.lock();return {profile,kit};
 }
 async enrollEmergency(vault,contact,fingerprint,{waitMs,expiresAt,confirmed=false}={}) {
  need(confirmed,'recovery_confirmation_required');const c=this.client,target=await c.pinAccount(contact,fingerprint),snapshot=await c.snapshot(vault),enrollment=id();
  try{const wrapped=await c.wrap(snapshot.key,target.publicKey,{tenant:c.profile.tenant,vault,object:enrollment,purpose:'emergency-access',epoch:snapshot.result.epoch,version:1});return await c.call(route('emergency-enroll'),{enrollment,vault,contact,waitMs,expiresAt,wrapped,confirmed})}finally{snapshot.key.fill(0)}
 }
 requestEmergency(enrollment){return this.client.call(route('emergency-request'),{enrollment})}
 cancelEmergency(enrollment){return this.client.call(route('emergency-cancel'),{enrollment})}
 async openEmergency(enrollment) {
  const c=this.client,result=await c.call(route('emergency-open'),{enrollment}),trusted=c.profile.trusted[result.owner];need(trusted?.authorityKey===result.authorityKey,'recipient_confirmation_required');
  const key=await unwrapSigned(result.wrapped,c.bundle.root.recipient.privateKey,trusted.authorityKey,result.owner,{tenant:result.tenant,vault:result.vault,object:result.enrollment,purpose:'emergency-access',epoch:result.epoch,version:1});
  try{return {...result,wrapped:undefined,versions:await Promise.all(result.versions.map(async row=>{const derived=await itemKey(key,result.tenant,result.vault,row.object_id);try{return {object:row.object_id,version:row.version,value:json(await open(derived,JSON.parse(row.envelope),{tenant:result.tenant,vault:result.vault,object:row.object_id,purpose:'item',epoch:result.epoch,version:row.version}))}}finally{derived.fill(0)}}))}}finally{key.fill(0)}
 }
}
