import { requestApi } from '../../src/latchkey/api/client.mjs';
import { createPortability } from '@runeditrun/rer/modules/portability';
import archivePolicy from '../../scripts/latchkey/archive-policy.mjs';
import { HandoffClient } from '../../src/latchkey/handoffs/client.mjs';
import { TypedItems, createAttachment } from '../../src/latchkey/items/index.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import {RuntimeTransport} from '../../src/latchkey/runtime/transport.mjs';
import {createServer} from 'node:http';
import {ReviewClient} from '../../src/latchkey/reviews/client.mjs';
import {restoreDomainArchive} from '../latchkey-evidence.mjs';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {expect} from '@playwright/test';
import {vaultFixture} from './fixture.mjs';
import {realRuntimeConsumers} from './runtime-consumers.mjs';
import {ProjectClient} from '../../src/latchkey/projects/client.mjs';
import {projectReference,fieldReference} from '../../src/latchkey/projects/model.mjs';
import {RuntimeGrantClient} from '../../src/latchkey/runtime/grant-client.mjs';
import {resolveRuntime,writeRuntime} from '../../src/latchkey/runtime/client.mjs';
import {MachineClient} from '../../src/latchkey/machine.mjs';
import {LifecycleClient} from '../../src/latchkey/lifecycle/client.mjs';
import {createItem} from '../../src/latchkey/items/types.mjs';
import {encode,id,random,unwrapSigned,open,decode} from '../../src/latchkey/crypto/envelope.mjs';
import {machineKeys} from '../../src/latchkey/runtime/keys.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;if(output)await mkdir(output,{recursive:true});
const refused=(promise,code)=>assert.rejects(promise,error=>error.code===code);
export async function projectRuntimeJourney(f,width,{consumers=true}={}){
 await specialistBoundaryJourney(f,width);
 const client=f.owner,projects=new ProjectClient(client),runtime=new RuntimeGrantClient(client),p=await projects.create({name:'Northstar applications'}),dev=await projects.createEnvironment(p.project,{name:'Development'}),staging=await projects.createEnvironment(p.project,{name:'Staging'}),production=await projects.createEnvironment(p.project,{name:'Production'}),shared=await projects.createEnvironment(p.project,{name:'Shared defaults'});
 const secret='synthetic-latchkey-4100';await projects.set(shared.environment,'SERVICE_SECRET','synthetic-latchkey-4101');await projects.set(dev.environment,'SERVICE_SECRET',secret);await projects.configure(staging.environment,{shared:[shared.environment],inherits:[dev.environment]});assert.equal((await projects.resolve(staging.environment,['SERVICE_SECRET'])).SERVICE_SECRET,secret);await projects.set(staging.environment,'SERVICE_SECRET','synthetic-latchkey-4102');assert.equal((await projects.resolve(staging.environment,['SERVICE_SECRET'])).SERVICE_SECRET,'synthetic-latchkey-4102');
 await projects.set(production.environment,'SERVICE_SECRET',secret);const preview=await projects.preview(production.environment,'SERVICE_SECRET','synthetic-latchkey-4103');assert.equal(preview.providerState,'unchanged');assert.equal(preview.previous.value,secret);await projects.set(production.environment,'SERVICE_SECRET','synthetic-latchkey-4103',{expectedVersion:1});await refused(projects.set(production.environment,'SERVICE_SECRET',preview.proposed,{expectedVersion:preview.expectedVersion,expectedCatalogVersion:preview.catalogVersion}),'version_conflict');assert.equal((await projects.compare(production.environment,'SERVICE_SECRET',1,2)).changed,true);const rollback=await projects.previewRollback(production.environment,'SERVICE_SECRET',1);assert.equal(rollback.providerState,'unchanged');await refused(projects.rollback(production.environment,'SERVICE_SECRET',1,{confirmed:false}),'rollback_confirmation_required');assert.equal((await projects.rollback(production.environment,'SERVICE_SECRET',1,{confirmed:true,expectedVersion:2})).providerState,'unchanged');assert.equal((await projects.history(production.environment,'SERVICE_SECRET')).length,3);const rollbackKey=encode(random()),rollbackProfile=await MachineClient.create(f.origin,rollbackKey),rollbackIdentity=await MachineClient.identity(rollbackProfile),rollbackReference=projectReference(p.project,production.environment,'SERVICE_SECRET'),rollbackGrant=await runtime.grant(rollbackIdentity,rollbackIdentity.fingerprint,[{reference:rollbackReference}],{maxUses:4});const consumer=createServer((req,res)=>{res.writeHead(req.headers.authorization===`Bearer ${secret}`?200:401);res.end()});await new Promise(r=>consumer.listen(0,'127.0.0.1',r));try{const origin=`http://127.0.0.1:${consumer.address().port}`,fetchConsumer=async()=>{const values=await resolveRuntime({profile:rollbackProfile,grant:rollbackGrant,runtimeKey:rollbackKey,references:{VALUE:rollbackReference},fetcher:f.fetcher});return(await fetch(origin,{headers:{authorization:'Bearer '+values.VALUE}})).status};await projects.set(production.environment,'SERVICE_SECRET','synthetic-latchkey-4107',{expectedVersion:3});assert.equal(await fetchConsumer(),401);assert.equal((await projects.rollback(production.environment,'SERVICE_SECRET',1,{confirmed:true,expectedVersion:4})).providerState,'unchanged');assert.equal(await fetchConsumer(),200)}finally{await new Promise(r=>consumer.close(r))}await runtime.revoke(rollbackGrant);
 await projects.set(production.environment,'DATABASE',{type:'connection',driver:'postgres',host:'db.example.test',username:'northstar',password:'synthetic-latchkey-4104'});await projects.reference(production.environment,'SERVICE_ALIAS',{project:p.project,environment:dev.environment,path:'SERVICE_SECRET'});assert.equal((await projects.resolve(production.environment,['SERVICE_ALIAS'])).SERVICE_ALIAS,secret);
 await projects.reference(dev.environment,'CYCLE_A',{project:p.project,environment:dev.environment,path:'CYCLE_B'});await projects.reference(dev.environment,'CYCLE_B',{project:p.project,environment:dev.environment,path:'CYCLE_A'});await refused(projects.resolve(dev.environment,['CYCLE_A']),'reference_cycle');await refused(projects.resolve(dev.environment,['ABSENT']),'reference_missing');await projects.reference(dev.environment,'FOREIGN',{project:id(),environment:id(),path:'SERVICE_SECRET'});await refused(projects.resolve(dev.environment,['FOREIGN']),'not_found');
 const reference=projectReference(p.project,production.environment,'SERVICE_SECRET'),runtimeKey=encode(random()),profile=await MachineClient.create(f.origin,runtimeKey),identity=await MachineClient.identity(profile);let grant=await runtime.grant(identity,identity.fingerprint,[{reference,read:true,write:true}],{expiresInSeconds:3600,maxUses:50});let input={profile,grant,runtimeKey,references:{SERVICE_SECRET:reference}};assert.equal((await resolveRuntime({...input,fetcher:f.fetcher})).SERVICE_SECRET,secret);
 if(consumers)assert.equal((await realRuntimeConsumers(f,input,secret)).authenticated,5);
 const written=await writeRuntime({...input,fetcher:f.fetcher},reference,'synthetic-latchkey-4105',{expectedVersion:5});assert.equal(written.version,6);assert.equal((await projects.resolve(production.environment,['SERVICE_SECRET'])).SERVICE_SECRET,'synthetic-latchkey-4105');await refused(writeRuntime({...input,fetcher:f.fetcher},reference,'synthetic-latchkey-4106',{expectedVersion:5}),'runtime_write_conflict');await runtime.revoke(grant);await refused(resolveRuntime({...input,fetcher:f.fetcher}),'machine_authority_expired');
 const reviewedGrant=await runtime.grant(identity,identity.fingerprint,[{reference}],{maxUses:20});const review=(await client.call('reviews/create',{vault:p.vault,reviewer:client.profile.account,scheduleAt:Date.now(),dueAt:Date.now()+86400000,period:'Northstar application review'})).id;const reviewState=await client.call('reviews/get',{review});const reviewRow=reviewState.rows.find(r=>r.id===reviewedGrant.id&&r.transport==='scoped-runtime');assert.ok(reviewRow);assert.equal(reviewRow.status,'active');await client.call('reviews/decide',{review,key:reviewRow.key,decision:'remove',reason:'Retire application integration'});await new ReviewClient(client).applyRemoval(review,reviewRow.key);await refused(resolveRuntime({...input,grant:reviewedGrant,fetcher:f.fetcher}),'machine_authority_expired');
 const limited=await runtime.grant(identity,identity.fingerprint,[{reference}],{maxUses:1});await resolveRuntime({...input,grant:limited,fetcher:f.fetcher});await refused(resolveRuntime({...input,grant:limited,fetcher:f.fetcher}),'machine_authority_expired');
 const expired=await runtime.grant(identity,identity.fingerprint,[{reference}],{expiresInSeconds:1});await new Promise(r=>setTimeout(r,1100));await refused(resolveRuntime({...input,grant:expired,fetcher:f.fetcher}),'machine_authority_expired');
 const vault=(await client.createVault()).vault,item=(await client.put(vault,createItem('login',{title:'Finance ordinary shared vault',values:{username:'finance@example.test',password:'synthetic-latchkey-4110'},fields:[{id:'recovery',label:'Recovery code',type:'secret',secret:true,required:false,value:'synthetic-latchkey-4112'}]}))).object;const field=fieldReference(vault,item,'password'),fieldGrant=await runtime.grant(identity,identity.fingerprint,[{reference:field}],{maxUses:20});const fieldInput={profile,grant:fieldGrant,runtimeKey,references:{PASSWORD:field},fetcher:f.fetcher};assert.equal((await resolveRuntime(fieldInput)).PASSWORD,'synthetic-latchkey-4110');await refused(resolveRuntime({...fieldInput,references:{OTP:fieldReference(vault,item,'recovery')}}),'permission_denied');await refused(resolveRuntime({...fieldInput,references:{FOREIGN:fieldReference(id(),item,'password')}}),'permission_denied');
 const keys=await machineKeys(profile,runtimeKey);const transport=new RuntimeTransport(f.origin,fieldGrant.token,{fetcher:f.fetcher});await refused(transport.request('runtime/fetch',{grant:fieldGrant.id,scopes:[grant.scopes[0].id]},keys.signing.privateKey),'permission_denied');const scope=fieldGrant.scopes[0],key=await unwrapSigned(scope.wrapped,keys.recipient.privateKey,fieldGrant.authorityKey,fieldGrant.account,{tenant:fieldGrant.tenant,vault,object:fieldGrant.machine,purpose:`runtime-key:${scope.id}`,epoch:scope.epoch,version:1});try{const encrypted=await client.call('item/read',{vault,object:item,history:false});await assert.rejects(open(key,JSON.parse(encrypted.versions[0].envelope),JSON.parse(encrypted.versions[0].envelope).context))}finally{key.fill(0)}
 const life=new LifecycleClient(client);await life.change(vault,item,'archived',{confirmed:true});await life.change(vault,item,'active',{confirmed:true});await refused(resolveRuntime(fieldInput),'machine_authority_expired');
 const family=(await client.createVault({kind:'family'})).vault,familyItem=(await client.put(family,createItem('login',{title:'Family secret',values:{password:'synthetic-latchkey-4111'}}))).object;await refused(runtime.grant(identity,identity.fingerprint,[{reference:fieldReference(family,familyItem,'password')}]),'not_found');
 // The actual project console creates and previews an environment secret.
 await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByLabel('I confirm this owner account is ready to use.').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application' + '/json',buffer:Buffer.from(JSON.stringify(client.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await f.page.getByRole('button',{name:'Projects and applications',exact:true}).click();await f.page.getByLabel('Project name',{exact:true}).fill('Northstar console application');await f.page.getByRole('button',{name:'Create project',exact:true}).click();await expect(f.page.getByLabel('Project',{exact:true}).locator('option:checked')).toHaveText('Northstar console application');for(const name of['Development','Staging','Production']){await f.page.getByLabel('Environment name',{exact:true}).fill(name);await f.page.getByRole('button',{name:'Create environment',exact:true}).click();await expect(f.page.getByLabel('Environment',{exact:true}).locator('option:checked')).toHaveText(name);await f.page.getByLabel('Secret path',{exact:true}).fill('CONSOLE_BOOTSTRAP');await f.page.getByLabel('Proposed value',{exact:true}).fill('synthetic-latchkey-4121');await f.page.getByRole('button',{name:'Preview secret change'}).click();await f.page.getByLabel('I approve this exact environment, path and proposed value.').check();await f.page.getByRole('button',{name:'Save approved secret'}).click();await expect(f.page.getByText('Secret version saved. Provider state unchanged.')).toBeVisible()}
 await f.page.getByLabel('Project',{exact:true}).selectOption(p.project);await f.page.getByLabel('Environment',{exact:true}).selectOption(production.environment);await f.page.getByLabel('Secret path',{exact:true}).fill('CONSOLE_PASSWORD');await f.page.getByLabel('Proposed value',{exact:true}).fill('synthetic-latchkey-4120');await f.page.getByRole('button',{name:'Preview secret change'}).click();await expect(f.page.getByRole('heading',{name:'Review secret change'})).toBeVisible();if(output)await f.page.screenshot({path:join(output,`projects-preview-${width}.png`),fullPage:true});await f.page.getByLabel('I approve this exact environment, path and proposed value.').check();await f.page.getByRole('button',{name:'Save approved secret'}).click();await expect(f.page.getByText('Secret version saved. Provider state unchanged.')).toBeVisible();await f.page.getByRole('button',{name:'Load secret versions'}).click();await f.page.getByLabel('Restore version').selectOption('1');await f.page.getByRole('button',{name:'Preview vault rollback'}).click();await expect(f.page.getByRole('heading',{name:'Review vault rollback'})).toBeVisible();if(output)await f.page.screenshot({path:join(output,`projects-rollback-${width}.png`),fullPage:true});assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 const archive=await restoreDomainArchive(f);assert.equal((await archive.prepare('SELECT COUNT(*) AS n FROM lky_projects').first()).n,2);assert.equal((await archive.prepare('SELECT COUNT(*) AS n FROM lky_project_environments').first()).n,7);assert.equal((await archive.prepare('SELECT COUNT(*) AS n FROM lky_runtime_grants').first()).n,0);assert.equal((await archive.prepare('SELECT COUNT(*) AS n FROM lky_devices').first()).n,0);assert.equal((await archive.prepare('SELECT COUNT(*) AS n FROM lky_checkouts').first()).n,0);const sourceRows=(await f.db.prepare('SELECT vault_id,object_id,version,envelope FROM lky_versions ORDER BY vault_id,object_id,version').all()).results,restoredRows=(await archive.prepare('SELECT vault_id,object_id,version,envelope FROM lky_versions ORDER BY vault_id,object_id,version').all()).results;assert.deepEqual(restoredRows,sourceRows);const persisted={};for(const table of['lky_versions','lky_projects','lky_project_environments','lky_project_resources','lky_runtime_grants','lky_runtime_scopes','lky_runtime_dependencies','lky_events'])persisted[table]=(await f.db.prepare(`SELECT * FROM ${table}`).all()).results;const serialized=JSON.stringify(persisted);for(const marker of[secret,'synthetic-latchkey-4104','synthetic-latchkey-4110','Northstar applications','SERVICE_SECRET'])assert.ok(!serialized.includes(marker),`control plane contains ${marker}`);
 console.log(`Project/runtime journey ${width}: encrypted environments, precedence, typed connections, references, append rollback, exact field and machine scopes, expiry/limits/revocation${consumers?', CLI and four actual SDK consumers authenticated':''} passed`);
}
if(import.meta.url===new URL(process.argv[1],'file:').href){for(const width of[1440,390]){const f=await vaultFixture();try{await projectRuntimeJourney(f,width,{consumers:width===1440})}catch(error){if(output)await f.page.screenshot({path:join(output,`projects-failure-${width}.png`),fullPage:true});throw error}finally{await f.close()}}}


