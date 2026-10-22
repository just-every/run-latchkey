import { access,campaign,canonicalJson,digest,exact,id,need,text,uuid } from '../reviews/common.mjs';
import { transact } from '../reviews/state.mjs';
const names=['evidence','vanta','drata','secureframe'];
const hosts={vanta:['https://api.vanta.com','https://api.vanta-gov.com'],drata:['https://public-api.drata.com','https://public-api.eu.drata.com','https://public-api.apac.drata.com'],secureframe:['https://api.secureframe.com']};
const output=row=>({...row,active:!!row.active});
async function destination(ctx,value){const row=await access(ctx).first('SELECT * FROM lky_evidence_destinations WHERE id=? AND tenant=? AND owner=?',uuid(value),ctx.tenant,ctx.actor);need(row,'evidence_destination_not_found',404);return row}
async function preview(ctx,review,destinationId){const row=await campaign(ctx,review);need(row.owner===ctx.actor,'review_owner_required',403);need(row.phase==='closed'&&row.package,'review_incomplete',409);const target=await destination(ctx,destinationId);need(target.active,'evidence_destination_revoked',403);return {review,destination:output(target),package:JSON.parse(row.package),fields:Object.keys(JSON.parse(row.package)).sort(),packageHash:await digest(row.package),sourceTimestamp:row.closed_at}}
export async function evidenceAuthenticated(route,input,ctx){
 if(!route.startsWith('evidence/'))return null;
 const {all,first,stmt,event,guard}=access(ctx);
 if(route==='evidence/destinations'){exact(input,[]);return(await all('SELECT * FROM lky_evidence_destinations WHERE tenant=? AND owner=? ORDER BY destination',ctx.tenant,ctx.actor)).map(output)}
 if(route==='evidence/configure'){
  exact(input,['destination','endpoint','target','workspace']);need(names.includes(input.destination));text(input.target,191);need(input.workspace===null||typeof input.workspace==='string'&&/^\d{1,15}$/.test(input.workspace));let url;try{url=new URL(input.endpoint)}catch{need(false,'invalid_evidence_endpoint')};need(!url.username&&!url.password&&!url.search&&!url.hash&&url.pathname==='/','invalid_evidence_endpoint');need(url.protocol==='https:'||input.destination==='evidence'&&url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'invalid_evidence_endpoint');need(!hosts[input.destination]||hosts[input.destination].includes(url.origin),'invalid_evidence_endpoint');
  const existing=await first('SELECT * FROM lky_evidence_destinations WHERE tenant=? AND owner=? AND destination=?',ctx.tenant,ctx.actor,input.destination),destinationId=existing?.id??id();
  // Only metadata is retained. Explicit configuration is not permission to send.
  const result=await ctx.db.batch([stmt(`INSERT INTO lky_evidence_destinations SELECT ?,?,?,?,?,?,?,1,1 WHERE ${ctx.fence} ON CONFLICT(tenant,owner,destination) DO UPDATE SET endpoint=excluded.endpoint,target=excluded.target,workspace=excluded.workspace,active=1,revision=revision+1`,destinationId,ctx.tenant,ctx.actor,input.destination,url.origin,input.target,input.workspace,...ctx.fenceArgs),event('evidence_destination_configured',destinationId)]);need(result[0].meta.changes,'authority_changed',409);return output(await destination(ctx,destinationId));
 }
 if(route==='evidence/revoke'){
  exact(input,['destination','revision']);const row=await destination(ctx,input.destination);need(row.revision===input.revision,'evidence_destination_changed',409);
  const changed=await ctx.db.batch([stmt(`UPDATE lky_evidence_destinations SET active=0,revision=revision+1 WHERE id=? AND revision=? AND ${ctx.fence}`,row.id,row.revision,...ctx.fenceArgs),event('evidence_destination_revoked',row.id)]);need(changed[0].meta.changes,'authority_changed',409);return output(await destination(ctx,row.id));
 }
 if(route==='evidence/preview'){exact(input,['review','destination']);return preview(ctx,input.review,input.destination)}
 if(route==='evidence/deliveries'){exact(input,['review']);const row=await campaign(ctx,input.review);need(row.owner===ctx.actor,'review_owner_required',403);return all('SELECT * FROM lky_evidence_deliveries WHERE review_id=? AND tenant=? AND owner=? ORDER BY created_at DESC,id',input.review,ctx.tenant,ctx.actor)}
 if(route==='evidence/begin'){
  exact(input,['review','destination','revision','packageHash','confirmed']);need(input.confirmed===true,'evidence_consent_required',403);const value=await preview(ctx,input.review,input.destination);need(value.destination.revision===input.revision&&value.packageHash===input.packageHash,'evidence_preview_changed',409);const delivery=id();
  await transact(ctx,value.package.vault,[stmt("INSERT INTO lky_evidence_deliveries VALUES(?,?,?,?,?,?,?,?,'pending',NULL,0,NULL,'{}',?,?)",delivery,ctx.tenant,ctx.actor,input.review,input.destination,input.revision,input.packageHash,value.sourceTimestamp,ctx.now,ctx.now),event('evidence_dispatch_authorized',delivery)],[guard('EXISTS(SELECT 1 FROM lky_evidence_destinations WHERE id=? AND active=1 AND revision=?)',[input.destination,input.revision]),guard("EXISTS(SELECT 1 FROM lky_reviews WHERE id=? AND phase='closed' AND package=?)",[input.review,canonicalJson(value.package)])]);
  return {id:delivery,phase:'pending',sourceTimestamp:value.sourceTimestamp};
 }
 if(route==='evidence/result'){
  exact(input,['delivery','state','providerReference','retryable','status','stage']);const row=await first('SELECT * FROM lky_evidence_deliveries WHERE id=? AND tenant=? AND owner=?',uuid(input.delivery),ctx.tenant,ctx.actor);need(row,'evidence_delivery_not_found',404);need(['accepted','rejected','backlog'].includes(input.state)&&typeof input.retryable==='boolean');need(input.providerReference===null||typeof input.providerReference==='string'&&input.providerReference.length<=1000);need(input.status===null||Number.isSafeInteger(input.status)&&input.status>=100&&input.status<=599);need(input.stage&&Object.keys(input.stage).every(key=>['name','binding','uploadReference','referenceAvailable'].includes(key))&&canonicalJson(input.stage).length<=3000,'invalid_evidence_result');
  const changed=await ctx.db.batch([stmt(`UPDATE lky_evidence_deliveries SET phase=?,provider_reference=?,retryable=?,status=?,stage=?,updated_at=? WHERE id=? AND phase='pending' AND ${ctx.fence}`,input.state,input.providerReference,Number(input.retryable),input.status,canonicalJson(input.stage),ctx.now,row.id,...ctx.fenceArgs),event('evidence_client_reported_'+input.state,row.id)]);need(changed[0].meta.changes,'evidence_result_already_recorded',409);return first('SELECT * FROM lky_evidence_deliveries WHERE id=?',row.id);
 }
 need(false,'evidence_route_not_found',404);
}
