import {sign} from '../crypto/envelope.mjs';
import {disclosureText,verifyDisclosure} from './signing.mjs';
import { canonicalJson, need } from '../reviews/common.mjs';
import { deliverEvidence } from './adapters.mjs';

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
 destinations() { return this.client.call('evidence/destinations', {}); }
 configure(value) {
  need(Object.hasOwn(names, value.destination), 'invalid_evidence_destination');
  return this.client.call('evidence/configure', { destination: value.destination, endpoint: value.endpoint, target: value.target, workspace: value.workspace ?? null,maxAgeSeconds:value.maxAgeSeconds??86400 });
 }
 revoke(destination) { return this.client.call('evidence/revoke', { destination: destination.id, revision: destination.revision }); }
 deliveries(review) { return this.client.call('evidence/deliveries', { review }); }
 async preview(review, destination) {
  const value = await this.client.call('evidence/preview', { review, destination: destination.id });
  need(value.destination.id === destination.id && value.destination.revision === destination.revision && value.destination.active, 'evidence_destination_changed');
  need(canonicalJson([...value.fields].sort()) === canonicalJson(Object.keys(value.package).sort()), 'evidence_preview_fields_changed');
  const signedPackage={schema:'latchkey/signed-evidence/v1',destination:value.destination.destination,package:value.package,signer:this.client.profile.account,authorityKey:this.client.profile.authorityKey};
  signedPackage.signature=await sign(this.client.bundle.root.authority.privateKey,disclosureText(signedPackage));
  const preview = { ...value, signedPackage };
  // Sending uses this immutable snapshot, not mutable form state.
  this.#previews.set(preview, JSON.parse(JSON.stringify(preview)));
  return preview;
 }
 async send(preview, credential, confirmed, { fetcher } = {}) {
  need(confirmed === true, 'evidence_consent_required');
  const snapshot = this.#previews.get(preview);
  need(snapshot && canonicalJson(snapshot) === canonicalJson(preview), 'evidence_preview_required');
  const destination = snapshot.destination;
  const coveredFrom = day(snapshot.package.asOf??snapshot.sourceTimestamp), coveredTo = day(snapshot.package.closedAt??snapshot.sourceTimestamp);
  const delivery = await this.client.call('evidence/begin', { review: snapshot.review, destination: destination.id, revision: destination.revision, packageHash: snapshot.packageHash, signedPackage:snapshot.signedPackage,confirmed: true });
  this.#previews.delete(preview);
  let outcome;
  try {
   outcome = await deliverEvidence({ destination: names[destination.destination], endpoint: destination.endpoint, credential, target: destination.target, workspace: destination.workspace, packageValue: snapshot.signedPackage, coveredFrom, coveredTo, ...(fetcher ? { fetcher } : {}) });
  } catch {
   outcome = { state: 'backlog', providerReference: null, retryable: false, status: null, stage: { name: 'dispatch-unknown' } };
  }
  // Only transport outcome fields cross back to the server; credentials never do.
  const payload = { delivery: delivery.id, state: outcome.state, providerReference: outcome.providerReference, retryable: outcome.retryable, status: outcome.status, stage: outcome.stage };
  try { return await this.client.call('evidence/result', payload); }
  catch {
   const error = new Error('evidence_result_not_saved');
   error.delivery = { ...delivery, ...payload, sourceTimestamp: snapshot.sourceTimestamp };
   throw error;
  }
 }
}
