import { evidenceRoutes } from '../src/latchkey/evidence/routes.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../scripts/latchkey/archive-policy.mjs';
import { readFile,readdir } from 'node:fs/promises';
import { unstable_splitSqlQuery } from 'wrangler';
import assert from 'node:assert/strict';
import { digest, id } from '../src/latchkey/crypto/envelope.mjs';
import { EvidenceClient } from '../src/latchkey/evidence/client.mjs';
export async function runEvidenceJourneys({owner,review,outsider,db,password}){
 const client=new EvidenceClient(owner),sent=[],credential='synthetic-latchkey-2050';
 const configs=[['evidence','https://evidence.example.test'],['vanta','https://api.vanta.com'],['drata','https://public-api.drata.com'],['secureframe','https://api.secureframe.com']];
 const edge=async(url,init)=>{
  const request=new Request(url,init);assert.equal(request.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  const provider=configs.find(([,origin])=>url.startsWith(origin))?.[0];assert.ok(provider);assert.equal(request.headers.get('authorization'),provider==='secureframe'?'synthetic-latchkey-2051 synthetic-latchkey-2052':`Bearer ${credential}`);
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
   const form=await request.formData(),file=form.get('file');assert.ok(file instanceof File);const value=JSON.parse(await file.text());assert.ok(await EvidenceClient.verify(value,owner.profile.authorityKey));assert.equal(value.package.completeness.total,value.package.completeness.decided);assert.ok(!value.package.rows.some(row=>Object.hasOwn(row,'subject')||Object.hasOwn(row,'reason')||Object.hasOwn(row,'reviewer')));assert.ok(!JSON.stringify(value).includes('synthetic-latchkey-2030'));assert.ok(!JSON.stringify(value).includes(credential));sent.push({provider,value});
   if(provider==='evidence'){assert.equal(form.get('requirement_id'),'Finance quarterly review');assert.match(form.get('covered_from'),/^\d{4}-\d{2}-\d{2}$/);return Response.json({receipt:'synthetic-latchkey-2053',origin:'manually-asserted',label:'source-reported',source:'Latchkey signed evidence'},{status:201})}
   if(provider==='vanta'){assert.ok(url.endsWith('/v1/documents/Finance%20quarterly%20review/uploads'));return Response.json({id:'synthetic-latchkey-2054',fileName:file.name,mimeType:'application/json',creationDate:new Date().toISOString()},{status:201})}
   if(provider==='drata'){assert.ok(url.endsWith('/public/v2/workspaces/1/evidence-files'));return Response.json({fileKey:'synthetic-latchkey-2055',originalFilename:file.name,mimeType:'application/json',fileSize:file.size},{status:201})}
   return new Response(null,{status:201,headers:{location:'/tests/synthetic-latchkey-2056/evidences/synthetic-latchkey-2057'}});
  }
  if(provider==='vanta'){assert.ok(url.endsWith('/submit'));return new Response(null,{status:204})}
  assert.equal(provider,'drata');const value=await request.json();assert.equal(value.artifacts[0].fileKey,'synthetic-latchkey-2055');return Response.json({id:2058,artifactsRequested:1,artifactsCreated:1,artifacts:[{id:2059}]},{status:201});
 };
 for(const[destination,endpoint]of configs){
  const config=await client.configure({destination,endpoint,target:'Finance quarterly review',workspace:destination==='drata'?'1':null});
  const preview=await client.preview(review,config);assert.deepEqual(preview.fields,Object.keys(preview.package).sort());
  if(destination==='evidence'){const tampered=structuredClone(preview.signedPackage);tampered.package.completeness.total++;await assert.rejects(owner.call(evidenceRoutes.begin,{delivery:id(),review,destination:config.id,revision:config.revision,packageHash:preview.packageHash,signedPackage:tampered,confirmed:true}),error=>error.code==='evidence_signature_invalid');assert.equal(sent.length,0);}
  await assert.rejects(client.send(preview,credential,false,{fetcher:edge}),e=>e.code==='evidence_consent_required');
  const providerCredential=destination==='secureframe'?{apiKey:'synthetic-latchkey-2051',keySecret:'synthetic-latchkey-2052'}:credential;
  await assert.rejects(client.saveCredential(config,providerCredential,false),error=>error.code==='evidence_consent_required');
  await client.saveCredential(config,providerCredential,true);
  const stored=await db.prepare('SELECT credential FROM lky_evidence_destinations WHERE id=?').bind(config.id).first();
  for(const value of [credential,'synthetic-latchkey-2051','synthetic-latchkey-2052'])assert.ok(!stored.credential.includes(value));
  assert.deepEqual(await new EvidenceClient(owner).loadCredential(config),providerCredential);
  await assert.rejects(owner.call(evidenceRoutes.credentialSave,{destination:config.id,revision:config.revision,version:0,wrapped:JSON.parse(stored.credential),confirmed:true}),error=>error.code==='evidence_credential_changed');
  if(outsider)await assert.rejects(new EvidenceClient(outsider).loadCredential(config),error=>error.code==='evidence_destination_not_found');
  const corrupt=JSON.parse(stored.credential);corrupt.signature=(corrupt.signature[0]==='A'?'B':'A')+corrupt.signature.slice(1);
  await db.prepare('UPDATE lky_evidence_destinations SET credential=? WHERE id=?').bind(JSON.stringify(corrupt),config.id).run();
  await assert.rejects(client.loadCredential(config));
  await db.prepare('UPDATE lky_evidence_destinations SET credential=? WHERE id=?').bind(stored.credential,config.id).run();
  const result=await client.sendSaved(preview,true,{fetcher:edge});assert.equal(result.state,'accepted');assert.ok(result.providerReference);assert.ok(result.sourceTimestamp);assert.ok(!JSON.stringify(result).includes(credential));
 }
 assert.equal(sent.length,4);assert.ok(sent.every(row=>row.value.package.id===review));
 if(password){
  const restored=new owner.constructor(owner.origin,{cookie:owner.cookie,fetcher:owner.fetcher});
  try{await restored.unlock(structuredClone(owner.profile),password);const destination=(await client.destinations()).find(row=>row.destination==='secureframe');assert.deepEqual(await new EvidenceClient(restored).loadCredential(destination),{apiKey:'synthetic-latchkey-2051',keySecret:'synthetic-latchkey-2052'});await db.prepare('UPDATE lky_grants SET expires_at=0 WHERE token_hash=?').bind(await digest(restored.token)).run();await assert.rejects(new EvidenceClient(restored).loadCredential(destination),error=>error.code==='authority_expired')}finally{restored.lock()}
 }

 const target=(await client.destinations()).find(r=>r.destination==='evidence');
 for(const[status,state,retryable]of [[403,'rejected',false],[503,'backlog',true],[429,'backlog',true]]){const preview=await client.preview(review,target);const result=await client.send(preview,credential,true,{fetcher:async()=>new Response(null,{status})});assert.equal(result.state,state);assert.equal(result.retryable,retryable)}
 const oldCredential=await owner.call(evidenceRoutes.credentialGet,{destination:target.id,revision:target.revision});
 await client.forgetCredential(target,true);await assert.rejects(client.loadCredential(target),error=>error.code==='evidence_credential_not_found');
 await db.prepare('UPDATE lky_evidence_destinations SET credential=?,credential_version=? WHERE id=?').bind(JSON.stringify(oldCredential.wrapped),oldCredential.version,target.id).run();
 await assert.rejects(client.loadCredential(target),error=>error.code==='evidence_credential_rollback');
 await db.prepare('UPDATE lky_evidence_destinations SET credential=NULL,credential_version=? WHERE id=?').bind(oldCredential.version+1,target.id).run();
 await client.saveCredential(target,credential,true);
 const preview=await client.preview(review,target);await client.revoke(target);
 assert.equal((await db.prepare('SELECT credential FROM lky_evidence_destinations WHERE id=?').bind(target.id).first()).credential,null);
 await assert.rejects(client.loadCredential(target),error=>error.code==='evidence_destination_changed');let calls=0;await assert.rejects(client.send(preview,credential,true,{fetcher:async()=>{calls++;throw Error('must not dispatch')}}),e=>e.code==='evidence_destination_revoked');assert.equal(calls,0);
 const history=await client.deliveries(review);assert.equal(history.length,7);assert.equal(history.filter(r=>r.state==='accepted').length,4);assert.ok(history.every(r=>r.sourceTimestamp===sent[0].value.package.closedAt));
 // Provider acknowledgements and local acknowledgements fail independently.
 // Recreate the client after each interruption instead of reusing memory.
 const configured = () => client.configure({destination:'vanta',endpoint:'https://api.vanta.com',target:'Finance quarterly review'});
 let config=await configured(), uploads=0, submits=0, pending;assert.equal(config.credentialSaved,false);
 const beginPreview=await client.preview(review,config), beginInput={delivery:id(),review,destination:config.id,revision:config.revision,packageHash:beginPreview.packageHash,signedPackage:beginPreview.signedPackage,confirmed:true};
 const begun=await owner.call(evidenceRoutes.begin,beginInput), beforeReplay=(await client.deliveries(review)).length;
 assert.equal((await owner.call(evidenceRoutes.begin,beginInput)).id,begun.id);
 assert.equal((await client.deliveries(review)).length,beforeReplay);
 await assert.rejects(owner.call(evidenceRoutes.begin,{...beginInput,packageHash:'synthetic-latchkey-2063'}),error=>error.code==='evidence_preview_changed');
 const acknowledged=Object.create(owner);
 acknowledged.call=async(route,input)=>{
  const result=await owner.call(route,input);
  if(route===evidenceRoutes.checkpointAttempt){pending=input.delivery;throw Error('synthetic-latchkey-2060')}
  return result;
 };
 const interrupted=new EvidenceClient(acknowledged);
 const checkpointEdge=async(url,init)=>{if(url.endsWith('/uploads'))uploads++;else submits++;return edge(url,init)};
 await assert.rejects(interrupted.send(await interrupted.preview(review,config),credential,true,{fetcher:checkpointEdge}),/synthetic-latchkey-2060/);
 const restarted=new EvidenceClient(owner), checkpoint=await restarted.delivery(pending);
 assert.equal(checkpoint.stage.state,'upload-acknowledged');assert.equal(checkpoint.stage.attempts.length,1);assert.equal(checkpoint.stage.attempts[0].outcome,'upload-acknowledged');assert.equal(checkpoint.stage.uploadReference,'synthetic-latchkey-2054');
 assert.equal(uploads,1);assert.equal(submits,0);
 if(outsider){
  await assert.rejects(new EvidenceClient(outsider).delivery(pending),error=>error.code==='evidence_delivery_not_found');
  for(const[route,input]of [[evidenceRoutes.startAttempt,{delivery:pending,stage:{name:'submit',binding:checkpoint.stage.binding,uploadReference:checkpoint.stage.uploadReference}}],[evidenceRoutes.checkpointAttempt,{delivery:pending,attempt:checkpoint.stage.attempt,uploadReference:checkpoint.stage.uploadReference}],[evidenceRoutes.inspectAttempt,{delivery:pending}]])await assert.rejects(outsider.call(route,input),error=>error.code==='evidence_delivery_not_found');
 }
 const racing=await Promise.allSettled([restarted.resumeUpload(pending,credential,true,{fetcher:checkpointEdge}),new EvidenceClient(owner).resumeUpload(pending,credential,true,{fetcher:checkpointEdge})]);
 assert.equal(racing.filter(row=>row.status==='fulfilled').length,1);assert.equal(racing.find(row=>row.status==='fulfilled').value.state,'accepted');assert.equal(uploads,1);assert.equal(submits,1);assert.equal((await restarted.delivery(pending)).stage.attempts.length,2);
 // Stalled writes can have reached the provider. A fresh client must retain
 // the ambiguous attempt, including any already acknowledged upload.
 for(const mode of ['upload','submit','body']){
  config=await client.configure({destination:mode==='body'?'drata':'vanta',endpoint:mode==='body'?'https://public-api.drata.com':'https://api.vanta.com',target:'Finance quarterly review',workspace:mode==='body'?'1':null});
  let writes=0,cancelled=false;
  const timed=await client.send(await client.preview(review,config),credential,true,{fetcher:async(url,init)=>{
   writes++;assert.ok(init.signal instanceof AbortSignal);
   if(mode==='submit'&&url.endsWith('/uploads'))return edge(url,init);
   if(mode==='body')return new Response(new ReadableStream({start(controller){
    const abort=()=>{cancelled=true;controller.error(init.signal.reason)};
    if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});
   }}),{status:201,headers:{'content-type':['application','json'].join('/')}});
   return new Promise((resolve,reject)=>{
    const abort=()=>{cancelled=true;reject(init.signal.reason)};
    if(init.signal.aborted)abort();else init.signal.addEventListener('abort',abort,{once:true});
   });
  }});
  assert.equal(cancelled,true);assert.equal(timed.state,'backlog');assert.equal(timed.retryable,false);
  assert.equal(timed.stage.name,mode==='body'?'unverified-response':mode);
  assert.equal(timed.providerReference,mode==='submit'?'synthetic-latchkey-2054':null);
  const fresh=new EvidenceClient(owner),retained=await fresh.delivery(timed.id);
  assert.equal(retained.requiresReconciliation,true);assert.equal(retained.stage.attempts.length,mode==='submit'?2:1);
  assert.equal(retained.stage.uploadReference,mode==='submit'?'synthetic-latchkey-2054':undefined);
  const forbidden=async()=>{writes++;throw Error('must not repeat ambiguous mutation')};
  await assert.rejects(fresh.resumeUpload(timed.id,credential,true,{fetcher:forbidden}),error=>error.code==='evidence_reconciliation_required');
  await assert.rejects(owner.call(evidenceRoutes.startAttempt,{delivery:timed.id,stage:{name:'upload',binding:retained.stage.binding}}),error=>error.code==='evidence_delivery_finished');
  assert.equal(writes,mode==='submit'?2:1);assert.ok(!JSON.stringify(retained).includes(credential));
 }
 // A provider accepted the write, but the process disappeared before saving it.
 config=await configured();let lost;
 const disconnected=Object.create(owner);
 disconnected.call=async(route,input)=>{if(route===evidenceRoutes.result)throw Error('synthetic-latchkey-2061');return owner.call(route,input)};
 const crashed=new EvidenceClient(disconnected);
 try{await crashed.send(await crashed.preview(review,config),credential,true,{fetcher:checkpointEdge})}catch(error){lost=error.delivery}
 assert.ok(lost?.delivery);const unknown=await restarted.delivery(lost.delivery);
 assert.equal(unknown.phase,'pending');assert.equal(unknown.requiresReconciliation,true);assert.equal(unknown.stage.name,'submit');assert.ok(unknown.stage.leaseUntil>0);
 const writesBefore=uploads+submits;
 await assert.rejects(restarted.resumeUpload(lost.delivery,credential,true,{fetcher:checkpointEdge}),error=>error.code==='evidence_reconciliation_required');
 await assert.rejects(owner.call(evidenceRoutes.startAttempt,{delivery:lost.delivery,stage:{name:'submit',binding:unknown.stage.binding,uploadReference:unknown.stage.uploadReference}}),error=>error.code==='evidence_reconciliation_required');
 assert.equal(uploads+submits,writesBefore);
 let reads=0;
 let releaseRead;const reading=new Promise(resolve=>{releaseRead=resolve});let signalRead;
 const firstRead=new Promise(resolve=>{signalRead=resolve});
 const observing=restarted.inspectUpload(lost.delivery,credential,{fetcher:async()=>{signalRead();await reading;return Response.json({results:{data:[],pageInfo:{hasNextPage:false,hasPreviousPage:false,startCursor:null,endCursor:null}}})}});
 await firstRead;
 await assert.rejects(owner.call(evidenceRoutes.inspectAttempt,{delivery:lost.delivery,inspection:id()}),error=>error.code==='evidence_inspection_changed');
 let overlappingReads=0;await assert.rejects(new EvidenceClient(owner).inspectUpload(lost.delivery,credential,{fetcher:async()=>{overlappingReads++;throw Error()}}),error=>error.code==='evidence_inspection_backoff');assert.equal(overlappingReads,0);releaseRead();assert.equal((await observing).presence,'not-found');
 const released=await restarted.delivery(lost.delivery);released.stage.inspection.nextAllowedAt=0;await db.prepare('UPDATE lky_evidence_deliveries SET stage=? WHERE id=?').bind(JSON.stringify(released.stage),lost.delivery).run();
 const observation=await restarted.inspectUpload(lost.delivery,credential,{fetcher:async(url,init)=>{
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');assert.equal(init.headers.Authorization,`Bearer ${credential}`);reads++;
  const query=new URL(url).searchParams;assert.equal(query.get('pageSize'),'100');assert.equal(query.get('pageCursor'),reads===1?null:'synthetic-latchkey-2064');
  return Response.json({results:{data:reads===1?[]:[{id:'synthetic-latchkey-2054',fileName:'latchkey-signed-evidence.json',title:'synthetic-latchkey-2066',description:null,mimeType:'application/json',deletionDate:null,effectiveDate:null,creationDate:'2026-10-24T00:00:00.000Z',updatedDate:'2026-10-24T00:00:00.000Z',uploadedBy:{type:'APPLICATION',id:'synthetic-latchkey-2067'},url:'https://api.vanta.com/v1/documents/synthetic-latchkey-2066'}],pageInfo:{hasNextPage:reads===1,hasPreviousPage:reads>1,startCursor:null,endCursor:reads===1?'synthetic-latchkey-2064':null}}});
 }});
 assert.equal(observation.presence,'found');assert.equal(observation.provesSubmit,false);assert.equal(reads,2);assert.equal(uploads+submits,writesBefore);
 assert.equal((await restarted.delivery(lost.delivery)).requiresReconciliation,true);
 let deniedReads=0;
 await assert.rejects(new EvidenceClient(owner).inspectUpload(lost.delivery,credential,{fetcher:async()=>{deniedReads++;throw Error()}}),error=>error.code==='evidence_inspection_backoff');assert.equal(deniedReads,0);
 const releaseInspection=async()=>{const row=await restarted.delivery(lost.delivery);row.stage.inspection.nextAllowedAt=0;await db.prepare('UPDATE lky_evidence_deliveries SET stage=? WHERE id=?').bind(JSON.stringify(row.stage),lost.delivery).run();};

 await releaseInspection();
 const rateLimited=await restarted.inspectUpload(lost.delivery,credential,{fetcher:async()=>new Response(null,{status:429,headers:{'retry-after':'120'}})});assert.equal(rateLimited.presence,'unknown');assert.equal(rateLimited.retryAfterSeconds,120);
 const diagnostics=(await restarted.delivery(lost.delivery)).stage.inspection;assert.equal(diagnostics.status,429);assert.equal(diagnostics.state,'client-reported');assert.ok(diagnostics.nextAllowedAt>=diagnostics.observedAt+120000);assert.ok(!JSON.stringify(diagnostics).includes(credential));
 await assert.rejects(new EvidenceClient(owner).inspectUpload(lost.delivery,credential,{fetcher:async()=>{deniedReads++;throw Error()}}),error=>error.code==='evidence_inspection_backoff');assert.equal(deniedReads,0);
 await releaseInspection();let cursorReads=0;
 const interruptedPages=await restarted.inspectUpload(lost.delivery,credential,{fetcher:async()=>{
  cursorReads++;return cursorReads===1?Response.json({results:{data:[],pageInfo:{hasNextPage:true,hasPreviousPage:false,startCursor:null,endCursor:'synthetic-latchkey-2068'}}}):new Response(null,{status:429,headers:{'retry-after':'60'}});
 }});assert.equal(interruptedPages.presence,'unknown');
 const checkpointed=(await restarted.delivery(lost.delivery)).stage.inspection;assert.equal(checkpointed.cursor,'synthetic-latchkey-2068');assert.ok(checkpointed.seenCursors.includes('synthetic-latchkey-2068'));
 await assert.rejects(owner.call(evidenceRoutes.checkpointInspection,{delivery:lost.delivery,inspection:checkpointed.id,cursor:'synthetic-latchkey-2068',nextCursor:'synthetic-latchkey-2069',page:checkpointed.pages+1}),error=>error.code==='evidence_inspection_changed');
 await releaseInspection();let resumedReads=0;
 const resumedPages=await new EvidenceClient(owner).inspectUpload(lost.delivery,credential,{fetcher:async url=>{resumedReads++;assert.equal(new URL(url).searchParams.get('pageCursor'),'synthetic-latchkey-2068');return Response.json({results:{data:[],pageInfo:{hasNextPage:false,hasPreviousPage:true,startCursor:null,endCursor:null}}})}});
 assert.equal(resumedReads,1);assert.equal(resumedPages.presence,'not-found');assert.equal((await restarted.delivery(lost.delivery)).stage.inspection.cursor,null);assert.equal(uploads+submits,writesBefore);
 await releaseInspection();
 assert.equal((await restarted.inspectUpload(lost.delivery,credential,{fetcher:async()=>Response.json({results:{data:[],pageInfo:{hasNextPage:true,hasPreviousPage:true,startCursor:null,endCursor:'synthetic-latchkey-2065'}}})})).presence,'unknown');
 await releaseInspection();let cancelledRead=false;
 const stalled=await restarted.inspectUpload(lost.delivery,credential,{fetcher:async(url,init)=>new Promise((resolve,reject)=>{
  const aborted=()=>{cancelledRead=true;reject(init.signal.reason)};
  if(init.signal.aborted)aborted();else init.signal.addEventListener('abort',aborted,{once:true});
 })});
 assert.equal(cancelledRead,true);assert.equal(stalled.presence,'unknown');assert.equal(stalled.status,null);assert.equal(uploads+submits,writesBefore);
 assert.equal((await restarted.delivery(lost.delivery)).stage.inspection.presence,'unknown');
 const payload=Object.fromEntries(['delivery','state','providerReference','retryable','status','stage'].map(key=>[key,lost[key]]));
 const saved=await owner.call(evidenceRoutes.result,payload), eventsBefore=(await owner.call('audit',{})).filter(row=>row.object_id===lost.delivery).length;
 assert.deepEqual(await owner.call(evidenceRoutes.result,payload),saved);
 assert.equal((await owner.call('audit',{})).filter(row=>row.object_id===lost.delivery).length,eventsBefore);
 await assert.rejects(owner.call(evidenceRoutes.result,{...payload,providerReference:'synthetic-latchkey-2062'}),error=>error.code==='evidence_result_already_recorded');
 // Revocation after an upload prevents the very next provider mutation.
 config=await configured();let revokedWrites=0;
 const revokeEdge=async(url,init)=>{revokedWrites++;const response=await edge(url,init);await client.revoke(config);return response};
 await assert.rejects(client.send(await client.preview(review,config),credential,true,{fetcher:revokeEdge}),error=>error.code==='evidence_destination_changed');
 assert.equal(revokedWrites,1);
 let revokedReads=0;await assert.rejects(restarted.inspectUpload(lost.delivery,credential,{fetcher:async()=>{revokedReads++;throw Error()}}),error=>error.code==='evidence_destination_changed');assert.equal(revokedReads,0);
 await configured();
 console.log('Evidence attempts: durable upload reference, fresh-client resume, racing resume refusal, ambiguous write fence, idempotent result acknowledgement and revoke before the next provider mutation passed');
 return history;
}

