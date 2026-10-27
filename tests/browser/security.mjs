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
  async function memberSuppressionJourney(){
  // Read-only members own their suppression history without acquiring item edit authority.
  let memberNow=Date.now();const member=await enroll(f,2640),memberHealth=new HealthClient(member,{now:()=>memberNow}),ownerHealth=new HealthClient(owner);
  await member.pinAccount(owner.profile.account,await owner.identity().fingerprint);
  await owner.share(vault,member.profile.account,await member.identity().fingerprint,['read']);
  const memberItem=await typed.save(vault,createItem('login',{title:'Synthetic member review',values:{password:'aaaa'}}));
  const memberReport=await memberHealth.inspect(vault),memberFinding=memberReport.findings.find(r=>r.object===memberItem.object&&r.code==='weak-password');assert.ok(memberFinding);
  // A vault writer cannot impersonate another actor using the unsigned legacy format.
  const legacy=await owner.put(vault,{schema:'latchkey/health-suppression/v1',actor:member.profile.account,object:memberItem.object,version:1,code:'weak-password',reason:'Synthetic forged member dismissal',until:null,observation:{source:'Synthetic legacy record',observedAt:memberNow,code:'weak-password',version:1}});
  const forgedReport=await memberHealth.inspect(vault);
  assert.equal(forgedReport.findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression,null,'unsigned legacy records must not suppress another actor findings');
  assert.ok(!forgedReport.history.some(r=>r.reason==='Synthetic forged member dismissal'));
  await memberHealth.suppress(vault,memberFinding,{reason:'Synthetic member investigation',until:memberNow+60000});
  const suppressed=await memberHealth.inspect(vault);assert.equal(suppressed.riskCount,memberReport.riskCount);assert.equal(suppressed.findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression.reason,'Synthetic member investigation');
  assert.equal((await ownerHealth.inspect(vault)).findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression,null);
  memberNow+=60001;assert.equal((await memberHealth.inspect(vault)).findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression,null);memberNow=Date.now();
  assert.ok(!(await memberHealth.history(vault)).some(r=>r.reason==='Synthetic investigation'));
  await assert.rejects(member.put(vault,createItem('login',{title:'Forbidden member write'}),memberItem.object,1),e=>e.status===403);
  const ownRows=await member.call(['health','history'].join('/'),{vault});assert.equal(ownRows.rows.length,1);
  assert.ok(!JSON.stringify(ownRows).includes('Synthetic member investigation'));assert.ok(!JSON.stringify(ownRows).includes('observedAt'));assert.ok(!JSON.stringify(ownRows).includes('weak-password'));
  if(width===1440){const row=ownRows.rows[0],tampered=structuredClone(row.wrapped);tampered.envelope.ciphertext=(tampered.envelope.ciphertext[0]==='A'?'B':'A')+tampered.envelope.ciphertext.slice(1);await f.db.prepare('UPDATE lky_health_suppressions SET wrapped=? WHERE id=?').bind(JSON.stringify(tampered),row.id).run();await assert.rejects(memberHealth.history(vault),/invalid_key_signature/);await f.db.prepare('UPDATE lky_health_suppressions SET wrapped=? WHERE id=?').bind(JSON.stringify(row.wrapped),row.id).run();}

  await assert.rejects(member.call(['health','history'].join('/'),{vault,actor:owner.profile.account}),e=>e.status===400);
  const memberContext=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}});
  const [cookieName,cookieValue]=member.cookie.split('=');await memberContext.addCookies([{name:cookieName,value:cookieValue,url:f.origin,secure:true}]);
  const ownerPage=f.page;f.page=await memberContext.newPage();
  try{
   await f.page.goto(f.origin+'/app/vault');await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(member.profile))});await f.page.getByLabel('Master password',{exact:true}).fill('synthetic-latchkey-2641');await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();
   await settings('Password health');await f.page.getByRole('button',{name:'Check locally',exact:true}).click();
   const finding=f.page.getByRole('article').filter({has:f.page.getByRole('heading',{name:'Synthetic member review · weak password',exact:true})});
   await expect(finding).toContainText('Suppressed: Synthetic member investigation');await f.page.getByLabel('Suppression reason').fill('Synthetic member dismissal');await finding.getByRole('button',{name:'Dismiss finding',exact:true}).click();await expect(finding).toContainText('Suppressed: Synthetic member dismissal');await expect(f.page.getByRole('heading',{name:'Your suppression history'})).toBeVisible();await capture('health-member-history');
  }finally{f.page=ownerPage;await memberContext.close();}
  if(width===1440){
   const history=await memberHealth.history(vault);assert.deepEqual(history.map(r=>r.reason),['Synthetic member investigation','Synthetic member dismissal']);assert.ok(history.every(r=>r.observation.code==='weak-password'&&r.observation.version===1));
   await typed.save(vault,createItem('login',{title:'Synthetic member review revised',values:{password:'aaaa'}}),memberItem.object);
   assert.equal((await memberHealth.inspect(vault)).findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression,null);await assert.rejects(memberHealth.suppress(vault,memberFinding,{reason:'Stale member finding'}),/finding_changed/);
   const current=(await memberHealth.inspect(vault)).findings.find(r=>r.object===memberItem.object&&r.code==='weak-password');
   await assert.rejects(new HealthClient(member,{now:()=>1}).suppress(vault,current,{reason:'Server expired snooze',until:Date.now()-1}),e=>e.code==='invalid_suppression');
   const stale=Object.create(member);stale.call=(route,input)=>member.call(route,route===['health','suppress'].join('/')?{...input,revision:input.revision-1}:input);await assert.rejects(new HealthClient(stale).suppress(vault,current,{reason:'Stale source revision'}),e=>e.code==='health_source_changed');

   await assert.rejects(memberHealth.suppress(vault,current,{reason:'Expired member snooze',until:Date.now()-1}),/invalid_suppression/);
   const foreign=(await owner.createVault()).vault;await assert.rejects(memberHealth.history(foreign),e=>e.status===404);
   const raced=Object.create(member);raced.call=async(route,input)=>{if(route===['health','suppress'].join('/'))await owner.rotate(vault,member.profile.account);return member.call(route,input)};await assert.rejects(new HealthClient(raced).suppress(vault,current,{reason:'Revocation during submission'}),e=>e.status>=400);
   await assert.rejects(memberHealth.history(vault),e=>e.status>=400);await assert.rejects(memberHealth.suppress(vault,current,{reason:'Revoked member'}),e=>e.status>=400);
   const rows=await f.db.prepare('SELECT wrapped FROM lky_health_suppressions').all();assert.ok(!JSON.stringify(rows).includes('Synthetic member'));assert.equal((await ownerHealth.inspect(vault)).findings.find(r=>r.object===memberItem.object&&r.code==='weak-password').suppression,null);
   // Mixed histories need separate owner review; no unrelated version is silently erased.
   const mixed=await owner.put(vault,{schema:'latchkey/health-suppression/v1',object:memberItem.object});
   await owner.put(vault,{secret:'Synthetic unrelated retained content'},mixed.object);
   await assert.rejects(owner.eraseItem(vault,memberItem.object,{confirmed:true}),/legacy_suppression_erasure_review_required/);
   assert.equal((await owner.readItem(vault,mixed.object,true)).versions.length,2);
   await owner.eraseItem(vault,mixed.object,{confirmed:true});
   const sourceRevision=(await owner.readVault(vault)).revision;
   await assert.rejects(owner.eraseItem(vault,memberItem.object,{confirmed:true,revision:sourceRevision-1}),e=>e.code==='version_conflict');
   assert.equal((await owner.readItem(vault,legacy.object)).versions.length,1);
   const interrupted=Object.create(owner);
   interrupted.call=(route,input)=>{if(route===['item','erase'].join('/')&&input.object===memberItem.object)throw Error('synthetic_erasure_interruption');return owner.call(route,input);};
   await assert.rejects(interrupted.eraseItem(vault,memberItem.object,{confirmed:true}),/synthetic_erasure_interruption/);
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=? AND object_id=?').bind(vault,legacy.object).first()).n,0);
   assert.equal((await owner.readItem(vault,memberItem.object)).versions.at(-1).value.title,'Synthetic member review revised');
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_health_suppressions WHERE object_id=?').bind(memberItem.object).first()).n,2);
   const erasedMember=await owner.eraseItem(vault,memberItem.object,{confirmed:true});assert.equal(erasedMember.deleted.lky_health_suppressions,2);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_versions WHERE vault_id=? AND object_id=?').bind(vault,legacy.object).first()).n,0);await assert.rejects(owner.put(vault,{schema:'latchkey/health-suppression/v1'},legacy.object),e=>e.code==='item_erased');assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_health_suppressions WHERE object_id=?').bind(memberItem.object).first()).n,0);
  }

  }
  await memberSuppressionJourney();
  console.log(`Security journeys ${width}: encrypted provider plan, padded HIBP, local risks, suppression, expiry, fresh version and outage passed.`);
 }finally{await f.close();}
}
await import('./reports.mjs');
