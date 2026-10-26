import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {expect} from '@playwright/test';
import {vaultFixture} from './fixture.mjs';
import {VaultClient} from '../../src/latchkey/client.mjs';
import {TypedItems} from '../../src/latchkey/items/client.mjs';
import {createItem} from '../../src/latchkey/items/types.mjs';
import {HealthClient} from '../../src/latchkey/health/client.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;
if(output)await mkdir(output,{recursive:true});
const hex=async text=>Buffer.from(await crypto.subtle.digest('SHA-1',new TextEncoder().encode(text))).toString('hex').toUpperCase();
const password='synthetic-latchkey-2600',freshPassword='synthetic-latchkey-2601-replaced';
const fullHash=await hex(password),freshHash=await hex(freshPassword);
async function enroll(f,n){const response=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email:`synthetic-latchkey-${n}@example.test`,displayName:'Synthetic reader',role:'member'}});assert.equal(response.status(),202);const token=new URL(f.mail.at(-1).content.find(c=>c.type==='text/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.confirmIdentity(token);const e=await client.register(`synthetic-latchkey-${n+1}`);await client.unlock(e.profile,`synthetic-latchkey-${n+1}`);return client;}
for(const width of [1440,390]){
 const f=await vaultFixture();
 const capture=async name=>{assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal viewport overflow');if(output)await f.page.screenshot({path:join(output,`${name}-${width}.png`),fullPage:true});};
 try{
  const baseline=Date.now(),expired=new Date(baseline-86400000).toISOString().slice(0,10);
  const snooze=await f.page.evaluate(time=>{const local=new Date(time),input=document.createElement('input');input.type='datetime-local';input.value=new Date(time-local.getTimezoneOffset()*60000).toISOString().slice(0,19);return input.value;},baseline+30000);
  const owner=f.owner,vault=(await owner.createVault({kind:'company'})).vault;
  await owner.put(vault,{schema:'latchkey/vault-meta/v1',title:'Synthetic security vault'});
  const typed=new TypedItems(owner),first=await typed.save(vault,createItem('login',{title:'Synthetic payroll login',values:{username:'synthetic-latchkey-2602',password},urls:[{url:'https://synthetic-latchkey.example.test',match:'exact-host'},{url:'https://github.com',match:'exact-host'}],fields:[{id:'passwordChangedAt',label:'Password changed at',type:'date',secret:false,value:'2024-01-01'}]})),second=await typed.save(vault,createItem('login',{title:'Synthetic CI login',values:{password}}));
  await typed.save(vault,createItem('document',{title:'Synthetic expiring document',values:{expiry:expired}}));
  await typed.save(vault,createItem('card',{title:'Synthetic expiring card',values:{expiry:expired.slice(0,7)}}));
  await typed.save(vault,createItem('login',{title:'Synthetic weak HTTP login',values:{password:'a'.repeat(4)},fields:[{id:'website',label:'Website',type:'url',secret:false,value:'http://synthetic-latchkey.example.test'}]}));
  // Fixed time drives expiry and snooze boundaries; wall-clock date never determines an assertion.
  await f.page.clock.install({time:new Date(baseline)});
  let outage=false,mfa=false;const requests=[];
  await f.page.route('https://api.github.com/user',route=>{if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,accept,x-github-api-version','access-control-allow-methods':'GET'}});assert.equal(route.request().headers().authorization,'Bearer synthetic-latchkey-2630');return route.fulfill({status:200,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'authorization,accept,x-github-api-version'},json:{login:'synthetic-latchkey-2602',two_factor_authentication:mfa}});});
  await f.page.route('https://haveibeenpwned.com/api/v3/breaches',route=>route.fulfill({status:outage?503:200,headers:{'access-control-allow-origin':'*'},json:[{Name:'Synthetic breach',Domain:'synthetic-latchkey.example.test',BreachDate:'2025-01-01',IsVerified:true}]}));
  await f.page.route('https://api.pwnedpasswords.com/**',async route=>{const r=route.request();if(r.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'add-padding'}});requests.push({url:r.url(),headers:r.headers(),body:r.postData()});assert.match(r.url(),/^https:\/\/api\.pwnedpasswords\.com\/range\/[A-F0-9]{5}$/);assert.equal(r.headers()['add-padding'],'true');assert.equal(r.postData(),null);assert.ok(!r.url().includes(fullHash));await route.fulfill({status:outage?503:200,headers:{'access-control-allow-origin':'*'},body:outage?'unavailable':`${fullHash.slice(5)}:12\r\n${freshHash.slice(5)}:0\r\n${'0'.repeat(35)}:0`});});
  await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');
  if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByRole('checkbox').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();}
  await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'New item',exact:true})).toBeEnabled();
  const settings=async name=>{await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name,exact:true}).click();await expect(f.page.getByRole('heading',{name,exact:true})).toBeVisible();};
  async function providerPlanJourney(){
  // providerPlanJourney: every class remains distinct; the planner cannot execute an operator ceremony.
  await settings('Provider connections');
  const classes=await f.page.getByLabel('Credential class').locator('option').evaluateAll(options=>options.map(o=>o.value));
  for(const kind of classes){await f.page.getByLabel('Credential class').selectOption(kind);await expect(f.page.getByText('Manual steps remain blocked until an authorized operator completes and verifies them outside this planner.')).toBeVisible();await expect(f.page.getByRole('link',{name:'Open official operator instructions'})).toHaveAttribute('href',/^https:/);}
  await f.page.getByLabel('Credential class').selectOption('aws-iam');await f.page.getByLabel('Identity owner',{exact:true}).fill('synthetic-latchkey-2604');await f.page.getByLabel('Credential expiry').fill('2031-01-01');
  for(const [kind,ref] of [['app','synthetic-latchkey-2605'],['ci','synthetic-latchkey-2606'],['cloud-sync','synthetic-latchkey-2607']]){await f.page.getByLabel('Consumer kind').selectOption(kind);await f.page.getByLabel('Consumer reference').fill(ref);await f.page.getByRole('button',{name:'Add consumer',exact:true}).click();}
  await expect(f.page.getByText('Unknown consumers remain',{exact:true})).toBeVisible();await expect(f.page.getByText('Key quota unknown or exhausted',{exact:true})).toBeVisible();await capture('provider-plan-blocked');
  await f.page.getByRole('button',{name:'Save encrypted plan',exact:true}).click();await expect(f.page.getByRole('status').filter({hasText:'Encrypted plan saved'})).toBeVisible();
  await settings('Password health');await settings('Provider connections');await f.page.getByLabel('Credential class').selectOption('aws-iam');await f.page.getByRole('button',{name:'Load saved plan',exact:true}).click();await expect(f.page.getByRole('status').filter({hasText:'Saved plan loaded'})).toBeVisible();await expect(f.page.getByText('app: synthetic-latchkey-2605',{exact:true})).toBeVisible();await expect(f.page.getByText('ci: synthetic-latchkey-2606',{exact:true})).toBeVisible();await expect(f.page.getByText('cloud-sync: synthetic-latchkey-2607',{exact:true})).toBeVisible();await capture('provider-plan-loaded');
  }
  await providerPlanJourney();
  async function healthJourney(){
  // healthJourney: actual vault creation, padded network boundary, suppression separate from risk and failure coverage.
  await settings('Password health');await f.page.getByLabel('GitHub token (optional)').fill('synthetic-latchkey-2630');await f.page.getByRole('button',{name:'Check with HIBP',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · breached password',exact:true})).toBeVisible();assert.ok(requests.length>=2);await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · missing mfa',exact:true})).toBeVisible();await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · compromised website',exact:true})).toBeVisible();
  const finding=()=>f.page.getByRole('article').filter({has:f.page.getByRole('heading',{name:'Synthetic payroll login · reused password',exact:true})});
  await expect(f.page.getByRole('heading',{name:'Synthetic expiring document · expiring item',exact:true})).toBeVisible();await expect(f.page.getByRole('heading',{name:'Synthetic expiring card · expiring item',exact:true})).toBeVisible();await expect(f.page.getByRole('heading',{name:'Synthetic weak HTTP login · insecure http',exact:true})).toBeVisible();
  const before=await f.page.getByRole('heading',{name:/underlying findings/}).textContent();await f.page.getByLabel('Suppression reason').fill('Synthetic investigation');await f.page.getByLabel('Snooze until').fill(snooze);await finding().getByRole('button',{name:'Snooze finding',exact:true}).click();await expect(finding()).toContainText('Suppressed: Synthetic investigation');assert.equal(await f.page.getByRole('heading',{name:/underlying findings/}).textContent(),before);await capture('health-snoozed');
  await f.page.clock.setSystemTime(new Date(baseline+31000));await f.page.getByRole('button',{name:'Check with HIBP',exact:true}).click();await expect(finding()).not.toContainText('Suppressed:');await finding().getByRole('button',{name:'Dismiss finding',exact:true}).click();await expect(finding()).toContainText('dismissed, risk retained');assert.equal(await f.page.getByRole('heading',{name:/underlying findings/}).textContent(),before);await capture('health-dismissed');
  await finding().getByRole('button',{name:'Open affected item',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Synthetic payroll login',exact:true})).toBeVisible();
  // The existing icon controls in this touched vault screen retain hover and keyboard tooltips.
  const reveal=f.page.getByRole('button',{name:/Reveal Password/i}).first();
  await expect(reveal).toBeVisible();const description=await reveal.getAttribute('aria-describedby'),tooltip=f.page.locator(`[id="${description}"]`);await reveal.focus();await expect(tooltip).toBeVisible();await f.page.keyboard.press('Tab');await reveal.hover();await f.page.clock.runFor(350);await expect(tooltip).toBeVisible();
  mfa=true;
  const current=(await owner.readItem(vault,first.object)).versions.at(-1);await owner.put(vault,{...current.value,fields:current.value.fields.map(field=>field.id==='password'?{...field,value:freshPassword}:field.id==='passwordChangedAt'?{...field,value:'2025-02-01'}:field)},first.object,current.version);
  await settings('Password health');await f.page.getByLabel('GitHub token (optional)').fill('synthetic-latchkey-2630');await f.page.getByRole('button',{name:'Check with HIBP',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · reused password',exact:true})).toHaveCount(0);await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · breached password',exact:true})).toHaveCount(0);
  await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · compromised website',exact:true})).toHaveCount(0);
  await expect(f.page.getByRole('heading',{name:'Synthetic payroll login · missing mfa',exact:true})).toHaveCount(0);
  outage=true;await f.page.getByRole('button',{name:'Check with HIBP',exact:true}).click();await expect(f.page.getByText('Password breach feed unavailable; status unknown').first()).toBeVisible();await capture('health-feed-outage');
  if(width===1440){
   const outsider=await enroll(f,2620);await assert.rejects(new HealthClient(outsider).inspect(vault),e=>['not_found','permission_denied'].includes(e.code));
   let now=Date.parse('2030-01-01T12:00:00Z');const health=new HealthClient(owner,{now:()=>now,fetcher:async url=>url.includes('haveibeenpwned')?Response.json([]):new Response(`${fullHash.slice(5)}:12\r\n${'0'.repeat(35)}:0`)});
   const report=await health.inspect(vault,{network:true}),active=report.findings.find(r=>r.object===second.object&&r.code==='breached-password');assert.ok(active);await health.suppress(vault,active,{reason:'Synthetic review',until:now+1000});let next=await health.inspect(vault,{network:true});assert.equal(next.riskCount,report.riskCount);assert.ok(next.findings.find(r=>r.object===second.object&&r.code==='breached-password').suppression);now+=1001;next=await health.inspect(vault,{network:true});assert.equal(next.findings.find(r=>r.object===second.object&&r.code==='breached-password').suppression,null);
   const row=(await owner.readItem(vault,second.object)).versions.at(-1);await owner.put(vault,row.value,second.object,row.version);await assert.rejects(health.suppress(vault,active,{reason:'Stale finding'}),/finding_changed/);
   let erased=false;const raced=new HealthClient(owner,{fetcher:async url=>{if(url.includes('haveibeenpwned'))return Response.json([]);if(!erased){erased=true;await owner.eraseItem(vault,first.object,{confirmed:true});}return new Response(`${fullHash.slice(5)}:12`);}});await assert.rejects(raced.inspect(vault,{network:true}),/health_source_changed/);const clean=await health.inspect(vault);assert.ok(!JSON.stringify(clean).includes('Synthetic payroll login'));
   const snapshot=await f.db.prepare('SELECT envelope FROM lky_versions').all();assert.ok(!JSON.stringify(snapshot).includes(password));
  }
  }
  await healthJourney();
  console.log(`Security journeys ${width}: encrypted provider plan, padded HIBP, local risks, suppression, expiry, fresh version and outage passed.`);
 }finally{await f.close();}
}