export async function runPostureEvidenceJourneys({owner,vault,outsider}){
 const client=new EvidenceClient(owner),credential='synthetic-latchkey-2090',sent=[];
 if(outsider)await assert.rejects(new EvidenceClient(outsider).capture(vault,true),error=>error.code==='review_owner_required');
 const initial=await client.capture(vault,true),original=await client.preview(initial.id,(await client.destinations()).find(row=>row.active));
 const privateVault=(await owner.createVault({kind:'private-work'})).vault,familyVault=(await owner.createVault({kind:'family'})).vault;
 await owner.put(privateVault,{schema:'latchkey/vault-meta/v1',title:'synthetic-latchkey-2091'});
 await assert.rejects(client.capture(privateVault,true),error=>error.code==='company_vault_required');
 await assert.rejects(client.capture(familyVault,true),error=>error.code==='company_vault_required');
 await assert.rejects(client.capture(vault,false),error=>error.code==='evidence_capture_confirmation_required');
 const source=await client.capture(vault,true),configs=[['evidence','https://evidence.example.test'],['vanta','https://api.vanta.com'],['drata','https://public-api.drata.com'],['secureframe','https://api.secureframe.com']];
 const edge=async(url,init)=>{
  const request=new Request(url,init);assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
   const form=await request.formData(),value=JSON.parse(await form.get('file').text());assert.ok(await EvidenceClient.verify(value,owner.profile.authorityKey));
   assert.equal(value.package.id,source.id);assert.equal(value.package.mfa.status,'unknown-not-implemented');assert.equal(value.package.mfa.enforcement,null);assert.equal(value.package.adoption.dailyActiveMembers,null);assert.ok(value.package.adoption.enrolledMembers>0);assert.equal(value.package.scope.kind,'company');
   const serialized=JSON.stringify(value.package);for(const marker of[owner.profile.account,vault,privateVault,familyVault,'synthetic-latchkey-2091','synthetic-latchkey-2030',credential])assert.ok(!serialized.includes(marker));sent.push(value);
   if(url.startsWith(configs[0][1]))return Response.json({receipt:'synthetic-latchkey-2092',origin:'manually-asserted',label:'source-reported'},{status:201});
   if(url.startsWith(configs[1][1]))return Response.json({id:'synthetic-latchkey-2093',fileName:'latchkey-signed-evidence.json',mimeType:'application/json',creationDate:new Date().toISOString()},{status:201});
   if(url.startsWith(configs[2][1]))return Response.json({fileKey:'synthetic-latchkey-2094'},{status:201});
   return new Response(null,{status:201,headers:{location:'/tests/synthetic-latchkey-2095/evidences/synthetic-latchkey-2096'}});
  }
  if(url.endsWith('/submit'))return new Response(null,{status:204});
  assert.ok(url.endsWith('/public/v2/workspaces/1/evidence'));const body=await request.json();assert.equal(body.artifacts[0].fileKey,'synthetic-latchkey-2094');return Response.json({id:2097,artifactsRequested:1,artifactsCreated:1,artifacts:[{id:2098}]},{status:201});
 };
 let accepted;
 for(const[destination,endpoint]of configs){const config=await client.configure({destination,endpoint,target:'Company posture and enrollment',workspace:destination==='drata'?'1':null});const preview=await client.preview(source.id,config);assert.deepEqual(preview.package.securityEvents.events,original.package.securityEvents.events);assert.ok(preview.package.securityEvents.events.some(row=>row.action==='review_closed'&&row.count>0));assert.equal(preview.stale,false);const result=await client.send(preview,destination==='secureframe'?{apiKey:'synthetic-latchkey-2051',keySecret:'synthetic-latchkey-2052'}:credential,true,{fetcher:edge});assert.equal(result.state,'accepted');assert.deepEqual(result.signedPackage,sent.at(-1));if(destination==='vanta')accepted=result;}
 assert.equal(sent.length,4);assert.ok(sent.every(value=>JSON.stringify(value.package)===JSON.stringify(sent[0].package)));
 const vanta=(await client.destinations()).find(row=>row.destination==='vanta'),outage=await client.send(await client.preview(source.id,vanta),credential,true,{fetcher:async()=>new Response(null,{status:503})});assert.equal(outage.state,'backlog');assert.equal(outage.sourceTimestamp,sent[0].package.sourceTimestamp);assert.ok(await EvidenceClient.verify(outage.signedPackage,owner.profile.authorityKey));
 const short=await client.configure({destination:'vanta',endpoint:'https://api.vanta.com',target:'Company posture and enrollment',maxAgeSeconds:1});await new Promise(resolve=>setTimeout(resolve,1100));const stale=await client.preview(source.id,short);assert.equal(stale.stale,true);let writes=0;await assert.rejects(client.send(stale,credential,true,{fetcher:async()=>{writes++;throw Error('must not send')}}),error=>error.code==='evidence_source_stale');assert.equal(writes,0);
 return {source,client,accepted,staleDestination:short,refresh:()=>client.configure({destination:'vanta',endpoint:'https://api.vanta.com',target:'Company posture and enrollment'})};
}

