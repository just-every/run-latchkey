import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {expect} from '@playwright/test';
import {vaultFixture} from './fixture.mjs';
import {VaultClient} from '../../src/latchkey/client.mjs';
import {createItem} from '../../src/latchkey/items/types.mjs';
import {unwrapSigned} from '../../src/latchkey/crypto/envelope.mjs';
import {reportRoute} from '../../src/latchkey/reports/service-route.mjs';
import {ReportsClient} from '../../src/latchkey/reports/client.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;
async function enroll(f,n){const response=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email:`synthetic-latchkey-${n}@example.test`,displayName:`Synthetic report reader ${n}`,role:'member'}});assert.equal(response.status(),202);const token=new URL(f.mail.at(-1).content.find(c=>c.type==='text\u002fplain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');const client=new VaultClient(f.origin,{fetcher:f.fetcher});await client.confirmIdentity(token);const e=await client.register(`synthetic-latchkey-${n+1}`);await client.unlock(e.profile,`synthetic-latchkey-${n+1}`);return client;}
export async function reportsJourney(width){
 const f=await vaultFixture(),directory=await mkdtemp(join(tmpdir(),'latchkey-report-'));
 const capture=async name=>{assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'report horizontal overflow');if(output){await mkdir(output,{recursive:true});await f.page.screenshot({path:join(output,`${name}-${width}.png`),fullPage:true});}};
 try{
  const owner=f.owner,vault=(await owner.createVault({kind:'company'})).vault;
  const pending=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email:'synthetic-latchkey-9130@example.test',displayName:'Synthetic pending member',role:'member'}});assert.equal(pending.status(),202);
  const first=(await owner.put(vault,createItem('login',{title:'Synthetic finance login',values:{password:'synthetic-latchkey-9100'}}))).object;
  const second=(await owner.put(vault,createItem('login',{title:'Synthetic reused login',values:{password:'synthetic-latchkey-9100'}}))).object;
  await owner.put(vault,createItem('secure-note',{title:'Synthetic clear note',values:{note:'synthetic-latchkey-9101'}}));
  await owner.readItem(vault,first);await owner.readItem(vault,first);
  const reportApi=new ReportsClient(owner,{fetcher:async()=>new Response('unavailable',{status:503})});
  const report=await reportApi.inspect(vault,{network:true});
  assert.equal(report.denominator,3);assert.equal(report.risky,2);assert.equal(report.unknown,2);assert.equal(report.clear,1);assert.equal(report.score,33);assert.equal(report.policyVersion,'local-health-v1');assert.equal(report.items.find(r=>r.object===first).status,'risk');assert.ok(report.items.find(r=>r.object===first).unknown.includes('Password breach feed unavailable; status unknown'));
  const views=report.usage.filter(r=>r.actor===owner.profile.account&&r.item===first&&r.action==='view');assert.equal(views.length,1);assert.equal(views[0].count,2);assert.ok(views[0].lastAccess>=report.from&&views[0].lastAccess<=report.asOf);assert.equal(views[0].maxReceiptDelay,0);
  assert.equal(report.adoption.enrolled,1);assert.equal(report.adoption.active,1);assert.equal(report.adoption.devices,1);assert.equal(report.adoption.extensionInstalled,null);assert.equal(report.adoption.neverUsed,null);assert.deepEqual(report.adoption.company,{invited:1,enrolled:1,inactive:0});
  const afterUsage=await reportApi.source(vault,views[0].lastAccess+1,Date.now());assert.deepEqual(afterUsage.events.filter(e=>e.item===first&&e.action==='view'),[]);assert.ok(report.coverage.includes('Only current active permitted items; private and family vaults excluded. Historical coverage requires explicit dated captures.'));
  assert.ok(!JSON.stringify(report).includes('synthetic-latchkey-9100'));assert.ok(!JSON.stringify(report).includes('Synthetic finance login'));
  const reader=await enroll(f,9110),auditor=await enroll(f,9120);
  await owner.share(vault,reader.profile.account,await reader.identity().fingerprint,['read','export']);await reader.pinAccount(owner.profile.account,await owner.identity().fingerprint);
  await owner.share(vault,auditor.profile.account,await auditor.identity().fingerprint,['read']);await auditor.pinAccount(owner.profile.account,await owner.identity().fingerprint);
  const refused=promise=>assert.rejects(promise,e=>['report_vault_owner_required','not_found'].includes(e.code));
  await refused(new ReportsClient(reader).inspect(vault));await refused(new ReportsClient(auditor).inspect(vault));
  const foreign=(await reader.createVault({kind:'company'})).vault;await reader.share(foreign,owner.profile.account,await owner.identity().fingerprint,['read','export']);await owner.pinAccount(reader.profile.account,await reader.identity().fingerprint);await refused(reportApi.inspect(foreign));
  const family=(await owner.createVault({kind:'family'})).vault;await refused(reportApi.inspect(family));
  await assert.rejects(reportApi.export(report,'csv'),e=>['health_source_changed'].includes(e.message));
  await reportApi.saveView(vault,'Finance monthly',30);assert.deepEqual((await reportApi.views(vault)).map(r=>[r.value.name,r.value.days]),[['Finance monthly',30]]);
  await reader.readItem(vault,first);await reader.readItem(vault,first);await reader.readItem(vault,second);await owner.readItem(vault,second);
  const criteria={actor:reader.profile.account,item:first,action:'view'};
  const filtered=await reportApi.inspect(vault,{network:true,filters:criteria});
  assert.deepEqual(filtered.filters,criteria);assert.equal(filtered.denominator,3);assert.equal(filtered.score,33);
  assert.deepEqual(filtered.usage.map(r=>[r.actor,r.item,r.action,r.count]),[[reader.profile.account,first,'view',2]]);
  assert.equal(filtered.events.length,2);assert.equal(filtered.usage[0].lastAccess,Math.max(...filtered.events.map(e=>e.time)));
  const memberUsage=await reportApi.inspect(vault,{filters:{actor:reader.profile.account}});
  assert.deepEqual(memberUsage.usage.map(r=>[r.item,r.action,r.count]).sort(),[[first,'view',2],[second,'view',1]].sort());
  const itemUsage=await reportApi.inspect(vault,{filters:{item:second,action:'view'}});
  assert.deepEqual(itemUsage.usage.map(r=>[r.actor,r.count]).sort(),[[owner.profile.account,1],[reader.profile.account,1]].sort());
  const noUsage=await reportApi.inspect(vault,{filters:{...criteria,action:'copy'}});assert.deepEqual(noUsage.usage,[]);assert.equal(noUsage.denominator,3);
  for(const filters of [{actor:'invalid'},{item:"' OR 1=1"},{action:'unknown'},{tenant:owner.profile.tenant},[]])await assert.rejects(owner.call(reportRoute,{vault,from:report.from,to:report.asOf,filters}),e=>e.code==='invalid_report_filter');
  await refused(new ReportsClient(reader).source(vault,report.from,report.asOf,{actor:owner.profile.account}));
  await reportApi.saveView(vault,'Member usage',30,criteria);
  const memberView=(await reportApi.views(vault)).find(r=>r.value.name==='Member usage');assert.deepEqual(memberView.value.filters,criteria);
  const sharedView=(await reader.readVault(vault)).versions.find(r=>r.object===memberView.object).value;
  assert.equal(sharedView.schema,'latchkey\u002freport-view\u002fv2');assert.ok(!JSON.stringify(sharedView).includes(reader.profile.account));assert.ok(!JSON.stringify(sharedView).includes('Member usage'));
  await assert.rejects(unwrapSigned(sharedView.wrapped,reader.bundle.root.recipient.privateKey,owner.profile.authorityKey,owner.profile.account,{tenant:owner.profile.tenant,vault,object:memberView.object,purpose:'report-view',epoch:1,version:1}));

  const filteredCsv=await reportApi.export(await reportApi.inspect(vault,{filters:criteria}),'csv');assert.ok(filteredCsv.includes(`"usage filter actor","${reader.profile.account}"`));assert.ok(filteredCsv.includes(`"usage filter item","${first}"`));assert.ok(filteredCsv.includes('"usage filter action","view"'));
  const fresh=await reportApi.inspect(vault,{network:true}),csv=await reportApi.export(fresh,'csv'),pdf=await reportApi.export(fresh,'pdf');
  assert.ok(csv.includes(`"asOf","${fresh.asOf}"`));assert.ok(csv.includes('"denominator","3"'));assert.ok(csv.includes('"confirmedClearPercent","33"'));assert.ok(csv.includes('Machine, agent and offline event sources unavailable'));assert.ok(pdf.startsWith('%PDF-1.4'));await refused(new ReportsClient(reader).export(fresh,'csv'));await refused(new ReportsClient(auditor).export(fresh,'pdf'));
  await writeFile(join(directory,'report.pdf'),pdf);if(process.platform==='linux'){const text=execFileSync('pdftotext',[join(directory,'report.pdf'),'-'],{encoding:'utf8'});assert.ok(text.includes('denominator | 3'));assert.ok(text.includes(`asOf | ${fresh.asOf}`));assert.ok(text.includes('local-health-v1'));}
  await f.page.route('https://api.pwnedpasswords.com/**',r=>r.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'unavailable'}));await f.page.route('https://haveibeenpwned.com/**',r=>r.fulfill({status:503,headers:{'access-control-allow-origin':'*'},body:'unavailable'}));
  await f.page.setViewportSize({width,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByRole('checkbox').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();}
  await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application\u002fjson',buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'New item',exact:true})).toBeEnabled();
  await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name:'Security reports',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Security reports',exact:true})).toBeVisible();
  await f.page.getByLabel('Saved report view').selectOption({label:'Finance monthly'});await f.page.getByLabel('View name',{exact:true}).fill('Finance review');await f.page.getByRole('button',{name:'Save report view',exact:true}).click();await expect(f.page.getByLabel('Saved report view').locator('option',{hasText:'Finance review'})).toHaveCount(1);await f.page.getByLabel('Saved report view').selectOption({label:'Finance review'});await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByTestId('report-denominator')).toHaveText('3 active items · 2 risky items · 2 items with unknown coverage · 1 confirmed clear');await expect(f.page.getByText('Confirmed clear share: 33%.',{exact:false})).toBeVisible();await capture('reports-posture');
  for(const format of ['CSV','PDF']){const downloaded=f.page.waitForEvent('download');await f.page.getByRole('button',{name:`Export ${format}`,exact:true}).click();const file=await downloaded;const contents=await readFile(await file.path(),'utf8');assert.ok(contents.includes(fresh.vault));assert.ok(!contents.includes('synthetic-latchkey-9100'));if(format==='CSV')assert.ok(contents.includes('"denominator","3"'));else assert.ok(contents.startsWith('%PDF-1.4'));}
  await f.page.getByLabel('Saved report view').selectOption({label:'Member usage'});await expect(f.page.getByLabel('Member reference',{exact:true})).toHaveValue(reader.profile.account);await expect(f.page.getByLabel('Item reference',{exact:true})).toHaveValue(first);await expect(f.page.getByLabel('Usage action')).toHaveValue('view');
  await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByTestId('report-usage')).toHaveCount(1);await expect(f.page.getByTestId('report-usage')).toContainText(`Person ${reader.profile.account}`);await expect(f.page.getByTestId('report-usage')).toContainText('2 actions');await expect(f.page.getByTestId('report-denominator')).toContainText('3 active items');await capture('reports-filtered-usage');
  const narrowedDownload=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Export CSV',exact:true}).click();const narrowedCsv=await readFile(await (await narrowedDownload).path(),'utf8');assert.ok(narrowedCsv.includes(`"usage filter actor","${reader.profile.account}"`));assert.ok(!narrowedCsv.includes(`"usage","${owner.profile.account}"`));
  await f.page.getByLabel('View name',{exact:true}).fill('Member saved again');await f.page.getByRole('button',{name:'Save report view',exact:true}).click();await f.page.getByLabel('Saved report view').selectOption({label:'Finance monthly'});await expect(f.page.getByLabel('Member reference',{exact:true})).toHaveValue('');await expect(f.page.getByLabel('Item reference',{exact:true})).toHaveValue('');await expect(f.page.getByLabel('Usage action')).toHaveValue('');await f.page.getByLabel('Saved report view').selectOption({label:'Member saved again'});await expect(f.page.getByLabel('Member reference',{exact:true})).toHaveValue(reader.profile.account);
  await f.page.getByLabel('Usage action').selectOption('copy');await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByTestId('report-usage')).toHaveCount(0);await expect(f.page.getByText('No matching retained item activity.',{exact:false})).toBeVisible();await expect(f.page.getByTestId('report-denominator')).toContainText('3 active items');await capture('reports-filtered-empty');
  await f.page.getByLabel('Saved report view').selectOption({label:'Finance monthly'});
  await f.page.getByLabel('Report range').selectOption('365');await expect(f.page.getByTestId('report-denominator')).toHaveCount(0);await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByText('Range filters retained events.',{exact:false})).toBeVisible();await capture('reports-usage-and-gaps');
  await f.page.getByRole('article').filter({has:f.page.getByRole('heading',{name:`Item ${first}`,exact:true})}).getByRole('button',{name:'Open permitted item',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Synthetic finance login',exact:true})).toBeVisible();const reveal=f.page.getByRole('button',{name:'Reveal Password'}).first();await reveal.focus();const tooltip=f.page.locator(`[id="${await reveal.getAttribute('aria-describedby')}"]`);await expect(tooltip).toBeVisible();await f.page.keyboard.press('Tab');await reveal.hover();await expect(tooltip).toBeVisible();await capture('reports-permitted-drilldown');
  await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name:'Security reports',exact:true}).click();await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByTestId('report-denominator')).toBeVisible();
  const row=(await owner.readItem(vault,first)).versions.at(-1);await owner.put(vault,row.value,first,row.version);await f.page.getByRole('button',{name:'Export CSV',exact:true}).click();await expect(f.page.getByRole('alert')).toContainText('Report authority or source changed.');await expect(f.page.getByRole('button',{name:'Export CSV',exact:true})).toHaveCount(0);await capture('reports-stale-refusal');
  for(const [person,password] of [[reader,'synthetic-latchkey-9111'],[auditor,'synthetic-latchkey-9121']]){
   await f.page.getByRole('button',{name:'Lock vault',exact:true}).click();await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application\u002fjson',buffer:Buffer.from(JSON.stringify(person.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'New item',exact:true})).toBeEnabled();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name:'Security reports',exact:true}).click();await expect(f.page.getByRole('alert')).toContainText('report vault owner required');await f.page.getByRole('button',{name:'Generate report',exact:true}).click();await expect(f.page.getByRole('alert')).toContainText('report vault owner required');await expect(f.page.getByRole('button',{name:'Export CSV',exact:true})).toHaveCount(0);await capture(person===reader?'reports-employee-refusal':'reports-reviewer-refusal');
  }
  if(width===1440)await historyJourney();
  console.log(`reportsJourney ${width}: scoped posture, denominator, unknowns, retained usage, saved view, CSV, PDF, drilldown and refusals passed.`);
 }finally{await f.close();await rm(directory,{recursive:true,force:true});}
}
async function historyJourney(){
 const realNow=Date.now;let clock=Date.parse('2031-02-28T23:59:59.999Z');Date.now=()=>clock;
 const f=await vaultFixture({clock,persistent:true});
 try{
  const owner=f.owner,api=new ReportsClient(owner),vault=(await owner.createVault({kind:'company'})).vault;
  const item=(await owner.put(vault,createItem('login',{title:'Synthetic historical login',values:{password:'synthetic-latchkey-9190'},fields:[{id:'site',label:'Site',type:'url',secret:false,required:false,value:'http://example.test'}]}))).object;
  const refresh=async next=>{clock=Date.parse(next);await f.setClock(clock);await owner.requestIdentity('synthetic-latchkey-1100@example.test');const token=new URL(f.mail.at(-1).content.find(c=>c.type===['text','plain'].join('/')).value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');await owner.confirmIdentity(token);await owner.unlock(owner.profile,f.password);};
  await assert.rejects(api.capture(vault),/report_capture_confirmation_required/);
  await api.capture(vault,{confirmed:true});const original=(await api.history(vault)).observations[0];
  assert.equal(original.score,0);assert.equal(original.denominator,1);assert.equal(original.unknown,1);assert.equal(original.adoption.extensionInstalled,null);assert.equal(original.scoringPolicy.id,original.policyVersion);
  await assert.rejects(api.capture(vault,{confirmed:true}),e=>e.code==='report_day_already_captured');
  const wire=await owner.call(['reports','history'].join('/'),{vault});assert.equal(wire.observations.length,1);assert.ok(!JSON.stringify(wire).includes('local-health-v1'));assert.ok(!JSON.stringify(wire).includes('Synthetic historical login'));
  await owner.put(vault,createItem('secure-note',{title:'Synthetic changed source',values:{note:'synthetic-latchkey-9191'}}),item);
  assert.deepEqual((await api.history(vault)).observations[0],original);
  await refresh('2031-03-01T00:00:00.000Z');await api.capture(vault,{confirmed:true});
  for(const day of ['2031-11-30','2032-01-29','2032-02-21','2032-02-28']){await refresh(day+'T12:00:00.000Z');await api.capture(vault,{confirmed:true});}
  const history=await api.history(vault);assert.equal(history.daily.length,365);assert.equal(history.daily[0].day,'2031-03-01');assert.equal(history.daily.at(-1).day,'2032-02-28');assert.equal(history.daily.filter(r=>r.observation).length,5);assert.equal(history.daily.filter(r=>!r.observation).length,360);
  assert.deepEqual(history.observations[0],original);assert.equal(history.observations.at(-1).score,100);
  assert.deepEqual(history.comparisons.map(c=>[c.range,c.day,c.scoreDelta]),[['7 days','2032-02-21',0],['30 days','2032-01-29',0],['90 days','2031-11-30',0],['12 months','2031-02-28',100]]);
  assert.deepEqual(history.monthly.filter(m=>m.observedDays).map(m=>[m.month,m.observedDays,m.expectedDays,m.meanScore]),[['2031-02',1,28,0],['2031-03',1,31,100],['2031-11',1,30,100],['2032-01',1,31,100],['2032-02',2,28,100]]);
  assert.deepEqual(history.monthly.filter(m=>!m.observedDays).map(m=>m.month),['2031-04','2031-05','2031-06','2031-07','2031-08','2031-09','2031-10','2031-12']);
  for(const days of [7,30,90,365])assert.equal((await api.history(vault,{days})).daily.length,days);
  const csv=await api.export(history,'csv'),pdf=await api.export(history,'pdf');assert.ok(csv.includes('"comparison","12 months","2031-02-28","100","0","100"'));assert.ok(csv.includes('"daily","2032-02-27","unknown","unknown","missing"'));assert.ok(csv.includes('local-health-v1'));assert.ok(pdf.startsWith('%PDF-1.4'));assert.ok(pdf.includes('monthly | 2031-02'));assert.ok(!csv.includes('synthetic-latchkey-9190'));
  const family=(await owner.createVault({kind:'family'})).vault;for(const work of [()=>api.capture(family,{confirmed:true}),()=>api.history(family)])await assert.rejects(work,e=>e.code==='report_vault_owner_required');
  await f.context.addCookies([{name:owner.cookie.split('=')[0],value:owner.cookie.slice(owner.cookie.indexOf('=')+1),url:f.origin,secure:true,httpOnly:true}]);
  const reader=await enroll(f,9192);await owner.share(vault,reader.profile.account,await reader.identity().fingerprint,['read','export']);await reader.pinAccount(owner.profile.account,await owner.identity().fingerprint);
  await assert.rejects(unwrapSigned(JSON.parse(wire.key.wrapped),reader.bundle.root.recipient.privateKey,owner.profile.authorityKey,owner.profile.account,{tenant:owner.profile.tenant,vault,object:owner.profile.account,purpose:'report-key',epoch:1,version:1}));
  const other=new ReportsClient(reader);for(const work of [()=>other.history(vault),()=>other.capture(vault,{confirmed:true}),()=>other.export(history,'csv')])await assert.rejects(work,e=>e.code==='report_vault_owner_required');
  const foreign=(await reader.createVault({kind:'company'})).vault;for(const work of [()=>api.history(foreign),()=>api.capture(foreign,{confirmed:true})])await assert.rejects(work,e=>e.code==='not_found');
  const captureVault=(await owner.createVault({kind:'company'})).vault;
  await f.page.addInitScript({content:`Date.now=()=>${clock}`});
  await f.context.addCookies([{name:owner.cookie.split('=')[0],value:owner.cookie.slice(owner.cookie.indexOf('=')+1),url:f.origin,secure:true,httpOnly:true}]);
  await f.page.setViewportSize({width:1440,height:1000});await f.page.goto(f.origin+'/app/vault');if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByRole('checkbox').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click();}
  await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:['application','json'].join('/'),buffer:Buffer.from(JSON.stringify(owner.profile))});await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'New item',exact:true})).toBeEnabled();await f.page.getByLabel('Vault',{exact:true}).selectOption(vault);await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name:'Security reports',exact:true}).click();
  await f.page.getByLabel('Report range').selectOption('365');await f.page.getByRole('button',{name:'Show retained history',exact:true}).click();await expect(f.page.getByTestId('report-history')).toContainText('5 observed dates · 360 missing dates');await expect(f.page.getByTestId('report-history')).toContainText('12 months: 100 percentage points');
  for(const width of [1440,390]){await f.page.setViewportSize({width,height:1000});assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));if(output){await mkdir(output,{recursive:true});await f.page.screenshot({path:join(output,`reports-history-${width}.png`),fullPage:true});}}
  const download=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Export history CSV',exact:true}).click();assert.ok((await readFile(await (await download).path(),'utf8')).includes('"comparison","12 months"'));
  await f.page.getByRole('button',{name:'Vault',exact:true}).click();await f.page.getByLabel('Vault',{exact:true}).selectOption(captureVault);await f.page.locator('summary',{hasText:'Settings'}).click();await f.page.getByRole('button',{name:'Security reports',exact:true}).click();await f.page.getByLabel('Retain today’s encrypted observation').check();await f.page.getByRole('button',{name:'Capture today',exact:true}).click();await expect(f.page.getByTestId('report-history')).toContainText('1 observed dates');
  // Replaying a previously valid capture after erasure cannot restore its data.
  let replay;const call=owner.call.bind(owner);owner.call=async(route,input)=>{if(route===['reports','capture'].join('/'))replay=structuredClone(input);return call(route,input)};
  const erasureVault=(await owner.createVault({kind:'company'})).vault,erasedItem=(await owner.put(erasureVault,createItem('secure-note',{title:'Synthetic erased report',values:{note:'synthetic-latchkey-9193'}}))).object;
  await api.capture(erasureVault,{confirmed:true});const beforeErase=await api.history(erasureVault);await owner.eraseItem(erasureVault,erasedItem,{confirmed:true});assert.deepEqual((await api.history(erasureVault)).observations,[]);await assert.rejects(api.export(beforeErase,'csv'),/report_history_changed/);await assert.rejects(call(['reports','capture'].join('/'),replay),e=>e.code==='report_source_changed');
  // Person erasure must fence a surviving member owner's accepted capture,
  // even when that owner's source counts did not change. Persist and restart
  // the real Worker before replay so a process-local cache cannot satisfy this.
  const erasedPerson=await enroll(f,9196),subject=(await f.db.prepare('SELECT operator_id FROM lky_accounts WHERE id=?').bind(erasedPerson.profile.account).first()).operator_id;
  let personReplay;const readerCall=reader.call.bind(reader);
  reader.call=async(route,input)=>{if(route===['reports','capture'].join('/'))personReplay=structuredClone(input);return readerCall(route,input)};
  try{await other.capture(foreign,{confirmed:true});}finally{reader.call=readerCall;}
  assert.equal((await other.history(foreign)).observations.length,1);
  const erasurePlan=await owner.call(['subject','erase-preview'].join('/'),{subject});
  await owner.call(['subject','erase'].join('/'),{subject,confirmed:true,planHash:erasurePlan.planHash});
  await f.restart();
  assert.deepEqual((await other.history(foreign)).observations,[]);
  await assert.rejects(readerCall(['reports','capture'].join('/'),personReplay),e=>e.code==='report_observation_erased');
  assert.deepEqual((await other.history(foreign)).observations,[]);
  await other.capture(foreign,{confirmed:true});assert.equal((await other.history(foreign)).observations.length,1);
 }finally{await f.close();Date.now=realNow;}
}
for(const width of [1440,390])await reportsJourney(width);
