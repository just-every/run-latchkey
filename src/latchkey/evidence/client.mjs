import { evidenceRoutes, evidenceCredentialContext } from './routes.mjs';
import {bytes,digest,id,json,sign,unwrapSigned} from '../crypto/envelope.mjs';
import {disclosureText,verifyDisclosure} from './signing.mjs';
import { canonicalJson, need } from '../reviews/common.mjs';
import { deliverEvidence, inspectVantaUpload } from './adapters.mjs';

const names = { evidence: 'Evidence', vanta: 'Vanta', drata: 'Drata', secureframe: 'Secureframe' };
const day = value => { const date = new Date(value); need(Number.isFinite(date.getTime()), 'invalid_evidence_period'); return date.toISOString().slice(0, 10); };

export class EvidenceClient {
 #previews = new WeakMap();
 constructor(client) { this.client = client; }
 static verify(value,pinnedAuthority){return verifyDisclosure(value,pinnedAuthority);}
 capture(vault,confirmed){return this.client.call('evidence/capture',{vault,confirmed});}
 sources(vault){return this.client.call('evidence/sources',{vault});}
 deletions(){return this.client.call('evidence/deletions',{});}
 requestDeletion(delivery,requestReference,confirmed){return this.client.call('evidence/deletion/request',{delivery,requestReference,confirmed});}
 confirmDeletion(deletion,confirmationReference,confirmed){return this.client.call('evidence/deletion/confirm',{deletion,confirmationReference,confirmed});}
 destinations() { return this.client.call(['evidence','destinations'].join('/'), {}); }
 configure(value) {
  need(Object.hasOwn(names, value.destination), 'invalid_evidence_destination');
  return this.client.call('evidence/configure', { destination: value.destination, endpoint: value.endpoint, target: value.target, workspace: value.workspace ?? null,maxAgeSeconds:value.maxAgeSeconds??86400 });
 }
 async revoke(destination) {
  const revoked=await this.client.call(['evidence','revoke'].join('/'),{destination:destination.id,revision:destination.revision});
  (this.client.profile.evidenceCredentials??={})[destination.id]={revision:revoked.revision,version:revoked.credential_version,hash:null};
  return revoked;
 }
 delivery(delivery) { return this.client.call(evidenceRoutes.delivery, { delivery }); }
 deliveries(review) { return this.client.call('evidence/deliveries', { review }); }
 async saveCredential(destination,credential,confirmed){
  need(confirmed===true,'evidence_consent_required');
  const secure=destination.destination==='secureframe';
  need(secure?credential&&Object.keys(credential).sort().join()===['apiKey','keySecret'].sort().join()&&[credential.apiKey,credential.keySecret].every(value=>typeof value==='string'&&value.length>0&&value.length<=4000&&!/\s/.test(value)):typeof credential==='string'&&credential.length>0&&credential.length<=4000&&!/\s/.test(credential),'invalid_evidence_credential');
  const current=(await this.destinations()).find(row=>row.id===destination.id);
  need(current?.active&&current.revision===destination.revision,'evidence_destination_changed');
  const profile=this.client.profile,plaintext=bytes(credential);
  try{
   const wrapped=await this.client.wrap(plaintext,profile.recipientKey,evidenceCredentialContext(profile.tenant,current.id,current.revision,current.credential_version+1));
   const saved=await this.client.call(evidenceRoutes.credentialSave,{destination:current.id,revision:current.revision,version:current.credential_version,wrapped,confirmed:true});
   (profile.evidenceCredentials??={})[current.id]={revision:saved.revision,version:saved.version,hash:await digest(canonicalJson(wrapped))};
   return saved;
  }finally{plaintext.fill(0)}
 }
 async loadCredential(destination){
  const profile=this.client.profile,stored=await this.client.call(evidenceRoutes.credentialGet,{destination:destination.id,revision:destination.revision});
  need(stored.destination===destination.id&&stored.revision===destination.revision,'evidence_destination_changed');
  const hash=await digest(canonicalJson(stored.wrapped)),seen=profile.evidenceCredentials?.[destination.id];
  need(!seen||stored.revision>seen.revision||stored.revision===seen.revision&&(stored.version>seen.version||stored.version===seen.version&&hash===seen.hash),'evidence_credential_rollback');
  const plaintext=await unwrapSigned(stored.wrapped,this.client.bundle.root.recipient.privateKey,profile.authorityKey,profile.account,evidenceCredentialContext(profile.tenant,stored.destination,stored.revision,stored.version));
  try{
   const credential=json(plaintext);
   (profile.evidenceCredentials??={})[destination.id]={revision:stored.revision,version:stored.version,hash};
   return credential;
  }finally{plaintext.fill(0)}
 }
 async forgetCredential(destination,confirmed){
  need(confirmed===true,'evidence_consent_required');
  const current=(await this.destinations()).find(row=>row.id===destination.id);
  need(current?.active&&current.revision===destination.revision,'evidence_destination_changed');
  const forgotten=await this.client.call(evidenceRoutes.credentialForget,{destination:current.id,revision:current.revision,version:current.credential_version,confirmed:true});
  (this.client.profile.evidenceCredentials??={})[current.id]={revision:forgotten.revision,version:forgotten.version,hash:null};
  return forgotten;
 }
 async sendSaved(preview,confirmed,options={}){
  need(confirmed===true,'evidence_consent_required');
  const prepared=this.#previews.get(preview);
  need(prepared&&canonicalJson(prepared.snapshot)===canonicalJson(preview),'evidence_preview_required');
  return this.send(preview,await this.loadCredential(prepared.snapshot.destination),true,options);
 }
 async preview(review, destination) {
  const value = await this.client.call('evidence/preview', { review, destination: destination.id });
  need(value.destination.id === destination.id && value.destination.revision === destination.revision && value.destination.active, 'evidence_destination_changed');
  need(canonicalJson([...value.fields].sort()) === canonicalJson(Object.keys(value.package).sort()), 'evidence_preview_fields_changed');
  const signedPackage={schema:'latchkey/signed-evidence/v1',destination:value.destination.destination,package:value.package,signer:this.client.profile.account,authorityKey:this.client.profile.authorityKey};
  signedPackage.signature=await sign(this.client.bundle.root.authority.privateKey,disclosureText(signedPackage));
  const preview = { ...value, signedPackage };
  // Sending uses this immutable snapshot, not mutable form state.
  this.#previews.set(preview, { snapshot: JSON.parse(JSON.stringify(preview)), delivery: id() });
  return preview;
 }
 async send(preview, credential, confirmed, { fetcher } = {}) {
  need(confirmed === true, 'evidence_consent_required');
  const prepared = this.#previews.get(preview), snapshot = prepared?.snapshot;
  need(snapshot && canonicalJson(snapshot) === canonicalJson(preview), 'evidence_preview_required');
  const destination = snapshot.destination;
  const delivery = await this.client.call(evidenceRoutes.begin, { delivery: prepared.delivery, review: snapshot.review, destination: destination.id, revision: destination.revision, packageHash: snapshot.packageHash, signedPackage:snapshot.signedPackage,confirmed: true });
  this.#previews.delete(preview);
  return this.dispatch(delivery, snapshot, credential, { fetcher });
 }
 async inspectUpload(deliveryId, credential, { fetcher } = {}) {
  const inspect = () => this.client.call(evidenceRoutes.inspectAttempt, { delivery: deliveryId, inspection: delivery.stage.inspection.id });
  const delivery = await this.client.call(evidenceRoutes.startInspection, {delivery:deliveryId});
  const observation = await inspectVantaUpload({ endpoint: delivery.destination.endpoint, target: delivery.destination.target, credential,
   uploadReference: delivery.stage.uploadReference, ...(fetcher ? { fetcher } : {}), beforeRead: inspect, pagination:delivery.stage.inspection,
   checkpoint:page=>this.client.call(evidenceRoutes.checkpointInspection,{delivery:deliveryId,inspection:delivery.stage.inspection.id,...page}) });
  await this.client.call(evidenceRoutes.finishInspection, {delivery:deliveryId,inspection:delivery.stage.inspection.id,
   presence:observation.presence,status:observation.status,pages:observation.pages,retryAfterSeconds:observation.retryAfterSeconds??0});
  return observation;
 }
 async resumeUpload(deliveryId, credential, confirmed, { fetcher } = {}) {
  need(confirmed === true, 'evidence_consent_required');
  const delivery = await this.delivery(deliveryId), stage = delivery.stage;
  need(delivery.phase === 'pending' && stage.state === 'upload-acknowledged', 'evidence_reconciliation_required');
  const destination = (await this.destinations()).find(row => row.id === delivery.destination_id);
  need(destination?.active && destination.revision === delivery.destination_revision, 'evidence_destination_changed');
  need(await EvidenceClient.verify(delivery.signedPackage, this.client.profile.authorityKey), 'evidence_signature_invalid');
  return this.dispatch(delivery, { destination, signedPackage: delivery.signedPackage, sourceTimestamp: delivery.sourceTimestamp }, credential,
   { fetcher, resume: { name: destination.destination === 'vanta' ? 'submit' : 'create', binding: stage.binding, uploadReference: stage.uploadReference } });
 }
 async dispatch(delivery, snapshot, credential, { fetcher, resume } = {}) {
  const destination = snapshot.destination, packageValue = snapshot.signedPackage.package;
  const coveredFrom = day(packageValue.asOf ?? snapshot.sourceTimestamp), coveredTo = day(packageValue.closedAt ?? snapshot.sourceTimestamp);
  let attempt, hookError;
  const checked = work => async stage => { try { return await work(stage); } catch (error) { hookError = error; throw error; } };
  const outcome = await deliverEvidence({ destination: names[destination.destination], endpoint: destination.endpoint, credential, target: destination.target,
   workspace: destination.workspace, packageValue: snapshot.signedPackage, coveredFrom, coveredTo, resume, ...(fetcher ? { fetcher } : {}),
   beforeMutation: checked(async stage => { const next = await this.client.call(evidenceRoutes.startAttempt, { delivery: delivery.id, stage }); attempt = next.stage.attempt; }),
   checkpoint: checked(stage => this.client.call(evidenceRoutes.checkpointAttempt, { delivery: delivery.id, attempt, uploadReference: stage.uploadReference })),
  });
  if (hookError) throw hookError;
  // Only transport outcome fields cross back to the server; credentials never do.
  const payload = { delivery: delivery.id, state: outcome.state, providerReference: outcome.providerReference, retryable: outcome.retryable, status: outcome.status, stage: outcome.stage };
  try { return await this.client.call(evidenceRoutes.result, payload); }
  catch {
   const error = new Error('evidence_result_not_saved');
   error.delivery = { ...delivery, ...payload, sourceTimestamp: snapshot.sourceTimestamp };
   throw error;
  }
 }
}
