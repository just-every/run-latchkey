import assert from 'node:assert/strict';
import {mkdir,mkdtemp,writeFile,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {expect} from '@playwright/test';
import {vaultFixture} from './fixture.mjs';
import {VaultClient} from '../../src/latchkey/client.mjs';
import {ApiClient,requestApi} from '../../src/latchkey/api/client.mjs';
import {AutomationClient,McpClient,mcpRequest} from '../../src/latchkey/automation/client.mjs';
import {signWebhook} from '../../src/latchkey/automation/webhooks.mjs';
import {SharingClient} from '../../src/latchkey/sharing/client.mjs';
import {ProjectClient} from '../../src/latchkey/projects/client.mjs';
import {bytes,digest,encode,id,itemKey,keypair,random,seal,sign,signingText} from '../../src/latchkey/crypto/envelope.mjs';
import {OrganizationClient} from '../../src/latchkey/collections/client.mjs';
import {createAttachment} from '../../src/latchkey/items/attachments.mjs';
import {EvidenceClient} from '../../src/latchkey/evidence/client.mjs';
import {createItem} from '../../src/latchkey/items/types.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;if(output)await mkdir(output,{recursive:true});
const refused=(promise,code)=>assert.rejects(promise,error=>error.code===code);
const command=(args,input,env)=>new Promise((resolve,reject)=>{const c=spawn(process.execPath,args,{env:{...process.env,...env},stdio:['pipe','pipe','pipe']});let out='',err='';c.stdout.on('data',v=>out+=v);c.stderr.on('data',v=>err+=v);c.once('error',reject);c.once('close',code=>resolve({code,out,err}));c.stdin.end(JSON.stringify(input))});
async function member(f,n){const response=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email:`synthetic-latchkey-${n}@example.test`,displayName:'Northstar finance reviewer',role:'member'}});assert.equal(response.status(),202);const token=new URL(f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');const c=new VaultClient(f.origin,{fetcher:f.fetcher});await c.confirmIdentity(token);const e=await c.register(`synthetic-latchkey-${n+1}`);await c.unlock(e.profile,`synthetic-latchkey-${n+1}`);return c}
export async function cliAdministrationJourney(f){
 const owner=f.owner,api=new ApiClient(owner),secret='synthetic-latchkey-5010';
 const groups=[id(),id()];for(const group of groups)await api.createGroup(group);
 await owner.createVault();await new ProjectClient(owner).create({name:'Northstar API application'});
 const directory=await mkdtemp(join(tmpdir(),'latchkey-api-cli-'));try{const profilePath=join(directory,'profile.json');await writeFile(profilePath,JSON.stringify(owner.profile),{mode:0o600});const group=id(),cli=await command([resolve('scripts/latchkey.mjs'),'api'],{profile:profilePath,password:f.password,api:{command:'groups.create',body:{group}}},{NODE_EXTRA_CA_CERTS:f.caFile});assert.equal(cli.code,0,cli.err);assert.equal(JSON.parse(cli.out).group,group);groups.push(group);const project=await command([resolve('scripts/latchkey.mjs'),'project-create'],{profile:profilePath,password:f.password,name:'Northstar CLI application'},{NODE_EXTRA_CA_CERTS:f.caFile});assert.equal(project.code,0,project.err);assert.ok(JSON.parse(project.out).project);const cliVault=await command([resolve('scripts/latchkey.mjs'),'vault-create'],{profile:profilePath,password:f.password},{NODE_EXTRA_CA_CERTS:f.caFile});assert.equal(cliVault.code,0,cliVault.err);assert.ok(JSON.parse(cliVault.out).vault);
 for(const resource of ['groups','vaults','projects']){const seen=[];let cursor;do{const result=await command([resolve('scripts/latchkey.mjs'),'api'],{profile:profilePath,password:f.password,api:{command:resource+'.list',limit:1,cursor}},{NODE_EXTRA_CA_CERTS:f.caFile});assert.equal(result.code,0,result.err);const page=JSON.parse(result.out);seen.push(...page.data.map(row=>row.id));cursor=page.nextCursor}while(cursor);assert.equal(new Set(seen).size,seen.length);assert.ok(seen.length>=2,resource+' CLI pagination');if(resource==='groups')assert.deepEqual([...seen].sort(),[...groups].sort());if(resource==='vaults')assert.ok(seen.includes(JSON.parse(cliVault.out).vault));if(resource==='projects')assert.ok(seen.includes(JSON.parse(project.out).project));}
 const bad=await command([resolve('scripts/latchkey.mjs'),'api'],{profile:profilePath,password:f.password,api:{command:'vaults.get',vault:id()}},{NODE_EXTRA_CA_CERTS:f.caFile});assert.equal(bad.code,1);assert.equal(JSON.parse(bad.err).error,'not_found');for(const file of await readdir(directory))assert.ok(!(await readFile(join(directory,file),'utf8')).includes(secret));assert.ok(!cli.out.includes(secret)&&!project.out.includes(secret))}finally{await rm(directory,{recursive:true,force:true})}
 console.log('CLI administration: isolated account creation, pagination and refusal passed');
}
async function adoptAgentPolicy(f) {
 const response=await f.fetcher(f.origin+'/agents/api/policy',{method:'PUT',headers:{origin:f.origin,cookie:f.owner.cookie,'content-type':'application/json'},body:JSON.stringify({document:{schema:'rer-agent-policy/1',catalogue:'rer-agent-classes/1',rules:[{id:'owner-delegation',class:'*',do:'autonomous'}],spend:{none:true}}})});
 assert.equal(response.status,200,'Owner explicitly configures the shared agent policy');
}
export async function administrationJourney(f,width){
 await adoptAgentPolicy(f);
 const owner=f.owner,api=new ApiClient(owner),automation=new AutomationClient(owner),recipient=await member(f,5000),secret='synthetic-latchkey-5010';
 const apiTransport=Object.create(owner);apiTransport.call=(route,input)=>route==='vault/create'?requestApi(owner,'POST','/vaults',input):route==='project/create'?requestApi(owner,'POST','/projects',input):owner.call(route,input);
 const vault=(await apiTransport.createVault()).vault,object=(await owner.put(vault,createItem('login',{title:'Northstar finance provider',values:{username:'finance@example.test',password:secret}}))).object;
 const groups=[id(),id()];for(const group of groups)assert.equal((await api.createGroup(group)).group,group);await api.setGroup(groups[0],[recipient.profile.account]);assert.deepEqual((await api.groupMembers(groups[0])).accounts,[recipient.profile.account]);
 const project=await new ProjectClient(apiTransport).create({name:'Northstar API application'});
 // The CLI has its own installation/account below: its repeated sign-ins must
 // not consume the browser owner's authentication quota.
 const thirdGroup=id();await api.createGroup(thirdGroup);groups.push(thirdGroup);
 await owner.createVault();await new ProjectClient(owner).create({name:'Northstar second application'});
 const paged=[];let cursor;do{const page=await api.groups({limit:1,cursor});paged.push(...page.data.map(r=>r.id));cursor=page.nextCursor}while(cursor);assert.equal(new Set(paged).size,3);assert.deepEqual([...paged].sort(),groups.sort());await refused(api.groups({limit:1,cursor:'invalid'}),'invalid_cursor');
 assert.ok((await api.projects({limit:1})).data.length);assert.equal((await api.project(project.project)).id,project.project);assert.ok((await api.users({limit:1})).data.length);const invited=await api.request('POST','/users',{email:'synthetic-latchkey-5020@example.test',displayName:'Invited API member'});assert.ok(invited);assert.ok((await api.vaults({limit:1})).nextCursor);
 for(const list of [page=>api.vaults(page),page=>api.projects(page)]){const seen=[];let cursor;do{const page=await list({limit:1,cursor});seen.push(...page.data.map(row=>row.id));cursor=page.nextCursor}while(cursor);assert.ok(seen.length>=2);assert.equal(new Set(seen).size,seen.length)}
 assert.ok(await api.policies());assert.ok((await api.events({limit:1})).data.length);const campaign=await api.createReview({vault,reviewer:recipient.profile.account,scheduleAt:Date.now(),dueAt:Date.now()+3600000,period:'quarterly'});assert.ok((await api.review(campaign.id)).id);assert.ok((await api.reviews({limit:1})).data.some(row=>row.id===campaign.id));
 const snapshot=await owner.snapshot(vault),derived=await itemKey(snapshot.key,owner.profile.tenant,vault,object);try{const envelope=await seal(derived,bytes(createItem('login',{title:'Northstar finance updated',values:{password:secret}})),{tenant:owner.profile.tenant,vault,object,purpose:'item',epoch:snapshot.result.epoch,version:2});const input={version:2,revision:snapshot.result.revision,envelope};assert.equal((await api.putEncryptedItem(vault,object,input,{ifMatch:input.revision})).version,2);await refused(api.putEncryptedItem(vault,object,input,{ifMatch:input.revision}),'version_conflict');await refused(api.putEncryptedItem(vault,object,{...input,revision:input.revision+1},{ifMatch:input.revision}),'precondition_failed')}finally{snapshot.key.fill(0);derived.fill(0)}
 await refused(api.vault(id()),'not_found');const expired=Object.create(owner);expired.token=encode(random());await refused(new ApiClient(expired).vaults(),'authority_expired');const expiredSession=new VaultClient(f.origin,{cookie:owner.cookie,fetcher:f.fetcher});await expiredSession.unlock(structuredClone(owner.profile),f.password);await f.db.prepare('UPDATE lky_grants SET expires_at=? WHERE token_hash=?').bind(Date.now()-1,await digest(expiredSession.token)).run();await refused(new ApiClient(expiredSession).vaults(),'authority_expired');expiredSession.lock();const spec=await(await f.fetcher(f.origin+'/api/latchkey/v1/openapi.json')).json();assert.ok(spec.paths['/api/latchkey/v1/groups']||spec.paths['/groups']);assert.ok(!(JSON.stringify(await api.encryptedItem(vault,object))).includes(secret));
 // A signed-in member's machine credential must treat inherited tool names
 // exactly like an unknown name. Assertions never include response bodies.
 {
  const memberVault=(await recipient.createVault()).vault,memberAutomation=new AutomationClient(recipient),memberSigning=await keypair('sign');
  const memberCredential=await memberAutomation.issueCredential({vault:memberVault,publicKey:memberSigning.publicKey,scopes:['posture:read','access:request'],expiresAt:Date.now()+3600000,confirmed:true});
  const memberAgent=new McpClient({origin:f.origin,token:memberCredential.token,privateKey:memberSigning.privateKey,fetcher:async(url,init)=>{
   const response=await f.fetcher(url,init),body=await response.clone().text();
   assert.equal(response.status,JSON.parse(body)?.error?.data?.code==='tool_not_found'?400:200,'MCP returns its typed JSON-RPC answer');
   assert.equal([secret,memberCredential.token,'synthetic-latchkey-1101','synthetic-latchkey-1103','SESSION_SECRET','MAIL_API_KEY'].some(value=>body.includes(value)),false,'MCP response contains no binding or secret value');
   return response;
  }});
  for(const name of ['unknown-tool','constructor','__proto__','hasOwnProperty']){
   const answer=await memberAgent.request('tools/call',{name,arguments:{vault:memberVault}});
   assert.equal(answer.error?.code===-32602&&answer.error?.message==='Unknown tool'&&answer.result===undefined,true,`Unknown MCP tool refused: ${name}`);
  }
  const legitimate=await memberAgent.posture(memberVault);
  assert.equal(legitimate.result?.isError,false,'Registered member tool still works');
  assert.equal(legitimate.result?.structuredContent?.valuesIncluded,false);
  assert.equal((await memberAutomation.requests()).length,0,'Unknown names create no access requests');
  await memberAutomation.revokeCredential(memberCredential.credential);
 }
 const signing=await keypair('sign'),credential=await automation.issueCredential({vault,publicKey:signing.publicKey,scopes:['posture:read','access:request'],expiresAt:Date.now()+3600000,confirmed:true}),agent=new McpClient({origin:f.origin,token:credential.token,privateKey:signing.privateKey,fetcher:f.fetcher});assert.equal((await agent.initialize()).result.serverInfo.name,'Latchkey');const tools=(await agent.tools()).result.tools;assert.equal(tools.length,3);assert.ok(!tools.some(t=>t.name.includes('approv')));const posture=await agent.posture(vault);assert.equal(posture.result.structuredContent.valuesIncluded,false);assert.ok(!JSON.stringify(posture).includes(secret));assert.equal((await agent.posture(id())).result.isError,true);
 const requested=await agent.requestAccess({vault,account:recipient.profile.account,objects:[object],rights:['read'],expiresAt:Date.now()+1800000}),request=requested.result.structuredContent.request;assert.ok(request);assert.equal(requested.result.structuredContent.granted,false);assert.equal((await new SharingClient(recipient).received()).length,0);let preview=await automation.preview(request);await refused(new AutomationClient(recipient).decide(preview,'approve',true),'not_found');await refused(automation.fulfill(preview),'human_approval_required');const badTool=await agent.request('tools/call',{name:'approve',arguments:{request}});assert.equal(badTool.error.code,-32602);const humanPath='/api/latchkey/mcp/ownerapprove',machineBody=JSON.stringify({request,revision:preview.revision,previewHash:preview.previewHash,decision:'approve',confirmed:true}),machineNonce=id(),machineTime=String(Date.now()),machineResponse=await f.fetcher(f.origin+humanPath,{method:'POST',headers:{origin:f.origin,'content-type':'application/json',authorization:'Bearer '+credential.token,'x-latchkey-nonce':machineNonce,'x-latchkey-time':machineTime,'x-latchkey-signature':await sign(signing.privateKey,signingText('POST',humanPath,credential.token,machineNonce,machineTime,await digest(machineBody)))},body:machineBody});assert.equal(machineResponse.status,401);assert.equal((await automation.preview(request)).phase,'pending');
 // Owner reviews the exact request, records a decision, and explicitly grants.
 await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByLabel('I confirm this owner account is ready to use.').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 // File selection can precede React hydration: setInputFiles does not wait for
 // an enabled input, so its change event would be lost before the client exists.
 await expect(f.page.getByLabel('Profile file')).toBeEnabled();
 await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await f.page.getByRole('button',{name:'API and agent access',exact:true}).click();await f.page.getByRole('button',{name:`Review request ${request}`,exact:true}).click();await expect(f.page.getByRole('heading',{name:'Exact owner approval'})).toBeVisible();if(output)await f.page.screenshot({path:join(output,`automation-owner-preview-${width}.png`),fullPage:true});await f.page.getByLabel('I approve this exact recipient, objects, versions, rights and expiry as the vault owner.').check();await f.page.getByRole('button',{name:'Record owner approval',exact:true}).click();await expect(f.page.getByText('Owner approval recorded. Access is not granted yet.')).toBeVisible();assert.equal((await new SharingClient(recipient).received()).length,0);await f.page.getByLabel('I approve this exact recipient, objects, versions, rights and expiry as the vault owner.').check();await f.page.getByRole('button',{name:'Grant exact approved access',exact:true}).click();await expect(f.page.getByText('Exact approved encrypted grant is effective.')).toBeVisible();preview=await automation.preview(request);assert.equal(preview.phase,'fulfilled');await recipient.pinAccount(owner.profile.account,await owner.identity().fingerprint);const received=await new SharingClient(recipient).read(preview.share,object);assert.equal(received.value.fields.find(f=>f.id==='password').value,secret);if(output)await f.page.screenshot({path:join(output,`automation-owner-complete-${width}.png`),fullPage:true});
 const revokedRequest=(await agent.requestAccess({vault,account:recipient.profile.account,objects:[object],rights:['read'],expiresAt:Date.now()+900000})).result.structuredContent.request;const revokePreview=await automation.preview(revokedRequest);await automation.revokeCredential(credential.credential);await refused(automation.decide(revokePreview,'approve',true),'automation_authority_changed');await refused(agent.posture(vault),'unauthenticated');
 const key1=encode(random()),key2=encode(random());await refused(automation.subscribe({endpoint:'https://unapproved.example.test/hook',events:['vault_created'],secret:key1,confirmed:true}),'webhook_origin_not_allowed');await refused(new AutomationClient(recipient).subscribe({endpoint:'https://receiver.example.test/hook',events:['vault_created'],secret:key1,confirmed:true}),'owner_required');const hook=await automation.subscribe({endpoint:'https://receiver.example.test/hook',events:['vault_created'],secret:key1,confirmed:true});assert.ok(!(await f.db.prepare('SELECT secret FROM lky_webhook_subscriptions WHERE id=?').bind(hook.id).first()).secret.includes(key1));await owner.createVault();const audit=await owner.call('audit',{}),event=audit.filter(e=>e.action==='vault_created').at(-1);const queued=await automation.enqueue(hook.id,hook.revision,event.id,true);assert.equal((await automation.enqueue(hook.id,hook.revision,event.id,true)).id,queued.id);const fail=await automation.dispatch(hook.id,hook.revision,queued.id,true);assert.equal(fail.phase,'backlog');const redirect=await automation.dispatch(hook.id,hook.revision,queued.id,true);assert.equal(redirect.phase,'backlog');assert.equal(redirect.status,302);const pass=await automation.dispatch(hook.id,hook.revision,queued.id,true);assert.equal(pass.phase,'accepted',JSON.stringify({attempt:pass,edgeCalls:f.webhooks.length,stages:(await f.db.prepare('SELECT outcome FROM lky_webhook_attempts').all()).results}));assert.equal(f.webhooks.length,3);assert.equal(f.webhooks[0].body,f.webhooks[1].body);for(const request of f.webhooks){assert.equal(request.headers['webhook-id'],event.id);assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.authorization,undefined);assert.equal(request.headers['webhook-signature'],await signWebhook(key1,event.id,request.headers['webhook-timestamp'],request.body));assert.ok(!request.body.includes(secret));assert.deepEqual(Object.keys(JSON.parse(request.body)).sort(),['id','occurredAt','schema','scope','type'])}
 const rotated=await automation.rotateWebhook(hook.id,hook.revision,key2,true);await refused(automation.dispatch(hook.id,hook.revision,queued.id,true),'webhook_revision_changed');await automation.dispatch(hook.id,rotated.revision,queued.id,true);assert.equal(f.webhooks[3].headers['webhook-signature'],await signWebhook(key2,event.id,f.webhooks[3].headers['webhook-timestamp'],f.webhooks[3].body));assert.notEqual(f.webhooks[3].headers['webhook-signature'],await signWebhook(key1,event.id,f.webhooks[3].headers['webhook-timestamp'],f.webhooks[3].body));await automation.revokeWebhook(hook.id,rotated.revision);const current=(await automation.webhookStatus(hook.id)).subscription;await refused(automation.dispatch(hook.id,current.revision,queued.id,true),'webhook_authorization_revoked');assert.equal(f.webhooks.length,4);
 await f.page.getByRole('button',{name:'Refresh requests and webhooks',exact:true}).click();await f.page.getByRole('button',{name:`Open webhook ${hook.id}`,exact:true}).click();await expect(f.page.getByRole('heading',{name:'Webhook delivery status'})).toBeVisible();await expect(f.page.getByText(/attempts 4/)).toBeVisible();if(output)await f.page.screenshot({path:join(output,`automation-webhook-${width}.png`),fullPage:true});assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const finalAudit=await owner.call('audit',{});for(const action of['mcp_access_requested','mcp_access_owner_approved','mcp_access_fulfilled'])assert.ok(finalAudit.some(e=>e.action===action));assert.ok(!JSON.stringify(finalAudit).includes(secret));
 // The authenticated rate door refuses before returning another metadata page.
 // This is a fixed calendar-minute quota, not a quota on 121 requests spread
 // across two minutes. Wait for enough of one window, then send a real burst.
 const remaining=60000-Date.now()%60000;if(remaining<15000)await new Promise(resolve=>setTimeout(resolve,remaining+10));
 const window=Math.floor(Date.now()/60000),burst=await Promise.allSettled(Array.from({length:121},()=>api.groups({limit:1})));
 assert.equal(Math.floor(Date.now()/60000),window,'rate probe must finish inside one quota window');
 const denied=burst.filter(result=>result.status==='rejected');assert.ok(denied.length>=1,'121 signed calls in one minute must be refused');
 for(const result of denied){assert.equal(result.reason.code,'rate_limited');assert.equal(result.reason.status,429)}recipient.lock();console.log(`Administration journey ${width}: signed REST/CLI pagination/CAS, machine MCP exact owner gate and signed webhook failure/replay/rotation/revoke passed`);
}
// One public-door coverage journey; existing item and person journeys own the
// confirmation and deletion cases. This adds derivatives and replay coverage.
export async function erasureCoverageJourney(f,width,{timed=false}={}){
 await adoptAgentPolicy(f);
 const owner=f.owner,api=new ApiClient(owner),automation=new AutomationClient(owner),organization=new OrganizationClient(owner);
 const cacheDirectory=await mkdtemp(join(tmpdir(),'latchkey-erasure-cache-'));
 const recipient=await member(f,5400),title='synthetic-latchkey-5410',secret='synthetic-latchkey-5411';
 try{
 const vault=(await owner.createVault()).vault;
 const attachment=await createAttachment('synthetic-latchkey-5412',new TextEncoder().encode('synthetic-latchkey-5413'));
 const created=await owner.put(vault,createItem('login',{title,values:{password:secret},healthFindings:['synthetic-latchkey-5414'],attachments:[attachment]}));
 const before=await owner.snapshot(vault),oldEnvelope=before.result.versions.find(row=>row.object_id===created.object);before.key.fill(0);
 const subscription=await automation.subscribe({endpoint:'https://receiver.example.test/hook',events:['vault_shared'],secret:encode(random()),confirmed:true});
 await owner.share(vault,recipient.profile.account,await digest(JSON.stringify([recipient.profile.recipientKey,recipient.profile.authorityKey])),['read']);
 await recipient.pinAccount(owner.profile.account,await digest(JSON.stringify([owner.profile.recipientKey,owner.profile.authorityKey])));
 const profilePath=join(cacheDirectory,'profile.json'),cachePath=join(cacheDirectory,'cache.json'),cacheKey=encode(random());
 await writeFile(profilePath,JSON.stringify(recipient.profile),{mode:0o600});
 const cacheInput={profile:profilePath,cache:cachePath,cacheKey,vault,password:'synthetic-latchkey-5401'};
 const native=(name,input)=>command([resolve('scripts/latchkey.mjs'),name],input,{NODE_EXTRA_CA_CERTS:f.caFile});
 const ownerProfilePath=join(cacheDirectory,'owner.json'),ownerCacheInput={...cacheInput,profile:ownerProfilePath,cache:join(cacheDirectory,'owner-cache.json'),password:f.password};
 await writeFile(ownerProfilePath,JSON.stringify(owner.profile),{mode:0o600});
 const ownerCached=await native('cache-refresh',ownerCacheInput);assert.equal(ownerCached.code,0,ownerCached.err);
 const refreshed=await native('cache-refresh',cacheInput);assert.equal(refreshed.code,0,refreshed.err);
 assert.ok(!(await readFile(cachePath,'utf8')).includes(secret));
 const disconnected=await native('cache-read',{...cacheInput,output:join(cacheDirectory,'disconnected.json')});assert.equal(disconnected.code,0,disconnected.err);
 const cached=JSON.parse(await readFile(join(cacheDirectory,'disconnected.json'),'utf8'));assert.equal(cached.connection,'disconnected');assert.equal(cached.expiresAt,null);assert.equal(cached.versions[0].value.fields.find(field=>field.id==='password').value,secret);
 assert.equal((await native('cache-read',{...cacheInput,cacheKey:encode(random()),output:join(cacheDirectory,'wrong-key.json')})).code,1);
 const {scanErasureContent}=await import('../../src/latchkey/erasure/client-scan.mjs');
 const scan=await scanErasureContent(owner,vault,[secret,'synthetic-latchkey-5413']);assert.equal(scan.matches.length,1);assert.deepEqual(scan.matches[0].attachments,[attachment.id]);assert.ok(!JSON.stringify(scan).includes(secret));assert.equal(scan.complete,false);
 // A read-only owner inspects another owner's history locally, without
 // acquiring permission to redact it. Unknown binary content stays explicit.
 const otherVault=(await recipient.createVault()).vault;
 const utf16=term=>Uint8Array.from(Buffer.from('\ufeff'+term,'utf16le'));
 const little=await createAttachment('synthetic-latchkey-5416',utf16(secret));
 const bigBytes=utf16(secret);for(let n=0;n<bigBytes.length;n+=2)[bigBytes[n],bigBytes[n+1]]=[bigBytes[n+1],bigBytes[n]];
 const big=await createAttachment('synthetic-latchkey-5417',bigBytes);
 const binary=await createAttachment('synthetic-latchkey-5418',new Uint8Array([0xff,0x00,0xc0,0x80]));
 const foreign=await recipient.put(otherVault,createItem('secure-note',{title:'Other owner content',attachments:[little,big,binary]}));
 await recipient.put(otherVault,createItem('secure-note',{title:'Current unrelated content'}),foreign.object);
 await recipient.share(otherVault,owner.profile.account,await owner.identity().fingerprint,['read']);
 await owner.pinAccount(recipient.profile.account,await recipient.identity().fingerprint);
 const foreignBefore=await owner.readVault(otherVault),foreignScan=await scanErasureContent(owner,otherVault,[secret]);
 assert.equal(foreignScan.versionsScanned,2);assert.equal(foreignScan.matches.length,1);
 assert.equal(foreignScan.matches[0].version,1);assert.deepEqual(foreignScan.matches[0].attachments,[little.id,big.id]);
 assert.deepEqual(foreignScan.unverifiedAttachments,[{object:foreign.object,version:1,attachment:binary.id}]);
 assert.equal(foreignScan.complete,false);assert.ok(!JSON.stringify(foreignScan).includes(secret));
 assert.deepEqual(await owner.readVault(otherVault),foreignBefore);
 await refused(owner.eraseItem(otherVault,foreign.object,{confirmed:true,revision:foreignBefore.revision}),'not_found');
 const event=(await owner.call('audit',{})).find(row=>row.action==='vault_shared'&&row.object_id===vault);
 const queued=await automation.enqueue(subscription.id,subscription.revision,event.id,true);
 const signing=await keypair('sign'),credential=await automation.issueCredential({vault,publicKey:signing.publicKey,scopes:['posture:read','access:request'],expiresAt:Date.now()+3600000,confirmed:true});
 const agent=new McpClient({origin:f.origin,token:credential.token,privateKey:signing.privateKey,fetcher:f.fetcher});
 const requestInput={vault,account:recipient.profile.account,objects:[created.object],rights:['read'],expiresAt:Date.now()+1800000};
 const requested=await agent.requestAccess(requestInput),request=requested.result.structuredContent.request;
 assert.ok(request);assert.equal((await organization.search(vault,{query:title})).length,1);assert.equal((await organization.search(vault,{health:'findings'})).length,1);
 const evidence=new EvidenceClient(owner),source=await evidence.capture(vault,true);
 const operator=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(recipient.profile.account).first()).operator_id;
 await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByLabel('I confirm this owner account is ready to use.').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();await f.page.goto(f.origin+'/app/vault')}
 await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);
 await f.page.getByRole('button',{name:new RegExp(title)}).click();await expect(f.page.getByRole('heading',{name:title,exact:true})).toBeVisible();
 const reveal=f.page.getByRole('button',{name:'Reveal Password',exact:true});await reveal.hover();await expect(f.page.getByRole('tooltip',{name:'Reveal field',exact:true})).toBeVisible();
 await f.page.getByRole('button',{name:'Copy Password',exact:true}).focus();await expect(f.page.getByRole('tooltip',{name:'Copy field',exact:true})).toBeVisible();
 await f.page.getByRole('button',{name:'Download synthetic-latchkey-5412',exact:true}).focus();await expect(f.page.getByRole('tooltip',{name:'Download attachment',exact:true})).toBeVisible();
 if(output)await f.page.screenshot({path:join(output,`erasure-controls-${width}.png`),fullPage:true});await f.page.getByRole('button',{name:'Lock vault',exact:true}).click();
 await owner.eraseItem(vault,created.object,{confirmed:true,revision:(await owner.readVault(vault)).revision});
 const preview=await owner.call(['subject', 'erase-preview'].join('/'),{subject:operator}),receipt=await owner.call(['subject', 'erase'].join('/'),{subject:operator,confirmed:true,planHash:preview.planHash});
 await owner.rotate(vault);const erasedAt=Date.now();
 // The actual CLI invalidates the durable encrypted file before attempting login.
 // Subject erasure refuses that login; no cached value survives the reconnect door.
 const reconnect=await native('cache-refresh',cacheInput);assert.equal(reconnect.code,1);
 const invalidated=JSON.parse(await readFile(cachePath,'utf8'));assert.equal(invalidated.state,'invalidated');assert.equal(invalidated.envelope,undefined);
 const stale=await native('cache-read',{...cacheInput,output:join(cacheDirectory,'stale.json')});assert.equal(stale.code,1);assert.equal(JSON.parse(stale.err).error,'offline_cache_invalidated');
 const reconciled=await native('cache-refresh',ownerCacheInput);assert.equal(reconciled.code,0,reconciled.err);assert.equal(JSON.parse(reconciled.out).versions,0);
 const freshRead=await native('cache-read',{...ownerCacheInput,output:join(cacheDirectory,'reconciled.json')});assert.equal(freshRead.code,0,freshRead.err);assert.deepEqual(JSON.parse(await readFile(join(cacheDirectory,'reconciled.json'),'utf8')).versions,[]);
 assert.equal((await scanErasureContent(owner,vault,[secret])).matches.length,0);
 // The exact-candidate mode observes the five-minute boundary outside Verify.
 // A timer yields the process and imposes no CPU load or clock substitution.
 if(timed)await new Promise(resolve=>setTimeout(resolve,Math.max(0,erasedAt+300000-Date.now())));
 const modelCapture=[];const capture=value=>{modelCapture.push(JSON.stringify(value));return value};
 assert.equal((await organization.search(vault,{query:title})).length,0);assert.equal((await organization.search(vault,{health:'findings'})).length,0);
 await refused(owner.readItem(vault,created.object,true),'not_found');await refused(api.encryptedItem(vault,created.object),'not_found');
 const exportKey=encode(random()),exported=await VaultClient.openExport(await owner.exportVault(vault,exportKey),exportKey);capture(exported);
 assert.ok(!JSON.stringify(exported).includes(attachment.id));
 assert.ok(!(await automation.requests()).some(row=>row.id===request));await refused(automation.preview(request),'not_found');
 assert.ok(!(await evidence.sources(vault)).some(row=>row.id===source.id));
 const posture=capture(await agent.posture(vault));assert.equal(posture.result.structuredContent.openAccessRequests,0);
 capture(await mcpRequest({origin:f.origin,route:['mcp', 'posture'].join('/'),input:{vault},token:credential.token,privateKey:signing.privateKey,fetcher:f.fetcher}));
 const replay=capture(await agent.requestAccess(requestInput));assert.equal(replay.result.isError,true);
 // Both the direct tool route and the JSON-RPC model door must refuse replay.
 await refused(mcpRequest({origin:f.origin,route:['mcp', 'requestaccess'].join('/'),input:requestInput,token:credential.token,privateKey:signing.privateKey,fetcher:f.fetcher}),'recipient_mismatch');
 await refused(owner.call(['item', 'put'].join('/'),{vault,object:created.object,version:oldEnvelope.version+1,revision:(await owner.readVault(vault)).revision,envelope:JSON.parse(oldEnvelope.envelope)}),'item_erased');
 await refused(api.putEncryptedItem(vault,created.object,{version:oldEnvelope.version+1,revision:(await owner.readVault(vault)).revision,envelope:JSON.parse(oldEnvelope.envelope)}),'item_erased');
 await refused(owner.put(vault,createItem('login',{title,values:{password:secret}}),created.object),'item_erased');
 const checkpoint=receipt.outstanding.find(row=>row.domain==='audit-checkpoint');
 assert.equal((await owner.call(['subject', 'audit-verify'].join('/'),{operation:receipt.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}})).valid,true);
 const auditFacts=(await f.db.prepare('SELECT facts FROM lky_subject_audit WHERE operation=?').bind(receipt.operation).all()).results.map(row=>JSON.parse(row.facts));
 const committed=auditFacts.find(row=>row.domain==='lky_audit_details');assert.ok(committed,'new audit dispositions are included in the held erasure checkpoint');
 const disposition=await f.db.prepare("SELECT * FROM lky_audit_details WHERE json_extract(disposition,'$.reason')='subject-erasure' LIMIT 1").first();assert.ok(disposition);
 await f.db.prepare("UPDATE lky_audit_details SET authorization='synthetic-latchkey-5415' WHERE id=?").bind(disposition.id).run();
 await refused(owner.call(['subject','audit-verify'].join('/'),{operation:receipt.operation,checkpoint:{root:checkpoint.root,length:checkpoint.length,signature:checkpoint.signature}}),'subject_audit_tampered');
 await f.db.prepare('UPDATE lky_audit_details SET authorization=? WHERE id=?').bind(disposition.authorization,disposition.id).run();

 const pending=await automation.webhookStatus(subscription.id);assert.equal(pending.deliveries.length,1);
 assert.equal((await automation.enqueue(subscription.id,subscription.revision,event.id,true)).id,queued.id);
 await automation.dispatch(subscription.id,subscription.revision,queued.id,true);
 assert.equal(f.webhooks.length,1);capture(f.webhooks[0].body);
 // Source-event replay deduplicates the existing secret-free notification;
 // neither it nor a dispatch can recreate content or access requests.
 assert.equal((await automation.webhookStatus(subscription.id)).deliveries.length,1);
 for(const value of [title,secret,attachment.name,attachment.data,recipient.profile.account,operator])assert.ok(!modelCapture.join('').includes(value),'erased data absent from export, model and notification output');
 assert.equal((await organization.search(vault,{})).length,0);assert.equal((await automation.requests()).length,0);
 assert.equal(receipt.complete,false);assert.ok(receipt.outstanding.some(row=>row.domain==='disconnected-device-cache'));
 await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByLabel('I confirm this owner account is ready to use.').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();await f.page.goto(f.origin+'/app/vault')}
 await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);await expect(f.page.getByRole('heading',{name:'No items yet',exact:true})).toBeVisible();await expect(f.page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();await expect(f.page.getByRole('heading',{name:title,exact:true})).toHaveCount(0);
 assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await f.page.screenshot({path:join(output,`erasure-coverage-${width}.png`),fullPage:true});
 console.log(`Erasure coverage ${width}: search, health, encrypted attachment door, export, pending evidence and MCP requests, model capture, source-event and queued notification replay passed${timed?' after five minutes':''}`);
 }finally{recipient.lock();await rm(cacheDirectory,{recursive:true,force:true})}
}
if(import.meta.url===new URL(process.argv[1],'file:').href){if(process.argv.includes('--erasure')){await Promise.all([1440,390].map(async width=>{const f=await vaultFixture({webhook:true});try{await erasureCoverageJourney(f,width,{timed:process.argv.includes('--five-minute')})}finally{await f.close()}}))}else{const cli=await vaultFixture();try{await cliAdministrationJourney(cli)}finally{await cli.close()}for(const width of[1440,390]){const coverage=await vaultFixture({webhook:true});try{await erasureCoverageJourney(coverage,width)}finally{await coverage.close()}const f=await vaultFixture({webhook:true});try{await administrationJourney(f,width)}catch(error){if(output)await f.page.screenshot({path:join(output,`automation-failure-${width}.png`),fullPage:true});throw error}finally{await f.close()}}}}
