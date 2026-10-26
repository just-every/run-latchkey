import { evidenceCredentialContext, evidenceRoutes } from './routes.mjs';
import { access, canonicalJson, exact, need, uuid } from '../reviews/common.mjs';
import { verifyWrapped } from '../crypto/envelope.mjs';
const routes=new Set([evidenceRoutes.credentialGet,evidenceRoutes.credentialSave,evidenceRoutes.credentialForget]);
export async function evidenceCredentialAuthenticated(route,input,ctx){
 if(!routes.has(route))return null;
 const saving=route===evidenceRoutes.credentialSave,forgetting=route===evidenceRoutes.credentialForget;
 exact(input,saving?['destination','revision','version','wrapped','confirmed']:forgetting?['destination','revision','version','confirmed']:['destination','revision']);
 const liveArgs=()=>ctx.fenceArgs.map(value=>value===ctx.now?Math.max(ctx.now,Date.now()):value);
 const {first,stmt}=access(ctx),row=await first(`SELECT * FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=? AND ${ctx.fence}`,uuid(input.destination),ctx.tenant,ctx.actor,...liveArgs());
 need(row,'evidence_destination_not_found',404);
 need(row.active&&row.revision===input.revision,'evidence_destination_changed',409);
 if(!saving&&!forgetting){
  need(row.credential,'evidence_credential_not_found',404);
  return {destination:row.id,revision:row.revision,version:row.credential_version,wrapped:JSON.parse(row.credential)};
 }
 need(input.confirmed===true,'evidence_consent_required');
 need(input.version===row.credential_version,'evidence_credential_changed',409);
 let wrapped=null;
 if(saving){
  need(canonicalJson(input.wrapped).length<=16384,'invalid_evidence_credential');
  const account=await first('SELECT authority_key FROM lky_accounts WHERE id=? AND tenant=?',ctx.actor,ctx.tenant);
  need(await verifyWrapped(input.wrapped,account.authority_key,ctx.actor,evidenceCredentialContext(ctx.tenant,row.id,row.revision,row.credential_version+1)),'invalid_evidence_credential');
  wrapped=canonicalJson(input.wrapped);
 }
 // The live grant fence and destination CAS are part of the same write.
 const changed=await ctx.db.batch([
  stmt(`UPDATE lky_evidence_destinations SET credential=?,credential_version=credential_version+1 WHERE id=? AND tenant=? AND owner=? AND active=1 AND revision=? AND credential_version=? AND ${ctx.fence}`,wrapped,row.id,ctx.tenant,ctx.actor,row.revision,row.credential_version,...liveArgs()),
  stmt('INSERT INTO lky_events SELECT ?,?,?,?,?,? WHERE changes()=1',crypto.randomUUID(),ctx.actor,ctx.device,saving?'evidence_credential_saved':'evidence_credential_forgotten',row.id,ctx.now),
 ]);
 need(changed[0].meta.changes,'evidence_credential_changed',409);
 return {destination:row.id,revision:row.revision,version:row.credential_version+1,saved:saving};
}