// Uses the emitted Worker, the shipped CLI and the existing vault screens.
export async function specialistBoundaryJourney(f, width) {
 const owner = f.owner, items = new TypedItems(owner), handoffs = new HandoffClient(owner);
 const { vault } = await owner.createVault(), directory = await mkdtemp(join(tmpdir(), 'latchkey-specialists-'));
 const certificate = await readFile(f.caFile, 'utf8'), privateKey = await readFile(join(dirname(f.caFile), 'key.pem'), 'utf8');
 const cert = await items.save(vault, createItem('certificate', { title: 'Private certificate', values: { certificate, privateKey, expiry: '2020-01-01' }, attachments: [await createAttachment('private-certificate.pem', new TextEncoder().encode(certificate))] }));
 const document = await items.save(vault, createItem('document', { title: 'Expiring recovery document', values: { description: 'synthetic-latchkey-6100', expiry: '2020-01-02' }, attachments: [await createAttachment('recovery.txt', new TextEncoder().encode('synthetic-latchkey-6101'))] }));
 assert.equal(await items.field(vault, cert.object, 'privateKey', 'reveal'), privateKey);
 assert.equal(new TextDecoder().decode((await items.attachment(vault, cert.object, (await items.current(vault, cert.object)).value.attachments[0].id)).data), certificate);
 const ordinary=await items.save(vault,createItem('secure-note',{title:'Unleased temporary item',values:{note:'synthetic-latchkey-6106'}}));
 await owner.eraseItem(vault,ordinary.object,{confirmed:true});await refused(items.current(vault,ordinary.object),'not_found');
 const alerts = await handoffs.expiry(vault);
 assert.deepEqual(alerts.alerts.map(row => row.object).sort(), [cert.object, document.object].sort());
 assert.ok(alerts.alerts.every(row => row.delivery === 'received-in-client' && row.state === 'expired'));
 await refused(handoffs.expiry(vault, { withinDays: -1 }), 'invalid_expiry_window');
 const refs = { source: cert.object, destination: id(), owner: id(), origin: 'https://specialist.example.test' };
 const opened = [];
 for (const [category, provider] of [['tls','uptime'], ['pki','venafi'], ['session','teleport'], ['mdm','jamf'], ['spend','zylo'], ['task','pegboard'], ['payroll','envelope']]) {
  const result = await handoffs.record(vault, { ...refs, category, provider }, { confirmed: true });
  const value = await handoffs.open(vault, result.object); opened.push(value);
  assert.equal(value.state, 'unresolved'); assert.equal(value.result, 'adapter-unavailable'); assert.equal(value.acknowledgement, 'none'); assert.equal(value.authority, 'reference-only'); assert.equal(value.providerVerified, false); assert.equal(value.url, refs.origin);
 }
 await refused(handoffs.record(vault, { ...refs, category: 'pki', provider: 'venafi', password: 'synthetic-latchkey-6102' }, { confirmed: true }), 'invalid_handoff_fields');
 await refused(handoffs.record(vault, { ...refs, category: 'pki', provider: 'venafi', source: 'synthetic-latchkey-6103' }, { confirmed: true }), 'opaque_reference_required');
 await refused(handoffs.record(vault, { ...refs, category: 'pki', provider: 'venafi', origin: refs.origin + '/?secret=synthetic-latchkey-6104' }, { confirmed: true }), 'handoff_origin_required');
 await refused(handoffs.record(vault, { ...refs, category: 'pki', provider: 'venafi' }), 'handoff_confirmation_required');
 await refused(handoffs.record(vault, { ...refs, category: 'pki', provider: 'venafi' }, { confirmed: 'true' }), 'handoff_confirmation_required');
 const originalReference=opened.find(row=>row.category==='task');
 const copiedReference=await items.save(vault,(await items.current(vault,originalReference.object)).value);
 await refused(handoffs.open(vault,copiedReference.object),'handoff_not_found');
 const changedReference=(await items.current(vault,originalReference.object)).value;
 changedReference.fields.find(field=>field.id==='destination').value=id();
 await items.save(vault,changedReference,originalReference.object);
 await refused(handoffs.open(vault,originalReference.object),'handoff_not_found');
 const tampered=opened.find(row=>row.category==='spend');const tamperedRecord=await items.current(vault,tampered.object);tamperedRecord.value.fields.push({id:'payrollData',label:'Payroll data',type:'secret',secret:true,value:'synthetic-latchkey-6105'});await items.save(vault,tamperedRecord.value,tampered.object);await refused(handoffs.open(vault,tampered.object),'handoff_not_found');
 const payloads = JSON.stringify(opened); for (const secret of [privateKey, certificate, 'synthetic-latchkey-6101']) assert.ok(!payloads.includes(secret));
 const credential = await items.save(vault, createItem('login', { title: 'Shared privileged account', values: { password: 'synthetic-latchkey-6110' } }));
 const leaseInput = { vault, object: credential.object, expiresAt: Date.now() + 60000, confirmed: true };
 await refused(owner.call('checkout' + '/acquire', {...leaseInput, confirmed:false}), 'checkout_confirmation_required');
 await refused(owner.call('checkout' + '/acquire', {...leaseInput, expiresAt:Date.now()+3700000}), 'invalid_checkout_expiry');
 const races = await Promise.allSettled([owner.call('checkout' + '/acquire', leaseInput), owner.call('checkout' + '/acquire', leaseInput)]);
 assert.equal(races.filter(row => row.status === 'fulfilled').length, 1);
 const lease = races.find(row => row.status === 'fulfilled').value;
 assert.equal(lease.providerState, 'unchanged');
 assert.equal((await requestApi(owner,'GET',`/vaults/${vault}/items/${credential.object}/checkout`)).checkout,lease.checkout);
 await refused(owner.call('checkout' + '/complete', { vault, object: credential.object, checkout: lease.checkout, version: 1, confirmed: true }), 'checkout_rotation_required');
 await f.db.prepare('UPDATE lky_checkouts SET expires_at=? WHERE id=?').bind(Date.now()-1, lease.checkout).run();
 const expired = await owner.call('checkout' + '/status', { vault, object: credential.object });
 assert.equal(expired.state, 'expired-rotation-required'); assert.equal(expired.stale,true); assert.equal(expired.checkout,lease.checkout);
 await refused(owner.call('checkout' + '/acquire', { ...leaseInput, expiresAt: Date.now()+60000 }), 'checkout_rotation_required');
 const changed = await items.save(vault, createItem('login', { title: 'Shared privileged account', values: { password: 'synthetic-latchkey-6111' }, fields: [{id:'sessionReference',label:'Specialist session reference',type:'text',secret:true,value:opened.find(row=>row.category==='session').destination}] }), credential.object);
 const completed = await requestApi(owner,'POST',`/vaults/${vault}/items/${credential.object}/checkout/complete`,{checkout:lease.checkout,version:changed.version,confirmed:true});
 assert.equal(completed.providerState, 'unchanged'); assert.equal(completed.verification, 'owner-attested-vault-version');
 await refused(owner.call('checkout' + '/complete', { vault, object: credential.object, checkout: lease.checkout, version: changed.version, confirmed: true }), 'checkout_changed');
 const response = await f.context.request.post(f.origin+'/auth/invite', {headers:{origin:f.origin},data:{email:`synthetic-latchkey-${width+6200}@example.test`,displayName:'Specialist boundary member',role:'member'}}); assert.equal(response.status(),202);
 const token = new URL(f.mail.at(-1).content.find(c=>c.type==='text' + '/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const member = new VaultClient(f.origin,{fetcher:f.fetcher}); await member.confirmIdentity(token); const enrolled=await member.register('synthetic-latchkey-6120'); await member.unlock(enrolled.profile,'synthetic-latchkey-6120');
 try {
  await owner.share(vault, member.profile.account, await member.identity().fingerprint, ['read']); await member.pinAccount(owner.profile.account,await owner.identity().fingerprint);
  assert.equal(await new TypedItems(member).field(vault, cert.object, 'privateKey', 'reveal'), privateKey);
  assert.equal((await new HandoffClient(member).expiry(vault)).alerts.length,2);
  assert.equal((await new HandoffClient(member).open(vault,opened.find(row=>row.category==='payroll').object)).acknowledgement,'none');
  const subject=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(member.profile.account).first()).operator_id;
  assert.equal((await owner.call('subject' + '/erase-preview',{subject})).requiresConfirmation,true);
  await refused(member.call('checkout' + '/acquire', { ...leaseInput, expiresAt:Date.now()+60000 }), 'checkout_owner_required');
  await refused(new HandoffClient(member).record(vault,{...refs,category:'pki',provider:'venafi'},{confirmed:true}), 'handoff_owner_required');
  const unrelated=(await member.createVault()).vault;
  await refused(owner.call('checkout' + '/status',{vault:unrelated,object:credential.object}), 'not_found');
  const next=await requestApi(owner,'POST',`/vaults/${vault}/items/${credential.object}/checkout`,{expiresAt:Date.now()+60000,confirmed:true}); assert.ok(next.checkout);
  assert.equal(await new TypedItems(member).field(vault,credential.object,'password','reveal'),'synthetic-latchkey-6111');
  await f.db.prepare('UPDATE lky_checkouts SET expires_at=? WHERE id=?').bind(Date.now()-1,next.checkout).run();
  assert.equal((await owner.call('checkout' + '/status',{vault,object:credential.object})).stale,true);
  assert.equal(await new TypedItems(member).field(vault,credential.object,'password','reveal'),'synthetic-latchkey-6111');
  const releaseInput={vault,object:credential.object,checkout:next.checkout,reason:'holder-unavailable',confirmed:true};
  await refused(member.call('checkout' + '/release',releaseInput),'checkout_owner_required');
  await refused(owner.call('checkout' + '/release',{...releaseInput,confirmed:false}),'checkout_confirmation_required');
  await refused(owner.call('checkout' + '/release',{...releaseInput,reason:'synthetic-latchkey-6113'}),'checkout_release_reason_required');
  assert.equal((await owner.call('checkout' + '/status',{vault,object:credential.object})).checkout,next.checkout);
  const released=await requestApi(owner,'POST',`/vaults/${vault}/items/${credential.object}/checkout/release`,{checkout:next.checkout,reason:releaseInput.reason,confirmed:true});
  assert.equal(released.state,'available'); assert.equal(released.providerState,'unchanged');
  const releaseAudit=(await requestApi(owner,'GET','/events?limit=200')).data.find(row=>row.action==='checkout_released:holder-unavailable'&&row.object_id===credential.object);
  assert.ok(releaseAudit);assert.equal(releaseAudit.actor,owner.profile.account);assert.equal(releaseAudit.device,owner.profile.device);
  await refused(owner.call('checkout' + '/release',releaseInput),'checkout_changed');
  const renewed=await requestApi(owner,'POST',`/vaults/${vault}/items/${credential.object}/checkout`,{expiresAt:Date.now()+60000,confirmed:true});
  const sharedRotation=await items.save(vault,createItem('login',{title:'Shared privileged account',values:{password:'synthetic-latchkey-6112'},fields:[{id:'sessionReference',label:'Specialist session reference',type:'text',secret:true,value:opened.find(row=>row.category==='session').destination}]}),credential.object);
  assert.equal((await requestApi(owner,'POST',`/vaults/${vault}/items/${credential.object}/checkout/complete`,{checkout:renewed.checkout,version:sharedRotation.version,confirmed:true})).providerState,'unchanged');
  assert.equal(await new TypedItems(member).field(vault,credential.object,'password','reveal'),'synthetic-latchkey-6112');
  await owner.call('checkout' + '/acquire',{...leaseInput,expiresAt:Date.now()+60000});
  await owner.eraseItem(vault,credential.object,{confirmed:true});
  assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_checkouts WHERE vault_id=? AND object_id=?').bind(vault,credential.object).first()).n,0);
  await refused(owner.call('checkout' + '/status',{vault,object:credential.object}), 'not_found');
  const watch = new HandoffClient(member).watchExpiry(vault, { intervalMs: 1000, checks: 2 });
  assert.equal((await watch.next()).value.alerts.length, 2);
  await member.call('device' + '/revoke', { device: member.profile.device });
  await refused(watch.next(), 'authority_expired');
 } finally { member.lock(); }
 await owner.call('checkout' + '/acquire',{vault,object:cert.object,expiresAt:Date.now()+60000,confirmed:true});
 const records=await createPortability({db:f.db,policy:archivePolicy}),job=await records.exports.create('synthetic-latchkey-6130');
 while((await records.exports.advance(job,{maxParts:100})).phase!=='complete'){}
 const archive=(await new Response(await records.exports.download(job)).text()).trim().split('\n').map(line=>JSON.parse(line));
 assert.ok(!archive[0].tables.some(table=>table.name==='lky_checkouts'));
 assert.ok(!archive.some(part=>part.table==='lky_checkouts'));
 try {
  const profile=join(directory,'profile.json'); await writeFile(profile,JSON.stringify(owner.profile),{mode:0o600});
  const cli = input => new Promise((resolve,reject)=>{ const child=spawn(process.execPath,['scripts/latchkey.mjs','item-expiry'],{env:{...process.env,NODE_EXTRA_CA_CERTS:f.caFile},stdio:['pipe','pipe','pipe']}); let stdout='',stderr=''; child.stdout.on('data',part=>stdout+=part);child.stderr.on('data',part=>stderr+=part);child.on('error',reject);child.on('close',code=>code===0?resolve(JSON.parse(stdout)):reject(Error('CLI expiry failed: '+stderr)));child.stdin.end(JSON.stringify(input)); });
  assert.equal((await cli({profile,password:f.password,vault})).alerts.length,2);
  const invalidWatch = handoffs.watchExpiry(vault, { intervalMs: 0 });
  await refused(invalidWatch.next(), 'invalid_expiry_schedule');
  // Mutations finish before advancing the recipient's next scheduled check.
  // Their crypto cost must not race a wall-clock polling interval in CI.
  const scheduled = handoffs.watchExpiry(vault, { checks: 3, intervalMs: 1000 });
  assert.equal((await scheduled.next()).value.alerts.length, 2);
  const changedDocument = (await items.current(vault, document.object)).value;
  changedDocument.fields.find(field => field.id === 'description').value = 'synthetic-latchkey-6131';
  await items.save(vault, changedDocument, document.object);
  const changedReport = (await scheduled.next()).value;
  assert.equal(changedReport.alerts.length, 1);
  assert.equal(changedReport.alerts[0].object, document.object);
  assert.equal(changedReport.alerts[0].version, 2);
  const archivedDocument = (await items.current(vault, document.object)).value;
  archivedDocument.fields.find(field => field.id === 'description').value = 'synthetic-latchkey-6132';
  await items.save(vault, archivedDocument, document.object);
  await new LifecycleClient(owner).change(vault, document.object, 'archived', { confirmed: true });
  assert.deepEqual((await scheduled.next()).value.alerts, []);
  assert.equal((await scheduled.next()).done, true);
  const child = spawn(process.execPath, ['scripts/latchkey.mjs', 'item-expiry-watch'], { env: { ...process.env, NODE_EXTRA_CA_CERTS: f.caFile }, stdio: ['pipe', 'pipe', 'pipe'] });
  const done = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code)); });
  let stderr = ''; child.stderr.on('data', part => { stderr += part; });
  child.stdin.end(JSON.stringify({ profile, password: f.password, vault, checks: 2, intervalMs: 1000 }));
  const reports = [];
  try {
   for await (const line of createInterface({ input: child.stdout })) reports.push(JSON.parse(line));
   assert.equal(await done, 0, stderr);
  } finally { if (child.exitCode === null) { child.kill('SIGTERM'); await done; } }
  assert.deepEqual(reports.map(report => report.alerts?.length), [1, 0, undefined]);
  assert.equal(reports[0].alerts[0].object, cert.object);
  assert.deepEqual(reports.at(-1), { completed: true });
  for (const secret of [privateKey, certificate, 'synthetic-latchkey-6100', 'synthetic-latchkey-6131', 'synthetic-latchkey-6132']) assert.ok(!JSON.stringify([...reports, changedReport]).includes(secret));
  await new LifecycleClient(owner).change(vault, document.object, 'active', { confirmed: true });

  const stored=JSON.stringify({read:await requestApi(owner,'GET',`/vaults/${vault}/items`),audit:await requestApi(owner,'GET','/events'),archive});
  for(const secret of [privateKey,certificate,'synthetic-latchkey-6101',refs.origin,refs.destination,refs.owner])assert.ok(!stored.includes(secret));
  await f.page.setViewportSize({width,height:1000}); await f.page.goto(f.origin+'/app/vault');
  if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByLabel('I confirm this owner account is ready to use.').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();await f.page.goto(f.origin+'/app/vault');}
  await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application' + '/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);
  await f.page.getByRole('button',{name:/Private certificate/}).click();
  const copyControl=f.page.getByRole('button',{name:'Copy Private key',exact:true});
  const copyTooltip=f.page.getByRole('tooltip',{name:'Copy field'});
  // History arrives after the fields render. Finish that layout before
  // positioning the pointer for a continuous hover and its delay sample.
  await expect(f.page.getByRole('article',{name:'Private certificate',exact:true}).getByRole('button',{name:/^Version 1 /})).toBeVisible();
  await copyControl.scrollIntoViewIfNeeded();
  await f.page.mouse.move(0,0);
  // Sample in the mouse event, so a delayed test driver cannot miss the delay.
  await copyControl.evaluate(button => {
   window.latchkeyTooltipProofButton=button;
   button.tooltipHoverProof = new Promise(resolve => {
    button.parentElement.addEventListener('mouseenter', event => {
     const started=performance.now(), initial=getComputedStyle(button.nextElementSibling).visibility;
     button.tooltipHoverEntry={x:event.clientX,y:event.clientY,initial};
     const sample=() => getComputedStyle(button.nextElementSibling).visibility==='visible'
      ? resolve({initial,elapsed:performance.now()-started}) : requestAnimationFrame(sample);
     requestAnimationFrame(sample);
    }, {once:true});
   });
  });
  await copyControl.hover();
  try { await expect(copyTooltip).toBeVisible(); }
  catch(error) {
   console.error('Certificate tooltip interaction:',await f.page.evaluate(() => {
    const original=window.latchkeyTooltipProofButton,current=document.querySelector('button[aria-label="Copy Private key"]');
    return {sameControl:original===current,connected:original?.isConnected,entry:original?.tooltipHoverEntry,
     rectangle:current?.getBoundingClientRect().toJSON(),hovered:current?.matches(':hover'),focused:current===document.activeElement,
     visibility:current&&getComputedStyle(current.nextElementSibling).visibility,scrollY};
   }));
   throw error;
  }
  const hoverProof=await copyControl.evaluate(button => button.tooltipHoverProof);
  assert.equal(hoverProof.initial,'hidden');assert.ok(hoverProof.elapsed>=250);
  await f.page.mouse.move(0,0);await expect(copyTooltip).toBeHidden();
  const attachmentControl=f.page.getByRole('button',{name:'Download private-certificate.pem',exact:true});
  await attachmentControl.focus();
  assert.equal(await attachmentControl.evaluate(button => getComputedStyle(button.nextElementSibling).visibility),'visible');
  await expect(f.page.getByRole('tooltip',{name:'Download attachment'})).toBeVisible();
  const reveal=f.page.getByRole('button',{name:'Reveal Private key',exact:true});await reveal.focus();
  assert.equal(await reveal.evaluate(button => getComputedStyle(button.nextElementSibling).visibility),'visible');
  await expect(f.page.getByRole('tooltip',{name:'Reveal field'})).toBeVisible();
  await expect(f.page.getByRole('tooltip',{name:'Download attachment'})).toBeHidden();
  await reveal.press('Escape');await expect(f.page.getByRole('tooltip',{name:'Reveal field'})).toBeHidden();
  await attachmentControl.focus();await reveal.focus();
  await expect(f.page.getByRole('tooltip',{name:'Reveal field'})).toBeVisible();
  assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await f.page.screenshot({path:join(output,`specialist-certificate-${width}.png`),fullPage:true});
  await f.page.getByRole('button',{name:/Expiring recovery document/}).click();await expect(f.page.getByRole('heading',{name:'Expiring recovery document',exact:true})).toBeVisible();
  assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await f.page.screenshot({path:join(output,`specialist-document-${width}.png`),fullPage:true});
 } finally { await rm(directory,{recursive:true,force:true}); }
}
