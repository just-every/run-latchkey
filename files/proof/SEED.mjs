import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {vaultFixture} from './browser/.sx-fixture.mjs';
import {VaultClient} from '../src/latchkey/client.mjs';
import {SharingClient} from '../src/latchkey/sharing/client.mjs';
import {createPortability} from '@runeditrun/rer/modules/portability';
import archivePolicy from '../scripts/latchkey/archive-policy.mjs';
import {planDestinationRewrap,approveDestinationRewrap} from '../src/latchkey/portability/rewrap.mjs';
import {PortabilityClient} from '../src/latchkey/portability/client.mjs';
import {ownerSignin} from '../node_modules/@runeditrun/rer/modules/deploy-kit/owner-signin.mjs';
import {randomUUID} from 'node:crypto';
import {sign} from '../src/latchkey/crypto/envelope.mjs';
import {policyText} from '../src/latchkey/crypto/lifecycle.mjs';
import {probe,promote} from './.sx-probe.mjs';
const source=await vaultFixture({browserEnabled:false}),target=await vaultFixture({browserEnabled:false,enrollOwner:false});
const directory=await mkdtemp(join(tmpdir(),'sx-audit-proof-'));
let invited,recipient,foreign;
try{
 const owner=source.owner,email='synthetic-latchkey-9310@example.test',password='synthetic-latchkey-9311';
 const response=await source.fetcher(source.origin+'/auth/invite',{method:'POST',headers:{origin:source.origin,'content-type':'application/json',cookie:owner.cookie},body:JSON.stringify({email,displayName:'Synthetic restore owner',role:'member'}),redirect:'manual'});assert.equal(response.status,202);
 const link=source.mail.at(-1).content.find(part=>part.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];invited=new VaultClient(source.origin,{fetcher:source.fetcher});await invited.confirmIdentity(new URL(link).searchParams.get('token'));const enrollment=await invited.register(password);const promoted=(await source.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(enrollment.profile.account).first()).operator_id;await promote(owner,source.mail,promoted);await invited.unlock(enrollment.profile,password);
 const vault=(await owner.createVault()).vault;await owner.put(vault,{secret:'synthetic-latchkey-9312'});await invited.createVault();
 const group=(await new SharingClient(owner).createGroup()).group,input={group,policy:{historyDays:1},reason:'Synthetic retained source'};
 const review=await owner.call('generator/policy/preview',input);await owner.call('generator/policy/set',{...input,policy:review.policy,review:review.hash,confirmed:true});
 // Only the Cloudflare metadata and SQL network edge is substituted. The
 // official deploy-kit mints its real one-time grant into the real source D1;
 // the emitted Worker consumes that grant and creates the auth audit record.
 const targetInfo={accountId:'0'.repeat(32),project:'synthetic-latchkey',environment:'test',worker:'synthetic-latchkey',origin:source.origin},versionId=randomUUID(),deploymentId=randomUUID(),database=randomUUID(),etag='synthetic-latchkey-9320',statePath=join(directory,'owner-state.json');
 await writeFile(statePath,JSON.stringify({version:1,kind:'rer-deploy-owner-state',...targetInfo,owned:{worker:{status:'created'},d1:{core:{status:'created',id:database}},r2:{},kv:{},queues:{}},receipt:{provider:{versionId,deploymentId,etag}}}),{mode:0o600});
 const api={async request(path,options){
  if(path===`/workers/scripts/${targetInfo.worker}/settings`)return{bindings:[]};
  if(path===`/workers/scripts/${targetInfo.worker}/deployments`)return{deployments:[{id:deploymentId,versions:[{version_id:versionId,percentage:100}]}]};
  if(path===`/workers/scripts/${targetInfo.worker}/versions/${versionId}`)return{id:versionId,resources:{script:{etag}}};
  assert.equal(path,`/d1/database/${database}/query`);assert.equal(options.method,'POST');return[await source.db.prepare(options.body.sql).all()];
 }};
 const signin=await ownerSignin({api,target:targetInfo,statePath}),signToken=new URL(signin.link).searchParams.get('token');
 const signedIn=await source.fetcher(source.origin+'/auth/owner-signin',{method:'POST',headers:{origin:source.origin,'content-type':'application/json'},body:JSON.stringify({token:signToken}),redirect:'manual'});assert.equal(signedIn.status,303,await signedIn.clone().text());
 assert.ok((await source.db.prepare('SELECT COUNT(*) AS n FROM oa_auth_audit').first()).n>0);
 const records=await createPortability({db:source.db,policy:archivePolicy}),job=await records.exports.create('synthetic-latchkey-9313');while((await records.exports.advance(job,{maxParts:100})).phase!=='complete'){}
 const archive=await new Response(await records.exports.download(job)).text(),lines=archive.trim().split('\n').map(JSON.parse),destination=await createPortability({db:target.db,policy:archivePolicy});
 const imported=await destination.imports.create(lines[0],'synthetic-latchkey-9314');for(const part of lines.slice(1,-1))await destination.imports.uploadPart(imported,part.index,part);const closing=lines.at(-1);assert.equal((await destination.imports.finalize(imported,{contentHash:closing.contentHash,archiveHash:closing.archiveHash})).phase,'complete');
 recipient=new VaultClient(target.origin,{fetcher:target.fetcher});const recovered=await recipient.recover({...enrollment.kit,origin:target.origin},password);await recipient.unlock(recovered.profile,password);
 const identity=client=>({account:client.profile.account,tenant:client.profile.tenant,recipientKey:client.profile.recipientKey,authorityKey:client.profile.authorityKey});
 const inputFile=join(directory,'source.jsonl');await writeFile(inputFile,archive,{mode:0o600});
 const sourceFingerprint=await owner.identity().fingerprint,destinationFingerprint=await recipient.identity().fingerprint;
 const {plan,planHash}=await planDestinationRewrap({input:inputFile,source:identity(owner),destination:identity(recipient),sourceFingerprint,destinationFingerprint});
 const approval=await approveDestinationRewrap({input:inputFile,plan,approvedPlanHash:planHash,client:owner,purpose:'Synthetic retained-row proof',expiresAt:Date.now()+300000});
 const portability=new PortabilityClient(recipient),prepared=await portability.prepare({plan,approval,sourceFingerprint,destinationFingerprint});await portability.activate({restore:prepared.restore,approvedPlanHash:planHash,activation:'Synthetic approved restore',rights:['read','create','edit','export','share','rotate','delete','restore']});
 for(const restoredVault of plan.vaults){const statement={schema:1,purpose:'trash-retention',tenant:recipient.profile.tenant,vault:restoredVault.vault,owner:recipient.profile.account,days:30};await recipient.call('lifecycle/policy/set',{vault:restoredVault.vault,policy:{statement,signature:await sign(recipient.bundle.root.authority.privateKey,policyText(statement))}});}
 assert.equal((await recipient.readVault(vault)).versions.length,1);
 const probed=await probe({owner:recipient,db:target.db,source:owner,mail:target.mail,erasureSecret:target.bindings.LATCHKEY_ERASURE_SECRET,bindings:target.bindings,phase:process.env.SX_PHASE});
 if(process.env.SX_PHASE==='after'){foreign=await vaultFixture({browserEnabled:false});assert.notEqual(foreign.owner.profile.tenant,source.owner.profile.tenant);await assert.rejects(foreign.owner.call('subject/audit-verify',{operation:probed.operation,checkpoint:probed.checkpoint}),e=>e.code==='subject_erasure_not_found');await assert.rejects(foreign.owner.call('subject/erase-preview',{subject:probed.subject}),e=>e.code==='subject_not_found');await assert.rejects(foreign.owner.call('subject/erase',{subject:probed.subject,confirmed:true,planHash:'synthetic-latchkey-9315'}),e=>e.code==='subject_not_found');assert.equal((await foreign.db.prepare('SELECT COUNT(*) AS n FROM lky_subject_erasures').first()).n,0);const path=process.env.SX_PACKET+'/after.json',report=JSON.parse(await readFile(path,'utf8'));await writeFile(path,JSON.stringify({...report,foreignTenantAllThreeDoorsRefused:true},null,2)+'\n');}
 console.log('SX_MINIMAL_PUBLIC_DOOR_PROOF_PASSED phase='+process.env.SX_PHASE);
}finally{await foreign?.close();recipient?.lock();invited?.lock();await target.close();await source.close();await rm(directory,{recursive:true,force:true})}
