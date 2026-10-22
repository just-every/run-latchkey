import { canonicalJson,evidenceText,need } from './common.mjs';
import { sign,verify } from '../crypto/envelope.mjs';
export class ReviewClient {
 constructor(client){this.client=client}
 async applyRemoval(review,key){
  const result=await this.client.call('reviews/get',{review}),row=result.rows.find(r=>r.key===key);
  need(row?.decision==='remove','remove_decision_required');
  if(row.kind==='direct')await this.client.rotate(result.vault,row.subject);
  else await this.client.call('reviews/remove',{review,key});
  return this.client.call('reviews/get',{review});
 }
 async export(review,destination){
  need(['evidence','vanta','drata','secureframe'].includes(destination),'invalid_evidence_destination');
  const packageValue=await this.client.call('reviews/package',{review}),signature=await sign(this.client.bundle.root.authority.privateKey,evidenceText(packageValue));
  await this.client.call('reviews/package/verify',{review,package:packageValue,signature});
  return {schema:'latchkey/signed-review/v1',destination,package:packageValue,signer:this.client.profile.account,authorityKey:this.client.profile.authorityKey,signature};
 }
 static async verify(value,pinnedAuthority){return value?.schema==='latchkey/signed-review/v1'&&value.authorityKey===pinnedAuthority&&await verify(pinnedAuthority,value.signature,evidenceText(value.package))}
}
