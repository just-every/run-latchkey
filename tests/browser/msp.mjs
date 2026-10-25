import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { vaultFixture } from './fixture.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
import { ApiClient } from '../../src/latchkey/api/client.mjs';
import { FleetClient,createProviderIdentity,publicProviderIdentity } from '../../src/latchkey/msp/client.mjs';
import { captureExpiry } from '../../src/latchkey/msp/posture-client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import { id,sign } from '../../src/latchkey/crypto/envelope.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;
if(output)await mkdir(output,{recursive:true});
const refused=(promise,code)=>assert.rejects(promise,error=>error.code===code);
const strict={externalEnabled:false,domains:[],defaultDays:1,maxDays:1};
async function enrollAnalyst(f,n){
 await new ApiClient(f.owner).inviteUser({email:`synthetic-latchkey-${n}@example.test`,displayName:'Finance operations analyst',role:'member'});
 const link=f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0];
 const member=new VaultClient(f.origin,{fetcher:f.fetcher});await member.confirmIdentity(new URL(link).searchParams.get('token'));const enrolled=await member.register(`synthetic-latchkey-${n+1}`);await member.unlock(enrolled.profile,`synthetic-latchkey-${n+1}`);return member;
}
async function grant(owner,identity,scopes=['summary','template','posture']){
 return new ApiClient(owner).request('POST','/msp/delegations',{...publicProviderIdentity(identity),scopes,expiresAt:Date.now()+86400000,confirmed:true});
}
async function request(f,identity,delegation,action,input={},overrides={}){
 const body=JSON.stringify({delegation:delegation.delegation,provider:identity.provider,nonce:id(),time:Date.now(),action,input,...overrides});
 return{body,init:{method:'POST',headers:{origin:identity.origin,'content-type':'application/json','x-latchkey-provider-signature':await sign(identity.privateKey,JSON.stringify(['latchkey/msp/v1',f.origin,body]))},body,redirect:'error'}};
}
export async function mspJourney(width,{scale=false}={}){
 const fixtures=[],grants=[],secrets=[];
 try{
  // Each client has an actual emitted Worker, independent D1/owner/keys and
  // origin. Only mail delivery is replaced at the network edge by the fixture.
  const count=scale?25:2;
  for(let i=0;i<count;i++){
   const f=await vaultFixture({browserEnabled:i===0});fixtures.push(f);
   const vault=(await f.owner.createVault()).vault,secret=`synthetic-latchkey-${8000+i}`;
   const object=(await f.owner.put(vault,createItem('login',{title:`Client ${i+1} finance system`,values:{password:secret},fields:[{id:'expiry',label:'Expiry',type:'date',secret:false,value:'2020-01-01'}]}))).object;
   const analyst=await enrollAnalyst(f,9000+i*10);
   await f.owner.share(vault,analyst.profile.account,await analyst.identity().fingerprint,['read']);
   await analyst.pinAccount(f.owner.profile.account,await f.owner.identity().fingerprint);assert.equal((await analyst.readItem(vault,object)).versions.length,1);
   const privateWork=(await analyst.createVault({kind:'private-work'})).vault;
   await analyst.put(privateWork,createItem('secure-note',{title:'Private client work draft',values:{note:`synthetic-latchkey-${9002+i*10}`}}));analyst.lock();
   await new ApiClient(f.owner).inviteUser({email:`synthetic-latchkey-${9003+i*10}@example.test`,displayName:'Invited project contractor',role:'member'});
   await captureExpiry(f.owner,vault,{confirmed:true});
   secrets.push({vault,object,secret,recipientKey:f.owner.profile.recipientKey,authorityKey:f.owner.profile.authorityKey});
   await new ApiClient(f.owner).setSharingPolicy({externalEnabled:true,domains:['example.test'],defaultDays:7,maxDays:30});
   await new ApiClient(f.owner).request('PUT','/msp/commercial',{status:i%2?'trial':'active',reference:`synthetic-latchkey-${8100+i}`,confirmed:true});
  }
  const first=fixtures[0],second=fixtures[1],identity=await createProviderIdentity(first.origin),other=await createProviderIdentity(first.origin);
  for(const f of fixtures)grants.push(await grant(f.owner,identity));
  const network=(url,init)=>{const f=fixtures.find(f=>new URL(url).origin===f.origin);assert.ok(f);return f.fetcher(url,init)};
  const fleet=new FleetClient(identity,{fetcher:network,consoleOrigin:first.origin});
  const summaries=await Promise.all(grants.map(g=>fleet.summary(g)));assert.equal(new Set(summaries.map(s=>s.tenant)).size,count);
  for(let i=0;i<count;i++){
   const s=summaries[i];assert.equal(s.onboarding.active,2);assert.equal(s.onboarding.invited,1);assert.equal(s.onboarding.enrolled,2);assert.equal(s.health.coverage,'current-observed-company-expiry');assert.equal(s.health.atRiskMembers.length,2);assert.equal(s.health.atRiskMembers[0].expiredItems,1);assert.equal(s.adoption.coverage,'observed-password-authentication');assert.equal(s.adoption.authenticatedMembers,2);assert.equal(s.members.filter(member=>member.enrolled).length,2);assert.equal(s.members.find(member=>member.status==='invited').enrolled,false);assert.equal(s.commercial.reference,`synthetic-latchkey-${8100+i}`);
   const encoded=JSON.stringify(s);for(const secret of secrets.flatMap(s=>[s.secret,s.vault,s.object,s.recipientKey,s.authorityKey]))assert.ok(!encoded.includes(secret));assert.ok(!encoded.includes('@example.test'));assert.ok(!encoded.includes(first.owner.profile.account));
  }
  // Unsigned, foreign-key, expired-time, replay and cross-client substitution
  // all go through the same production HTTP endpoint.
  const wire=await request(first,identity,grants[0],'summary');let response=await first.fetcher(first.origin+'/api/latchkey/msp/provider',wire.init);assert.equal(response.status,200);assert.equal(response.headers.get('access-control-allow-origin'),first.origin);assert.equal(response.headers.get('access-control-allow-credentials'),null);
  response=await first.fetcher(first.origin+'/api/latchkey/msp/provider',wire.init);assert.equal((await response.json()).error,'request_replayed');
  for(const [who,fields,code]of[[other,{provider:identity.provider},'invalid_signature'],[identity,{time:Date.now()-120000},'request_expired'],[identity,{delegation:grants[1].delegation},'delegation_unavailable']]){
   const w=await request(first,who,{...grants[0],provider:identity.provider},'summary',{},fields);const r=await first.fetcher(first.origin+'/api/latchkey/msp/provider',w.init);assert.equal((await r.json()).error,code);
  }
  for(const action of['item/read','vault/read','audit','export','api/users/status']){const w=await request(first,identity,grants[0],action,{vault:secrets[0].vault,object:secrets[0].object});const r=await first.fetcher(first.origin+'/api/latchkey/msp/provider',w.init);assert.equal((await r.json()).error,'msp_action_not_delegated')}
  await refused(second.owner.readVault(secrets[0].vault),'not_found');
  const preflight=await second.fetcher(second.origin+'/api/latchkey/msp/provider',{method:'OPTIONS',headers:{origin:first.origin,'access-control-request-method':'POST','access-control-request-headers':'content-type,x-latchkey-provider-signature'}});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),first.origin);
  const deniedOrigin=await second.fetcher(second.origin+'/api/latchkey/msp/provider',{method:'OPTIONS',headers:{origin:'https://unapproved.example.test','access-control-request-method':'POST'}});assert.equal(deniedOrigin.status,403);assert.equal(deniedOrigin.headers.get('access-control-allow-origin'),null);
  const readonly=await grant(first.owner,other,['summary']),readonlyFleet=new FleetClient(other,{fetcher:network,consoleOrigin:first.origin});const limitedSummary=await readonlyFleet.summary(readonly);assert.equal(limitedSummary.tenant,grants[0].tenant);assert.equal(limitedSummary.health.coverage,'unknown');assert.equal(limitedSummary.adoption.coverage,'unknown');assert.equal(limitedSummary.health.atRiskMembers,undefined);
  const readWire=await request(first,other,readonly,'preview',{policy:strict});assert.equal((await(await first.fetcher(first.origin+'/api/latchkey/msp/provider',readWire.init)).json()).error,'template_not_delegated');
  await refused(fleet.preview(grants[0],{externalEnabled:true,domains:['example.test','outside.example.test'],defaultDays:7,maxDays:30}),'template_would_broaden_access');
  let plans=await Promise.all(grants.map(g=>fleet.preview(g,strict)));
  const noConsent=await request(first,identity,grants[0],'apply',{preview:plans[0].id,hash:plans[0].hash,confirmed:false});assert.equal((await(await first.fetcher(first.origin+'/api/latchkey/msp/provider',noConsent.init)).json()).error,'template_confirmation_required');
  await new ApiClient(first.owner).setSharingPolicy({externalEnabled:true,domains:['example.test'],defaultDays:6,maxDays:30});await refused(fleet.apply(grants[0],plans[0]),'template_plan_changed');
  // A selected client that revokes consent is an individual failure, while the
  // other independently current plans still succeed.
  plans=await Promise.all(grants.map(g=>fleet.preview(g,strict)));
  await new ApiClient(second.owner).request('DELETE',`/msp/delegations/${grants[1].delegation}`,{confirmed:true});
  const applied=await Promise.allSettled(grants.map((g,i)=>fleet.apply(g,plans[i])));assert.equal(applied.filter(r=>r.status==='fulfilled').length,count-1);assert.equal(applied[1].status,'rejected');
  assert.deepEqual((await new ApiClient(first.owner).policies()).sharing.domains,[]);assert.equal((await new ApiClient(second.owner).policies()).sharing.externalEnabled,true);
  assert.equal((await fleet.apply(grants[0],plans[0])).replayed,true);
  // Provider handover never changes a client account, key or item. Old
  // delegation dies, new exact owner consent works, then owner-run detaches all.
  const next=await grant(first.owner,other);await new ApiClient(first.owner).request('DELETE',`/msp/delegations/${grants[0].delegation}`,{confirmed:true});await refused(fleet.summary(grants[0]),'delegation_unavailable');await refused(fleet.preview(grants[0],strict),'delegation_unavailable');await refused(fleet.apply(grants[0],plans[0]),'delegation_unavailable');assert.equal((await readonlyFleet.summary(next)).tenant,grants[0].tenant);
  const independent=await new ApiClient(first.owner).request('POST','/msp/independent',{confirmed:true});assert.equal(independent.independent,true);await refused(readonlyFleet.summary(next),'delegation_unavailable');
  assert.equal((await first.owner.readItem(secrets[0].vault,secrets[0].object)).versions[0].value.fields[0].value,secrets[0].secret);assert.equal(first.owner.profile.recipientKey,secrets[0].recipientKey);assert.equal(first.owner.profile.authorityKey,secrets[0].authorityKey);
  const audit=await first.owner.call('audit',{});const companyAudit=(await new ApiClient(first.owner).request('GET','/msp/delegations')).events;assert.ok(companyAudit.some(e=>e.action==='msp_template_applied'));for(const secret of secrets)assert.ok(!JSON.stringify(companyAudit).includes(secret.secret));assert.ok(audit.some(e=>e.action==='msp_independent_owner_confirmed'));for(const secret of secrets)assert.ok(!JSON.stringify(audit).includes(secret.secret));
  // The actual fleet UI and owner consent screens are exercised below.
  await mspScreens(first,second,identity,other,width,scale?grants.slice(2):[]);
  console.log(`MSP journey ${width}: ${count} isolated clients, scoped signed delegation, exact restrictive templates, individual failures, revocation and independent custody passed`);
 }finally{for(const f of fixtures.reverse())await f.close()}
}
async function mspScreens(first,second,identity,other,width,additional=[]){
 const count=2+additional.length;
 const page=first.page;
 await page.setViewportSize({width,height:1000});await page.goto(first.origin+'/app/vault');
 if(new URL(page.url()).pathname==='/setup'){await page.getByLabel('I confirm this owner account is ready to use.').check();await page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await expect(page.getByLabel('Profile file')).toBeEnabled();await page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(first.owner.profile))});await page.getByLabel('Master password',{exact:true}).fill(first.password);await page.getByRole('button',{name:'Unlock vault',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reveal Password',exact:true})).toBeVisible();
 const reveal=page.getByRole('button',{name:'Reveal Password',exact:true});await reveal.hover();await expect(page.getByRole('tooltip')).toHaveText('Reveal field');await page.mouse.move(0,0);await expect(page.getByRole('tooltip')).toHaveCount(0);await reveal.focus();await expect(page.getByRole('tooltip')).toBeVisible();
 if(output)await page.screenshot({path:join(output,`msp-vault-tooltip-${width}.png`),fullPage:true});await reveal.press('Escape');await expect(page.getByRole('tooltip')).toHaveCount(0);
 await page.locator('summary').filter({hasText:/^Settings$/}).click();await page.getByRole('button',{name:'Service provider',exact:true}).click();await expect(page.getByRole('heading',{name:'Service provider',exact:true})).toBeVisible();

 const ownedCompany=(await first.owner.call('vaults',{})).find(v=>v.kind==='company'&&v.owner===first.owner.profile.account);
 await page.getByLabel('Company vault you own').selectOption(ownedCompany.id);await expect(page.getByRole('button',{name:'Capture company expiry metadata',exact:true})).toBeDisabled();
 const captureConsent=page.getByRole('checkbox',{name:/I approve this local expiry scan/});await captureConsent.focus();await captureConsent.press('Space');await page.getByRole('button',{name:'Capture company expiry metadata',exact:true}).click();await expect(page.getByText('Company expiry metadata captured. Review observed counts and unknown coverage below.',{exact:true})).toBeVisible();
 await page.locator('summary').filter({hasText:/^Company expiry captures/}).click();await expect(page.getByText(/Expired at capture: 1/)).toBeVisible();if(output)await page.screenshot({path:join(output,`msp-owner-expiry-${width}.png`),fullPage:true});
 await page.getByLabel('Provider public identity JSON').setInputFiles({name:'provider-public.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(publicProviderIdentity(identity)))});
 await page.getByLabel('Also allow template scope:',{exact:false}).check();await page.getByLabel('Also allow observed company expiry',{exact:false}).check();await expect(page.getByRole('button',{name:'Create delegation',exact:true})).toBeDisabled();
 await page.getByRole('checkbox',{name:/I authorize this provider/}).check();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(output)await page.screenshot({path:join(output,`msp-owner-consent-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Create delegation',exact:true}).click();await expect(page.getByRole('button',{name:'Download delegation file',exact:true})).toBeVisible();
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'Download delegation file',exact:true}).click();const download=await pending;const stream=await download.createReadStream();let value='';for await(const chunk of stream)value+=chunk;const localGrant=JSON.parse(value);assert.equal(localGrant.provider,identity.provider);
 const remoteGrant=await grant(second.owner,identity);
 await new ApiClient(first.owner).setSharingPolicy({externalEnabled:true,domains:['example.test'],defaultDays:4,maxDays:10});
 await page.goto(first.origin+'/app/fleet');await expect(page.getByRole('heading',{name:'No provider identity loaded',exact:true})).toBeVisible();
 await page.getByLabel('Import provider private identity JSON').setInputFiles({name:'provider-private.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(identity))});await expect(page.getByRole('heading',{name:'No companies loaded',exact:true})).toBeVisible();
 await page.getByLabel('Import company delegation JSON files').setInputFiles([localGrant,remoteGrant,...additional].map((g,i)=>({name:`client-${i+1}.json`,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(g))})));
 await page.getByRole('button',{name:'Refresh all companies',exact:true}).click();await expect(page.getByText(`All ${count} company summaries refreshed.`,{exact:true})).toBeVisible();await expect(page.getByText(/Health coverage: current-observed-company-expiry/)).toHaveCount(count);await expect(page.getByText(/Observed expired items: 1/)).toHaveCount(count);
 if(output)await page.screenshot({path:join(output,`msp-fleet-summary-${width}.png`),fullPage:true});
 for(const checkbox of await page.getByRole('checkbox',{name:/Select this company for restrictive policy preview/}).all())await checkbox.check();
 await page.getByRole('button',{name:'Refresh and preview selected companies',exact:true}).click();await expect(page.getByRole('heading',{name:'Exact policy preview',exact:true})).toHaveCount(count);await expect(page.getByRole('button',{name:'Apply approved previews',exact:true})).toBeDisabled();
 if(output)await page.screenshot({path:join(output,`msp-fleet-preview-${width}.png`),fullPage:true});
 await new ApiClient(second.owner).request('DELETE',`/msp/delegations/${remoteGrant.delegation}`,{confirmed:true});
 const approval=page.getByRole('checkbox',{name:/I reviewed each before and after policy below/});await approval.focus();await approval.press('Space');await page.getByRole('button',{name:'Apply approved previews',exact:true}).click();
 await expect(page.getByText(`${count-1} of ${count} approved companies applied successfully. Review each failure below and refresh before another preview.`,{exact:true})).toBeVisible();await expect(page.getByText(/Policy application was not verified/)).toBeVisible();assert.equal((await new ApiClient(second.owner).policies()).sharing.externalEnabled,true);assert.equal((await new ApiClient(first.owner).policies()).sharing.externalEnabled,false);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output)await page.screenshot({path:join(output,`msp-fleet-partial-${width}.png`),fullPage:true});
 // An incompatible provider identity cannot import this portfolio.
 await page.locator('summary').filter({hasText:/^Provider signing identity$/}).click();await page.getByRole('button',{name:'Clear identity and portfolio',exact:true}).click();await expect(page.getByRole('heading',{name:'No provider identity loaded',exact:true})).toBeVisible();
 await page.getByLabel('Import provider private identity JSON').setInputFiles({name:'other-provider.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(other))});await page.getByLabel('Import company delegation JSON files').setInputFiles({name:'foreign-delegation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(localGrant))});await expect(page.getByRole('alert')).toContainText('provider mismatch');await expect(page.getByRole('heading',{name:'No companies loaded',exact:true})).toBeVisible();
 if(output)await page.screenshot({path:join(output,`msp-fleet-refusal-${width}.png`),fullPage:true});
}
if(import.meta.url===new URL(process.argv[1],'file:').href){for(const width of [1440,390])await mspJourney(width,{scale:process.argv.includes('--scale')})}
