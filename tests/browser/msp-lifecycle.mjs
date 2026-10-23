import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import { createPortability } from '@runeditrun/rer/modules/portability';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { ApiClient } from '../../src/latchkey/api/client.mjs';
import { FleetClient,createProviderIdentity,publicProviderIdentity } from '../../src/latchkey/msp/client.mjs';
import archivePolicy from '../../scripts/latchkey/archive-policy.mjs';
import { vaultFixture } from './fixture.mjs';
const refused=(promise,code)=>assert.rejects(promise,error=>error.code===code);
async function enrolled(f,n,role){
 await new ApiClient(f.owner).inviteUser({email:`synthetic-latchkey-${n}@example.test`,displayName:`Client custodian ${n}`,role});
 const link=f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];
 const person=new VaultClient(f.origin,{fetcher:f.fetcher});await person.confirmIdentity(new URL(link).searchParams.get('token'));const result=await person.register(`synthetic-latchkey-${n+1}`);await person.unlock(result.profile,`synthetic-latchkey-${n+1}`);return person;
}
export async function mspLifecycleJourney(){
 const source=await vaultFixture({browserEnabled:false}),destination=await vaultFixture({browserEnabled:false,enrollOwner:false});let otherOwner,member;
 try{
  const identity=await createProviderIdentity(source.origin),fleet=new FleetClient(identity,{consoleOrigin:source.origin,fetcher:(url,init)=>new URL(url).origin===source.origin?source.fetcher(url,init):destination.fetcher(url,init)});
  const input={...publicProviderIdentity(identity),scopes:['summary','template'],expiresAt:Date.now()+86400000,confirmed:true};
  await refused(source.owner.call('msp/grant',{...input,confirmed:false}),'owner_consent_required');
  member=await enrolled(source,8400,'admin');await refused(member.call('msp/grant',input),'owner_required');await refused(member.call('msp/independent',{confirmed:true}),'owner_required');
  const post=(path,input)=>source.fetcher(source.origin+path,{method:'POST',headers:{origin:source.origin,'content-type':'application/json',cookie:source.owner.cookie},body:JSON.stringify(input),redirect:'manual'});
  assert.equal((await post('/auth/step-up',{action:'owner:transfer',returnTo:'/app'})).status,202);
  const stepToken=new URL(source.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  assert.equal((await post('/auth/confirm',{token:stepToken})).status,303);
  otherOwner=await enrolled(source,8410,'owner');
  const grant=await otherOwner.call('msp/grant',input);await otherOwner.call('msp/commercial',{status:'active',reference:'synthetic-latchkey-8410@example.test',confirmed:true});
  await mspCliJourney(source,identity,grant);
  assert.equal((await fleet.summary(grant)).onboarding.active,3);await fleet.preview(grant,{externalEnabled:false,domains:[],defaultDays:1,maxDays:1});
  const records=await createPortability({db:source.db,policy:archivePolicy}),job=await records.exports.create('synthetic-latchkey-8420');while((await records.exports.advance(job,{maxParts:100})).phase!=='complete'){}
  const raw=await new Response(await records.exports.download(job)).text(),lines=raw.trim().split('\n').map(line=>JSON.parse(line)),manifest=lines[0],end=lines.at(-1);
  const restore=await createPortability({db:destination.db,policy:archivePolicy}),imported=await restore.imports.create(manifest,'synthetic-latchkey-8421');for(const part of lines.slice(1,-1))await restore.imports.uploadPart(imported,part.index,part);assert.equal((await restore.imports.finalize(imported,{contentHash:end.contentHash,archiveHash:end.archiveHash})).phase,'complete');
  // Use the restored actual Worker: merely changing origin cannot activate a
  // historical provider consent or give the archive's recipient its old keys.
  await refused(fleet.summary({...grant,origin:destination.origin}),'delegation_unavailable');
  assert.equal((await destination.db.prepare('SELECT COUNT(*) AS n FROM lky_msp_delegations WHERE revoked_at IS NULL').first()).n,0);
  assert.equal((await destination.db.prepare('SELECT COUNT(*) AS n FROM lky_msp_previews').first()).n,0);
  assert.equal((await destination.db.prepare('SELECT COUNT(*) AS n FROM lky_msp_nonces').first()).n,0);
  assert.equal((await destination.db.prepare('SELECT status FROM lky_msp_commercial').first()).status,'active');
  const people=(await new ApiClient(source.owner).users({limit:100})).data,subject=people.find(p=>p.email==='synthetic-latchkey-8410@example.test').id;
  const plan=await source.owner.call('subject/erase-preview',{subject});const erased=await source.owner.call('subject/erase',{subject,planHash:plan.planHash,confirmed:true});assert.equal(erased.controlPlaneErased,true);
  await refused(fleet.summary(grant),'delegation_unavailable');assert.equal((await source.owner.call('msp/list',{})).delegations.length,0);assert.equal((await source.owner.call('msp/list',{})).commercial.status,'not_recorded');
  const after=await records.exports.create('synthetic-latchkey-8422');while((await records.exports.advance(after,{maxParts:100})).phase!=='complete'){}
  const clean=await new Response(await records.exports.download(after)).text();for(const value of[otherOwner.profile.account,'synthetic-latchkey-8410@example.test',grant.delegation])assert.ok(!clean.includes(value));
  console.log('MSP lifecycle: non-owner and missing consent refusal, real inactive archive restore, delegated-request refusal and erased-owner disclosure removal passed');
 }finally{otherOwner?.lock();member?.lock();await destination.close();await source.close()}
}
async function mspCliJourney(source,identity,delegation){
 const directory=await mkdtemp(join(tmpdir(),'latchkey-msp-cli-'));
 try{
  const identityPath=join(directory,'provider.json'),delegationPath=join(directory,'delegation.json'),output=join(directory,'summary.json');
  await writeFile(identityPath,JSON.stringify(identity),{mode:0o600});await writeFile(delegationPath,JSON.stringify(delegation),{mode:0o600});
  const child=spawn(process.execPath,[resolve('scripts/latchkey.mjs'),'msp-provider'],{env:{...process.env,NODE_EXTRA_CA_CERTS:source.caFile},stdio:['pipe','pipe','pipe']});let stdout='',stderr='';child.stdout.on('data',chunk=>stdout+=chunk);child.stderr.on('data',chunk=>stderr+=chunk);
  child.stdin.end(JSON.stringify({identity:identityPath,delegation:delegationPath,output,consoleOrigin:identity.origin,action:'summary'}));
  const exit=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve)});assert.equal(exit,0,stderr);assert.equal(JSON.parse(stdout).written,true);assert.ok(!stdout.includes(identity.privateKey)&&!stderr.includes(identity.privateKey));assert.equal(JSON.parse(await readFile(output,'utf8')).tenant,delegation.tenant);
 }finally{await rm(directory,{recursive:true,force:true})}
}
if(import.meta.url===new URL(process.argv[1],'file:').href)await mspLifecycleJourney();
