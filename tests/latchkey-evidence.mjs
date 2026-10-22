import assert from 'node:assert/strict';
import { EvidenceClient } from '../src/latchkey/evidence/client.mjs';
import { ReviewClient } from '../src/latchkey/reviews/client.mjs';
export async function runEvidenceJourneys({owner,review}){
 const client=new EvidenceClient(owner),sent=[],credential='synthetic-latchkey-2050';
 const configs=[['evidence','https://evidence.example.test'],['vanta','https://api.vanta.com'],['drata','https://public-api.drata.com'],['secureframe','https://api.secureframe.com']];
 const edge=async(url,init)=>{
  const request=new Request(url,init);assert.equal(request.method,'POST');assert.equal(init.redirect,'error');assert.equal(init.credentials,'omit');
  const provider=configs.find(([,origin])=>url.startsWith(origin))?.[0];assert.ok(provider);assert.equal(request.headers.get('authorization'),provider==='secureframe'?'synthetic-latchkey-2051 synthetic-latchkey-2052':`Bearer ${credential}`);
  if(request.headers.get('content-type')?.startsWith('multipart/form-data')){
   const form=await request.formData(),file=form.get('file');assert.ok(file instanceof File);const value=JSON.parse(await file.text());assert.ok(await ReviewClient.verify(value,owner.profile.authorityKey));assert.equal(value.package.completeness.total,value.package.completeness.decided);assert.ok(!JSON.stringify(value).includes('synthetic-latchkey-2030'));assert.ok(!JSON.stringify(value).includes(credential));sent.push({provider,value});
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
  await assert.rejects(client.send(preview,credential,false,{fetcher:edge}),e=>e.code==='evidence_consent_required');
  const result=await client.send(preview,destination==='secureframe'?{apiKey:'synthetic-latchkey-2051',keySecret:'synthetic-latchkey-2052'}:credential,true,{fetcher:edge});assert.equal(result.state,'accepted');assert.ok(result.providerReference);assert.ok(result.sourceTimestamp);assert.ok(!JSON.stringify(result).includes(credential));
 }
 assert.equal(sent.length,4);assert.ok(sent.every(row=>row.value.package.id===review));
 const target=(await client.destinations()).find(r=>r.destination==='evidence');
 for(const[status,state,retryable]of [[403,'rejected',false],[503,'backlog',true],[429,'backlog',true]]){const preview=await client.preview(review,target);const result=await client.send(preview,credential,true,{fetcher:async()=>new Response(null,{status})});assert.equal(result.state,state);assert.equal(result.retryable,retryable)}
 const preview=await client.preview(review,target);await client.revoke(target);let calls=0;await assert.rejects(client.send(preview,credential,true,{fetcher:async()=>{calls++;throw Error('must not dispatch')}}),e=>e.code==='evidence_destination_revoked');assert.equal(calls,0);
 const history=await client.deliveries(review);assert.equal(history.length,7);assert.equal(history.filter(r=>r.state==='accepted').length,4);assert.ok(history.every(r=>r.sourceTimestamp===sent[0].value.package.closedAt));
 return history;
}
