import { ClientError } from '../client.mjs';
import { bytes, id, json, open, random, seal, unwrapSigned } from '../crypto/envelope.mjs';
import { quorumRoute, quorumBinding, enrollmentStatement, caseStatement } from './quorum-context.mjs';
const need=(value,code)=>{if(!value)throw new ClientError(code)};
export class QuorumClient {
 constructor(client){this.client=client}
 policy(){return this.client.call(quorumRoute('policy'),{})}
 propose(custodians,{confirmed=false}={}){return this.client.call(quorumRoute('propose'),{custodians,confirmed})}
 reviewChange(change){return this.client.call(quorumRoute('change-review'),{change})}
 approveChange(change,{exactChange='',confirmed=false}={}){return this.client.call(quorumRoute('change-approve'),{change,exactChange,confirmed})}
 async enroll(fingerprints,{confirmed=false}={}){
  need(confirmed,'recovery_confirmation_required');const c=this.client,{policy}=await this.policy();need(policy,'quorum_policy_unavailable');const custodians=JSON.parse(policy.custodians);need(custodians.length===2,'two_distinct_custodians_required');
  for(let i=0;i<2;i++){const target=await c.pinAccount(custodians[i].account,fingerprints[i]);need(target.publicKey===custodians[i].recipientKey&&c.profile.trusted[custodians[i].account].authorityKey===custodians[i].authorityKey,'quorum_authority_changed')}
  const enrollment=id(),statement=enrollmentStatement(enrollment,policy),key=random(),left=random(),right=key.map((v,i)=>v^left[i]);
  try{
   const payload=await seal(key,bytes({root:c.bundle.root,trusted:c.profile.trusted,seen:c.profile.seen}),await quorumBinding(statement,'quorum-payload'));
   const shares=await Promise.all([left,right].map(async(share,i)=>c.wrap(share,custodians[i].recipientKey,await quorumBinding(statement,'quorum-share',custodians[i]))));
   await c.call(quorumRoute('enroll'),{enrollment,statement,payload,shares,confirmed});
   return {schema:1,kind:'quorum',origin:c.origin,account:c.profile.account,tenant:c.profile.tenant,generation:c.profile.generation,enrollment,statement};
  }finally{key.fill(0);left.fill(0);right.fill(0)}
 }
 review(operation){return this.client.call(quorumRoute('review'),{operation})}
 async approve(operation,{exactCase='',confirmed=false,identityChecked=false}={}){
  need(confirmed&&identityChecked&&exactCase===operation,'exact_human_approval_required');const c=this.client,review=await this.review(operation),s=review.statement;
  const trusted=c.profile.trusted[s.account];need(trusted?.authorityKey===review.authorityKey,'recipient_confirmation_required');
  const {operation:ignored,transferKey,expiresAt,...enrolled}=s;
  const share=await unwrapSigned(review.share,c.bundle.root.recipient.privateKey,trusted.authorityKey,s.account,await quorumBinding(enrolled,'quorum-share',review.custodian));
  try{need(share.length===32,'quorum_share_invalid');const wrapped=await c.wrap(share,transferKey,await quorumBinding(s,'quorum-release',review.custodian));return await c.call(quorumRoute('approve'),{operation,exactCase,confirmed,identityChecked,wrapped})}finally{share.fill(0)}
 }
 async payload(pending){
  const c=this.client,{credential,preview,transfer}=pending,status=await c.request(['recovery','session','status'].join('/'),{operation:preview.operation});
  need(status.approved&&status.approvals?.length===2,'recovery_approval_required');const expected=caseStatement(credential.statement,preview.operation,transfer.publicKey,preview.expiresAt);need(JSON.stringify(expected)===JSON.stringify(status.statement),'quorum_case_changed');
  const shares=[];let key;
  try{
   for(const custodian of expected.custodians){const releases=status.approvals.filter(a=>a.custodian===custodian.account);need(releases.length===1,'quorum_shares_required');const share=await unwrapSigned(releases[0].wrapped,transfer.privateKey,custodian.authorityKey,custodian.account,await quorumBinding(expected,'quorum-release',custodian));need(share.length===32,'quorum_share_invalid');shares.push(share)}
   key=shares[0].map((v,i)=>v^shares[1][i]);return json(await open(key,status.payload,await quorumBinding(credential.statement,'quorum-payload')));
  }finally{key?.fill(0);for(const share of shares)share.fill(0)}
 }
}
