import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { join } from 'node:path';
import { digest } from '../../src/latchkey/crypto/envelope.mjs';
import { SharingClient, PublicLinkClient } from '../../src/latchkey/sharing/client.mjs';
export async function contractorJourney(f,vault,objects,width,output) {
 const email=`synthetic-latchkey-${1120+width}@example.test`,password='synthetic-latchkey-1121';
 const invited=await f.context.request.post(f.origin+'/auth/invite',{headers:{origin:f.origin},data:{email,displayName:'Northstar contractor',role:'member'}});assert.equal(invited.status(),202);
 const plain=f.mail.at(-1).content.find(c=>c.type==='text/plain').value,token=new URL(plain.match(/https:\/\/[^\s<>]+/)[0]).searchParams.get('token');
 const context=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}});let page;
 try {
  const confirmed=await context.request.post(f.origin+'/auth/confirm',{headers:{origin:f.origin},data:{token},maxRedirects:0});assert.equal(confirmed.status(),303);
  page=await context.newPage();await page.goto(f.origin+'/app/vault');await expect(page.getByLabel('Profile file')).toBeEnabled();
  await page.getByRole('button',{name:'First time? Create an account',exact:true}).click();await page.getByLabel('Master password',{exact:true}).fill(password);await page.getByLabel('Confirm master password',{exact:true}).fill(password);if(output)await page.screenshot({path:join(output,`vault-registration-${width}.png`),fullPage:true});await page.getByRole('button',{name:'Create account',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Keep your keys safe'})).toBeVisible();
  const person=await f.db.prepare('SELECT id FROM oa_operators WHERE email=?').bind(email).first();assert.ok(person);assert.equal((await f.db.prepare('SELECT COUNT(*) AS n FROM lky_accounts WHERE operator_id=?').bind(person.id).first()).n,0);
  if(output)await page.screenshot({path:join(output,`vault-registration-custody-${width}.png`),fullPage:true});
  const files={};for(const [key,label] of [['profile','Download profile'],['kit','Download recovery kit']]){const downloading=page.waitForEvent('download');await page.getByRole('button',{name:label,exact:true}).click();const download=await downloading;let content='';for await(const chunk of await download.createReadStream())content+=chunk;files[key]=JSON.parse(content)}
  assert.equal(files.profile.account,files.kit.account);await page.getByLabel('I saved both files securely').check();await page.getByRole('button',{name:'Create account and open vault',exact:true}).click();await expect(page.getByRole('button',{name:'Shared with me',exact:true})).toBeVisible();
  const fingerprint=await digest(JSON.stringify([files.profile.recipientKey,files.profile.authorityKey])),ownerFingerprint=await digest(JSON.stringify([f.owner.profile.recipientKey,f.owner.profile.authorityKey]));
  const sharing=new SharingClient(f.owner),grant=await sharing.grant(vault,{recipients:[{account:files.profile.account,fingerprint}],objects,expiresAt:Date.now()+86400000});
  await page.getByRole('button',{name:'Shared with me',exact:true}).click();
  await expect(page.getByRole('button',{name:/Open shared item/})).toHaveCount(2);await page.locator('summary').filter({hasText:'Verify sender'}).click();await page.getByLabel('Sender fingerprint').fill(ownerFingerprint);await page.getByRole('button',{name:'I compared and confirm this sender'}).click();await page.getByRole('button',{name:/Open shared item/}).first().click();await expect(page.getByRole('region',{name:'Opened shared item'})).toBeVisible();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'shared item horizontal overflow');if(output)await page.screenshot({path:join(output,`contractor-two-items-${width}.png`),fullPage:true});
  // Advance the persisted authoritative expiry as a controlled fixture clock.
  await f.db.prepare('UPDATE lky_shares SET expires_at=? WHERE id=?').bind(Date.now()-1,grant.share).run();
  await page.getByRole('button',{name:'Refresh shared items'}).click();await expect(page.getByText('No active shared items.')).toBeVisible();await expect(page.getByRole('region',{name:'Opened shared item'})).toHaveCount(0);if(output)await page.screenshot({path:join(output,`contractor-expired-${width}.png`),fullPage:true});return {operator:person.id,email};
 } catch(error) {if(output&&page)await page.screenshot({path:join(output,`contractor-failure-${width}.png`),fullPage:true});throw error} finally {await context.close()}
}

export async function fileLinkJourney(f,manager,attachment,width,output) {
 await manager.getByLabel('Share content').selectOption(attachment.id);await manager.getByLabel('Maximum committed views').fill('2');await manager.getByLabel('Separate link password').fill('synthetic-latchkey-1110');
 const previous=await manager.getByLabel('Private sharing link').inputValue();await manager.getByRole('button',{name:'Create link',exact:true}).click();await expect(manager.getByLabel('Private sharing link')).not.toHaveValue(previous);const url=await manager.getByLabel('Private sharing link').inputValue();
 const context=await f.browser.newContext({ignoreHTTPSErrors:true,viewport:{width,height:1000}});
 try {
  const page=await context.newPage();await page.goto(url);await page.getByLabel('Recipient email').fill('contractor@example.test');await page.getByLabel('Link password').fill('synthetic-latchkey-1110');await page.getByRole('button',{name:'Send verification code'}).click();await expect(page.getByLabel('Verification code')).toBeVisible();await page.getByLabel('Verification code').fill(f.code());
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Verify and open'}).click();const download=await downloading;assert.equal(download.suggestedFilename(),attachment.name);let content='';for await(const chunk of await download.createReadStream())content+=chunk;assert.equal(content,'synthetic-latchkey-1108');await expect(page.getByRole('heading',{name:'File downloaded'})).toBeVisible();if(output)await page.screenshot({path:join(output,`sharing-file-downloaded-${width}.png`),fullPage:true});
  await page.reload();await expect(page.getByRole('button',{name:'Send verification code'})).toBeVisible();
  await manager.getByRole('listitem').filter({hasText:'0/2 views'}).getByRole('button',{name:'Revoke link',exact:true}).click();await expect(manager.getByText('Link revoked. Future views and downloads are refused.')).toBeVisible();
  await page.reload();await expect(page.getByRole('alert')).toContainText('unavailable');if(output)await page.screenshot({path:join(output,`sharing-revoked-file-${width}.png`),fullPage:true});
  const link=new PublicLinkClient(url),source=await f.db.prepare('SELECT vault_id,object_id FROM lky_links WHERE id=?').bind(link.link).first();
  const expiring=await new SharingClient(f.owner).createLink(source.vault_id,source.object_id,{recipient:'contractor@example.test',maxViews:1});
  await page.goto(expiring.url);await expect(page.getByRole('button',{name:'Send verification code'})).toBeVisible();await f.db.prepare('UPDATE lky_links SET expires_at=? WHERE id=?').bind(Date.now()-1,expiring.link).run();await page.reload();await expect(page.getByRole('alert')).toContainText('unavailable');if(output)await page.screenshot({path:join(output,`sharing-expired-${width}.png`),fullPage:true});
 }finally{await context.close()}
}