export async function restoreDomainArchive(f){
 const source=await createPortability({db:f.db,policy:archivePolicy}),job=await source.exports.create('synthetic-latchkey-2081');
 while((await source.exports.advance(job,{maxParts:100})).phase!=='complete'){}
 const lines=(await new Response(await source.exports.download(job)).text()).trim().split('\n').map(line=>JSON.parse(line));
 const db=await f.archiveDatabase();for(const name of(await readdir('migrations/core')).filter(n=>n.endsWith('.sql')).sort())await db.batch(unstable_splitSqlQuery(await readFile('migrations/core/'+name,'utf8')).map(sql=>db.prepare(sql)));
 const destination=await createPortability({db,policy:archivePolicy}),imported=await destination.imports.create(lines[0],'synthetic-latchkey-2082');
 for(const part of lines.slice(1,-1))await destination.imports.uploadPart(imported,part.index,part);
 const final=lines.at(-1),result=await destination.imports.finalize(imported,{contentHash:final.contentHash,archiveHash:final.archiveHash});assert.equal(result.phase,'complete');
 return db;
}
export async function runReviewArchiveJourney(f,review){
 const client=new EvidenceClient(f.owner),destination=(await client.destinations()).find(row=>row.active&&row.destination==='secureframe');
 await client.saveCredential(destination,{apiKey:'synthetic-latchkey-2051',keySecret:'synthetic-latchkey-2052'},true);
 assert.ok((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_evidence_destinations WHERE credential IS NOT NULL').first()).n>0);
 const db=await restoreDomainArchive(f);
 const campaign=await db.prepare('SELECT * FROM lky_reviews WHERE id=?').bind(review).first();assert.equal(campaign.phase,'inactive');assert.equal(campaign.package,null);assert.ok((await db.prepare('SELECT * FROM lky_review_rows WHERE review_id=?').bind(review).all()).results.length);
 const destinations=(await db.prepare('SELECT active,credential,credential_version FROM lky_evidence_destinations').all()).results;assert.ok(destinations.every(row=>row.credential===null&&row.credential_version===0));assert.ok(destinations.length);assert.ok(destinations.every(row=>row.active===0));assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM lky_devices').first()).n,0);
 const captures=(await db.prepare('SELECT active FROM lky_evidence_sources').all()).results;assert.ok(captures.length);assert.ok(captures.every(row=>row.active===0));
}

export async function assertEvidenceErasure(f,{source,subject}){
 const client=new EvidenceClient(f.owner),vault=(await f.owner.call('vaults',{})).find(row=>row.kind==='company'&&row.owner===f.owner.profile.account).id;
 const fresh=await client.capture(vault,true),destination=(await client.destinations()).find(row=>row.destination==='secureframe'),preview=await client.preview(fresh.id,destination);
 assert.ok(!JSON.stringify(preview.signedPackage).includes(subject));
 const records=await createPortability({db:f.db,policy:archivePolicy}),job=await records.exports.create('synthetic-latchkey-2110');
 while((await records.exports.advance(job,{maxParts:100})).phase!=='complete'){}
 const lines=(await new Response(await records.exports.download(job)).text()).trim().split('\n').map(line=>JSON.parse(line)),rows=lines.filter(line=>line.kind==='part').flatMap(part=>part.items).filter(item=>item.kind==='row'&&item.table.startsWith('lky_evidence_'));
 assert.ok(rows.length);const serialized=JSON.stringify(rows);assert.ok(!serialized.includes(subject));assert.ok(!serialized.includes(source));
 assert.ok(rows.some(row=>row.table==='lky_evidence_deletions'));
}
