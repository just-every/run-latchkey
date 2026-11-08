import { scopedRecoveryBrowserJourney } from './recovery-scoped.mjs';
import { runGeneratorApiJourney } from '../latchkey-generator-policy.mjs';
import { companyCustodyJourney } from './company-custody.mjs';
import { staleSaveJourney } from './stale-save.mjs';
import { passboltJourney, migrationJourney } from './passbolt.mjs';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { contractorJourney, fileLinkJourney } from './sharing.mjs';
import { vaultFixture } from './fixture.mjs';
import { TypedItems } from '../../src/latchkey/items/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import { createAttachment } from '../../src/latchkey/items/attachments.mjs';
import { SharingClient } from '../../src/latchkey/sharing/client.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
const output=process.env.LATCHKEY_SCREENSHOTS;
if(output)await mkdir(output,{recursive:true});
if(process.argv.includes('--scoped-recovery')){for(const width of [1440,390])await scopedRecoveryBrowserJourney(width,output);process.exit(0)}
if (process.argv.includes('--browser-lock')) { await browserLockJourney(output); process.exit(0); }
const generatorOnly = process.argv.includes('--generator-policy');
if (!generatorOnly) { await browserLockJourney(output); await companyCustodyJourney(output); await staleSaveJourney(1440, output); }
for(const width of [1440,390]) {
await generatorPolicyReviewJourney(width, output);
if (generatorOnly) continue;
await scopedRecoveryBrowserJourney(width,output);
await passboltJourney(width, output);
await migrationJourney(width, output);
const f=await vaultFixture();
const capture=async(name,width)=>{assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal viewport overflow');if(output)await f.page.screenshot({path:join(output,`${name}-${width}.png`),fullPage:true})};
const unlock=async()=>{
 await expect(f.page.getByLabel('Profile file')).toBeEnabled();
 await f.page.getByLabel('Profile file').setInputFiles({name:'profile.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(f.owner.profile))});
 await f.page.getByLabel('Master password',{exact:true}).fill(f.password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();await expect(f.page.getByRole('button',{name:'New item',exact:true})).toBeEnabled();await f.page.getByRole('navigation',{name:'Vault items'}).getByRole('button').filter({hasText:'Treasury operations'}).click();
};
try {
 const vault=(await f.owner.createVault()).vault;await f.owner.put(vault,{schema:'latchkey/vault-meta/v1',title:'Northstar Finance'});
 const typed=new TypedItems(f.owner),attachment=await createAttachment('Quarterly recovery guide.txt',new TextEncoder().encode('synthetic-latchkey-1108'),'text/plain');
 const item=createItem('login',{title:'Treasury workspace',values:{username:'finance@example.test',password:'synthetic-latchkey-1109'},labels:['Finance'],tags:['quarterly'],favorite:true,ownership:'company',urls:[{match:'exact-host',url:'https://treasury.example.test'}],attachments:[attachment]});
 const saved=await typed.save(vault,item);await typed.save(vault,{...item,title:'Treasury operations'},saved.object);
 const second=await typed.save(vault,createItem('secure-note',{title:'Contractor operating guide',values:{note:'synthetic-latchkey-1111'}}));
 const sharing=new SharingClient(f.owner);
 await f.page.goto(f.origin+'/app/vault');
 if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByRole('checkbox').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click()}
 await expect(f.page.getByRole('heading',{name:'Unlock your vault'})).toBeVisible();
 {
  const contractor=await contractorJourney(f,vault,[saved.object,second.object],width,output);
  await f.page.setViewportSize({width,height:1000});await capture('vault-locked',width);await unlock();
  await expect(f.page.getByRole('heading',{name:'Treasury operations',exact:true})).toBeVisible();await capture('vault-detail',width);
  await f.page.getByRole('button',{name:'Reveal Password',exact:true}).click();await expect(f.page.getByLabel('Password',{exact:true})).toHaveValue('synthetic-latchkey-1109');await f.context.grantPermissions(['clipboard-read','clipboard-write'],{origin:f.origin});await f.page.getByRole('button',{name:'Copy Password',exact:true}).click();await expect.poll(()=>f.page.evaluate(()=>navigator.clipboard.readText())).toBe('synthetic-latchkey-1109');await f.page.evaluate(()=>navigator.clipboard.writeText(''));
  const download=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Download Quarterly recovery guide.txt'}).click();assert.equal((await download).suggestedFilename(),'Quarterly recovery guide.txt');
  await f.page.locator('summary').filter({hasText:/^History · version /}).click();await f.page.getByRole('button',{name:/Version 1 ·/}).click();await expect(f.page.getByRole('heading',{name:'Preview version 1'})).toBeVisible();await capture('vault-history',width);
  await f.page.getByLabel('Restore this version as a new current version').check();await f.page.getByRole('button',{name:'Restore version 1',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Treasury workspace',exact:true})).toBeVisible();
  await f.page.getByRole('button',{name:'Edit',exact:true}).click();await f.page.getByLabel('Title',{exact:true}).fill('Treasury operations');await capture('vault-editor',width);await f.page.getByRole('button',{name:'Save item',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Treasury operations',exact:true})).toBeVisible();
  await f.page.locator('summary').filter({hasText:/^Settings$/}).click();await f.page.getByRole('button',{name:'Password generator',exact:true}).click();await expect(f.page.getByRole('button',{name:'Generate',exact:true})).toBeEnabled();await f.page.getByRole('button',{name:'Generate',exact:true}).click();await expect(f.page.getByLabel('Generated value')).not.toHaveValue('');await capture('vault-generator',width);
  await f.page.locator('summary').filter({hasText:/^Settings$/}).click();await f.page.getByRole('button',{name:'Custom templates',exact:true}).click();await f.page.getByLabel('Template name').fill('Treasury approval');await f.page.getByRole('button',{name:'Add field',exact:true}).click();await f.page.getByLabel('Label',{exact:true}).fill('Approval reference');await capture('vault-templates',width);await f.page.getByRole('button',{name:'Save template',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Treasury operations',exact:true})).toBeVisible();await f.page.getByRole('button',{name:'New item',exact:true}).click();await f.page.getByLabel('Template').selectOption({label:'Treasury approval'});await f.page.getByLabel('Title',{exact:true}).fill('Quarterly control');await f.page.getByLabel('Approval reference',{exact:true}).fill('synthetic-latchkey-1113');await f.page.getByRole('button',{name:'Save item',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Quarterly control',exact:true})).toBeVisible();await capture('vault-template-item',width);await f.page.getByRole('navigation',{name:'Vault items'}).getByRole('button').filter({hasText:'Treasury operations'}).click();
  await f.page.locator('summary').filter({hasText:/^Sharing$/}).click();const manager=f.page.getByRole('region',{name:'Sharing',exact:true});await expect(manager.getByText(/Link default:/)).toBeVisible();await capture('sharing-disabled',width);
  await manager.locator('summary').filter({hasText:'Company sharing policy'}).click();await manager.getByLabel('Enable external links for approved domains').check();await manager.getByLabel('Approved email domains, separated by commas').fill('example.test');await manager.getByRole('button',{name:'Save sharing policy',exact:true}).click();await expect(manager.getByText('Sharing policy saved and audited.')).toBeVisible();
  await manager.getByLabel('Recipient email',{exact:true}).fill('contractor@unapproved.test');await manager.getByLabel('Separate link password').fill('synthetic-latchkey-1110');await manager.getByRole('button',{name:'Create link',exact:true}).click();await expect(manager.getByRole('alert')).toContainText('not approved');await capture('sharing-blocked-domain',width);
  await manager.getByLabel('Link lifetime in days').fill(String(Number(await manager.getByLabel('Link lifetime in days').getAttribute('max'))+1));assert.equal(await manager.getByLabel('Link lifetime in days').evaluate(element=>element.validity.rangeOverflow),true);await manager.getByLabel('Link lifetime in days').fill('7');
  await manager.getByLabel('Recipient email',{exact:true}).fill('contractor@example.test');await manager.getByLabel('Separate link password').fill('synthetic-latchkey-1110');await manager.getByLabel('Maximum committed views').fill('1');await manager.getByRole('button',{name:'Create link',exact:true}).click();await expect(manager.getByLabel('Private sharing link')).not.toHaveValue('');const url=await manager.getByLabel('Private sharing link').inputValue();await capture('sharing-created',width);
  const recipient=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}}),guest=await recipient.newPage();
  try {
   await guest.goto(url);await expect(guest.getByRole('button',{name:'Send verification code'})).toBeVisible();await guest.getByLabel('Recipient email').fill('wrong@example.test');await guest.getByLabel('Link password').fill('synthetic-latchkey-1110');await guest.getByRole('button',{name:'Send verification code'}).click();await expect(guest.getByRole('alert')).toBeVisible();if(output)await guest.screenshot({path:join(output,`sharing-wrong-recipient-${width}.png`),fullPage:true});
   await guest.getByLabel('Recipient email').fill('contractor@example.test');await guest.getByLabel('Link password').fill('synthetic-latchkey-1112');await guest.getByRole('button',{name:'Send verification code'}).click();await expect(guest.getByRole('alert')).toBeVisible();if(output)await guest.screenshot({path:join(output,`sharing-wrong-password-${width}.png`),fullPage:true});await guest.getByLabel('Link password').fill('synthetic-latchkey-1110');await guest.getByRole('button',{name:'Send verification code'}).click();await expect(guest.getByLabel('Verification code')).toBeVisible();await guest.getByLabel('Verification code').fill(f.code());await guest.getByRole('button',{name:'Verify and open'}).click();await expect(guest.getByRole('heading',{name:'Shared secret',exact:true})).toBeVisible();await expect(guest.getByRole('region',{name:'Shared content'})).toContainText('Treasury operations');if(output)await guest.screenshot({path:join(output,`sharing-opened-${width}.png`),fullPage:true});
   await guest.reload();await expect(guest.getByRole('alert')).toContainText('unavailable');if(output)await guest.screenshot({path:join(output,`sharing-spent-${width}.png`),fullPage:true});
  } finally {await recipient.close()}
  await fileLinkJourney(f,manager,attachment,width,output);
  await f.page.getByRole('button',{name:'Refresh',exact:true}).click();await f.page.locator('summary').filter({hasText:/^Sharing$/}).click();await expect(f.page.getByText('View limit reached',{exact:false})).toBeVisible();
  await f.page.getByRole('button',{name:'Shared with me',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Shared with me',exact:true})).toBeVisible();await capture('received-empty',width);
  await f.page.getByRole('button',{name:'Vault',exact:true}).click();await f.page.getByRole('button',{name:'New item',exact:true}).click();await f.page.getByLabel('Title',{exact:true}).fill('Temporary contractor credential');await f.page.getByLabel('Item type').selectOption('secure-note');await f.page.getByRole('button',{name:'Reveal to edit Note',exact:true}).click();await f.page.getByLabel(/^Note/).fill('synthetic-latchkey-1114');await f.page.getByRole('button',{name:'Save item',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Temporary contractor credential',exact:true})).toBeVisible();await f.page.locator('summary').filter({hasText:'Permanently erase this item'}).click();await f.page.getByLabel('Type the item title to confirm').fill('Temporary contractor credential');await f.page.getByLabel('I understand that all retained versions and current sharing copies will be erased').check();await capture('erasure-confirmation',width);await f.page.getByRole('button',{name:'Erase item permanently',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Temporary contractor credential',exact:true})).toHaveCount(0);await expect(f.page.getByRole('button',{name:'Refresh',exact:true})).toBeEnabled();await expect(f.page.locator('summary').filter({hasText:/^History · version \d+$/})).toBeVisible();await capture('erasure-complete',width);
  await f.page.locator('summary').filter({hasText:/^Settings$/}).click();await f.page.getByRole('button',{name:'Erase a person',exact:true}).click();await f.page.getByLabel('Person').selectOption(contractor.operator);await expect(f.page.getByText(contractor.email,{exact:true})).toBeVisible();await f.page.getByRole('button',{name:'Preview person erasure',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Records to erase or anonymize'})).toBeVisible();await capture('person-erasure-preview',width);await f.page.getByLabel('I reviewed this person and understand the permanent deletion and outstanding copies').check();await f.page.getByRole('button',{name:'Confirm person erasure',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Server authority and owned records erased'})).toBeVisible();await expect(f.page.getByText('Full erasure is still incomplete.')).toBeVisible();await capture('person-erasure-outstanding',width);const receiptDownload=f.page.waitForEvent('download');await f.page.getByRole('button',{name:'Download anonymous receipt',exact:true}).click();let receiptText='';for await(const chunk of await (await receiptDownload).createReadStream())receiptText+=chunk;assert.equal(JSON.parse(receiptText).complete,false);assert.ok(!receiptText.includes(contractor.operator)&&!receiptText.includes(contractor.email));await f.owner.rotate(vault);
  await f.page.getByRole('button',{name:'Lock vault',exact:true}).click();await expect(f.page.getByRole('heading',{name:'Unlock your vault'})).toBeVisible();
  await sharing.setPolicy({externalEnabled:false,domains:['example.test'],defaultDays:7,maxDays:30});
 }
 console.log('Vault browser: real owner setup/unlock, typed edit, reveal, attachment download, append restore, generator, templates and protected verified one-view sharing at 1440 and 390 passed');
} catch(error) {if(output)await f.page.screenshot({path:join(output,'failure.png'),fullPage:true});throw error} finally {await f.close()}
}

async function generatorPolicyReviewJourney(width, output) {
 const f = await vaultFixture();
 const capture = async name => { assert.ok(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)); if (output) await f.page.screenshot({ path: join(output, `${name}-${width}.png`), fullPage: true }); };
 try {
  await f.owner.createVault();
  const second = new VaultClient(f.origin, { cookie: f.owner.cookie, fetcher: f.fetcher });
  try {
   const pending = await second.beginEnrollment(f.owner.profile, f.password);
   await f.owner.approveEnrollment(pending.device, pending.fingerprint);
   const profile = await second.completeEnrollment(pending.profile, f.password);
   await f.owner.call('device' + '/revoke', { device: profile.device });
  } finally { second.lock(); }
  if (width === 1440) {
   const apiFixture = await vaultFixture({ browserEnabled: false });
   try { await runGeneratorApiJourney(apiFixture); } finally { await apiFixture.close(); }
  }
  await f.page.setViewportSize({ width, height: 1000 });
  await f.page.goto(f.origin + '/app/vault');
  if (new URL(f.page.url()).pathname === '/setup') { await f.page.getByRole('checkbox').check(); await f.page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  await f.page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application' + '/json', buffer: Buffer.from(JSON.stringify(f.owner.profile)) });
  await f.page.getByLabel('Master password', { exact: true }).fill(f.password);
  await f.page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
  await f.page.locator('summary').filter({ hasText: /^Settings$/ }).click();
  await f.page.getByRole('button', { name: 'Password generator', exact: true }).click();
  await f.page.getByRole('button', { name: 'Generate', exact: true }).waitFor({ state: 'visible' });
  await f.page.locator('summary').filter({ hasText: 'Manage company and group policy' }).click();
  const group = (await new SharingClient(f.owner).createGroup([f.owner.profile.account])).group;
  await f.page.getByLabel('Existing group ID').fill(group);
  await f.page.getByLabel('Minimum characters', { exact: true }).fill('36');
  await f.page.getByLabel('Reason for this change').fill('synthetic-latchkey-1312');
  const before = await f.owner.call('generator' + '/policy', {});
  await f.page.getByRole('button', { name: 'Preview policy change', exact: true }).click();
  const review = f.page.getByRole('region', { name: 'Policy change review' });
  await review.waitFor();
  if (width === 1440) {
   await expect(review).toContainText('1 affected members'); await expect(review).toContainText(f.owner.profile.device);
   await expect(review).toContainText('1 enrolled devices · 1 revoked or superseded device records');
   await expect(review).toContainText('revoked · reachability unknown · convergence unverified');
   await expect(review).toContainText('Before: 16–256'); await expect(review).toContainText('After: 36–256');
   await expect(review).toContainText('Sources after: baseline · group ' + group);
   await expect(review).toContainText('reachability unknown');
   await expect(review.getByRole('button', { name: 'Apply reviewed policy' })).toBeDisabled();
   assert.deepEqual((await f.owner.call('generator' + '/policy', {})).policy, before.policy);
  }
  await capture('generator-policy-review');
  await review.getByRole('checkbox').check();
  if (width === 1440) {
   await new SharingClient(f.owner).setGroup(group, []);
   await review.getByRole('button', { name: 'Apply reviewed policy' }).click();
   await expect(f.page.getByRole('alert')).toContainText('Preview again');
   assert.deepEqual((await f.owner.call('generator' + '/policy', {})).policy, before.policy);
   await new SharingClient(f.owner).setGroup(group, [f.owner.profile.account]);
   await f.page.getByRole('button', { name: 'Preview policy change' }).click(); await review.getByRole('checkbox').check();
  }
  let releaseApply;
  if (width === 1440) {
   const paused = new Promise(resolve => { releaseApply = resolve; });
   await f.page.route('**/api/latchkey/generator/policy/set', async route => { await paused; await route.continue(); });
  }
  await review.getByRole('button', { name: 'Apply reviewed policy' }).click();
  if (width === 1440) { try { await expect(f.page.getByRole('button', { name: 'Generate', exact: true })).toBeDisabled(); } finally { releaseApply(); } }
  await expect(f.page.getByRole('status').filter({ hasText: 'Policy saved' })).toContainText('Policy saved');
  if (width === 1440) assert.equal((await f.owner.call('generator' + '/policy', {})).policy.minLength, 36);
  await f.page.getByRole('button', { name: 'Generate', exact: true }).click();
  await expect(f.page.getByLabel('Generated value')).not.toHaveValue('');
  if (width === 1440) assert.equal((await f.page.getByLabel('Generated value').inputValue()).length, 36);
  await capture('generator-policy-applied');
  await f.page.getByLabel('Maximum characters', { exact: true }).fill('32');
  await f.page.getByRole('button', { name: 'Preview policy change' }).click();
  await review.waitFor();
  if (width === 1440) { await expect(review.getByRole('alert')).toContainText('Minimum length 36 exceeds maximum length 32'); await expect(review.getByRole('button', { name: 'Apply reviewed policy' })).toBeDisabled(); }
  await capture('generator-policy-conflict');
  await f.page.getByLabel('Maximum characters', { exact: true }).fill('36');
  await f.page.getByLabel('Minimum entropy (bits)', { exact: true }).fill('300');
  await f.page.getByRole('button', { name: 'Preview policy change' }).click();
  await review.waitFor();
  if (width === 1440) {
   await expect(review.getByRole('alert')).toContainText('Minimum entropy 300 bits exceeds');
   await expect(review.getByRole('alert')).toContainText('maximum length 36');
   await expect(review.getByRole('button', { name: 'Apply reviewed policy' })).toBeDisabled();
   assert.equal((await f.owner.call('generator' + '/policy', {})).policy.minEntropyBits, 80);
  }
  await capture('generator-policy-entropy-conflict');
 } catch (error) { if (output) await f.page.screenshot({ path: join(output, `generator-policy-failure-${width}.png`), fullPage: true }); throw error; }
 finally { await f.close(); }
}

async function browserLockJourney(output) {
 const f = await vaultFixture(), page = f.page, profile = structuredClone(f.owner.profile), wire = [], errors = [];
 const secret = 'synthetic-latchkey-2801', title = 'Browser lock reference';
 const otpSeed = [...Buffer.from('synthetic-latchkey-2806')].map(byte => byte.toString(2).padStart(8, '0')).join('').match(/.{1,5}/g).map(group => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(group.padEnd(5, '0'), 2)]).join('');
 const locked = () => expect(page.getByRole('heading', { name: 'Unlock your vault', exact: true })).toBeVisible();
 const capture = async name => {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'horizontal overflow');
  if (output) await page.screenshot({ path: join(output, name + '.png'), fullPage: true });
 };
 const enter = async (selected = profile, password = f.password) => {
  await page.getByLabel('Profile file').setInputFiles({ name: 'profile.json', mimeType: 'application' + '/json', buffer: Buffer.from(JSON.stringify(selected)) });
  await page.getByLabel('Master password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Unlock vault', exact: true }).click();
 };
 const unlock = async selected => { await enter(selected); await expect(page.getByRole('button', { name: 'Lock vault', exact: true })).toBeVisible(); };
 const settings = async () => {
  await page.locator('summary').filter({ hasText: /^Settings$/ }).click();
  await page.getByRole('button', { name: 'Browser lock', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Browser lock', exact: true })).toBeVisible();
 };
 const review = async (minutes, background) => {
  await settings(); await page.getByLabel('Lock after inactivity').selectOption(String(minutes));
  await page.getByLabel('Lock when this page goes into the background').setChecked(background);
  await page.getByRole('button', { name: 'Review lock settings', exact: true }).click();
 };
 const apply = async () => {
  await page.getByRole('button', { name: 'Apply reviewed lock settings', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Browser lock settings saved' })).toBeVisible();
 };
 const vaultView = async () => { await page.getByRole('button', { name: 'Vault', exact: true }).click(); await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible(); };
 const stored = () => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));
 const hide = async () => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
 });
 const show = async () => page.evaluate(() => {
  delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange'));
 });
 const defer = async path => {
  let release, seen;
  const waiting = new Promise(resolve => { seen = resolve; }), delayed = new Promise(resolve => { release = resolve; });
  const handler = async route => {
   const response = await route.fetch(); seen(); await delayed;
   try { await route.fulfill({ response }); } catch { /* Lock aborted the browser request. */ }
  };
  await page.route('**/api/latchkey/' + path, handler);
  return { waiting, finish: async () => { release(); await page.unroute('**/api/latchkey/' + path, handler); } };
 };
 try {
  const vault = (await f.owner.createVault()).vault;
  const savedItem = await new TypedItems(f.owner).save(vault, createItem('login', { title, values: { username: 'synthetic-latchkey-2802', password: secret, totp: { secret: otpSeed, account: 'synthetic-latchkey-2807', issuer: 'Synthetic' } } }));
  // A transport that ignores cancellation still cannot deliver an old result.
  let releaseRead, observeRead, delayRead = false;
  const readWaiting = new Promise(resolve => { observeRead = resolve; });
  const readRelease = new Promise(resolve => { releaseRead = resolve; });
  const guarded = new VaultClient(f.origin, { fetcher: async (url, init) => {
   const response = await f.fetcher(url, init);
   if (delayRead && url.endsWith('/item/read')) { observeRead(); await readRelease; }
   return response;
  } });
  await guarded.unlock(structuredClone(profile), f.password); delayRead = true;
  const oldRead = guarded.readItem(vault, savedItem.object);
  const refusedRead = assert.rejects(oldRead, { code: 'locked' });
  await readWaiting; guarded.lock(); releaseRead(); await refusedRead;
  assert.throws(() => guarded.call('vaults', {}), { code: 'locked' });
  await assert.rejects(new TypedItems(guarded).field(vault, savedItem.object, 'password', 'copy'), { code: 'locked' });
  await assert.rejects(guarded.put(vault, createItem('secure-note', { title: 'Refused locked write', values: { note: secret } })), { code: 'locked' });
  assert.equal((await f.owner.readVault(vault)).versions.length, 1);
  console.log('PROBE LKY-004 locked client: a delayed actual Worker result is invalidated even without transport cancellation; reveal, copy and mutation refuse without writes');
  page.on('request', request => { if (request.url().includes('/api/')) wire.push(request.postData() ?? ''); });
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(f.origin + '/app/vault');
  if (new URL(page.url()).pathname === '/setup') { await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Finish setup', exact: true }).click(); }
  const unlocking = await defer('login/finish');
  try {
   await enter(); await unlocking.waiting;
   await page.evaluate(() => { dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })); dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })); });
   await locked();
  } finally { await unlocking.finish(); }
  await expect(page.getByRole('button', { name: 'Unlock vault', exact: true })).toBeEnabled();
  await expect(page.getByLabel('Master password', { exact: true })).toHaveValue('');
  console.log('PROBE LKY-004 pending unlock: leaving the page invalidates a delayed authorized login completion and clears the password');
  await unlock(); await review(1, true);
  const reviewed = page.getByRole('region', { name: 'Lock settings review' });
  for (const value of [f.origin, profile.tenant, profile.account, profile.device]) await expect(reviewed).toContainText(value);
  assert.deepEqual(await stored(), {}); await capture('browser-lock-review-1440');
  await page.getByRole('button', { name: 'Cancel lock changes', exact: true }).click();
  assert.deepEqual(await stored(), {}); await expect(page.getByLabel('Lock after inactivity')).toHaveValue('0');
  await page.getByLabel('Lock after inactivity').selectOption('1');
  // Keyboard confirms the reviewed binding; changing a draft invalidates review.
  await page.getByRole('button', { name: 'Review lock settings', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Lock after inactivity').selectOption('5'); await expect(reviewed).toHaveCount(0);
  await page.getByLabel('Lock after inactivity').selectOption('1');
  await page.getByRole('button', { name: 'Review lock settings', exact: true }).click();
  await page.getByRole('button', { name: 'Apply reviewed lock settings', exact: true }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Browser lock settings saved' })).toBeVisible();
  const saved = await stored(); assert.equal(Object.keys(saved).length, 1);
  assert.deepEqual(JSON.parse(Object.values(saved)[0]), { schema: 1, binding: { origin: f.origin, tenant: profile.tenant, account: profile.account, device: profile.device, generation: profile.generation }, minutes: 1, background: false });
  await capture('browser-lock-settings-1440');
  console.log('PROBE LKY-004 settings: reviewed exact profile, cancelled without persistence, changed draft requires review, keyboard confirmation persisted only preferences');
  await vaultView();
  await page.getByRole('button', { name: 'Reveal Password', exact: true }).focus();
  await expect(page.getByRole('tooltip')).toContainText('Reveal field');
  await page.getByRole('button', { name: 'Reveal Password', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue(secret);
  await page.clock.install(); await page.clock.setFixedTime(new Date());
  await page.clock.fastForward(55000);
  await page.getByRole('searchbox', { name: 'Search vault' }).fill('Browser');
  await page.clock.fastForward(55000); await expect(page.getByRole('button', { name: 'Lock vault', exact: true })).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true })));
  await page.clock.fastForward(6000); await locked(); await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0); await capture('browser-lock-idle-1440');
  await page.clock.resume(); await page.clock.setFixedTime(new Date());
  console.log('PROBE LKY-004 inactivity: genuine input extended the deadline; synthetic activity did not; idle lock removed rendered title and revealed secret');
  await enter(profile, 'synthetic-latchkey-2803'); await expect(page.getByRole('alert')).toContainText('could not unlock'); await locked(); await unlock();
  await review(0, true); await apply(); await vaultView();
  await hide(); await locked(); await show(); await locked();
  console.log('PROBE LKY-004 background: browser visibility boundary locks immediately and return stays locked');
  await unlock(); await vaultView();
  // A real history traversal and an explicit persisted lifecycle event both use
  // the built page. Playwright disables native BFCache in its default launch.
  await page.goto(f.origin + '/contract'); await page.goBack(); await locked();
  await unlock(); await page.evaluate(() => {
   dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
   dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  }); await locked();
  await unlock(); await page.reload(); await locked();
  await unlock(); await settings(); await expect(page.getByLabel('Lock after inactivity')).toHaveValue('0'); await expect(page.getByLabel('Lock when this page goes into the background')).toBeChecked();
  console.log('PROBE LKY-004 restart: reload, history return and persisted page lifecycle require the existing profile and password ceremony; preferences survive without keys');
  await vaultView();
  const read = await defer('vault/view');
  try {
   await page.getByRole('button', { name: 'Refresh', exact: true }).click(); await read.waiting;
   await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await locked();
  } finally { await read.finish(); }
  await expect(page.getByRole('heading', { name: title, exact: true })).toHaveCount(0); await unlock(); await vaultView();
  const reveal = await defer('item/read');
  try {
   await page.getByRole('button', { name: 'Reveal Password', exact: true }).click(); await reveal.waiting;
   await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await locked();
  } finally { await reveal.finish(); }
  await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Copy Password', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'New item', exact: true })).toHaveCount(0);
  console.log('PROBE LKY-004 pending: delayed real read and reveal responses cannot restore state after lock; copy and mutation controls are absent');
  await unlock(); await vaultView();
  await f.context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: f.origin });
  await page.evaluate(() => navigator.clipboard.writeText('synthetic-latchkey-2808'));
  await page.getByRole('button', { name: 'Show current code', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Copy current code', exact: true })).toBeVisible();
  await page.evaluate(() => {
   window.originalSign = crypto.subtle.sign; window.hmacPending = false;
   crypto.subtle.sign = async function (...args) {
    const result = await window.originalSign.apply(this, args);
    if (args[0] === 'HMAC') { window.hmacPending = true; await new Promise(resolve => { window.releaseHmac = resolve; }); }
    return result;
   };
  });
  await page.getByRole('button', { name: 'Copy current code', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.hmacPending)).toBe(true);
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await locked();
  await page.evaluate(() => { crypto.subtle.sign = window.originalSign; window.releaseHmac(); });
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'synthetic-latchkey-2808');
  await page.evaluate(() => navigator.clipboard.writeText(''));
  console.log('PROBE LKY-004 delayed copy: a real TOTP calculation completing after lock cannot overwrite the clipboard');
  // Existing account with a freshly approved second device has distinct settings.
  const second = new VaultClient(f.origin, { cookie: f.owner.cookie, fetcher: f.fetcher });
  const pending = await second.beginEnrollment(profile, f.password); await f.owner.approveEnrollment(pending.device, pending.fingerprint);
  const secondProfile = await second.completeEnrollment(pending.profile, f.password);
  await unlock(secondProfile); await settings(); await expect(page.getByLabel('Lock after inactivity')).toHaveValue('0'); await expect(page.getByLabel('Lock when this page goes into the background')).not.toBeChecked();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await unlock(); await settings(); await expect(page.getByLabel('Lock when this page goes into the background')).toBeChecked();
  assert.equal(Object.keys(await stored()).length, 1);
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click();
  await f.owner.call('device' + '/revoke', { device: secondProfile.device });
  await enter(secondProfile); await expect(page.getByRole('alert')).toContainText('could not unlock'); await locked();
  await enter({ ...profile, origin: 'https://foreign.example.test' }); await expect(page.getByRole('alert')).toContainText('profile mismatch'); await locked();
  const member = new VaultClient(f.origin, { fetcher: f.fetcher }), memberPassword = 'synthetic-latchkey-2805';
  await f.owner.call(['api', 'users', 'invite'].join('/'), { email: ['synthetic-latchkey-2804', 'example.test'].join('@'), displayName: 'Browser profile member', role: 'member', returnTo: '/app/vault' });
  const identity = new URL(f.mail.at(-1).content.find(c => c.type === 'text' + '/plain').value.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
  await member.confirmIdentity(identity);
  const memberEnrollment = await member.register(memberPassword); await member.unlock(memberEnrollment.profile, memberPassword);
  await enter(memberEnrollment.profile, memberPassword); await expect(page.getByRole('button', { name: 'Lock vault', exact: true })).toBeVisible();
  await settings(); await expect(page.getByLabel('Lock after inactivity')).toHaveValue('0'); await expect(page.getByLabel('Lock when this page goes into the background')).not.toBeChecked();
  await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); member.lock();
  console.log('PROBE LKY-004 isolation: a second approved device and a separate account start unconfigured, foreign origin refuses, original preferences remain isolated, revoked profile and wrong password cannot unlock');
  await unlock(); await settings();
  await page.setViewportSize({ width: 390, height: 1000 }); await capture('browser-lock-settings-390');
  await page.getByLabel('Lock after inactivity').selectOption('1'); await page.getByRole('button', { name: 'Review lock settings', exact: true }).click(); await capture('browser-lock-review-390');
  await page.getByRole('button', { name: 'Cancel lock changes', exact: true }).click(); await page.getByRole('button', { name: 'Lock vault', exact: true }).click(); await capture('browser-lock-locked-390');
  const persistence = JSON.stringify(await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, databases: await indexedDB.databases(), caches: await caches.keys() })));
  const audit = JSON.stringify(await f.owner.call('audit', {}));
  const state = JSON.stringify(await f.db.prepare('SELECT * FROM lky_events').all());
  for (const canary of [secret, otpSeed, f.password, profile.deviceSecret, f.owner.bundle.root.authority.privateKey, f.owner.bundle.root.recipient.privateKey]) {
   assert.ok(!persistence.includes(canary), 'secret persisted in browser');
   assert.ok(!wire.join('').includes(canary), 'secret sent over wire');
   assert.ok(!audit.includes(canary) && !state.includes(canary), 'secret in audit');
  }
  assert.deepEqual(errors, []); second.lock();
  console.log('PROBE LKY-004 secrecy: local and session storage, IndexedDB, caches, wire and audit contain no password, profile secret, root or decrypted item');
  console.log('browserLockJourney passed; assertions at 1440, changed settings, review and locked screens captured at 390');
 } catch (error) { if (output) await page.screenshot({ path: join(output, 'browser-lock-failure.png'), fullPage: true }); throw error; }
 finally { await f.close(); }
}
