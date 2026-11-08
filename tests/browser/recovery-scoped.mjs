import { TypedItems } from '../../src/latchkey/items/client.mjs';
import { createItem } from '../../src/latchkey/items/types.mjs';
import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { join } from 'node:path';
import { vaultFixture } from './fixture.mjs';
import { member, verifiedClient } from '../latchkey-recovery.mjs';
import { RecoveryClient } from '../../src/latchkey/recovery/client.mjs';
import { VaultClient } from '../../src/latchkey/client.mjs';
const upload=(value,name='profile.json')=>({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});
async function signIn(f,client){
 const cookies=client.cookie.split(';').filter(Boolean).map(row=>{const [name,...parts]=row.trim().split('=');return {name,value:parts.join('='),url:f.origin,secure:true}});
 await f.context.clearCookies();await f.context.addCookies(cookies);await f.page.goto(f.origin+'/app/vault');
 if(new URL(f.page.url()).pathname==='/setup'){await f.page.getByRole('checkbox').check();await f.page.getByRole('button',{name:'Finish setup',exact:true}).click()}
}
async function unlock(f,client,password){
 await signIn(f,client);await f.page.getByLabel('Profile file').setInputFiles(upload(client.profile));await f.page.getByLabel('Master password',{exact:true}).fill(password);await f.page.getByRole('button',{name:'Unlock vault',exact:true}).click();
 await f.page.locator('summary').filter({hasText:/^Settings$/}).click();await f.page.getByRole('button',{name:'Scoped recovery',exact:true}).click();await f.page.getByRole('button',{name:'Refresh recovery scopes'}).waitFor();
}
async function downloaded(page,work){const event=page.waitForEvent('download');await work();let raw='';for await(const chunk of await(await event).createReadStream())raw+=chunk;return JSON.parse(raw)}
export async function scopedRecoveryBrowserJourney(width,output){
 const f=await vaultFixture(),assertions=width===1440;
 const capture=async name=>{assert.ok(await f.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'recovery viewport overflow');if(output)await f.page.screenshot({path:join(output,`${name}-${width}.png`),fullPage:true})};
 try{
  await f.page.setViewportSize({width,height:1000});
  const custodian=await member(f,9700),person=await member(f,9710),personIdentity=await person.client.identity(),custodianIdentity=await custodian.client.identity();
  const vault=(await person.client.createVault()).vault;await new TypedItems(person.client).save(vault,createItem('secure-note',{title:'Recovered company document',values:{note:'synthetic-latchkey-9712'}}));
  const plaintext=[person.password,custodian.password,person.client.bundle.root.recipient.privateKey,custodian.client.bundle.root.recipient.privateKey,'synthetic-latchkey-9712','synthetic-latchkey-9713','synthetic-latchkey-9715'];
  const requests=[],recordRequest=request=>{if(request.url().includes('/api/latchkey/'))requests.push(request.postData()??'')};f.page.on('request',recordRequest);
  await unlock(f,f.owner,f.password);
  const panel=f.page.getByRole('region',{name:'Scoped recovery',exact:true});
  await panel.getByLabel('Grant custodian account',{exact:true}).fill(custodianIdentity.account);await panel.getByLabel('Grant member account',{exact:true}).fill(personIdentity.account);
  if(assertions)await expect(panel.getByRole('button',{name:'Grant named recovery scope'})).toBeDisabled();
  await panel.getByLabel('I confirm this exact scope change or revocation').check();await panel.getByRole('button',{name:'Grant named recovery scope'}).focus();await panel.getByRole('button',{name:'Grant named recovery scope'}).press('Enter');await panel.getByRole('status').filter({hasText:'Recovery scope granted'}).waitFor();
  const scope=(await new RecoveryClient(f.owner).scopes()).scopes.find(row=>row.member===personIdentity.account);
  await capture('scoped-recovery-owner');
  await unlock(f,person.client,person.password);
  await panel.getByLabel('Enrollment custodian account').fill(custodianIdentity.account);await panel.getByLabel('Enrollment scope').fill(scope.id);await panel.getByLabel('Custodian fingerprint').fill(await custodianIdentity.fingerprint);
  if(assertions)await expect(panel.getByRole('button',{name:'Enroll and save recovery credential'})).toBeDisabled();
  await panel.getByLabel('I consent to encrypted company-account custody by this pinned custodian').check();
  if(assertions){
   // Consent belongs to the exact pinned key, including changes in another form.
   await panel.getByLabel('Custodian fingerprint').fill('synthetic-latchkey-9714');
   await expect(panel.getByRole('button',{name:'Enroll and save recovery credential'})).toBeDisabled();
   await panel.getByLabel('Custodian fingerprint').fill(await custodianIdentity.fingerprint);
   await expect(panel.getByLabel('I consent to encrypted company-account custody by this pinned custodian')).not.toBeChecked();
   await panel.getByLabel('I consent to encrypted company-account custody by this pinned custodian').check();
   await panel.getByLabel('Grant custodian account',{exact:true}).fill(personIdentity.account);
   await expect(panel.getByRole('button',{name:'Enroll and save recovery credential'})).toBeDisabled();
   await panel.getByLabel('Enrollment custodian account').fill(custodianIdentity.account);
   await panel.getByLabel('I consent to encrypted company-account custody by this pinned custodian').check();
  }
  const credential=await downloaded(f.page,()=>panel.getByRole('button',{name:'Enroll and save recovery credential'}).click());
  if(assertions){assert.equal(credential.trustedAdministrator.account,custodianIdentity.account);assert.ok(!JSON.stringify(credential).includes(person.client.bundle.root.recipient.privateKey))}
  await panel.getByRole('status').filter({hasText:'Member enrollment saved'}).waitFor();await capture('scoped-recovery-member');
  const verified=await verifiedClient(f,person.email);await signIn(f,verified);
  await f.page.locator('summary').filter({hasText:/^Recover company account$/}).click();
  const recovery=f.page.getByRole('region',{name:'Recover company account',exact:true}),newPassword='synthetic-latchkey-9713';
  if(assertions){
   const cases=(await f.db.prepare('SELECT COUNT(*) AS n FROM lky_recovery_cases WHERE account=?').bind(personIdentity.account).first()).n,notices=f.mail.length;
   await recovery.getByLabel('Recovery credential file').setInputFiles(upload({...credential,account:custodianIdentity.account},'changed-recovery.json'));
   await recovery.getByLabel('New recovery password').fill(newPassword);
   await recovery.getByRole('button',{name:'Start recovery case'}).click();
   await expect(recovery.getByRole('alert')).toContainText('does not match the signed-in company account');
   await expect(recovery.locator('[data-recovery-case]')).toHaveCount(0);
   assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_recovery_cases WHERE account=?').bind(personIdentity.account).first()).n,cases);
   assert.equal(f.mail.length,notices);
  }
  await recovery.getByLabel('Recovery credential file').setInputFiles(upload(credential,'recovery.json'));await recovery.getByLabel('New recovery password').fill(newPassword);await recovery.getByRole('button',{name:'Start recovery case'}).click();
  const operation=await recovery.locator('[data-recovery-case]').innerText();
  await recovery.getByLabel('I confirm recovery of this exact company account').check();await recovery.getByRole('button',{name:'Finish approved recovery'}).click();
  if(assertions)await expect(recovery.getByRole('alert')).toContainText('approval');else await recovery.getByRole('alert').waitFor();
  await capture('scoped-recovery-pending');
  // Keep the member's case tab while the distinct custodian reviews in a new tab.
  const memberPage=f.page,memberContext=f.context,custodianContext=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}}),custodianPage=await custodianContext.newPage();
  custodianPage.on('request',recordRequest);
  try{
   const cf={...f,page:custodianPage,context:custodianContext};await unlock(cf,custodian.client,custodian.password);
   const reviewPanel=custodianPage.getByRole('region',{name:'Scoped recovery',exact:true});
   await reviewPanel.getByLabel('Recovery case',{exact:true}).fill(operation);await reviewPanel.getByLabel('Member account to pin').fill(personIdentity.account);await reviewPanel.getByLabel('Member fingerprint',{exact:true}).fill(await personIdentity.fingerprint);await reviewPanel.getByRole('button',{name:'Review named recovery case'}).click();
   await reviewPanel.getByLabel('I checked this member’s identity for this exact case').waitFor();if(assertions)await expect(reviewPanel.getByRole('button',{name:'Approve exact recovery case'})).toBeDisabled();
   if(output)await custodianPage.screenshot({path:join(output,`scoped-recovery-custodian-${width}.png`),fullPage:true});
   await reviewPanel.getByLabel('I checked this member’s identity for this exact case').check();await reviewPanel.getByRole('button',{name:'Approve exact recovery case'}).click();await reviewPanel.getByRole('status').filter({hasText:'case was approved'}).waitFor();
  }finally{await custodianContext.close()}
  await memberPage.getByRole('button',{name:'Finish approved recovery'}).click();await recovery.getByRole('heading',{name:'Save new credentials before finishing'}).waitFor();
  const profile=await downloaded(memberPage,()=>recovery.getByRole('button',{name:'Save new profile',exact:true}).click());await downloaded(memberPage,()=>recovery.getByRole('button',{name:'Save new Emergency Kit',exact:true}).click());await recovery.getByRole('button',{name:'I retained both files; complete recovery'}).click();
  await recovery.getByRole('status').filter({hasText:'Recovery completed'}).waitFor();await capture('scoped-recovery-complete');
  const fresh=await verifiedClient(f,person.email);await fresh.unlock(profile,newPassword);
  if(assertions){assert.equal((await fresh.readVault(vault)).versions[0].value.fields.find(field=>field.id==='note').value,'synthetic-latchkey-9712');await assert.rejects(custodian.client.readVault(vault));for(const secret of plaintext)assert.ok(!requests.join('').includes(secret));await assert.rejects(person.client.readVault(vault))}
  // Decrypt the intended content with the fresh profile in the actual browser.
  await signIn(f,fresh);await memberPage.getByLabel('Profile file').setInputFiles(upload(profile));await memberPage.getByLabel('Master password',{exact:true}).fill(newPassword);await memberPage.getByRole('button',{name:'Unlock vault',exact:true}).click();
  await memberPage.getByRole('button',{name:'New item',exact:true}).waitFor();await memberPage.getByRole('navigation',{name:'Vault items'}).getByRole('button').filter({hasText:'Recovered company document'}).click();if(assertions){await memberPage.getByRole('button',{name:'Reveal Note',exact:true}).focus();await expect(memberPage.getByRole('tooltip')).toContainText('Reveal field')}await memberPage.getByRole('button',{name:'Reveal Note',exact:true}).click();if(assertions)await expect(memberPage.getByLabel('Note',{exact:true})).toHaveValue('synthetic-latchkey-9712');await memberPage.getByRole('button',{name:'Hide Note',exact:true}).click();await capture('scoped-recovery-unlocked');
  // A later owner revocation must refuse the browser's already-open case.
  const nextGrant=await new RecoveryClient(f.owner).setScopes(custodianIdentity.account,[{account:profile.account,generation:profile.generation,domain:'company-account'}],{confirmed:true});
  await unlock(f,fresh,newPassword);
  await panel.getByLabel('Enrollment custodian account').fill(custodianIdentity.account);
  await panel.getByLabel('Enrollment scope').fill(nextGrant.scopes[0].id);
  await panel.getByLabel('Custodian fingerprint').fill(await custodianIdentity.fingerprint);
  await panel.getByLabel('I consent to encrypted company-account custody by this pinned custodian').check();
  const nextCredential=await downloaded(memberPage,()=>panel.getByRole('button',{name:'Enroll and save recovery credential'}).click());
  await panel.getByRole('status').filter({hasText:'Member enrollment saved'}).waitFor();
  await signIn(f,await verifiedClient(f,person.email));
  await memberPage.locator('summary').filter({hasText:/^Recover company account$/}).click();
  await recovery.getByLabel('Recovery credential file').setInputFiles(upload(nextCredential,'recovery.json'));
  await recovery.getByLabel('New recovery password').fill('synthetic-latchkey-9715');
  await recovery.getByRole('button',{name:'Start recovery case'}).click();
  await recovery.locator('[data-recovery-case]').waitFor();
  await new RecoveryClient(f.owner).setScopes(custodianIdentity.account,[],{confirmed:true});
  await recovery.getByLabel('I confirm recovery of this exact company account').check();
  await recovery.getByRole('button',{name:'Finish approved recovery'}).click();
  await recovery.getByRole('alert').waitFor();
  if(assertions){
   await expect(recovery.getByRole('alert')).toContainText('grant no longer matches');
   assert.equal((await f.db.prepare('SELECT generation FROM lky_accounts WHERE id=?').bind(profile.account).first()).generation,profile.generation);
  }
  await capture('scoped-recovery-revoked');
  if(assertions)for(const secret of plaintext)assert.ok(!requests.join('').includes(secret));
  console.log(`Scoped recovery browser ${width}: owner grant, member encryption, distinct custodian approval, retained new credentials and recovered company account passed`);
 }catch(error){if(output)await f.page.screenshot({path:join(output,`scoped-recovery-failure-${width}.png`),fullPage:true});throw error}finally{await f.close()}
}
